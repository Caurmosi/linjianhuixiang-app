"""
dsp.py —— 轻量信号处理原语（numpy + scipy 自包含，不依赖 librosa）

提供：
  - Slaney 风格 mel 滤波器组（与 librosa 默认一致，保证 BirdNET 输入兼容）
  - power_to_db（与 librosa 默认一致，top_db=80）
  - STFT 幅度谱 / 频带能量统计
"""
from __future__ import annotations

import numpy as np
from scipy import signal as sp_signal

# ---------------------------------------------------------------------------
# Mel 滤波器组（Slaney 风格，等价 librosa.filters.mel(norm="slaney")）
# ---------------------------------------------------------------------------
_MEL_FMAX_DEFAULT = 15000.0


def _hz_to_mel(freq: np.ndarray) -> np.ndarray:
    """Slaney 分段公式：1kHz 以下线性，以上对数。"""
    f = np.asarray(freq, dtype=float)
    f_0 = 0.0
    f_sp = 200.0 / 3
    mels = (f - f_0) / f_sp
    min_log_hz = 1000.0
    min_log_mel = (min_log_hz - f_0) / f_sp
    logstep = np.log(6.4) / 27.0
    log_mels = min_log_mel + np.log(np.maximum(f, 1e-10) / min_log_hz) / logstep
    return np.where(f >= min_log_hz, log_mels, mels)


def _mel_to_hz(mels: np.ndarray) -> np.ndarray:
    m = np.asarray(mels, dtype=float)
    f_0 = 0.0
    f_sp = 200.0 / 3
    freqs = f_0 + f_sp * m
    min_log_hz = 1000.0
    min_log_mel = (min_log_hz - f_0) / f_sp
    logstep = np.log(6.4) / 27.0
    log_freqs = min_log_hz * np.exp(logstep * (m - min_log_mel))
    return np.where(m >= min_log_mel, log_freqs, freqs)


def mel_filterbank(
    sr: int,
    n_fft: int,
    n_mels: int = 128,
    fmin: float = 0.0,
    fmax: float = _MEL_FMAX_DEFAULT,
) -> np.ndarray:
    """返回 (n_mels, n_fft//2+1) 的三角 mel 滤波器权重，行和归一化（Slaney norm）。"""
    n_freqs = n_fft // 2 + 1
    mel_points = np.linspace(_hz_to_mel(fmin), _hz_to_mel(fmax), n_mels + 2)
    hz_points = _mel_to_hz(mel_points)
    bins = np.floor((n_fft + 1) * hz_points / sr).astype(int)
    bins = np.clip(bins, 0, n_fft // 2)
    fb = np.zeros((n_mels, n_freqs))
    for i in range(n_mels):
        left, center, right = bins[i], bins[i + 1], bins[i + 2]
        if center > left:
            fb[i, left:center] = (np.arange(left, center) - left) / max(center - left, 1)
        if right > center:
            fb[i, center:right] = (right - np.arange(center, right)) / max(right - center, 1)
    # Slaney norm：每行权重之和为 1
    row_sums = fb.sum(axis=1, keepdims=True)
    fb = np.divide(fb, row_sums, out=np.zeros_like(fb), where=row_sums > 0)
    return fb


def mel_spectrogram(
    y: np.ndarray,
    sr: int,
    n_fft: int = 1024,
    hop_length: int = 512,
    n_mels: int = 128,
    fmin: float = 0.0,
    fmax: float = _MEL_FMAX_DEFAULT,
) -> np.ndarray:
    """librosa.feature.melspectrogram 的等价实现，返回 (n_mels, n_frames) 功率谱。"""
    S = stft_magnitude(y, sr, n_fft=n_fft, hop_length=hop_length)
    fb = mel_filterbank(sr, n_fft, n_mels=n_mels, fmin=fmin, fmax=fmax)
    return fb @ S


def power_to_db(S: np.ndarray, amin: float = 1e-10, top_db: float = 80.0) -> np.ndarray:
    """librosa.power_to_db 等价实现。"""
    db = 10.0 * np.log10(np.maximum(S, amin))
    if top_db is not None:
        db = np.maximum(db, db.max() - top_db)
    return db


# ---------------------------------------------------------------------------
# STFT
# ---------------------------------------------------------------------------
def stft_magnitude(
    y: np.ndarray,
    sr: int,
    n_fft: int = 1024,
    hop_length: int = 512,
) -> np.ndarray:
    """幅度谱 (n_freqs, n_frames)。scipy.stft 帧中心化，结果与 librosa 略有相位差异，幅度量级一致。"""
    _, _, Zxx = sp_signal.stft(
        y,
        fs=sr,
        window="hann",
        nperseg=n_fft,
        noverlap=n_fft - hop_length,
        boundary=None,
        padded=True,
    )
    return np.abs(Zxx)


def band_power(freqs: np.ndarray, S: np.ndarray, fmin: float, fmax: float) -> float:
    """频带内平均功率（S 为幅度谱 (n_freqs, n_frames)）。"""
    mask = (freqs >= fmin) & (freqs < fmax)
    if not np.any(mask):
        return 0.0
    return float(np.mean(S[mask] ** 2))


def band_fractions(freqs: np.ndarray, S: np.ndarray, edges: list[float]) -> list[float]:
    """把总功率按频带切分，返回各带占比（和为 1）。"""
    total = float(np.sum(S ** 2)) + 1e-12
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        out.append(band_power(freqs, S, lo, hi) / total)
    return out


def resample_poly(y: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
    """整系数比重采样（scipy.signal.resample_poly）。"""
    if src_sr == dst_sr:
        return y
    g = int(np.gcd(src_sr, dst_sr))
    up = dst_sr // g
    down = src_sr // g
    return sp_signal.resample_poly(y, up, down).astype(np.float32)


def bandpass(y: np.ndarray, sr: int, lo: float, hi: float, order: int = 4) -> np.ndarray:
    """Butterworth 带通滤波（零相位 filtfilt）。"""
    nyq = 0.5 * sr
    if lo <= 0 and hi >= nyq:
        return y
    lo_c = max(lo, 1.0) / nyq
    hi_c = min(hi, nyq - 1.0) / nyq
    if lo <= 0:
        b, a = sp_signal.butter(order, hi_c, btype="lowpass")
    elif hi >= nyq:
        b, a = sp_signal.butter(order, lo_c, btype="highpass")
    else:
        b, a = sp_signal.butter(order, [lo_c, hi_c], btype="bandpass")
    if len(y) < 3 * order * 2:
        return y
    return sp_signal.filtfilt(b, a, y).astype(np.float32)


def rms_normalize(y: np.ndarray, target_rms: float = 0.05) -> np.ndarray:
    """RMS 归一化到目标电平，峰值限幅 0.98。"""
    rms = float(np.sqrt(np.mean(y ** 2))) + 1e-12
    gain = target_rms / rms
    y = y * gain
    peak = float(np.max(np.abs(y)))
    if peak > 0.98:
        y = y * (0.98 / peak)
    return y.astype(np.float32)


def trim_silence(y: np.ndarray, sr: int, threshold: float = 1e-4, frame_sec: float = 0.05) -> np.ndarray:
    """按短时 RMS 去除首尾静音；至少保留 1 秒。"""
    frame = max(1, int(sr * frame_sec))
    n = len(y)
    if n < frame * 4:
        return y
    rms = np.sqrt(
        np.mean(y[: n - (n % frame)].reshape(-1, frame) ** 2, axis=1) + 1e-12
    )
    active = np.where(rms > threshold)[0]
    if len(active) == 0:
        return y
    start = max(0, int(active[0] * frame) - frame)
    end = min(n, int((active[-1] + 1) * frame) + frame)
    if end - start < sr:  # 过短则保持原始长度
        return y
    return y[start:end]
