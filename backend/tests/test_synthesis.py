"""
test_synthesis.py —— waveform / segment_points / 真实时频 heatmap 单元测试

验证：
  - waveform 长度 = n、值域 [0,1]、round 3 位、不同输入不同；
  - heatmap 仍为 4×12，且由真实时频能量驱动（不同音频明显不同、时段列随能量变化）；
  - segment_points 返回 n 个含 x/y/c/t 的样点，坐标落在画布内。
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core import indices as indices_mod  # noqa: E402
from app.core import synthesis, synth  # noqa: E402


def _bird(duration: float = 20.0) -> np.ndarray:
    return synth.make_bird_sample(duration=duration)


def _traffic(duration: float = 20.0) -> np.ndarray:
    return synth.make_traffic_sample(duration=duration)


def _spec(y: np.ndarray):
    return indices_mod.spectrogram(y, 48000)


# ---------------------------------------------------------------------------
# waveform
# ---------------------------------------------------------------------------
def test_waveform_length_range_and_round():
    wf = synthesis.waveform(_bird(), n=160)
    assert len(wf) == 160
    for v in wf:
        assert 0.0 <= v <= 1.0, f"波形值越界: {v}"
        assert round(v, 3) == v, f"波形值应保留 3 位: {v}"


def test_waveform_empty_and_constant():
    assert synthesis.waveform(np.zeros(0), n=160) == [0.0] * 160
    assert synthesis.waveform(np.zeros(48000), n=160) == [0.0] * 160


def test_waveform_different_inputs_differ():
    assert synthesis.waveform(_bird(), n=120) != synthesis.waveform(_traffic(), n=120)


def test_waveform_follows_energy_envelope():
    """前半静音后半活跃 → 后半段波形值整体更高。"""
    sr = 48000
    silence = np.zeros(sr * 10, dtype=np.float32)
    chirp = synth._chirp(3000, 5000, 10.0, sr, amp=0.9)
    y = np.concatenate([silence, chirp]).astype(np.float32)
    wf = synthesis.waveform(y, n=160)
    assert np.mean(wf[:80]) < np.mean(wf[80:]) - 0.3


# ---------------------------------------------------------------------------
# heatmap（真实时频驱动）
# ---------------------------------------------------------------------------
def test_heatmap_shape_and_range():
    y = _bird()
    freqs, S = _spec(y)
    hm = synthesis.heatmap(y, freqs, S, activity=0.5, noise=30.0)
    assert len(hm) == 4
    for row in hm:
        assert len(row) == 12
        for v in row:
            assert 0.0 <= v <= 1.0


def test_heatmap_different_audio_clearly_differs():
    yb = _bird()
    yt = _traffic()
    fb, Sb = _spec(yb)
    ft, St = _spec(yt)
    hb = synthesis.heatmap(yb, fb, Sb, activity=0.5, noise=20.0)
    ht = synthesis.heatmap(yt, ft, St, activity=0.5, noise=20.0)
    assert hb != ht
    # 交通噪声低频能量主导 → 低频行（第 0 行）均值应高于鸟鸣场景
    assert np.mean(ht[0]) > np.mean(hb[0]) + 0.15
    # 生物声带行（2/3 行）鸟鸣应占优
    bio_bird = (np.mean(hb[2]) + np.mean(hb[3])) / 2
    bio_traffic = (np.mean(ht[2]) + np.mean(ht[3])) / 2
    assert bio_bird > bio_traffic + 0.15


def test_heatmap_columns_driven_by_energy():
    """前半静音后半活跃 → 后半时段列整体更亮（时段列由真实能量驱动）。"""
    sr = 48000
    silence = np.zeros(sr * 10, dtype=np.float32)
    chirp = synth._chirp(3000, 5000, 10.0, sr, amp=0.9)
    y = np.concatenate([silence, chirp]).astype(np.float32)
    freqs, S = _spec(y)
    hm = synthesis.heatmap(y, freqs, S, activity=0.5, noise=20.0)
    col_first = np.mean([row[0] for row in hm])
    col_last = np.mean([row[-1] for row in hm])
    assert col_last > col_first + 0.1


def test_heatmap_fallback_without_stft():
    """STFT 缺失时回退：时段列仍由 y 能量驱动，形状不变。"""
    y = _bird()
    hm = synthesis.heatmap(y, None, None, activity=0.5, noise=30.0)
    assert len(hm) == 4
    for row in hm:
        assert len(row) == 12
        for v in row:
            assert 0.0 <= v <= 1.0


# ---------------------------------------------------------------------------
# segment_points
# ---------------------------------------------------------------------------
def test_segment_points_shape_and_fields():
    pts = synthesis.segment_points(_bird(), score=68, seed=1, n=6)
    assert len(pts) == 6
    for p in pts:
        assert {"x", "y", "c", "t"} <= set(p.keys()), f"样点缺少字段: {p}"
        assert isinstance(p["x"], int) and isinstance(p["y"], int)
        assert p["c"].startswith("#")
        assert isinstance(p["t"], str)


def test_segment_points_bounds_and_labels():
    pts = synthesis.segment_points(_bird(), score=50, seed=2, n=8)
    assert len(pts) == 8
    for p in pts:
        assert 50 <= p["x"] <= 285
        assert 30 <= p["y"] <= 150
    assert pts[0]["t"] == "开始"
    assert pts[-1]["t"] == "结束"
    assert all(p["t"] == "" for p in pts[1:-1])


def test_segment_points_driven_by_audio():
    """低能量 + 高低频占比段 → 受压；高能量生物声段 → 宜居/一般。"""
    sr = 48000
    silence = np.zeros(sr * 15, dtype=np.float32)
    chirp = synth._chirp(3000, 5000, 15.0, sr, amp=0.9)
    y = np.concatenate([silence, chirp]).astype(np.float32)  # 前半静音、后半鸟声
    pts = synthesis.segment_points(y, score=68, seed=3, n=6)
    assert len(pts) == 6
    # 至少存在非"受压"的样点（后半鸟声段）
    assert any(p["c"] != "#c25a39" for p in pts)


def test_segment_points_empty_fallback():
    pts = synthesis.segment_points(np.zeros(0), score=68, seed=0, n=6)
    assert len(pts) == 6
    for p in pts:
        assert {"x", "y", "c", "t"} <= set(p.keys())
