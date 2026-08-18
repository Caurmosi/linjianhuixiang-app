"""
errors.py —— 业务错误统一格式

新增业务端点（登录 / 公共上传池）抛 ApiError，由 main.py 注册的异常处理器
输出统一错误体：{"error": "...", "detail": "..."}（前端 apiService 依赖展示）。
既有 HTTPException 端点保持原样（{"detail": "..."}），不受影响。
"""
from __future__ import annotations


class ApiError(Exception):
    """业务错误：携带 HTTP 状态码 + 顶层 error/detail 双字段。"""

    def __init__(self, status_code: int, message: str, detail: str | None = None) -> None:
        super().__init__(message)
        self.status_code = int(status_code)
        self.message = str(message)
        self.detail = str(detail) if detail is not None else str(message)
