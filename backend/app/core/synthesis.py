"""
synthesis.py —— 从分析结果合成可视化数据（热力图 / 空间样点 / 多绿地 / 提升建议）

所有输出字段与前端契约一致：
  heatmap: 4×12 二维数组（0–1 强度）—— 4 个频段行 × 12 个 2 小时时段列
  mapPoints: [{x, y, c, t}]（x/y 在 320×170 画布空间内，颜色/标签对应宜居等级）
  greenSpaces: [{name, points: [...]}]
  suggestions: 字符串数组（规则驱动）
"""
from __future__ import annotations

import hashlib

import numpy as np

from . import dsp

GRADE_COLORS = {"宜居": "#2e7d52", "一般": "#d49a26", "受压": "#c25a39"}
PARK_NAMES = [("zhongshan", "中山公园"), ("binjiang", "滨江绿地"), ("xijiao", "西郊森林公园")]

# 12 个 2 小时时段的昼夜活动权重（0–24h）：清晨/上午/黄昏双峰
_DIURNAL = [0.25, 0.30, 0.45, 0.65, 0.85, 1.00, 0.80, 0.60, 0.55, 0.70, 0.90, 0.40]
# 4 个频段行：<1k, 1–2k, 2–6k, 6–11k
_BAND_EDGES = [0.0, 1000.0, 2000.0, 6000.0, 11000.0]


def _hash_seed(*parts) -> int:
    return int(hashlib.md5("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()[:8], 16)


# ---------------------------------------------------------------------------
# 热力图
# ---------------------------------------------------------------------------
def heatmap(indices: dict, noise: float, activity: float, freqs: np.ndarray | None = None, S=None) -> list[list[float]]:
    """4 行（频段）× 12 列（时段）。"""
    ndsi = indices.get("ndsi", 0.0)
    ndsi_norm = max(0.0, min(1.0, (ndsi + 1.0) / 2.0))

    # 各频段功率占比
    if freqs is not None and S is not None:
        fracs = dsp.band_fractions(freqs, S, _BAND_EDGES)
    else:
        fracs = [0.25, 0.25, 0.30, 0.20]
    # 生物声带（2–11k）占比高 → 高 NDSI 时自然亮
    bio_share = fracs[2] + fracs[3]

    noise_factor = 1.0 - 0.35 * (noise / 100.0)
    rows = []
    for r in range(4):
        row = []
        for c in range(12):
            band_bright = 0.35 * fracs[r] + 0.55 * bio_share * _DIURNAL[c] + 0.25 * ndsi_norm
            # 中高频行受鸟声活动直接驱动
            if r >= 2:
                band_bright += 0.40 * activity * _DIURNAL[c]
            val = band_bright * noise_factor
            row.append(round(float(np.clip(val, 0.0, 1.0)), 2))
        rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# 空间样点
# ---------------------------------------------------------------------------
def _grade_counts(score: int) -> dict[str, int]:
    if score >= 70:
        return {"宜居": 4, "一般": 1, "受压": 1}
    if score >= 50:
        return {"宜居": 2, "一般": 3, "受压": 1}
    return {"宜居": 1, "一般": 2, "受压": 3}


def _point_positions(seed: int, n: int = 6) -> list[tuple[int, int]]:
    rng = np.random.default_rng(seed)
    xs = (rng.uniform(50, 285, n)).astype(int)
    ys = (rng.uniform(30, 150, n)).astype(int)
    # 保证至少 15px 间距
    pts = []
    for x, y in zip(xs, ys):
        ok = True
        for px, py in pts:
            if abs(px - x) < 18 and abs(py - y) < 18:
                ok = False
                break
        if ok:
            pts.append((int(x), int(y)))
    while len(pts) < n:
        pts.append((int(rng.uniform(50, 285)), int(rng.uniform(30, 150))))
    return pts[:n]


def map_points(score: int, seed: int = 0) -> list[dict]:
    counts = _grade_counts(score)
    pts = _point_positions(seed)
    out = []
    label_used = set()
    order = ["宜居", "一般", "受压"]
    for (x, y), grade in zip(pts, _expand(counts, order)):
        color = GRADE_COLORS[grade]
        t = ""
        if grade not in label_used and grade in counts and counts[grade] > 0:
            t = grade
            label_used.add(grade)
        out.append({"x": x, "y": y, "c": color, "t": t})
    return out


def _expand(counts: dict[str, int], order: list[str]) -> list[str]:
    out = []
    for g in order:
        out.extend([g] * counts[g])
    return out


def green_spaces(recording: str, score: int) -> list[dict]:
    """3 个绿地对比；录音名决定"本次分析"的绿地（其余 ±偏移模拟对比）。"""
    primary = _hash_seed(recording) % 3
    out = []
    for i, (pid, name) in enumerate(PARK_NAMES):
        if i == primary:
            s = score
        elif (i - primary) % 3 == 1:
            s = score + 12  # 更优样地
        else:
            s = score - 14  # 更差样地
        s = int(max(0, min(100, s)))
        pts = map_points(s, seed=_hash_seed(pid, recording))
        out.append({"id": pid, "name": name, "points": pts})
    return out


# ---------------------------------------------------------------------------
# 提升建议（规则驱动）
# ---------------------------------------------------------------------------
_DEFAULT_SUGGESTIONS = [
    "控制晨练音响音量，降低 6–9 时人为噪声峰值",
    "增植灌木与中层植被，提升鸟类隐蔽与筑巢空间",
    "设置低干扰生态廊道，连通破碎绿地",
]


def suggestions(livability: dict, indices: dict, species_count: int) -> list[str]:
    noise = livability["noise"]
    score = livability["score"]
    ndsi = indices.get("ndsi", 0.0)

    out: list[str] = []
    if noise >= 60:
        out.append(f"人为噪声占比高达 {noise}%，建议优先降噪：控制晨练音响音量，降低 6–9 时噪声峰值")
    elif noise >= 40:
        out.append("控制晨练音响音量，降低 6–9 时人为噪声峰值")
    if species_count < 6:
        out.append("物种偏少，建议增植灌木与中层植被，提升鸟类隐蔽与筑巢空间")
    if ndsi < 0:
        out.append("声景被交通噪声主导，建议增设绿化隔离带阻隔主干道噪声")
    if score < 50:
        out.append("绿地连通性不足，建议设置低干扰生态廊道，连通破碎绿地")
    if score >= 70:
        out.append("声环境良好，建议保持现有低干扰管理并增设观鸟标识")

    for d in _DEFAULT_SUGGESTIONS:
        if len(out) >= 5:
            break
        if d not in out:
            out.append(d)
    return out[:5]
