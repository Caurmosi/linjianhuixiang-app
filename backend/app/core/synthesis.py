"""
synthesis.py —— 从分析结果合成可视化数据（波形 / 热力图 / 空间样点 / 多绿地 / 提升建议）

所有输出字段与前端契约一致：
  waveform: [0,1] 归一化峰值包络数组（160 点，供前端画录音波形）
  heatmap: 4×12 二维数组（0–1 强度）—— 4 个频段行 × 12 个时段列，
           由真实录音时频能量驱动（见 heatmap() 注释）
  mapPoints: [{x, y, c, t}]（x/y 在 320×170 画布空间内，颜色/标签对应宜居等级）
  segmentPoints: [{x, y, c, t}]（按录音时间切片生成的真实声景样点）
  greenSpaces: [{name, points: [...]}]
  suggestions: 字符串数组（规则驱动）
"""
from __future__ import annotations

import hashlib

import numpy as np

from . import dsp, livability

GRADE_COLORS = {"宜居": "#2e7d52", "一般": "#d49a26", "受压": "#c25a39"}
PARK_NAMES = [("zhongshan", "中山公园"), ("binjiang", "滨江绿地"), ("xijiao", "西郊森林公园")]

# 4 个频段行：<1k, 1–2k, 2–6k, 6–11k
_BAND_EDGES = [0.0, 1000.0, 2000.0, 6000.0, 11000.0]
# 兜底频带占比（仅当 STFT 不可用时使用）
_DEFAULT_BAND_FRACS = [0.25, 0.25, 0.30, 0.20]
# 分析链路统一目标采样率（routes 经 audio.to_target_rate 归一）
_TARGET_SR = 48000


def _hash_seed(*parts) -> int:
    return int(hashlib.md5("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()[:8], 16)


# ---------------------------------------------------------------------------
# 录音波形
# ---------------------------------------------------------------------------
def waveform(y: np.ndarray, n: int = 160) -> list[float]:
    """把 y 切 n 段，每段取峰值绝对值，整体 min-max 归一化到 [0,1]（round 3 位）。

    供前端画录音波形：不同录音的能量包络不同 → 波形不同。
    """
    y = np.asarray(y, dtype=np.float64)
    if y.size == 0:
        return [0.0] * n
    peaks = []
    for seg in np.array_split(y, n):
        if seg.size == 0:
            peaks.append(1e-6)
        else:
            peaks.append(float(max(1e-6, float(np.max(np.abs(seg))))))
    peaks = np.asarray(peaks, dtype=np.float64)
    lo, hi = float(peaks.min()), float(peaks.max())
    if hi - lo > 1e-12:
        norm = (peaks - lo) / (hi - lo)
    else:
        norm = np.zeros_like(peaks)
    return [round(float(v), 3) for v in norm]


# ---------------------------------------------------------------------------
# 热力图（真实时频驱动）
# ---------------------------------------------------------------------------
def heatmap(
    y: np.ndarray,
    freqs: np.ndarray,
    S: np.ndarray,
    activity: float,
    noise: float,
    rows: int = 4,
    cols: int = 12,
) -> list[list[float]]:
    """4 行（频段）× 12 列（时段）热力图，由录音真实时频能量驱动。

    算法：
      1) 把整段 STFT 幅度谱 S (n_freqs, n_frames) 按时间等分 cols 段；
      2) 每段调用 dsp.band_fractions(freqs, S_seg, _BAND_EDGES) 得到 4 频带能量占比；
      3) 叠加该段平均功率 → 时段能量权重 e_w（能量高的时段列整体更亮，0.25–1.0）；
      4) 归一化到 [0,1]（峰值 0.9）；
      5) 叠加少量 activity/noise 修正（幅度 ≤ 0.15），保持"真实为主"。

    不同录音的频谱结构与能量包络不同 → 热力图明显不同。
    """
    if S is not None and freqs is not None and getattr(S, "ndim", 0) == 2 and S.shape[1] >= 2:
        band_m = np.zeros((cols, rows))
        seg_power = np.zeros(cols)
        edges = np.linspace(0, S.shape[1], cols + 1).astype(int)
        for c in range(cols):
            i0, i1 = int(edges[c]), int(edges[c + 1])
            i1 = max(i1, i0 + 1)
            S_seg = S[:, i0:i1]
            seg_power[c] = float(np.mean(S_seg**2)) + 1e-12
            band_m[c] = dsp.band_fractions(freqs, S_seg, _BAND_EDGES)
        e_w = seg_power / (seg_power.max() + 1e-12)
    else:
        # 兜底（STFT 不可用）：频带用默认占比，时段列仍由 y 的真实能量包络驱动
        band_m = np.tile(np.asarray(_DEFAULT_BAND_FRACS, dtype=float), (cols, 1))
        seg_power = np.zeros(cols)
        for c, seg in enumerate(np.array_split(np.asarray(y, dtype=np.float64), cols)):
            seg_power[c] = float(np.mean(seg**2)) + 1e-12 if seg.size else 1e-12
        e_w = seg_power / (seg_power.max() + 1e-12)
    e_w = np.clip(e_w, 0.25, 1.0)

    mat = band_m.T * e_w  # (rows, cols)：每列 = 该时段频带占比 × 时段能量权重
    m = float(mat.max())
    if m > 1e-9:
        mat = mat / m * 0.9

    # activity / noise 修正（幅度 ≤ 0.15，保持"真实为主"）
    noise_k = float(np.clip(noise / 100.0, 0.0, 1.0)) * 0.15
    act_k = float(np.clip(activity, 0.0, 1.0)) * 0.15
    mat[0] += noise_k  # 噪声高 → 低频行略亮
    mat[1] += 0.15 * noise_k
    mat[2] += 0.6 * act_k  # 活动高 → 中高频（生物声带）行略亮
    mat[3] += 0.4 * act_k
    mat = np.clip(mat, 0.0, 1.0)
    return [[round(float(v), 2) for v in row] for row in mat]


# ---------------------------------------------------------------------------
# 空间样点
# ---------------------------------------------------------------------------
def _low_freq_ratio(seg: np.ndarray, sr: int = _TARGET_SR) -> float:
    """该段 <1kHz 功率占比（作为人为噪声/低频能量近似），∈[0,1]。"""
    n = len(seg)
    if n < 64:
        return 0.5
    w = np.hanning(n)
    X = np.abs(np.fft.rfft(seg * w))
    freqs = np.fft.rfftfreq(n, 1.0 / sr)
    total = float(np.sum(X**2)) + 1e-12
    low = float(np.sum(X[freqs < 1000.0] ** 2))
    return low / total


def segment_points(y: np.ndarray, score: int, seed: int = 0, n: int = 6) -> list[dict]:
    """把音频按时间切 n 段，每段依据真实声学特征生成声景样点 {x, y, c, t}。

    - x：按段索引在 50–285 均匀分布（加确定性抖动）
    - y：按该段 RMS 能量映射 30–150（能量高 → 更靠上）
    - c：按该段质量等级（宜居/一般/受压，复用 GRADE_COLORS），
        段能量低且低频噪声占比高 → 受压
    - t：仅首段"开始"、末段"结束"，其余空（避免图例杂乱）

    完全基于真实 y；score 仅参与随机种子派生（确定性抖动）。
    """
    y = np.asarray(y, dtype=np.float64)
    if y.size < n:  # 过短/空：退化为按分数合成，保证结构完整
        return map_points(int(score), seed=_hash_seed(seed, score))[:n]

    rng = np.random.default_rng(_hash_seed(seed, score))
    segs = np.array_split(y, n)

    rms = np.array([float(np.sqrt(np.mean(seg**2))) if seg.size else 0.0 for seg in segs]) + 1e-12
    e_norm = rms / (rms.max() + 1e-12)
    lows = np.array([_low_freq_ratio(seg) for seg in segs])
    # 段质量分：能量贡献（0–1）扣减低频噪声占比后映射到 0–100
    seg_score = np.clip((e_norm - lows) * 55.0 + 62.0, 0.0, 100.0)

    xs = np.clip(50 + (np.arange(n) / max(n - 1, 1)) * 235 + rng.integers(-6, 7, n), 50, 285).astype(int)
    ys = np.clip(150 - 110 * e_norm + rng.integers(-6, 7, n), 30, 150).astype(int)

    out = []
    for i in range(n):
        grade = livability.grade_of(int(round(float(seg_score[i]))))[0]
        out.append(
            {
                "x": int(xs[i]),
                "y": int(ys[i]),
                "c": GRADE_COLORS[grade],
                "t": "开始" if i == 0 else ("结束" if i == n - 1 else ""),
            }
        )
    return out


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
