"""
test_audio_mp3.py —— MP3 解码走 soundfile 直接读取（无需 ffmpeg）

背景：libsndfile 1.2.2 内置 mp3 解码，真实 MP3 无需 ffmpeg。
用例使用 fixture tests/fixtures/sample1.mp3（1.9MB 真实 MP3，44100Hz 立体声 122s）。
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core import audio  # noqa: E402

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "sample1.mp3"


def test_soundfile_mp3_support_probe():
    """libsndfile 应原生支持 MP3 格式（available_formats 含 'MP3'）。"""
    assert "MP3" in sf.available_formats()


def test_decode_real_mp3_via_soundfile():
    """真实 MP3 由 soundfile 直接解码：成功、44100Hz、mono、非静音（全程不调用 ffmpeg）。"""
    data = FIXTURE.read_bytes()
    y, sr = audio.decode_audio(data, "sample1.mp3")
    assert sr == 44100
    assert y.ndim == 1, "应返回 mono（立体声需混缩为单声道）"
    assert y.dtype == np.float32
    assert abs(float(np.max(np.abs(y)))) > 0.01, "内容应非静音"
