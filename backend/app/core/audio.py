"""
audio.py —— 音频解码与预处理管线

解码策略（依赖最小化）：
  - wav / flac / ogg / aiff：直接 soundfile 读取（内存 BytesIO）；
  - mp3 / webm / m4a / aac：调用 ffmpeg 转成 48kHz 单声道 s16le wav 再读取；
    若系统无 ffmpeg，抛出带明确提示的解码错误。

预处理：
  1) 统一 48kHz 单声道 float32
  2) 带通滤波（默认 150–15000Hz，去交通低频轰鸣）
  3) RMS 归一化 + 静音裁剪
  4) 导出 16bit PCM（满足“48kHz / 16bit”规格）
"""
from __future__ import annotations

import io
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from . import dsp
from ..config import ALLOWED_EXTENSIONS, TARGET_BITS, TARGET_SR


class AudioError(Exception):
    """音频解码 / 校验失败。"""


def supported_extension(filename: str) -> bool:
    ext = Path(filename or "").suffix.lower()
    return ext in ALLOWED_EXTENSIONS


def decode_audio(data: bytes, filename: str) -> tuple[np.ndarray, int]:
    """解码任意支持格式 → (float32 mono 波形, 原始采样率)。"""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise AudioError(f"不支持的音频格式：{ext or '未知'}（允许：{', '.join(sorted(ALLOWED_EXTENSIONS))}）")

    # 1) soundfile 直接可读的容器
    if ext in {".wav", ".flac", ".ogg", ".aiff", ".aif"}:
        try:
            with io.BytesIO(data) as buf:
                y, sr = sf.read(buf, dtype="float32", always_2d=False)
            return _to_mono(y), int(sr)
        except Exception:
            pass  # 有些 mp3 伪装成 .wav 等，交给 ffmpeg 兜底

    # 2) ffmpeg 路径
    return _decode_with_ffmpeg(data, filename)


def _decode_with_ffmpeg(data: bytes, filename: str) -> tuple[np.ndarray, int]:
    try:
        with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix.lower(), delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        try:
            proc = subprocess.run(
                [
                    "ffmpeg", "-y", "-i", tmp_path,
                    "-vn", "-ac", "1", "-ar", str(TARGET_SR),
                    "-f", "wav", "-acodec", "pcm_s16le", "-",
                ],
                capture_output=True,
                timeout=120,
            )
        finally:
            Path(tmp_path).unlink(missing_ok=True)
        if proc.returncode != 0:
            stderr = proc.stderr.decode("utf-8", errors="replace")[-400:]
            raise AudioError(f"ffmpeg 解码失败（{filename}）：{stderr}")
        y, sr = sf.read(io.BytesIO(proc.stdout), dtype="float32", always_2d=False)
        return _to_mono(y), int(sr)
    except FileNotFoundError:
        raise AudioError(
            "系统缺少 ffmpeg，无法解码 mp3/webm/m4a 等格式。"
            "请安装 ffmpeg（https://ffmpeg.org），或上传 wav 文件。"
        )


def _to_mono(y: np.ndarray) -> np.ndarray:
    if y.ndim == 2:
        y = np.mean(y, axis=1)
    return y.astype(np.float32)


def to_target_rate(y: np.ndarray, sr: int) -> np.ndarray:
    """重采样到 48kHz。"""
    return dsp.resample_poly(y, int(sr), TARGET_SR).astype(np.float32)


def preprocess(y: np.ndarray, sr: int = TARGET_SR, highpass: bool = True) -> np.ndarray:
    """标准预处理：带通 → 归一化 → 裁剪静音。输入应为 48kHz mono。"""
    if sr != TARGET_SR:
        y = to_target_rate(y, sr)
        sr = TARGET_SR
    if highpass:
        y = dsp.bandpass(y, sr, lo=150.0, hi=15000.0)
    y = dsp.rms_normalize(y, target_rms=0.05)
    y = dsp.trim_silence(y, sr)
    return y


def to_pcm16(y: np.ndarray, sr: int = TARGET_SR) -> bytes:
    """导出 48kHz/16bit 单声道 PCM（满足预处理规格，可用于存证/二次分析）。"""
    if sr != TARGET_SR:
        y = to_target_rate(y, sr)
    pcm = np.clip(np.round(y * 32767.0), -32768, 32767).astype(np.int16)
    return pcm.tobytes()


def duration_sec(y: np.ndarray, sr: int = TARGET_SR) -> float:
    return float(len(y)) / float(sr)


def fmt_duration(sec: float) -> str:
    """秒 → 'm:ss'（与前端 mock 历史 duration 格式一致）。"""
    sec = max(0, int(round(sec)))
    m, s = divmod(sec, 60)
    return f"{m}:{s:02d}"
