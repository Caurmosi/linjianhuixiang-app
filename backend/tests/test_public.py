"""
test_public.py —— 公共上传池接口：上传/聚合/视口/详情/我的/撤回/鉴权
geocode 一律 mock（monkeypatch），不真实调用高德。
"""
from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import quote

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core import privacy  # noqa: E402


@pytest.fixture()
def client():
    """函数级夹具：每个用例独立 DB，避免上传数据跨用例污染聚合断言。"""
    from fastapi.testclient import TestClient

    from app.db import database
    from app.main import app

    tmp_db = Path(__file__).resolve().parent / "_test_public.db"
    if tmp_db.exists():
        tmp_db.unlink()
    database.reset_db_for_tests(tmp_db)
    with TestClient(app) as c:
        yield c
    database.close_db()
    tmp_db.unlink(missing_ok=True)


@pytest.fixture(autouse=True)
def _geocode_mock(monkeypatch):
    """默认 mock 高德：geocode 返回西湖公园坐标，place 返回空。"""
    from app.api import routes

    def fake_amap_request(url, params):
        if "geocode" in url:
            return {"geocodes": [{"location": "120.132000,30.259000", "formatted_address": "西湖公园"}]}
        return {"pois": []}

    monkeypatch.setattr(routes, "_amap_request", fake_amap_request)


def _register(client, username="上传用户", password="secret123") -> str:
    r = client.post("/api/auth/register", json={"username": username, "password": password})
    assert r.status_code == 201, r.text
    return r.json()["token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _upload(client, token: str, **body) -> dict:
    payload = {"regionName": "西湖公园", "score": 70}
    payload.update(body)
    r = client.post("/api/public/records", json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------
# 上传
# ---------------------------------------------------------------------------
def test_upload_with_coords(client):
    """带 lat/lng → coords_source=gps，返回 201 契约字段。"""
    token = _register(client)
    data = _upload(client, token, lat=30.259, lng=120.132, score=78, confidence=0.9,
                   summary={"livability": {"score": 78}})
    assert data["id"] > 0
    assert data["regionName"] == "西湖公园"
    assert data["score"] == 78
    assert data["confidence"] == 0.9
    assert data["coordsSource"] == "gps"
    assert "|" in data["clusterKey"] and ":" in data["clusterKey"]
    assert data["createdAt"]


def test_upload_geocode_fallback(client):
    """无坐标 → geocode 反查兜底，coords_source=geocode。"""
    token = _register(client, "无坐标用户")
    data = _upload(client, token, score=70)
    assert data["coordsSource"] == "geocode"
    assert data["clusterKey"].startswith("西湖公园|")


def test_upload_geocode_fail_400(client, monkeypatch):
    """坐标全失败（高德不可达）→ 400「无法定位该地区，请在地图上选点」。"""
    from app.api import routes

    monkeypatch.setattr(routes, "_amap_request", lambda url, params: None)
    token = _register(client, "定位失败用户")
    r = client.post(
        "/api/public/records",
        json={"regionName": "不存在的地方", "score": 50},
        headers=_auth(token),
    )
    assert r.status_code == 400
    body = r.json()
    assert body["error"] == "无法定位该地区，请在地图上选点"


def test_upload_anonymous_null_username(client):
    """isAnonymous=true → 我的记录 username 为 null。"""
    token = _register(client, "匿名用户甲")
    data = _upload(client, token, lat=30.259, lng=120.132, score=66, isAnonymous=True)
    rec_id = data["id"]
    me = client.get("/api/public/me", headers=_auth(token)).json()["records"]
    mine = [m for m in me if m["id"] == rec_id][0]
    assert mine["isAnonymous"] is True
    assert mine["username"] is None


def test_upload_override_coords_manual(client):
    """overrideCoords 优先于 lat/lng → coords_source=manual，簇键按覆盖坐标计算。"""
    token = _register(client, "覆盖坐标用户")
    data = _upload(client, token, lat=30.259, lng=120.132, score=50,
                   overrideCoords={"lat": 30.1, "lng": 120.1})
    assert data["coordsSource"] == "manual"
    assert data["clusterKey"] == privacy.cluster_key("西湖公园", 30.1, 120.1)


def test_upload_score_clamped(client):
    """score clamp 0-100。"""
    token = _register(client, "钳制用户")
    assert _upload(client, token, lat=30.259, lng=120.132, score=150)["score"] == 100
    assert _upload(client, token, lat=30.259, lng=120.132, score=-5)["score"] == 0


def test_public_requires_auth(client):
    """公共只读（clusters 列表/详情）匿名可访问；写操作（上传/我的/撤回）需登录。"""
    assert client.get("/api/public/clusters").status_code == 200, "公共聚合应匿名可读（公共网页无登录）"
    assert client.get("/api/public/clusters/不存在%7C1%3A1").status_code == 404, "匿名访问详情：不存在 → 404（而非 401）"
    assert client.get("/api/public/me").status_code == 401
    assert client.post("/api/public/records", json={"regionName": "x", "score": 1}).status_code == 401
    assert client.delete("/api/public/records/1").status_code == 401


# ---------------------------------------------------------------------------
# 聚合 / 视口 / 详情
# ---------------------------------------------------------------------------
def test_clusters_aggregation_and_fuzz(client):
    """同格网合并、加权均值、fuzz 确定性。"""
    token = _register(client, "聚合用户")
    h = _auth(token)
    # 同格网两条（cell 6050:24020）+ 不同格网一条
    _upload(client, token, lat=30.251, lng=120.101, score=80, confidence=0.9)
    _upload(client, token, lat=30.252, lng=120.102, score=60, confidence=0.1)
    _upload(client, token, lat=30.40, lng=120.40, score=70, confidence=0.5)

    r = client.get("/api/public/clusters", headers=h)
    assert r.status_code == 200
    body = r.json()
    clusters = body["clusters"]
    assert body["total"] == 2  # 两条同格网合并成 1 簇 + 独立 1 簇
    two = [c for c in clusters if c["n"] == 2][0]
    assert two["scoreMin"] == 60 and two["scoreMax"] == 80
    # 加权均值：(80*0.9 + 60*0.1) / (0.9+0.1) = 78.0
    assert two["score"] == 78.0
    assert two["confidenceAvg"] == 0.5
    assert two["createdFrom"] and two["createdTo"]
    # fuzz 确定性：两次请求同簇坐标一致
    r2 = client.get("/api/public/clusters", headers=h).json()
    c2 = [c for c in r2["clusters"] if c["id"] == two["id"]][0]
    assert c2["lat"] == two["lat"] and c2["lng"] == two["lng"]


def test_clusters_viewport_filter(client):
    """视口过滤：仅返回视口内记录对应的簇。"""
    token = _register(client, "视口用户")
    h = _auth(token)
    _upload(client, token, lat=30.259, lng=120.132, score=70)
    _upload(client, token, regionName="滨江公园", lat=31.5, lng=121.5, score=60)

    r = client.get(
        "/api/public/clusters",
        params={"minLng": 120.0, "maxLng": 120.5, "minLat": 30.0, "maxLat": 30.5},
        headers=h,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["clusters"][0]["regionName"] == "西湖公园"


def test_cluster_detail(client):
    """详情：簇聚合 + 样本（匿名 → 匿名用户，date 到天，不含坐标）；未知 key → 404。"""
    token = _register(client, "详情用户")
    h = _auth(token)
    _upload(client, token, lat=30.259, lng=120.132, score=81, confidence=0.8, isAnonymous=True)

    clusters = client.get("/api/public/clusters", headers=h).json()["clusters"]
    assert len(clusters) == 1
    key = clusters[0]["id"]
    r = client.get(f"/api/public/clusters/{quote(key, safe='')}", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cluster"]["id"] == key
    assert len(body["samples"]) == 1
    s = body["samples"][0]
    assert s["nickname"] == "匿名用户"
    assert s["isAnonymous"] is True
    assert len(s["date"]) == 10  # YYYY-MM-DD
    assert s["score"] == 81
    assert s["confidence"] == 0.8
    # 未知 key → 404
    r = client.get(f"/api/public/clusters/{quote('不存在|1:1', safe='')}", headers=h)
    assert r.status_code == 404
    assert "error" in r.json()


# ---------------------------------------------------------------------------
# 我的记录 / 撤回
# ---------------------------------------------------------------------------
def test_me_only_own_records(client):
    """me 只返回本人记录。"""
    token_a = _register(client, "甲用户")
    token_b = _register(client, "乙用户")
    _upload(client, token_a, lat=30.259, lng=120.132, score=75)
    _upload(client, token_b, regionName="滨江公园", lat=31.5, lng=121.5, score=65)

    me_a = client.get("/api/public/me", headers=_auth(token_a)).json()["records"]
    assert len(me_a) == 1
    assert me_a[0]["regionName"] == "西湖公园"
    assert me_a[0]["username"] == "甲用户"
    assert me_a[0]["score"] == 75


def test_delete_public_record(client):
    """撤回：他人 403 / 本人 200 / 不存在 404。"""
    token = _register(client, "撤回用户")
    rec_id = _upload(client, token, lat=30.259, lng=120.132, score=72)["id"]

    token_b = _register(client, "他人用户")
    r = client.delete(f"/api/public/records/{rec_id}", headers=_auth(token_b))
    assert r.status_code == 403
    assert "error" in r.json()

    r = client.delete(f"/api/public/records/{rec_id}", headers=_auth(token))
    assert r.status_code == 200
    assert r.json() == {"ok": True, "id": rec_id}

    r = client.delete(f"/api/public/records/{rec_id}", headers=_auth(token))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# 高德瓦片代理（/api/tiles）
# ---------------------------------------------------------------------------
def test_tiles_out_of_range(client):
    """瓦片坐标越界 → 400。"""
    assert client.get("/api/tiles/20/0/0").status_code == 400
    assert client.get("/api/tiles/0/0/0").status_code == 400


def test_tiles_proxy_ok(client, monkeypatch):
    """代理转发：上游返回 PNG → 200 image/png。"""
    class _Resp:
        content = b"\x89PNG\r\n\x1a\nfake"
        def raise_for_status(self):
            return None
    import requests as _requests
    monkeypatch.setattr(_requests, "get", lambda *a, **k: _Resp())
    r = client.get("/api/tiles/12/3414/1684")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/png")
    assert r.content.startswith(b"\x89PNG")


def test_tiles_proxy_upstream_error(client, monkeypatch):
    """上游失败 → 502。"""
    def _boom(*a, **k):
        raise RuntimeError("upstream down")
    import requests as _requests
    monkeypatch.setattr(_requests, "get", _boom)
    assert client.get("/api/tiles/12/3414/1684").status_code == 502


# ---------------------------------------------------------------------------
# 检索 / 筛选（region 模糊 / 评分区间 / 时间窗 / 样本 id）
# ---------------------------------------------------------------------------
def test_clusters_search_and_filter(client):
    """region 模糊检索 + minScore/maxScore 聚合后过滤 + from/to 时间窗。"""
    t1 = _register(client, "检索甲", "secret123")
    t2 = _register(client, "检索乙", "secret123")
    _upload(client, t1, regionName="西湖公园", lat=30.26, lng=120.15, score=80)
    _upload(client, t1, regionName="西湖公园", lat=30.26, lng=120.15, score=60)
    _upload(client, t2, regionName="杭州植物园", lat=30.26, lng=120.12, score=45)

    # region 模糊：命中「西湖」→ 只含西湖公园簇
    r = client.get("/api/public/clusters", params={"region": "西湖"})
    assert r.status_code == 200
    names = [c["regionName"] for c in r.json()["clusters"]]
    assert names == ["西湖公园"]

    # minScore：西湖簇均值 (80+60)/2=70 → 过滤掉 45 的植物园，且西湖保留
    r = client.get("/api/public/clusters", params={"minScore": 50})
    names = [c["regionName"] for c in r.json()["clusters"]]
    assert names == ["西湖公园"]

    # maxScore：45 的植物园保留，西湖 70 被过滤
    r = client.get("/api/public/clusters", params={"maxScore": 50})
    names = [c["regionName"] for c in r.json()["clusters"]]
    assert names == ["杭州植物园"]

    # 时间窗：from=未来 → 空
    r = client.get("/api/public/clusters", params={"from": "2999-01-01T00:00:00Z"})
    assert r.json()["total"] == 0


def test_cluster_detail_samples_have_id(client):
    """详情样本带 id（供「我的记录」删除识别）。"""
    token = _register(client, "样本id", "secret123")
    _upload(client, token, regionName="带id公园", lat=30.2, lng=120.1, score=66)
    r = client.get("/api/public/clusters", params={"region": "带id公园"})
    cid = r.json()["clusters"][0]["id"]
    d = client.get(f"/api/public/clusters/{cid}").json()
    assert len(d["samples"]) >= 1
    assert isinstance(d["samples"][0]["id"], int)


# ---------------------------------------------------------------------------
# 趋势 / 多地区对比 / 生态简报
# ---------------------------------------------------------------------------
def _seed_cluster(client, username: str, region: str, lat: float, lng: float, scores: list[int]):
    """注册用户并对同一地区上传多条记录，返回第一条的 cluster_key。

    注意：本文件 _register 返回 token 字符串，_upload 返回响应 JSON dict。
    """
    token = _register(client, username, "secret123")
    cid = None
    for s in scores:
        r = _upload(client, token, regionName=region, lat=lat, lng=lng, score=s, confidence=0.8)
        cid = r.get("clusterKey") or cid
    return cid, token


def test_cluster_detail_has_trend_and_noise(client):
    """详情含 trend（时间升序）且样本带 noise。"""
    cid, _ = _seed_cluster(client, "趋势甲", "趋势公园", 30.2, 120.1, [60, 72, 68])
    d = client.get(f"/api/public/clusters/{cid}").json()
    assert len(d["trend"]) == 3
    dates = [p["date"] for p in d["trend"]]
    assert dates == sorted(dates), "trend 应按时间升序"
    assert all("score" in p and "confidence" in p for p in d["trend"])
    # 样本带 noise 字段（summary 缺失时 None，不报错）
    for s in d["samples"]:
        assert "noise" in s


def test_compare_clusters(client):
    """多地区对比：返回各簇评分/噪声/样本数/物种。"""
    cid1, _ = _seed_cluster(client, "对比甲", "对比公园A", 30.21, 120.11, [60, 80])
    cid2, _ = _seed_cluster(client, "对比乙", "对比公园B", 30.22, 120.12, [45])
    # 注意：不手动 quote——TestClient/httpx 会对 params 自动 URL 编码（手动 quote 会二次编码导致 404）
    r = client.get("/api/public/compare", params={"ids": cid1 + "," + cid2})
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 2
    by_name = {it["regionName"]: it for it in items}
    a = by_name["对比公园A"]
    assert a["n"] == 2 and a["score"] == 70.0
    assert "noiseAvg" in a and "speciesTop" in a


def test_compare_requires_ids(client):
    """compare 缺 ids → 400；超过 4 个 → 400。"""
    assert client.get("/api/public/compare").status_code == 400
    assert client.get("/api/public/compare", params={"ids": "a,b,c,d,e"}).status_code == 400


def test_eco_report_template_fallback(client, monkeypatch):
    """无 LLM key → 模板简报（含地区名与评分信息）。"""
    import app.core.eco_report as eco_report_mod
    monkeypatch.setattr(eco_report_mod, "LLM_API_KEY", "")
    cid, _ = _seed_cluster(client, "报告甲", "报告公园", 30.23, 120.13, [55, 65])
    r = client.get(f"/api/public/clusters/{cid}/report")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "template"
    assert body["regionName"] == "报告公园"
    assert "报告公园" in body["report"]
    assert "宜居度" in body["report"]


def test_eco_report_llm_failure_fallback(client, monkeypatch):
    """LLM 调用失败（接口 500）→ 降级模板，不报错。"""
    import app.core.eco_report as eco_report_mod
    monkeypatch.setattr(eco_report_mod, "LLM_API_KEY", "fake-key")
    def _boom(*a, **k):
        raise RuntimeError("upstream down")
    monkeypatch.setattr(eco_report_mod.requests, "post", _boom)
    cid, _ = _seed_cluster(client, "报告乙", "报告湖", 30.24, 120.14, [70])
    r = client.get(f"/api/public/clusters/{cid}/report")
    assert r.status_code == 200
    assert r.json()["source"] == "template"
