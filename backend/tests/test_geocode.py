"""
test_geocode.py —— GET /api/geocode 地名搜索代理
mock 高德响应验证：geocode 解析 / 空结果 place 兜底 / 异常降级 400 / 无 key 400 / 非法坐标跳过。
不真实调用外部 API。
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

    tmp_db = Path(__file__).resolve().parent / "_test_geocode.db"
    if tmp_db.exists():
        tmp_db.unlink()
    database.reset_db_for_tests(tmp_db)
    with TestClient(app) as c:
        yield c
    database.close_db()
    tmp_db.unlink(missing_ok=True)


@pytest.fixture(autouse=True)
def _reset_key(monkeypatch):
    """每个用例前恢复默认 key，避免用例间污染。"""
    from app.api import routes

    monkeypatch.setattr(routes.config, "AMAP_WEB_KEY", "test-key-123")


def _mock_geocode(monkeypatch, geocodes=None, pois=None):
    """mock 网络边界函数 _amap_request：按 (geocode, place) 顺序返回固定响应。"""
    from app.api import routes

    responses = iter([geocodes, pois])

    def fake_amap_request(url, params):
        return next(responses)

    monkeypatch.setattr(routes, "_amap_request", fake_amap_request)


def test_geocode_parse(client, monkeypatch):
    """geocode 非空：解析 location/formatted_address，取前 3 条。"""
    _mock_geocode(
        monkeypatch,
        geocodes={
            "status": "1",
            "geocodes": [
                {"location": "116.391284,39.907139", "formatted_address": "中山公园(东门)"},
                {"location": "116.405285,39.904989", "formatted_address": "中山公园"},
                {"location": "116.5,39.5", "formatted_address": "中山公园(南门)"},
                {"location": "116.6,39.6", "formatted_address": "第四条被截断"},
            ],
        },
        pois=None,
    )
    r = client.get("/api/geocode", params={"q": "中山公园"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["query"] == "中山公园"
    results = body["results"]
    assert len(results) == 3, "应返回前 3 条"
    assert results[0] == {"name": "中山公园(东门)", "lng": 116.391284, "lat": 39.907139}
    assert results[2]["name"] == "中山公园(南门)" and results[2]["lng"] == 116.5
    assert all(r2["name"] != "第四条被截断" for r2 in results), "第 4 条应被截断"


def test_geocode_fallback_to_place(client, monkeypatch):
    """geocode 空结果 → place/text 兜底取 poi。"""
    _mock_geocode(
        monkeypatch,
        geocodes={"status": "1", "geocodes": []},
        pois={
            "status": "1",
            "pois": [
                {"location": "116.407526,39.904030", "name": "中山公园"},  # 只取前3
                {"location": "116.3,39.8", "name": "中山公园附近"},
                {"location": "116.4,39.9", "name": "中山公园地铁站"},
            ],
        },
    )
    r = client.get("/api/geocode", params={"q": "中山公园"})
    assert r.status_code == 200, r.text
    results = r.json()["results"]
    assert len(results) == 3
    assert results[0]["name"] == "中山公园"
    assert results[0]["lng"] == 116.407526


def test_geocode_invalid_location_skipped(client, monkeypatch):
    """location 非法（非数字 / 越界）的条目被跳过，不污染结果。"""
    _mock_geocode(
        monkeypatch,
        geocodes={
            "geocodes": [
                {"location": "not-a-coord", "formatted_address": "非法"},
                {"location": "999,999", "formatted_address": "越界"},
                {"location": "116.39,39.9", "formatted_address": "有效"},
            ]
        },
        pois=None,
    )
    r = client.get("/api/geocode", params={"q": "测试"})
    assert r.status_code == 200, r.text
    results = r.json()["results"]
    assert len(results) == 1, "非法/越界坐标应被跳过"
    assert results[0]["name"] == "有效"


def test_geocode_both_empty_returns_empty(client, monkeypatch):
    """geocode 与 place 皆空 → 200 + 空 results（前端展示未找到）。"""
    _mock_geocode(monkeypatch, geocodes={"geocodes": []}, pois={"pois": []})
    r = client.get("/api/geocode", params={"q": "不存在的地方xyz"})
    assert r.status_code == 200, r.text
    assert r.json()["results"] == []


def test_geocode_exception_returns_400(client, monkeypatch):
    """高德不可达/异常（_amap_request 返回 None）→ 400「地名搜索暂不可用」。"""
    from app.api import routes

    monkeypatch.setattr(routes, "_amap_request", lambda url, params: None)
    r = client.get("/api/geocode", params={"q": "中山公园"})
    assert r.status_code == 400
    assert r.json()["detail"] == "地名搜索暂不可用"


def test_geocode_place_exception_returns_400(client, monkeypatch):
    """geocode 空但 place 异常 → 同样 400（前端降级手动定位）。"""
    responses = iter([{"geocodes": []}, None])

    def fake(url, params):
        return next(responses)

    from app.api import routes

    monkeypatch.setattr(routes, "_amap_request", fake)
    r = client.get("/api/geocode", params={"q": "中山公园"})
    assert r.status_code == 400
    assert r.json()["detail"] == "地名搜索暂不可用"


def test_geocode_no_key_returns_400(client, monkeypatch):
    """无 key（环境变量未配置）→ 400，不发起网络请求。"""
    from app.api import routes

    monkeypatch.setattr(routes.config, "AMAP_WEB_KEY", "")
    called = []
    monkeypatch.setattr(routes, "_amap_request", lambda url, params: called.append(url) or {})
    r = client.get("/api/geocode", params={"q": "中山公园"})
    assert r.status_code == 400
    assert r.json()["detail"] == "地名搜索暂不可用"
    assert called == [], "无 key 时不应调用高德"


def test_geocode_q_validation(client):
    """q 缺失/空串 → 422（Query min_length 校验）。"""
    assert client.get("/api/geocode").status_code == 422
    assert client.get("/api/geocode", params={"q": ""}).status_code == 422
