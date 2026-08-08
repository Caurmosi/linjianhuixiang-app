"""
noise.py —— 人为噪声占比估算（0–100%）

方法（频谱 + 检测融合）：
  1. 频谱比：1–2kHz（交通/机械声带）功率 vs 2–11kHz（生物声带）功率；
     谱面噪声占比 = E_anthro / (E_anthro + E_bio)。
  2. 鸟声活动：BirdNET / 启发式检测得到的类鸟鸣活动占比（越高 → 噪声越低）。
  3. 融合：noise = 0.65 * 频谱比 + 0.35 * (1 - activity)，映射到 0–100%。
"""
from __future__ import annotations

import numpy as np

from . import dsp


def estimate_noise_ratio(freqs: np.ndarray, S: np.ndarray, activity: float) -> float:
    anthro = dsp.band_power(freqs, S, 1000.0, 2000.0)
    bio = dsp.band_power(freqs, S, 2000.0, 11000.0)
    spectral_noise = anthro / (anthro + bio + 1e-12)
    noise = 0.65 * spectral_noise + 0.35 * (1.0 - float(np.clip(activity, 0.0, 1.0)))
    return float(np.clip(noise * 100.0, 0.0, 100.0))
