"""
indices.py —— 声学指数计算（ACI / NDSI / ADI / H）

实现说明（与生态声学文献口径一致）：
  - ACI（声学复杂度，Pieretti et al. 2011）：按频点累计相邻帧幅度差的绝对值，
    除以该频点幅度和，再对频点取均值。越大表示生物声活动越复杂。
  - NDSI（归一化声景，Kasten et al. 2012）：(生物声带 2–11kHz − 人为声带 1–2kHz) / 二者之和，∈[-1,1]。
  - ADI（声学多样性，Villanueva-Rivera et al. 2011）：把 0–11kHz 均分为 10 个频带，
    对超过最大能量 −50dB 的频带计算 Shannon 熵并归一化，∈[0,1]。
  - H（声学熵/均匀度，Sueur et al. 2008）：时间熵 Ht × 频谱熵 Hf，∈[0,1]。
    越接近 1 表示各声源分布越均衡。

返回值同时附带 display / pct 两个展示字段（与前端 mockData.INDICES 契约一致）：
  display: 字符串（ACI 一位小数，其余两位小数）
  pct:     0–100 整数（NDSI 从 [-1,1] 映射到 [0,100]）
"""
from __future__ import annotations

import numpy as np

from . import dsp

STFT_N_FFT = 1024
STFT_HOP = 512  # 48kHz 下约 10.7ms

ACI_NORMALIZE_K = 8.0  # ACI 原始值 → 0-100 展示的缩放系数（tanh 压缩）


def compute_indices(y: np.ndarray, sr: int) -> dict:
    """输入 48kHz mono float32，返回含原始值 + 展示值的指数字典。"""
    freqs, S = _spectrogram(y, sr)

    aci_raw = _aci(S)
    ndsi_raw = _ndsi(freqs, S)
    adi_raw = _adi(freqs, S)
    h_raw = _h(y, S)

    pct_aci = int(round(100.0 * np.tanh(aci_raw * ACI_NORMALIZE_K)))
    pct_ndsi = int(round((ndsi_raw + 1.0) / 2.0 * 100.0))
    pct_adi = int(round(adi_raw * 100.0))
    pct_h = int(round(h_raw * 100.0))

    return {
        # 原始值（供宜居度融合使用）
        "aci": float(aci_raw),
        "ndsi": float(ndsi_raw),
        "adi": float(adi_raw),
        "h": float(h_raw),
        # 前端契约展示值
        "indices": [
            {
                "key": "ACI",
                "name": "声学复杂度指数",
                "display": f"{pct_aci:.1f}",
                "pct": pct_aci,
                "desc": "越高表示生物声活动越丰富、声景越复杂。",
            },
            {
                "key": "NDSI",
                "name": "归一化声景指数",
                "display": f"{ndsi_raw:.2f}",
                "pct": pct_ndsi,
                "desc": "正值代表生物声主导；负值代表人为噪声主导。",
            },
            {
                "key": "ADI",
                "name": "声学多样性指数",
                "display": f"{adi_raw:.2f}",
                "pct": pct_adi,
                "desc": "频带能量分布广度，反映声音类型多样性。",
            },
            {
                "key": "H",
                "name": "声学均匀度（熵）",
                "display": f"{h_raw:.2f}",
                "pct": pct_h,
                "desc": "越接近 1 表示各声源分布越均衡、干扰越小。",
            },
        ],
    }


def spectrogram(y: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    """返回 (freqs, 幅度谱)。供噪声估算 / 热力图合成复用同一 STFT。"""
    return _spectrogram(y, sr)


def _spectrogram(y: np.ndarray, sr: int):
    S = dsp.stft_magnitude(y, sr, n_fft=STFT_N_FFT, hop_length=STFT_HOP)
    freqs = np.linspace(0, sr / 2.0, S.shape[0])
    return freqs, S


def _aci(S: np.ndarray) -> float:
    """ACI（Pieretti et al. 2011，dB 域实现，与 soundecology 口径一致）：
    先转 dB（下限 -80），再按频点计算 相邻帧dB差绝对值之和 / 平移后dB之和，最后对频点取均值。
    dB 域使鸟鸣的强动态变化 > 宽频噪声的小幅抖动，从而鸟鸣场景 ACI 更高。"""
    db = 20.0 * np.log10(S + 1e-10)
    db = np.maximum(db, -80.0)
    d = np.abs(np.diff(db, axis=1))
    shift = db - np.min(db, axis=1, keepdims=True) + 1.0
    denom = np.sum(shift[:, :-1], axis=1) + 1e-6
    per_bin = np.sum(d, axis=1) / denom
    return float(np.mean(per_bin))


def _ndsi(freqs: np.ndarray, S: np.ndarray) -> float:
    anthro = dsp.band_power(freqs, S, 1000.0, 2000.0)
    bio = dsp.band_power(freqs, S, 2000.0, 11000.0)
    return float((bio - anthro) / (bio + anthro + 1e-10))


def _adi(freqs: np.ndarray, S: np.ndarray, n_bands: int = 10, max_hz: float = 11000.0) -> float:
    edges = np.linspace(0.0, max_hz, n_bands + 1)
    energies = np.array([dsp.band_power(freqs, S, edges[i], edges[i + 1]) for i in range(n_bands)])
    db = 10.0 * np.log10(energies + 1e-10)
    thr = float(np.max(db)) - 50.0
    sel = db[db > thr]
    if sel.size == 0:
        return 0.0
    p = sel / sel.sum()
    return float(-np.sum(p * np.log(p + 1e-12)) / np.log(sel.size))


def _h(y: np.ndarray, S: np.ndarray) -> float:
    # 时间熵：10ms 短时 RMS 作为包络
    frame = 512  # 48kHz * 10.7ms
    n = len(y)
    if n >= frame * 4:
        env = np.sqrt(np.mean(y[: n - (n % frame)].reshape(-1, frame) ** 2, axis=1) + 1e-12)
    else:
        env = np.abs(y)
    env = env / (env.sum() + 1e-12)
    ht = float(-np.sum(env * np.log(env + 1e-12)) / np.log(len(env)))
    # 频谱熵：平均幅度谱
    spec = np.mean(S, axis=1)
    spec = spec / (spec.sum() + 1e-12)
    hf = float(-np.sum(spec * np.log(spec + 1e-12)) / np.log(len(spec)))
    return float(np.clip(ht * hf, 0.0, 1.0))
