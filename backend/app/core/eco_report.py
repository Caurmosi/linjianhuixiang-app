"""
eco_report.py —— 地区生态简报生成

两种模式：
1. LLM 模式（默认）：配置 LLM_API_KEY 后调用大模型（默认智谱 glm-4-flash，免费档）生成自然语言简报。
   支持通过环境变量切换任意 OpenAI 兼容接口：
     - LLM_API_KEY   （必填，启用 LLM）
     - LLM_BASE_URL  （默认 https://open.bigmodel.cn/api/paas/v4）
     - LLM_MODEL     （默认 glm-4-flash；通义可用 qwen-turbo、DeepSeek 可用 deepseek-chat 等）
2. 模板模式（降级）：未配置 key 或调用失败时，用规则模板拼一份结构化简报，保证功能不阻塞。

均返回 (report_markdown, source)：
  - source: "llm" | "template"
"""
from __future__ import annotations

import json
import os
from typing import Any

import requests

# 环境变量（Docker 部署时在容器 env 配置）
LLM_API_KEY = os.environ.get("LLM_API_KEY", "").strip()
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://open.bigmodel.cn/api/paas/v4").strip().rstrip("/")
LLM_MODEL = os.environ.get("LLM_MODEL", "glm-4-flash").strip()
LLM_TIMEOUT = 45

_REPORT_PROMPT = """你是一位城市生态学专家，正在为「城市鸟类宜居度公共地图」平台撰写一份地区生态简报。
请根据给定的聚合观测数据，输出一份**中文 Markdown 生态简报**，要求：
- 结构清晰，使用二级/三级标题、列表；
- 用通俗语言解释宜居度评分含义（0-100，越高越宜居），并给出噪声、置信度、物种多样性的解读；
- 结合趋势（若有多条历史数据）说明变化方向与可能原因；
- 结尾给出 2-3 条具体、可执行的改善建议（面向普通市民/社区）；
- 语气客观、友好，不要编造数据中不存在的信息，篇幅 250-400 字。

聚合数据（JSON）：
{data_json}
"""


def _grade(score: float) -> str:
    """宜居度档位（与 App 展示一致）。"""
    if score >= 70:
        return "宜居"
    if score >= 50:
        return "一般"
    return "受压"


def _template_report(data: dict) -> str:
    """规则模板简报（无 LLM key 或调用失败时降级）。"""
    region = data.get("regionName", "该地区")
    n = data.get("n", 0)
    score = data.get("score")
    grade = _grade(score or 0) if score is not None else "—"
    score_min = data.get("scoreMin")
    score_max = data.get("scoreMax")
    conf = data.get("confidenceAvg")
    noise = data.get("noiseAvg")
    trend = data.get("trend", [])
    species = data.get("speciesTop", [])

    lines = [f"## {region} · 生态简报", ""]
    lines.append(f"> 自动生成（{n} 条公开观测聚合）· 数据仅供参考，坐标为近似位置")

    lines += ["", f"### 宜居度：{score} 分（{grade}）"]
    if score_min is not None and score_max is not None:
        lines.append(f"- 样本评分区间 **{score_min} ~ {score_max}**，共 **{n}** 条记录")
    if conf is not None:
        lines.append(f"- 识别置信度均值 **{round(conf, 2)}**（越高代表样本质量越好）")
    if noise is not None:
        if noise >= 60:
            noise_desc = "较高，可能靠近道路/施工区等嘈杂环境"
        elif noise >= 35:
            noise_desc = "中等，存在一定人为干扰"
        else:
            noise_desc = "较低，声环境较安静"
        lines.append(f"- 人为噪声占比 **{noise}%**（{noise_desc}）")

    if species:
        names = "、".join(f"{s['name']}（{s['count']} 次）" for s in species[:5])
        lines += ["", "### 观测到的鸟类", f"- {names}"]
    else:
        lines += ["", "### 观测到的鸟类", "- 暂未识别到明确鸟种，建议在鸟鸣活跃时段（清晨/黄昏）多采样"]

    if len(trend) >= 2:
        first, last = trend[0], trend[-1]
        diff = last["score"] - first["score"]
        if diff >= 5:
            direction = "明显上升 📈"
        elif diff <= -5:
            direction = "明显下降 📉"
        elif abs(diff) < 5:
            direction = "总体平稳 ➡️"
        lines += [
            "",
            "### 时间趋势",
            f"- 从 {first['date']} 到 {last['date']}，宜居度评分 {direction}（{first['score']} → {last['score']}）",
        ]

    lines += ["", "### 改善建议", "1. 保留并增加乔木与灌丛层次，为鸟类提供栖息与隐蔽空间", "2. 减少高峰期人为噪声（如割草、施工），营造安静的声环境", "3. 增设水景/食物源植物，并鼓励社区持续观测积累数据"]
    return "\n".join(lines)


def _call_llm(data: dict) -> str:
    """调用 OpenAI 兼容 chat/completions 接口，返回回复文本。失败抛异常。"""
    payload = {
        "model": LLM_MODEL,
        "messages": [
            {
                "role": "user",
                "content": _REPORT_PROMPT.format(data_json=json.dumps(data, ensure_ascii=False)),
            }
        ],
        "temperature": 0.4,
        "max_tokens": 1200,
    }
    resp = requests.post(
        f"{LLM_BASE_URL}/chat/completions",
        headers={
            "Authorization": f"Bearer {LLM_API_KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=LLM_TIMEOUT,
    )
    resp.raise_for_status()
    body = resp.json()
    content = body["choices"][0]["message"]["content"]
    if isinstance(content, list):  # 部分模型返回多段内容
        content = "".join(seg.get("text", "") for seg in content if isinstance(seg, dict))
    return str(content).strip()


def generate_eco_report(data: dict[str, Any]) -> tuple[str, str]:
    """生成地区生态简报。

    data 键（由 routes 聚合后传入）：
      regionName / n / score / scoreMin / scoreMax / confidenceAvg /
      noiseAvg / speciesTop / trend
    返回 (report_markdown, source)，source ∈ {"llm", "template"}。
    """
    if not LLM_API_KEY:
        return _template_report(data), "template"
    try:
        return _call_llm(data), "llm"
    except Exception as exc:  # noqa: BLE001 网络/鉴权/限流失败均降级模板
        print(f"[eco_report] LLM 调用失败，降级模板: {exc}")
        return _template_report(data), "template"
