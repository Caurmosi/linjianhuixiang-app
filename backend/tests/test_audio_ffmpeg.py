"""
test_audio_ffmpeg.py —— ffmpeg 可执行文件解析 _ffmpeg_exe() 单测
覆盖：环境变量 FFMPEG_PATH 优先 / 指向不存在文件时忽略 / 项目内路径
（ffmpeg.exe 与 ffmpeg 两种命名）/ PATH fallback。
全部用 monkeypatch + tmp_path，不实际执行 ffmpeg。
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core import audio  # noqa: E402


def test_project_dir_derivation():
    """_PROJECT_FFMPEG_DIR 应推导到 backend/ffmpeg/bin（audio.py 向上 3 级）。"""
    expected = Path(__file__).resolve().parent.parent / "ffmpeg" / "bin"
    assert audio._PROJECT_FFMPEG_DIR == expected


def test_env_var_wins_over_project_path(monkeypatch, tmp_path):
    """FFMPEG_PATH 指向存在的文件 → 优先使用，即使项目内路径也存在。"""
    fake = tmp_path / "custom-ffmpeg.exe"
    fake.write_bytes(b"")
    monkeypatch.setenv("FFMPEG_PATH", str(fake))
    monkeypatch.setattr(audio, "_PROJECT_FFMPEG_DIR", tmp_path)
    (tmp_path / "ffmpeg.exe").write_bytes(b"")  # 项目内路径同样存在
    assert audio._ffmpeg_exe() == str(fake)


def test_env_var_missing_file_falls_back(monkeypatch, tmp_path):
    """FFMPEG_PATH 指向不存在的文件 → 忽略，项目内也无 → PATH fallback。"""
    monkeypatch.setenv("FFMPEG_PATH", str(tmp_path / "no-such-ffmpeg.exe"))
    monkeypatch.setattr(audio, "_PROJECT_FFMPEG_DIR", tmp_path)
    assert audio._ffmpeg_exe() == "ffmpeg"


def test_project_windows_exe(monkeypatch, tmp_path):
    """未设 FFMPEG_PATH，项目内 backend/ffmpeg/bin/ffmpeg.exe 存在 → 使用绝对路径。"""
    monkeypatch.delenv("FFMPEG_PATH", raising=False)
    monkeypatch.setattr(audio, "_PROJECT_FFMPEG_DIR", tmp_path)
    exe = tmp_path / "ffmpeg.exe"
    exe.write_bytes(b"")
    assert audio._ffmpeg_exe() == str(exe)


def test_project_linux_name(monkeypatch, tmp_path):
    """未设 FFMPEG_PATH，项目内 backend/ffmpeg/bin/ffmpeg（无扩展名）存在 → 使用绝对路径。"""
    monkeypatch.delenv("FFMPEG_PATH", raising=False)
    monkeypatch.setattr(audio, "_PROJECT_FFMPEG_DIR", tmp_path)
    exe = tmp_path / "ffmpeg"
    exe.write_bytes(b"")
    assert audio._ffmpeg_exe() == str(exe)


def test_project_exe_preferred_over_plain_name(monkeypatch, tmp_path):
    """两种命名同时存在时优先 ffmpeg.exe。"""
    monkeypatch.delenv("FFMPEG_PATH", raising=False)
    monkeypatch.setattr(audio, "_PROJECT_FFMPEG_DIR", tmp_path)
    (tmp_path / "ffmpeg.exe").write_bytes(b"")
    (tmp_path / "ffmpeg").write_bytes(b"")
    assert audio._ffmpeg_exe() == str(tmp_path / "ffmpeg.exe")


def test_fallback_to_system_path(monkeypatch, tmp_path):
    """环境变量与项目内路径均无 → 回退系统 PATH 的 "ffmpeg"。"""
    monkeypatch.delenv("FFMPEG_PATH", raising=False)
    monkeypatch.setattr(audio, "_PROJECT_FFMPEG_DIR", tmp_path)  # 空目录
    assert audio._ffmpeg_exe() == "ffmpeg"
