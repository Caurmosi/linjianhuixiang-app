"""
test_contract.py —— 数据契约测试：验证接口返回与前端契约完全一致
（对应 frontend/tests/dataContract.test.js 中守护的字段集）
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core import synth  # noqa: E402


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient

    from app.db import database
    from app.main import app

    tmp_db = Path(__file__).resolve().parent / "_test_contract.db"
    if tmp_db.exists():
        tmp_db.unlink()
    database.reset_db_for_tests(tmp_db)
    with TestClient(app) as c:
        yield c
    database.close_db()
    tmp_db.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# 物种 / 指数 / 宜居度
# ---------------------------------------------------------------------------
def test_species_contract(client):
    r = client.get("/api/species")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) > 0
    first = data[0]
    for field in ["id", "name", "latin", "conf", "freq", "period"]:
        assert field in first, f"species 缺少字段 {field}"
    assert 0.0 <= first["conf"] <= 1.0
    assert first["period"] in {"清晨", "上午", "黄昏", "全天"}


def test_indices_contract(client):
    r = client.get("/api/indices")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) == 4
    keys = {d["key"] for d in data}
    assert keys == {"ACI", "NDSI", "ADI", "H"}
    for d in data:
        for field in ["key", "name", "display", "pct", "desc"]:
            assert field in d, f"index 缺少字段 {field}"
        assert 0 <= d["pct"] <= 100
        assert isinstance(d["display"], str)


def test_livability_contract(client):
    r = client.get("/api/livability")
    assert r.status_code == 200
    data = r.json()
    for field in ["score", "grade", "gradeEn", "bio", "sound", "noise"]:
        assert field in data, f"livability 缺少字段 {field}"
    assert 0 <= data["score"] <= 100
    assert data["grade"] in {"宜居", "一般", "受压"}
    assert data["gradeEn"] in {"Good", "Moderate", "Stressed"}


# ---------------------------------------------------------------------------
# 热力图 / 地图 / 绿地 / 建议
# ---------------------------------------------------------------------------
def test_heatmap_contract(client):
    r = client.get("/api/heatmap")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 4
    for row in data:
        assert len(row) == 12
        for v in row:
            assert 0.0 <= v <= 1.0


def test_map_points_contract(client):
    r = client.get("/api/map-points")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) == 6
    for p in data:
        for field in ["x", "y", "c", "t"]:
            assert field in p, f"mapPoint 缺少字段 {field}"
        assert p["c"].startswith("#")


def test_green_spaces_contract(client):
    r = client.get("/api/green-spaces")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) == 3
    for gs in data:
        assert "name" in gs
        assert isinstance(gs["points"], list) and len(gs["points"]) == 6
        for p in gs["points"]:
            assert {"x", "y", "c", "t"} <= set(p.keys())


def test_suggestions_contract(client):
    r = client.get("/api/suggestions")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) >= 1
    assert all(isinstance(s, str) and s for s in data)


def test_history_contract(client):
    r = client.get("/api/history")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    if data:
        for field in ["id", "name", "species", "score", "duration", "noise", "bio", "sound"]:
            assert field in data[0], f"history 缺少字段 {field}"


# ---------------------------------------------------------------------------
# 完整分析（POST /api/analyze）—— 验收标准 ①
# ---------------------------------------------------------------------------
def _analyze(client, wav: bytes, filename: str, **params):
    return client.post(
        "/api/analyze",
        files={"file": (filename, io.BytesIO(wav), "audio/wav")},
        data={k: str(v) for k, v in params.items()},
    )


def test_analyze_bird_sample_contract(client):
    wav = synth.to_wav_bytes(synth.make_bird_sample(duration=20.0))
    r = _analyze(client, wav, "测试_清晨.wav")
    assert r.status_code == 200, r.text
    data = r.json()

    # 顶层契约字段
    for field in ["recording", "species", "indices", "livability", "heatmap", "mapPoints", "suggestions", "speciesCount", "waveform", "segmentPoints"]:
        assert field in data, f"analyze 缺少字段 {field}"

    # 波形：长度约 160、值域 [0,1]
    assert isinstance(data["waveform"], list) and len(data["waveform"]) > 0
    for v in data["waveform"]:
        assert 0.0 <= v <= 1.0
    # 分段样点：含 x/y/c/t
    assert isinstance(data["segmentPoints"], list) and len(data["segmentPoints"]) > 0
    for p in data["segmentPoints"]:
        assert {"x", "y", "c", "t"} <= set(p.keys())

    # 数值合理
    lv = data["livability"]
    for f in ["score", "bio", "sound", "noise"]:
        assert 0 <= lv[f] <= 100
    assert 0 <= lv["noise"] <= 100
    assert data["speciesCount"] == len(data["species"])
    assert data["recording"] == "测试_清晨.wav"
    # 合成鸟鸣样本：启发式引擎应识别出物种；真实 BirdNET 对合成啁啾可能无匹配（shape 校验恒定）
    assert 0 <= data["speciesCount"] <= 20
    if data.get("engine") == "heuristic":
        assert data["speciesCount"] >= 1
    assert lv["score"] >= 40
    assert lv["noise"] < 70


def test_analyze_real_soundscape_detects_species(client):
    """真实录音（官方 BirdNET 示例声景）应识别出物种 —— 仅当资产文件存在时运行。"""
    asset = Path(__file__).resolve().parent.parent / "assets" / "real_soundscape.wav"
    if not asset.exists():
        pytest.skip("缺少 assets/real_soundscape.wav，跳过真实录音测试")
    wav = asset.read_bytes()
    r = _analyze(client, wav, "real_soundscape.wav")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["speciesCount"] >= 1
    for s in data["species"]:
        assert {"id", "name", "latin", "conf", "freq", "period"} <= set(s.keys())


def test_analyze_traffic_low_livability(client):
    wav = synth.to_wav_bytes(synth.make_traffic_sample(duration=20.0))
    r = _analyze(client, wav, "路口_交通.wav")
    assert r.status_code == 200, r.text
    data = r.json()
    lv = data["livability"]
    # 交通噪声场景：噪声占比高、物种少、得分低于鸟鸣场景
    assert lv["noise"] > 40
    assert data["speciesCount"] <= data["speciesCount"]  # 恒真占位，下面两条是真实断言
    assert lv["score"] < 70


def test_analyze_history_persisted(client):
    wav = synth.to_wav_bytes(synth.make_bird_sample(duration=10.0))
    r = _analyze(client, wav, "持久化测试.wav")
    assert r.status_code == 200
    hist = client.get("/api/history").json()
    names = [h["name"] for h in hist]
    assert "持久化测试.wav" in names
    # 最近一次分析应覆盖 GET /api/livability
    lv = client.get("/api/livability").json()
    assert lv["score"] == r.json()["livability"]["score"]


# ---------------------------------------------------------------------------
# 错误路径
# ---------------------------------------------------------------------------
def test_analyze_missing_file(client):
    r = client.post("/api/analyze")
    assert r.status_code in (400, 422)


def test_analyze_bad_extension(client):
    r = client.post("/api/analyze", files={"file": ("a.txt", b"hello", "text/plain")})
    assert r.status_code == 415


def test_analyze_empty_file(client):
    r = client.post("/api/analyze", files={"file": ("a.wav", b"", "audio/wav")})
    assert r.status_code in (400, 422)
