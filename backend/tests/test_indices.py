"""
test_indices.py —— 声学指数数值合理性：鸟鸣 vs 交通场景应显著区分
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core import indices as indices_mod  # noqa: E402
from app.core import birdnet, livability, noise, synth  # noqa: E402
from app.core import dsp  # noqa: E402


def _prepare(signal: np.ndarray):
    y = dsp.rms_normalize(signal, 0.05)
    return y


def test_indices_ranges():
    y = _prepare(synth.make_bird_sample(duration=15.0))
    idx = indices_mod.compute_indices(y, 48000)
    assert 0.0 <= idx["aci"] <= 5.0
    assert -1.0 <= idx["ndsi"] <= 1.0
    assert 0.0 <= idx["adi"] <= 1.0
    assert 0.0 <= idx["h"] <= 1.0
    # 展示值
    assert len(idx["indices"]) == 4
    for item in idx["indices"]:
        assert 0 <= item["pct"] <= 100


def test_bird_beats_traffic():
    bird = _prepare(synth.make_bird_sample(duration=15.0))
    traffic = _prepare(synth.make_traffic_sample(duration=15.0))
    bi = indices_mod.compute_indices(bird, 48000)
    ti = indices_mod.compute_indices(traffic, 48000)
    # 生物声带占优 → NDSI 更高
    assert bi["ndsi"] > ti["ndsi"]
    # 鸟鸣动态变化更强（dB 域 ACI）→ ACI 更高
    assert bi["aci"] > ti["aci"]
    # 指数均在合法量程
    assert -1.0 <= bi["ndsi"] <= 1.0 and -1.0 <= ti["ndsi"] <= 1.0
    assert 0.0 <= bi["adi"] <= 1.0 and 0.0 <= ti["adi"] <= 1.0
    assert 0.0 <= bi["h"] <= 1.0 and 0.0 <= ti["h"] <= 1.0


def test_noise_and_livability_separation():
    bird = _prepare(synth.make_bird_sample(duration=15.0))
    traffic = _prepare(synth.make_traffic_sample(duration=15.0))

    def full(signal):
        y = _prepare(signal)
        idx = indices_mod.compute_indices(y, 48000)
        freqs, S = indices_mod.spectrogram(y, 48000)  # noqa: SLF001
        det = birdnet.detect(y, threshold=0.5, max_species=10)
        nr = noise.estimate_noise_ratio(freqs, S, det["activity"])
        confs = [s["conf"] for s in det["species"]]
        lv = livability.compute_livability(len(det["species"]), np.mean(confs) if confs else 0.0, det["activity"], idx, nr)
        return lv, det, nr

    lv_bird, det_bird, nr_bird = full(bird)
    lv_traffic, det_traffic, nr_traffic = full(traffic)

    assert nr_bird < nr_traffic
    assert lv_bird["score"] > lv_traffic["score"]
    # 启发式引擎对合成啁啾应检出物种且生物多样性更高；
    # 真实 BirdNET 对合成信号可能无匹配（生物多样性由噪声折减主导，不在此断言）
    if det_bird["engine"] == "heuristic":
        assert lv_bird["bio"] > lv_traffic["bio"]
        assert len(det_bird["species"]) >= 1
    # 等级映射与前端 gradeOf 一致
    assert livability.grade_of(lv_bird["score"]) == (lv_bird["grade"], lv_bird["gradeEn"])
    assert livability.grade_of(70)[0] == "宜居"
    assert livability.grade_of(50)[0] == "一般"
    assert livability.grade_of(49)[0] == "受压"


def test_heuristic_engine_runs_without_model():
    info = birdnet.get_engine_status()
    assert info["engine"] in {"birdnet", "heuristic"}
    y = _prepare(synth.make_bird_sample(duration=10.0))
    det = birdnet.detect(y, threshold=0.3, max_species=10)
    assert det["engine"] in {"birdnet", "heuristic"}
    for s in det["species"]:
        assert {"id", "name", "latin", "conf", "freq", "period"} <= set(s.keys())
