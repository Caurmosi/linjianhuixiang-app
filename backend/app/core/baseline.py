"""
baseline.py —— 演示基准数据（与前端 mockData.js 完全一致）

用途：尚无任何分析记录时，GET /api/* 返回这套基准，保证 API 模式下
前端演示流程看到与 mock 完全一致的数据；真实分析发生后即被覆盖。
"""
from __future__ import annotations

import math


def _demo_waveform(n: int = 160) -> list[float]:
    """演示波形：中段活跃的峰值包络（与前端 mockData.WAVEFORM 同式）。"""
    out = []
    for i in range(n):
        t = i / (n - 1)
        base = 0.35 + 0.55 * math.sin(math.pi * t)
        ripples = 0.18 * math.sin(7 * t * math.pi) * math.sin(3 * t * math.pi + 0.5)
        out.append(round(max(0.04, min(1.0, base + ripples)), 3))
    return out

BASELINE_SPECIES = [
    {"id": 1, "name": "白头鹎", "latin": "Pycnonotus sinensis", "conf": 0.93, "freq": 21, "period": "清晨"},
    {"id": 2, "name": "麻雀", "latin": "Passer montanus", "conf": 0.88, "freq": 14, "period": "全天"},
    {"id": 3, "name": "珠颈斑鸠", "latin": "Spilopelia chinensis", "conf": 0.82, "freq": 9, "period": "清晨"},
    {"id": 4, "name": "乌鸫", "latin": "Turdus merula", "conf": 0.77, "freq": 8, "period": "黄昏"},
    {"id": 5, "name": "大山雀", "latin": "Parus major", "conf": 0.71, "freq": 6, "period": "上午"},
    {"id": 6, "name": "喜鹊", "latin": "Pica pica", "conf": 0.66, "freq": 5, "period": "全天"},
    {"id": 7, "name": "八哥", "latin": "Acridotheres cristatellus", "conf": 0.55, "freq": 3, "period": "黄昏"},
    {"id": 8, "name": "灰喜鹊", "latin": "Cyanopica cyanus", "conf": 0.48, "freq": 2, "period": "清晨"},
    {"id": 9, "name": "戴胜", "latin": "Upupa epops", "conf": 0.42, "freq": 1, "period": "上午"},
]

BASELINE_INDICES = [
    {"key": "ACI", "name": "声学复杂度指数", "display": "82.4", "pct": 82, "desc": "越高表示生物声活动越丰富、声景越复杂。"},
    {"key": "NDSI", "name": "归一化声景指数", "display": "0.41", "pct": 70, "desc": "正值代表生物声主导；负值代表人为噪声主导。"},
    {"key": "ADI", "name": "声学多样性指数", "display": "0.73", "pct": 73, "desc": "频带能量分布广度，反映声音类型多样性。"},
    {"key": "H", "name": "声学均匀度（熵）", "display": "0.85", "pct": 85, "desc": "越接近 1 表示各声源分布越均衡、干扰越小。"},
]

BASELINE_LIVABILITY = {
    "score": 68,
    "grade": "一般",
    "gradeEn": "Moderate",
    "bio": 76,
    "sound": 60,
    "noise": 34,
    "confidence": 0.72,
    "confidenceLabel": "高",
}

BASELINE_HEATMAP = [
    [0.2, 0.3, 0.5, 0.7, 0.8, 0.6, 0.4, 0.3, 0.5, 0.7, 0.6, 0.3],
    [0.3, 0.4, 0.6, 0.8, 0.9, 0.7, 0.5, 0.4, 0.6, 0.8, 0.7, 0.4],
    [0.4, 0.5, 0.7, 0.9, 0.7, 0.5, 0.4, 0.5, 0.7, 0.6, 0.5, 0.3],
    [0.5, 0.6, 0.8, 0.7, 0.5, 0.4, 0.3, 0.4, 0.5, 0.4, 0.3, 0.2],
]

BASELINE_MAP_POINTS = [
    {"x": 70, "y": 55, "c": "#2e7d52", "t": "宜居"},
    {"x": 140, "y": 80, "c": "#2e7d52", "t": ""},
    {"x": 200, "y": 100, "c": "#d49a26", "t": "一般"},
    {"x": 105, "y": 120, "c": "#d49a26", "t": ""},
    {"x": 250, "y": 90, "c": "#c25a39", "t": "受压"},
    {"x": 175, "y": 55, "c": "#2e7d52", "t": ""},
]

# 录音波形演示数据（与前端 mockData.WAVEFORM 一致）
BASELINE_WAVEFORM = _demo_waveform()

# 按时间切片的演示声景样点（与前端 mockData.SEGMENT_POINTS 一致）
BASELINE_SEGMENT_POINTS = [
    {"x": 50, "y": 90, "c": "#d49a26", "t": "开始"},
    {"x": 97, "y": 62, "c": "#2e7d52", "t": ""},
    {"x": 144, "y": 55, "c": "#2e7d52", "t": ""},
    {"x": 191, "y": 78, "c": "#d49a26", "t": ""},
    {"x": 238, "y": 120, "c": "#c25a39", "t": ""},
    {"x": 285, "y": 95, "c": "#d49a26", "t": "结束"},
]

BASELINE_GREEN_SPACES = [
    {"id": "zhongshan", "name": "中山公园", "points": BASELINE_MAP_POINTS},
    {
        "id": "binjiang",
        "name": "滨江绿地",
        "points": [
            {"x": 90, "y": 60, "c": "#d49a26", "t": "一般"},
            {"x": 160, "y": 85, "c": "#d49a26", "t": ""},
            {"x": 230, "y": 70, "c": "#c25a39", "t": "受压"},
            {"x": 120, "y": 110, "c": "#d49a26", "t": ""},
            {"x": 200, "y": 130, "c": "#c25a39", "t": ""},
            {"x": 150, "y": 55, "c": "#2e7d52", "t": "宜居"},
        ],
    },
    {
        "id": "xijiao",
        "name": "西郊森林公园",
        "points": [
            {"x": 80, "y": 60, "c": "#2e7d52", "t": "宜居"},
            {"x": 150, "y": 80, "c": "#2e7d52", "t": ""},
            {"x": 220, "y": 65, "c": "#2e7d52", "t": ""},
            {"x": 110, "y": 115, "c": "#d49a26", "t": "一般"},
            {"x": 190, "y": 130, "c": "#d49a26", "t": ""},
            {"x": 260, "y": 95, "c": "#2e7d52", "t": "宜居"},
        ],
    },
]

BASELINE_SUGGESTIONS = [
    "控制晨练音响音量，降低 6–9 时人为噪声峰值",
    "增植灌木与中层植被，提升鸟类隐蔽与筑巢空间",
    "设置低干扰生态廊道，连通破碎绿地",
]
