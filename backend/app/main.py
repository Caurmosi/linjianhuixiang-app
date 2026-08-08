"""
main.py —— FastAPI 应用入口

启动：uvicorn app.main:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config
from .api import routes

app = FastAPI(
    title="林间回响 · 后端服务",
    description="城市绿地鸟类宜居度诊断：BirdNET 鸟声识别 + 声学指数 + 人为噪声耦合 + 宜居度评分",
    version=config.SERVICE_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGIN_LIST if config.CORS_ORIGIN_LIST != ["*"] else ["*"],
    allow_credentials=False if "*" in config.CORS_ORIGIN_LIST else True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes.router)


# ---------------------------------------------------------------------------
# 统一错误处理（前端 apiService 依赖 message 字段展示）
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "服务器内部错误", "detail": str(exc)},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)
