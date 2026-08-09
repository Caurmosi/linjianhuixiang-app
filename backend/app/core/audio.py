"""
audio.py —— 音频解码与预处理管线

解码策略（依赖最小化）：
  - wav / flac / ogg / aiff / mp3：直接 soundfile 读取（内存 BytesIO；
    libsndfile ≥1.1 内置 mp3 解码，mp3 无需 ffmpeg）；
  - m4a / webm / aac：PyAV（libav/FFmpeg 库绑定，无需外部 ffmpeg 进程）解码；
  - 以上均失败时：调用 ffmpeg 进程兜底（转 48kHz 单声道 s16le wav 再读取，
    若系统无 ffmpeg，抛出带明确提示的解码错误）。

预处理：
  1) 统一 48kHz 单声道 float32
  2) 带通滤波（默认 150–15000Hz，去交通低频轰鸣）
  3) RMS 归一化 + 静音裁剪
  4) 导出 16bit PCM（满足“48kHz / 16bit”规格）
"""
from __future__ import annotations

import io
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from . import dsp
from ..config import ALLOWED_EXTENSIONS, TARGET_BITS, TARGET_SR


class AudioError(Exception):
    """音频解码 / 校验失败。"""


# 项目内约定 ffmpeg 位置：audio.py 在 backend/app/core/，向上 3 级到 backend/ffmpeg/bin
_PROJECT_FFMPEG_DIR = Path(__file__).resolve().parent.parent.parent / "ffmpeg" / "bin"


def _ffmpeg_exe() -> str:
    """解析 ffmpeg 可执行文件路径（优先级从高到低）：

    1. 环境变量 FFMPEG_PATH（若设置且指向存在的文件）；
    2. 项目内约定路径 backend/ffmpeg/bin/ffmpeg(.exe)（静态构建，不依赖系统 PATH）；
    3. 系统 PATH 中的 "ffmpeg"。

    仅在路径存在时返回绝对路径，否则回退下一级；最终返回字符串命令名。
    """
    env = os.environ.get("FFMPEG_PATH")
    if env and Path(env).is_file():
        return env
    for name in ("ffmpeg.exe", "ffmpeg"):
        cand = _PROJECT_FFMPEG_DIR / name
        if cand.is_file():
            return str(cand)
    return "ffmpeg"


def supported_extension(filename: str) -> bool:
    ext = Path(filename or "").suffix.lower()
    return ext in ALLOWED_EXTENSIONS


def _decode_with_pyav(data: bytes) -> tuple[np.ndarray, int] | None:
    """用 PyAV 解码 libsndfile 不支持的容器（m4a/webm/aac 等手机录音常见格式）。

    返回 (float32 mono 波形, 采样率)；PyAV 未安装或解码失败返回 None，交给 ffmpeg 兜底。
    """
    try:
        import av
    except ImportError:
        return None
    try:
        with av.open(io.BytesIO(data)) as container:
            stream = container.streams.audio[0]
            rate = int(stream.rate or 0)
            if rate <= 0:
                return None
            chunks = []
            for frame in container.decode(audio=0):
                arr = frame.to_ndarray()  # 多声道 → (channels, samples)；单声道 → (samples,)
                if arr.ndim == 2:
                    arr = arr.mean(axis=0)  # 声道均值混缩为 mono
                chunks.append(arr.astype(np.float32))
            if not chunks:
                return None
            return np.concatenate(chunks).astype(np.float32), rate
    except Exception:
        # 任何解码失败都继续走 ffmpeg 兜底
        return None


def decode_audio(data: bytes, filename: str) -> tuple[np.ndarray, int]:
    """解码任意支持格式 → (float32 mono 波形, 原始采样率)。"""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise AudioError(f"不支持的音频格式：{ext or '未知'}（允许：{', '.join(sorted(ALLOWED_EXTENSIONS))}）")

    # 1) soundfile 直接可读的容器（libsndfile 1.2.2 内置 mp3 解码，无需 ffmpeg）
    if ext in {".wav", ".flac", ".ogg", ".aiff", ".aif", ".mp3"}:
        try:
            with io.BytesIO(data) as buf:
                y, sr = sf.read(buf, dtype="float32", always_2d=False)
            return _to_mono(y), int(sr)
        except Exception:
            pass  # 异常变体/伪装文件，交给后续 PyAV / ffmpeg 兜底

    # 2) PyAV 解码（m4a/webm/aac 等 libsndfile 不支持的容器）
    pyav = _decode_with_pyav(data)
    if pyav is not None:
        return pyav

    # 3) ffmpeg 终兜底
    return _decode_with_ffmpeg(data, filename)


def _decode_with_ffmpeg(data: bytes, filename: str) -> tuple[np.ndarray, int]:
    try:
        with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix.lower(), delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        try:
            proc = subprocess.run(
                [
                    _ffmpeg_exe(), "-y", "-i", tmp_path,
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
            "系统缺少 ffmpeg，无法解码 webm/m4a/aac 等格式。"
            "请安装 ffmpeg（https://ffmpeg.org），"
            "或在 FFMPEG_PATH 环境变量 / 项目 backend/ffmpeg/bin 目录下放置 ffmpeg 可执行文件，"
            "或上传 wav/mp3 文件。"
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
