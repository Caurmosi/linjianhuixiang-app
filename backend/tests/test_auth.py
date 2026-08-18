"""
test_auth.py —— 登录系统接口：注册/重名/密码与用户名规则/登录/me/登出/无效 token
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

    tmp_db = Path(__file__).resolve().parent / "_test_auth.db"
    if tmp_db.exists():
        tmp_db.unlink()
    database.reset_db_for_tests(tmp_db)
    with TestClient(app) as c:
        yield c
    database.close_db()
    tmp_db.unlink(missing_ok=True)


def _register(client, username: str, password: str = "secret123"):
    return client.post("/api/auth/register", json={"username": username, "password": password})


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_register_success(client):
    """注册即登录：201 + {token, username, createdAt}。"""
    r = _register(client, "绿荫观察员")
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["username"] == "绿荫观察员"
    assert data["token"]
    assert data["createdAt"]


def test_register_duplicate_409(client):
    """重名注册 → 409 + 统一错误体。"""
    assert _register(client, "重复用户").status_code == 201
    r = _register(client, "重复用户", "other456")
    assert r.status_code == 409
    body = r.json()
    assert "error" in body and "detail" in body


def test_register_short_password_400(client):
    """密码 <6 字符 → 400（而非 422）。"""
    r = _register(client, "短密码", "12345")
    assert r.status_code == 400
    assert "error" in r.json() and "detail" in r.json()


def test_register_invalid_username_400(client):
    """非法用户名（空/含空格/含横线/超长）→ 400。"""
    for name in ["", "a b", "含-横线", "x" * 21]:
        r = _register(client, name)
        assert r.status_code == 400, f"username={name!r} → {r.status_code}"
        assert "error" in r.json()


def test_login_success(client):
    """正确凭据登录 → 200 + {token, username}。"""
    assert _register(client, "登录测试").status_code == 201
    r = client.post("/api/auth/login", json={"username": "登录测试", "password": "secret123"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["username"] == "登录测试"
    assert data["token"]


def test_login_wrong_password_401(client):
    """密码错误 → 401 + 统一错误体。"""
    assert _register(client, "错密码").status_code == 201
    r = client.post("/api/auth/login", json={"username": "错密码", "password": "wrong123"})
    assert r.status_code == 401
    assert "error" in r.json() and "detail" in r.json()
    # 不存在的用户名同样 401
    r = client.post("/api/auth/login", json={"username": "不存在用户", "password": "secret123"})
    assert r.status_code == 401


def test_me(client):
    """GET /api/auth/me：有效 token → {username, createdAt}。"""
    token = _register(client, "me测试").json()["token"]
    r = client.get("/api/auth/me", headers=_auth(token))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["username"] == "me测试"
    assert data["createdAt"]


def test_me_invalid_token_401(client):
    """无效 token / 无 header → 401。"""
    r = client.get("/api/auth/me", headers=_auth("deadbeef" * 8))
    assert r.status_code == 401
    assert "error" in r.json()
    assert client.get("/api/auth/me").status_code == 401


def test_logout(client):
    """登出删除 token → 200 {ok:true}；登出后原 token 失效。"""
    token = _register(client, "登出测试").json()["token"]
    r = client.post("/api/auth/logout", headers=_auth(token))
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    assert client.get("/api/auth/me", headers=_auth(token)).status_code == 401


def test_logout_requires_header(client):
    """登出缺 header → 401。"""
    assert client.post("/api/auth/logout").status_code == 401
