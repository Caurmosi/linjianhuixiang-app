"""
test_audio_pyav.py —— PyAV 解码分支（m4a/webm/aac 等 libsndfile 不支持的容器）

用 av 现场编码一段短 m4a（AAC 正弦波），走 decode_audio 断言成功，
并验证 m4a 走 PyAV 分支而非 ffmpeg 进程。
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

av = pytest.importorskip("av")  # PyAV 未安装则整体跳过

from app.core import audio  # noqa: E402


def _make_m4a_bytes(sr: int = 44100, duration: float = 0.5, freq: float = 440.0) -> bytes:
    """用 PyAV 现场编码一段单声道正弦波 m4a（AAC）。"""
    t = np.linspace(0.0, duration, int(sr * duration), endpoint=False)
    mono = (0.3 * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    buf = io.BytesIO()
    with av.open(buf, "w", format="mp4") as container:
        stream = container.add_stream("aac", rate=sr)
        stream.layout = "mono"
        stream.codec_context.format = "fltp"  # PyAV 18：采样格式字段为 format（旧版 sample_fmt）
        frame = av.AudioFrame.from_ndarray(mono.reshape(1, -1), format="fltp", layout="mono")
        frame.sample_rate = sr
        for packet in stream.encode(frame):
            container.mux(packet)
        for packet in stream.encode(None):
            container.mux(packet)
    return buf.getvalue()


def test_decode_m4a_via_pyav():
    """m4a 走 PyAV 分支解码成功：44100Hz、mono、非静音。"""
    data = _make_m4a_bytes()
    y, sr = audio.decode_audio(data, "recording.m4a")
    assert sr == 44100
    assert y.ndim == 1, "应返回 mono"
    assert y.dtype == np.float32
    assert abs(float(np.max(np.abs(y)))) > 0.01, "正弦波应非静音"


def test_decode_m4a_not_using_ffmpeg(monkeypatch):
    """m4a 应走 PyAV 而非 ffmpeg 进程：把 ffmpeg 分支打成必然失败仍能成功解码。"""
    data = _make_m4a_bytes()

    def boom(*args, **kwargs):
        raise RuntimeError("不应调用 ffmpeg 兜底")

    monkeypatch.setattr(audio, "_decode_with_ffmpeg", boom)
    y, sr = audio.decode_audio(data, "recording.m4a")
    assert sr == 44100
    assert y.ndim == 1
