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
