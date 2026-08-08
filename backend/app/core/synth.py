"""
synth.py —— 测试/演示信号合成器

生成两类可复现的 48kHz 单声道测试音频：
  - sample_bird.wav    ：模拟清晨鸟鸣（扫频啁啾 + 谐波），供 /api/analyze 端到端验证
  - sample_traffic.wav ：模拟交通噪声（宽频 + 低频轰鸣），用于对比"低宜居度"场景

注意：这些是合成信号，仅用于验证管线与接口；正式评估请使用真实录音 + BirdNET 模型。
"""
from __future__ import annotations

import numpy as np

SR = 48000


def _chirp(f0: float, f1: float, dur: float, sr: int, amp: float = 0.9) -> np.ndarray:
    n = int(dur * sr)
    t = np.linspace(0, dur, n, endpoint=False)
    phase = 2 * np.pi * (f0 * t + (f1 - f0) * t**2 / (2 * dur))
    y = amp * np.sin(phase)
    # 攻击/衰减包络（避免爆音）
    env = np.ones(n)
    a = int(0.02 * sr)
    env[:a] = np.linspace(0, 1, a)
    env[-a:] = np.linspace(1, 0, a)
    return y * env


def make_bird_sample(duration: float = 30.0, sr: int = SR, seed: int = 42) -> np.ndarray:
    """模拟鸟鸣：2–4 音节短语，主频 2.8–5.5kHz，附微弱环境底噪。"""
    rng = np.random.default_rng(seed)
    total = np.zeros(int(duration * sr), dtype=np.float64)
    t = 0.0
    while t < duration - 1.5:
        n_syl = int(rng.integers(2, 5))
        for s in range(n_syl):
            f0 = float(rng.uniform(2800, 4200))
            f1 = float(rng.uniform(f0 + 300, f0 + 1600))
            syl = _chirp(f0, f1, 0.09 + 0.04 * s, sr, amp=0.55)
            # 谐波
            t_harm = np.linspace(0, len(syl) / sr, len(syl), endpoint=False)
            syl = syl + 0.28 * np.sin(2 * np.pi * 2 * f0 * t_harm + 0.5) * np.hanning(len(syl))
            start = int(t * sr) + int(rng.uniform(0, 0.03) * sr)
            end = min(len(total), start + len(syl))
            total[start:end] += syl[: end - start]
            t += 0.16 + rng.uniform(0.02, 0.12)
        t += 0.7 + rng.uniform(0.1, 0.9)
    # 底噪：微风宽带 + 轻微低频轰鸣（模拟城区背景）
    noise = rng.normal(0, 1, len(total)) * 0.035
    noise = _lowpass(noise, sr, 4000)
    rumble = rng.normal(0, 1, len(total)) * 0.05
    rumble = _lowpass(rumble, sr, 180)
    return _normalize(total + noise + rumble)


def make_traffic_sample(duration: float = 30.0, sr: int = SR, seed: int = 7) -> np.ndarray:
    """模拟交通噪声：宽频路噪 + 强低频轰鸣 + 偶发喇叭声。"""
    rng = np.random.default_rng(seed)
    total = np.zeros(int(duration * sr), dtype=np.float64)
    noise = rng.normal(0, 1, len(total)) * 0.5
    total += _lowpass(noise, sr, 3000)
    rumble = rng.normal(0, 1, len(total)) * 0.7
    total += _lowpass(rumble, sr, 250)
    # 偶发高频"刹车/喇叭"尖峰
    t = 5.0
    while t < duration - 2:
        if rng.random() < 0.5:
            n = int(0.35 * sr)
            idx = int(t * sr)
            end = min(len(total), idx + n)
            total[idx:end] += _chirp(1800, 2600, 0.35, sr, amp=0.5)[: end - idx]
        t += rng.uniform(3, 7)
    return _normalize(total)


def _lowpass(y: np.ndarray, sr: int, cutoff: float, order: int = 3) -> np.ndarray:
    from scipy import signal as sp_signal

    nyq = 0.5 * sr
    b, a = sp_signal.butter(order, cutoff / nyq, btype="lowpass")
    return sp_signal.filtfilt(b, a, y)


def _normalize(y: np.ndarray, peak: float = 0.9) -> np.ndarray:
    m = float(np.max(np.abs(y)))
    if m > 1e-9:
        y = y * (peak / m)
    return y.astype(np.float32)


def to_wav_bytes(y: np.ndarray, sr: int = SR) -> bytes:
    """合成信号 → wav bytes（16bit PCM）。"""
    import io

    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, y, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()
