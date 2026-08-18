"""
deps.py —— 登录态辅助

get_current_user(authorization_header) -> dict(user)
解析 `Authorization: Bearer <token>`，查 auth_tokens → users；缺失/无效 → 401。
"""
from __future__ import annotations

from ..db import database
from .errors import ApiError


def parse_bearer(authorization_header: str | None) -> str | None:
    """解析 "Bearer <token>"；缺失/格式错误返回 None。"""
    if not authorization_header:
        return None
    parts = authorization_header.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        return None
    return parts[1].strip()


def get_current_user(authorization_header: str | None) -> dict:
    """从 Authorization 头解析 Bearer token，返回 {id, username, created_at}；无效 401。"""
    token = parse_bearer(authorization_header)
    if token is None:
        raise ApiError(401, "未登录", "缺少或非法的 Authorization 头，请先登录")
    user = database.get_db().get_user_by_token(token)
    if user is None:
        raise ApiError(401, "登录已失效", "token 无效或已注销，请重新登录")
    return user
