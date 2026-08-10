"""
test_api.py —— 基础接口行为（health / 数据端点 / 历史）
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient

    from app.db import database
    from app.main import app

    tmp_db = Path(__file__).resolve().parent / "_test_api.db"
    if tmp_db.exists():
        tmp_db.unlink()
    database.reset_db_for_tests(tmp_db)
    with TestClient(app) as c:
        yield c
    database.close_db()
    tmp_db.unlink(missing_ok=True)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["service"] == "linjianhuixiang-backend"
    for field in ["engine", "modelLoaded", "db", "uptimeSec", "version", "timestamp"]:
        assert field in data


def test_all_data_endpoints_ok(client):
    for path in [
        "/api/species",
        "/api/indices",
        "/api/livability",
        "/api/heatmap",
        "/api/waveform",
        "/api/map-points",
        "/api/segment-points",
        "/api/green-spaces",
        "/api/suggestions",
        "/api/history",
    ]:
        r = client.get(path)
        assert r.status_code == 200, f"{path} → {r.status_code}"


def test_history_empty_and_append(client):
    r = client.get("/api/history")
    assert r.status_code == 200
    # 干净库返回列表（可为空）
    assert isinstance(r.json(), list)


def test_unknown_route_404(client):
    assert client.get("/api/nope").status_code == 404


# ---------------------------------------------------------------------------
# 地区记录 / 历史删除（增量功能）
# ---------------------------------------------------------------------------
def _summary(score=70, noise=30, species=6):
    return {
        "recording": "综合.wav",
        "speciesCount": species,
        "livability": {"score": score, "noise": noise, "bio": 76, "sound": 60},
        "species": [{"id": 1, "name": "白头鹎"}],
    }


def test_region_api_full_cycle(client):
    """POST 保存 → GET 列表（score 提取）→ PATCH 改名 → DELETE 删除。"""
    r = client.post("/api/regions", json={"name": "中山公园", "summary": _summary(score=70, noise=30)})
    assert r.status_code == 201, r.text
    created = r.json()
    for f in ["id", "name", "created_at", "detail", "score"]:
        assert f in created, f"创建响应缺少字段 {f}"
    assert created["score"] == 70

    # 同名第二条（归组依据）
    r2 = client.post("/api/regions", json={"name": "中山公园", "summary": _summary(score=74, noise=28)})
    assert r2.status_code == 201

    # GET 列表：含 score 提取
    r = client.get("/api/regions")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 2
    for item in items:
        assert item["name"] == "中山公园"
        assert item["score"] == item["detail"]["livability"]["score"], "列表 score 应等于快照 score"

    # PATCH 改名
    r = client.patch(f"/api/regions/{created['id']}", json={"name": "森林公园"})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "森林公园"

    # DELETE
    assert client.delete(f"/api/regions/{created['id']}").status_code == 200
    assert len(client.get("/api/regions").json()) == 1

    # 404 边界
    assert client.delete("/api/regions/99999").status_code == 404
    assert client.patch("/api/regions/99999", json={"name": "x"}).status_code == 404
    # 空 name 被 schema 拒绝
    assert client.post("/api/regions", json={"name": "", "summary": {}}).status_code == 422


def test_history_delete_api(client):
    """DELETE /api/history/{id}：存在删除成功，不存在 404。"""
    from app.db import database

    row = database.get_db().insert_history(
        {
            "name": "待删除.wav",
            "species": 3,
            "score": 66,
            "duration": "1:00",
            "noise": 35,
            "bio": 72,
            "sound": 58,
            "analysis": {"recording": "待删除.wav", "speciesCount": 3, "livability": {"score": 66}},
        }
    )
    target = row["id"]
    r = client.delete(f"/api/history/{target}")
    assert r.status_code == 200, r.text
    ids = [h["id"] for h in client.get("/api/history").json()]
    assert target not in ids, "删除后列表不应再包含该 id"
    assert client.delete(f"/api/history/{target}").status_code == 404, "重复删除应 404"
    assert client.delete("/api/history/999999").status_code == 404
