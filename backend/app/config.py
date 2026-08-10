"""
《林间回响》后端配置 —— 所有可调参数集中于此，支持环境变量覆盖。
"""
from __future__ import annotations

import os
from pathlib import Path

# ---------------------------------------------------------------------------
# 路径
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("LJX_DATA_DIR", BACKEND_DIR / "data"))
MODELS_DIR = Path(os.getenv("LJX_MODELS_DIR", BACKEND_DIR / "models"))
ASSETS_DIR = BACKEND_DIR / "assets"

DATA_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# 服务
# ---------------------------------------------------------------------------
SERVICE_NAME = "linjianhuixiang-backend"
SERVICE_VERSION = "1.0.0"

# ---------------------------------------------------------------------------
# 数据库
# ---------------------------------------------------------------------------
DB_PATH = Path(os.getenv("LJX_DB_PATH", DATA_DIR / "linjianhuixiang.db"))

# ---------------------------------------------------------------------------
# BirdNET 模型
# ---------------------------------------------------------------------------
# mode: auto = 有模型用 BirdNET，否则启发式；birdnet = 强制 BirdNET（缺模型报错）；heuristic = 强制启发式
BIRDSNET_MODE = os.getenv("LJX_BIRDSNET_MODE", "auto").lower()
BIRDSNET_MODEL_PATH = Path(
    os.getenv("LJX_BIRDSNET_MODEL_PATH", MODELS_DIR / "BirdNET_GLOBAL_6K_V2.4_Model_FP16.tflite")
)
BIRDSNET_LABELS_PATH = Path(
    os.getenv("LJX_BIRDSNET_LABELS_PATH", MODELS_DIR / "eBird_taxonomy_codes_V6.0.csv")
)
# 识别置信度阈值（前端设置滑杆 0.30-0.90，默认 0.50 与前端一致）
CONFIDENCE_THRESHOLD = float(os.getenv("LJX_CONFIDENCE_THRESHOLD", "0.5"))
MAX_SPECIES = int(os.getenv("LJX_MAX_SPECIES", "10"))

# ---------------------------------------------------------------------------
# 音频
# ---------------------------------------------------------------------------
TARGET_SR = 48000  # 统一重采样到 48kHz
TARGET_BITS = 16  # 16bit PCM
MAX_UPLOAD_MB = int(os.getenv("LJX_MAX_UPLOAD_MB", "30"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
ALLOWED_EXTENSIONS = {".wav", ".mp3", ".webm", ".m4a", ".ogg", ".flac", ".aac", ".aiff", ".aif"}
# 分析最短/最长时长（秒）：过短无统计意义，过长浪费算力
MIN_DURATION_SEC = 1.0
MAX_DURATION_SEC = 600.0

# 启发式探测相关（音频段落在 2–8kHz 的突发能量视为“疑似鸟声”）
BIO_BAND = (2000.0, 8000.0)  # 鸟声主要频段
ANTHRO_BAND = (500.0, 2000.0)  # 人为噪声（交通/机械）主要频段

# ---------------------------------------------------------------------------
# 高德地图 Web 服务（地名搜索代理）
# ---------------------------------------------------------------------------
# 仅用于后端代理 /api/geocode（geocode 地名 → 坐标），key 可覆盖/替换：
#   export AMAP_KEY=你的key
# 瓦片底图走高德公开栅格瓦片（无 key，见前端 MapCanvas），与此 key 无关。
AMAP_WEB_KEY = os.getenv("AMAP_KEY", "ebb35c87bf1255f52b70bf9f59d2bcf8")
AMAP_GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo"
AMAP_PLACE_URL = "https://restapi.amap.com/v3/place/text"
AMAP_TIMEOUT_SEC = 5.0  # 高德请求超时（秒）

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
CORS_ORIGINS = os.getenv("LJX_CORS_ORIGINS", "*")
CORS_ORIGIN_LIST = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]


def get_settings() -> dict:
    """返回 /health 可展示的配置摘要（不含敏感信息）。"""
    return {
        "mode": BIRDSNET_MODE,
        "model_path": str(BIRDSNET_MODEL_PATH),
        "labels_path": str(BIRDSNET_LABELS_PATH),
        "threshold": CONFIDENCE_THRESHOLD,
        "max_species": MAX_SPECIES,
        "target_sr": TARGET_SR,
        "target_bits": TARGET_BITS,
        "max_upload_mb": MAX_UPLOAD_MB,
        "db_path": str(DB_PATH),
    }
