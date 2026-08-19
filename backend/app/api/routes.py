"""
routes.py —— REST 接口（与前端 apiService.js 12 个函数一一对应）

GET  /health
GET  /api/species         → 最近一次分析 / 基准 的物种清单
GET  /api/indices         → 声学指数（ACI/NDSI/ADI/H）
GET  /api/livability      → 宜居度耦合结果
GET  /api/heatmap         → 4×12 二维数组
GET  /api/map-points      → 空间样点
GET  /api/green-spaces    → 多绿地对比
GET  /api/suggestions     → 提升建议
GET  /api/history         → 历史记录列表
POST /api/analyze         → 上传音频（multipart），返回完整分析结果
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
import sqlite3
import time
from datetime import datetime, timezone

import requests
import numpy as np
from fastapi import APIRouter, File, Form, Header, HTTPException, Query, Response, UploadFile

from .. import config
from ..core import audio, birdnet, dsp, indices as indices_mod, livability as livability_mod
from ..core import noise as noise_mod
from ..core import baseline, synthesis
from ..core import eco_report
from ..core import privacy as privacy_mod
from ..db import database
from . import deps, schemas
from .errors import ApiError

router = APIRouter()
_started_at = time.time()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# 健康检查
# ---------------------------------------------------------------------------
@router.get("/health", response_model=schemas.Health, tags=["system"])
def health() -> schemas.Health:
    status = birdnet.get_engine_status()
    db_status = "ok"
    try:
        database.get_db().list_history(limit=1)
    except Exception:
        db_status = "error"
    return schemas.Health(
        status="ok",
        service=config.SERVICE_NAME,
        version=config.SERVICE_VERSION,
        engine=status["engine"],
        modelLoaded=status["model_loaded"],
        labelsCount=status["labels_count"],
        db=db_status,
        uptimeSec=round(time.time() - _started_at, 1),
        timestamp=_now_iso(),
    )


# ---------------------------------------------------------------------------
# GET 数据端点（统一从"最近一次分析"取数，无则返回基准数据）
# ---------------------------------------------------------------------------
def _latest() -> dict:
    detail = database.get_db().latest_analysis()
    return detail or {}


def _latest_or(section: str, fallback):
    detail = _latest()
    value = detail.get(section)
    return value if value is not None else fallback


@router.get("/api/species", response_model=list[schemas.Species], tags=["data"])
def get_species() -> list[dict]:
    return _latest_or("species", baseline.BASELINE_SPECIES)


@router.get("/api/indices", response_model=list[schemas.IndexItem], tags=["data"])
def get_indices() -> list[dict]:
    return _latest_or("indices", baseline.BASELINE_INDICES)


@router.get("/api/livability", response_model=schemas.Livability, tags=["data"])
def get_livability() -> dict:
    return _latest_or("livability", baseline.BASELINE_LIVABILITY)


@router.get("/api/heatmap", response_model=list[list[float]], tags=["data"])
def get_heatmap() -> list[list[float]]:
    return _latest_or("heatmap", baseline.BASELINE_HEATMAP)


@router.get("/api/waveform", response_model=list[float], tags=["data"])
def get_waveform() -> list[float]:
    return _latest_or("waveform", baseline.BASELINE_WAVEFORM)


@router.get("/api/map-points", response_model=list[schemas.MapPoint], tags=["data"])
def get_map_points() -> list[dict]:
    return _latest_or("mapPoints", baseline.BASELINE_MAP_POINTS)


@router.get("/api/segment-points", response_model=list[schemas.MapPoint], tags=["data"])
def get_segment_points() -> list[dict]:
    return _latest_or("segmentPoints", baseline.BASELINE_SEGMENT_POINTS)


@router.get("/api/green-spaces", response_model=list[schemas.GreenSpace], tags=["data"])
def get_green_spaces() -> list[dict]:
    return _latest_or("greenSpaces", baseline.BASELINE_GREEN_SPACES)


@router.get("/api/suggestions", response_model=list[str], tags=["data"])
def get_suggestions() -> list[str]:
    return _latest_or("suggestions", baseline.BASELINE_SUGGESTIONS)


@router.get("/api/history", response_model=list[schemas.HistoryItem], tags=["data"])
def get_history(limit: int = Query(100, ge=1, le=500)) -> list[dict]:
    return database.get_db().list_history(limit=limit)


@router.delete("/api/history/{item_id}", status_code=200, tags=["data"])
def delete_history(item_id: int) -> dict:
    """删除一条历史记录；id 不存在返回 404。"""
    if not database.get_db().delete_history(item_id):
        raise HTTPException(status_code=404, detail=f"历史记录不存在：id={item_id}")
    return {"ok": True, "id": item_id}


# ---------------------------------------------------------------------------
# 地区记录
# ---------------------------------------------------------------------------
def _region_score(detail: dict | None) -> int | None:
    if not isinstance(detail, dict):
        return None
    lv = detail.get("livability")
    s = lv.get("score") if isinstance(lv, dict) else None
    return s if isinstance(s, int) else None


def _region_record(item: dict) -> dict:
    """组合地区记录输出：detail 完整快照 + score 提取（便于列表展示）。"""
    return {
        "id": item["id"],
        "name": item["name"],
        "created_at": item["created_at"],
        "detail": item["detail"],
        "score": item.get("score", _region_score(item.get("detail"))),
    }


@router.get("/api/regions", response_model=list[schemas.RegionRecord], tags=["data"])
def get_regions() -> list[dict]:
    return [_region_record(r) for r in database.get_db().list_regions()]


@router.post("/api/regions", response_model=schemas.RegionRecord, status_code=201, tags=["data"])
def create_region(payload: schemas.RegionCreate) -> dict:
    """保存地区记录：name（同名自动归组）+ summary 完整快照。"""
    row = database.get_db().insert_region(payload.name, payload.summary)
    record = database.get_db().get_region(row["id"])
    assert record is not None  # 刚插入必存在
    return _region_record(record)


@router.delete("/api/regions/{item_id}", status_code=200, tags=["data"])
def delete_region(item_id: int) -> dict:
    """删除一条地区记录；id 不存在返回 404。"""
    if not database.get_db().delete_region(item_id):
        raise HTTPException(status_code=404, detail=f"地区记录不存在：id={item_id}")
    return {"ok": True, "id": item_id}


@router.patch("/api/regions/{item_id}", response_model=schemas.RegionRecord, tags=["data"])
def rename_region(item_id: int, payload: schemas.RegionRename) -> dict:
    """重命名地区记录；id 不存在返回 404。"""
    if not database.get_db().rename_region(item_id, payload.name):
        raise HTTPException(status_code=404, detail=f"地区记录不存在：id={item_id}")
    record = database.get_db().get_region(item_id)
    assert record is not None
    return _region_record(record)


# ---------------------------------------------------------------------------
# 地名搜索代理（geocode）
# ---------------------------------------------------------------------------
def _parse_location(location: str) -> tuple[float, float] | None:
    """解析高德 location "lng,lat" → (lng, lat)；非法格式返回 None。"""
    if not location:
        return None
    try:
        lng, lat = (float(v) for v in str(location).split(",")[:2])
    except (ValueError, TypeError):
        return None
    if not (-180 <= lng <= 180 and -90 <= lat <= 90):
        return None
    return lng, lat


def _amap_request(url: str, params: dict) -> dict | None:
    """调用高德 Web 服务（5s 超时）；网络异常/非 JSON 返回 None。"""
    try:
        resp = requests.get(url, params=params, timeout=config.AMAP_TIMEOUT_SEC)
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception:
        return None


@router.get("/api/geocode", response_model=schemas.GeocodeResult, tags=["data"])
def geocode(q: str = Query(..., min_length=1, max_length=100, description="地名关键词")) -> dict:
    """
    地名搜索代理：调高德 geocode 把地名转坐标（GCJ-02，与瓦片一致）。
    - geocodes 非空 → 取前 3 条 formatted_address；
    - 空结果 → place/text 兜底 → 取前 3 条 poi；
    - 两者皆空 → 返回空 results（200）；
    - 无 key / 高德不可达 / 异常 → 400「地名搜索暂不可用」（前端降级手动定位）。
    """
    key = config.AMAP_WEB_KEY
    if not key:
        raise HTTPException(status_code=400, detail="地名搜索暂不可用")

    # 1) geocode 优先
    data = _amap_request(config.AMAP_GEOCODE_URL, {"address": q, "key": key})
    if data is None:
        raise HTTPException(status_code=400, detail="地名搜索暂不可用")
    geocodes = data.get("geocodes") if isinstance(data, dict) else None
    items: list[dict] = []
    if isinstance(geocodes, list) and geocodes:
        for g in geocodes[:3]:
            if not isinstance(g, dict):
                continue
            loc = _parse_location(g.get("location"))
            if loc is None:
                continue
            lng, lat = loc
            items.append({"name": g.get("formatted_address") or q, "lng": lng, "lat": lat})
        if items:
            return {"query": q, "results": items}

    # 2) 空结果 → place/text 兜底
    data = _amap_request(config.AMAP_PLACE_URL, {"keywords": q, "key": key})
    if data is None:
        raise HTTPException(status_code=400, detail="地名搜索暂不可用")
    pois = data.get("pois") if isinstance(data, dict) else None
    if isinstance(pois, list) and pois:
        for p in pois[:3]:
            if not isinstance(p, dict):
                continue
            loc = _parse_location(p.get("location"))
            if loc is None:
                continue
            lng, lat = loc
            items.append({"name": p.get("name") or q, "lng": lng, "lat": lat})

    return {"query": q, "results": items[:3]}


# ---------------------------------------------------------------------------
# 音频分析
# ---------------------------------------------------------------------------
def _build_species_list(detected: list[dict]) -> list[dict]:
    """统一物种条目：id 从 1 起，与前端契约一致。"""
    return [
        {
            "id": i + 1,
            "name": s["name"],
            "latin": s["latin"],
            "conf": round(min(0.99, max(0.01, float(s["conf"]))), 2),
            "freq": int(s.get("freq", 1)),
            "period": s.get("period", "全天"),
        }
        for i, s in enumerate(detected)
    ]


@router.post("/api/analyze", response_model=schemas.AnalysisResult, tags=["analyze"])
async def analyze(
    file: UploadFile = File(..., description="音频文件（wav/mp3/webm/m4a/ogg/flac/aac）"),
    threshold: float = Form(config.CONFIDENCE_THRESHOLD, ge=0.05, le=0.95, description="置信度阈值"),
    highpass: bool = Form(True, description="是否高通滤波去噪"),
    max_species: int = Form(config.MAX_SPECIES, ge=1, le=20),
) -> dict:
    filename = file.filename or "recording.wav"
    if not audio.supported_extension(filename):
        raise HTTPException(
            status_code=415,
            detail=f"不支持的音频格式：{filename}（允许 wav/mp3/webm/m4a/ogg/flac/aac/aiff）",
        )

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="上传的音频为空")
    if len(data) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"音频过大：{len(data) / 1024 / 1024:.1f}MB，上限 {config.MAX_UPLOAD_MB}MB",
        )

    # 1) 解码 + 预处理
    try:
        y, sr = audio.decode_audio(data, filename)
    except audio.AudioError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    y = audio.to_target_rate(y, sr)
    y = audio.preprocess(y, highpass=highpass)
    dur = audio.duration_sec(y)
    if dur < config.MIN_DURATION_SEC:
        raise HTTPException(
            status_code=400,
            detail=f"音频过短（{dur:.1f}s），至少需要 {config.MIN_DURATION_SEC:.0f}s",
        )
    if dur > config.MAX_DURATION_SEC:
        raise HTTPException(
            status_code=400,
            detail=f"音频过长（{dur:.1f}s），上限 {config.MAX_DURATION_SEC:.0f}s",
        )

    # 2) 识别
    det = birdnet.detect(y, threshold=threshold, max_species=max_species)
    species = _build_species_list(det["species"])
    activity = det["activity"]

    # 3) 声学指数 + 噪声 + 宜居度
    idx = indices_mod.compute_indices(y, 48000)
    freqs, S = indices_mod.spectrogram(y, 48000)
    noise_ratio = noise_mod.estimate_noise_ratio(freqs, S, activity)

    mean_conf = float(np.mean([s["conf"] for s in species])) if species else 0.0
    lv = livability_mod.compute_livability(len(species), mean_conf, activity, idx, noise_ratio, duration_sec=dur)

    # 4) 合成可视化数据
    heatmap = synthesis.heatmap(y, freqs, S, activity, lv["noise"])
    wave = synthesis.waveform(y)
    points = synthesis.map_points(lv["score"], seed=hash(filename) & 0xFFFFFFFF)
    seg_points = synthesis.segment_points(y, lv["score"], seed=hash(filename) & 0xFFFFFFFF)
    green = synthesis.green_spaces(filename, lv["score"])
    sugg = synthesis.suggestions(lv, idx, len(species))

    result = {
        "recording": filename,
        "species": species,
        "indices": idx["indices"],
        "livability": lv,
        "heatmap": heatmap,
        "waveform": wave,
        "mapPoints": points,
        "segmentPoints": seg_points,
        "greenSpaces": green,
        "suggestions": sugg,
        "speciesCount": len(species),
        "engine": det["engine"],
        "durationSec": round(dur, 1),
    }

    # 5) 持久化（历史 + 最近分析）
    db = database.get_db()
    db.save_analysis(result)
    db.insert_history(
        {
            "name": filename,
            "species": len(species),
            "score": lv["score"],
            "duration": audio.fmt_duration(dur),
            "noise": lv["noise"],
            "bio": lv["bio"],
            "sound": lv["sound"],
            "created_at": _now_iso(),
            # 完整分析快照：历史回放优先恢复（含 species/indices/heatmap/waveform/segmentPoints 等）
            "analysis": result,
        }
    )
    return result


# ---------------------------------------------------------------------------
# 登录系统（用户名 + 密码，无手机号/邮箱；服务端 token 表，长期有效）
# ---------------------------------------------------------------------------
_USERNAME_RE = re.compile(r"^[A-Za-z0-9_\u4e00-\u9fa5]+$")
_PBKDF2_ITERATIONS = 100_000


def _hash_password(password: str) -> str:
    """PBKDF2-SHA256 密码哈希，存储格式 `pbkdf2$<salt>$<hex>`。"""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("ascii"), _PBKDF2_ITERATIONS)
    return f"pbkdf2${salt}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    """校验存储的 pbkdf2 哈希（常量时间比较，防时序攻击）。"""
    try:
        scheme, salt, expected = stored.split("$", 2)
    except ValueError:
        return False
    if scheme != "pbkdf2":
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("ascii"), _PBKDF2_ITERATIONS)
    return hmac.compare_digest(digest.hex(), expected)


def _issue_token(user: dict) -> str:
    """生成 token（secrets.token_hex(32)）并写入 auth_tokens 表，返回 token 字符串。"""
    token = secrets.token_hex(32)
    database.get_db().create_token(token, user["id"])
    return token


def _validate_username(username: str) -> str | None:
    """校验用户名：1-20 字符，字母/数字/下划线/中文；非法返回错误信息，合法返回 None。"""
    if not (1 <= len(username) <= 20):
        return "用户名长度须为 1-20 个字符"
    if not _USERNAME_RE.match(username):
        return "用户名只能包含字母、数字、下划线和中文"
    return None


def _validate_password(password: str) -> str | None:
    """校验密码：至少 6 字符；非法返回错误信息，合法返回 None。"""
    if len(password) < 6:
        return "密码长度至少 6 个字符"
    return None


@router.post("/api/auth/register", response_model=schemas.AuthResponse, status_code=201, tags=["auth"])
def register(payload: schemas.RegisterRequest) -> dict:
    """注册即登录：创建用户 + 签发 token。重名 → 409；非法用户名/密码 → 400。"""
    username = payload.username.strip()
    err = _validate_username(username)
    if err:
        raise ApiError(400, err, err)
    err = _validate_password(payload.password)
    if err:
        raise ApiError(400, err, err)

    db = database.get_db()
    if db.get_user_by_username(username) is not None:
        raise ApiError(409, "用户名已被占用", f"用户名 {username} 已存在，请更换或直接登录")
    try:
        user = db.create_user(username, _hash_password(payload.password))
    except sqlite3.IntegrityError:
        # 并发注册兜底：唯一约束冲突同样视为重名
        raise ApiError(409, "用户名已被占用", f"用户名 {username} 已存在，请更换或直接登录")
    token = _issue_token(user)
    return {"token": token, "username": user["username"], "createdAt": user["created_at"]}


@router.post(
    "/api/auth/login",
    response_model=schemas.AuthResponse,
    response_model_exclude_none=True,
    status_code=200,
    tags=["auth"],
)
def login(payload: schemas.LoginRequest) -> dict:
    """登录：校验用户名 + 密码 → 签发 token。凭据错 → 401。"""
    username = payload.username.strip()
    user = database.get_db().get_user_by_username(username)
    if user is None or not _verify_password(payload.password, user["password_hash"]):
        raise ApiError(401, "用户名或密码错误", "用户名或密码不正确")
    token = _issue_token(user)
    return {"token": token, "username": user["username"]}


@router.post("/api/auth/logout", status_code=200, tags=["auth"])
def logout(authorization: str | None = Header(default=None)) -> dict:
    """登出：删除当前 token（幂等，token 不存在也返回 ok）。"""
    token = deps.parse_bearer(authorization)
    if token is None:
        raise ApiError(401, "未登录", "缺少或非法的 Authorization 头")
    database.get_db().delete_token(token)
    return {"ok": True}


@router.post("/api/auth/change-password", status_code=200, tags=["auth"])
def change_password(
    payload: schemas.ChangePasswordRequest,
    authorization: str | None = Header(default=None),
) -> dict:
    """修改密码：校验旧密码 → 更新哈希 → 删除该用户全部 token（强制重新登录）。

    旧密码错 → 401；新密码不合法 → 400。
    """
    user = deps.get_current_user(authorization)
    err = _validate_password(payload.newPassword)
    if err:
        raise ApiError(400, err, err)
    db = database.get_db()
    full = db.get_user_by_id(user["id"])
    if full is None or not _verify_password(payload.oldPassword, full["password_hash"]):
        raise ApiError(401, "旧密码不正确", "旧密码验证失败")
    db.update_password(user["id"], _hash_password(payload.newPassword))
    dropped = db.delete_user_tokens(user["id"])
    return {"ok": True, "droppedTokens": dropped}


@router.get("/api/auth/me", response_model=schemas.MeResponse, tags=["auth"])
def me(authorization: str | None = Header(default=None)) -> dict:
    """当前登录用户信息；token 缺失/无效 → 401。"""
    user = deps.get_current_user(authorization)
    return {"username": user["username"], "createdAt": user["created_at"]}


# ---------------------------------------------------------------------------
# 公共上传池（登录后可用）
# ---------------------------------------------------------------------------
def _geocode_first(region_name: str) -> tuple[float, float] | None:
    """用高德 geocode/place 反查地区名坐标（GCJ-02），返回 (lng, lat)；失败返回 None。

    复用 _amap_request（key 在后端 config，不暴露给前端）。
    """
    key = config.AMAP_WEB_KEY
    if not key:
        return None
    data = _amap_request(config.AMAP_GEOCODE_URL, {"address": region_name, "key": key})
    if isinstance(data, dict):
        for g in data.get("geocodes") or []:
            if not isinstance(g, dict):
                continue
            loc = _parse_location(g.get("location"))
            if loc is not None:
                return loc
    data = _amap_request(config.AMAP_PLACE_URL, {"keywords": region_name, "key": key})
    if isinstance(data, dict):
        for p in data.get("pois") or []:
            if not isinstance(p, dict):
                continue
            loc = _parse_location(p.get("location"))
            if loc is not None:
                return loc
    return None


@router.post(
    "/api/public/records",
    response_model=schemas.PublicRecordResponse,
    status_code=201,
    tags=["public"],
)
def create_public_record(
    payload: schemas.PublicRecordCreate,
    authorization: str | None = Header(default=None),
) -> dict:
    """公开上传：登录后写入一条公共记录（region 当前快照）。

    坐标解析顺序：overrideCoords(manual) > lat/lng(gps) > geocode 反查(geocode)；
    全失败 → 400「无法定位该地区，请在地图上选点」。
    is_anonymous=true 时 username 置 NULL。
    """
    user = deps.get_current_user(authorization)
    region_name = payload.regionName.strip()
    if not region_name:
        raise ApiError(400, "地区名称不能为空", "regionName 不能为空")

    lat: float | None = None
    lng: float | None = None
    coords_source = "manual"
    if payload.overrideCoords is not None:
        lat, lng = payload.overrideCoords.lat, payload.overrideCoords.lng
        coords_source = "manual"
    elif payload.lat is not None and payload.lng is not None:
        lat, lng = payload.lat, payload.lng
        coords_source = "gps"
    else:
        loc = _geocode_first(region_name)
        if loc is None:
            raise ApiError(400, "无法定位该地区，请在地图上选点", "无法定位该地区，请在地图上选点")
        lng, lat = loc
        coords_source = "geocode"

    score = max(0, min(100, int(payload.score)))
    is_anonymous = bool(payload.isAnonymous)
    username = None if is_anonymous else user["username"]
    key = privacy_mod.cluster_key(region_name, lat, lng)
    summary_json = json.dumps(payload.summary or {}, ensure_ascii=False)
    row = database.get_db().insert_public_record(
        {
            "user_id": user["id"],
            "username": username,
            "is_anonymous": is_anonymous,
            "region_name": region_name,
            "lat": lat,
            "lng": lng,
            "cluster_key": key,
            "score": score,
            "confidence": payload.confidence,
            "coords_source": coords_source,
            "summary_json": summary_json,
            "created_at": _now_iso(),
        }
    )
    return {
        "id": row["id"],
        "regionName": row["region_name"],
        "score": row["score"],
        "confidence": row["confidence"],
        "coordsSource": row["coords_source"],
        "clusterKey": row["cluster_key"],
        "createdAt": row["created_at"],
    }


@router.get("/api/public/clusters", response_model=schemas.ClusterListResponse, tags=["public"])
def get_public_clusters(
    minLng: float | None = Query(default=None),
    maxLng: float | None = Query(default=None),
    minLat: float | None = Query(default=None),
    maxLat: float | None = Query(default=None),
    region: str | None = Query(default=None),
    minScore: int | None = Query(default=None, ge=0, le=100),
    maxScore: int | None = Query(default=None, ge=0, le=100),
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
) -> dict:
    """公共聚合查询（匿名只读）：按 cluster_key 聚合 + 质心模糊。

    过滤：region 地区名模糊 / from-to 时间窗（聚合前 SQL 过滤）；
         minScore-maxScore 评分区间（聚合后按簇加权均值过滤）。
    """
    viewport = {
        "min_lng": minLng,
        "max_lng": maxLng,
        "min_lat": minLat,
        "max_lat": maxLat,
        "region": region,
        "from": from_,
        "to": to,
    }
    rows = database.get_db().list_public_records(viewport)
    clusters = privacy_mod.aggregate_clusters(rows)
    if minScore is not None:
        clusters = [c for c in clusters if c["score"] >= minScore]
    if maxScore is not None:
        clusters = [c for c in clusters if c["score"] <= maxScore]
    total = len(clusters)
    return {"clusters": clusters[:limit], "total": total}


@router.get(
    "/api/public/clusters/{cluster_key}",
    response_model=schemas.ClusterDetailResponse,
    tags=["public"],
)
def get_public_cluster_detail(
    cluster_key: str,
) -> dict:
    """聚合点详情（匿名只读）：簇聚合 + 样本（昵称/日期/评分/噪声）+ 趋势序列（不返回坐标）。"""
    rows = database.get_db().list_public_records()
    matched = [r for r in rows if r["cluster_key"] == cluster_key]
    if not matched:
        raise ApiError(404, "聚合点不存在", f"cluster_key={cluster_key} 不存在")
    cluster = privacy_mod.aggregate_clusters(matched)[0]
    samples = [
        {
            "id": r["id"],
            "nickname": "匿名用户" if r["is_anonymous"] or not r["username"] else r["username"],
            "isAnonymous": bool(r["is_anonymous"]),
            "date": str(r["created_at"])[:10],
            "score": r["score"],
            "confidence": r["confidence"],
            "noise": privacy_mod.noise_of(r),
        }
        for r in matched
    ]
    trend = privacy_mod.build_trend(matched)
    return {"cluster": cluster, "samples": samples, "trend": trend}


@router.get("/api/public/compare", response_model=schemas.CompareResponse, tags=["public"])
def compare_public_clusters(
    ids: str | None = Query(default=None, description="逗号分隔的 cluster_key 列表，最多 4 个（每个需 URL 编码）"),
) -> dict:
    """多地区对比（匿名只读）：给定多个聚合点 id，返回每簇评分/噪声/置信度/样本数/物种 Top。"""
    if not ids or not ids.strip():
        raise ApiError(400, "缺少 ids", "请提供至少一个聚合点 id")
    keys = [k.strip() for k in ids.split(",") if k.strip()]
    if len(keys) > 4:
        raise ApiError(400, "最多对比 4 个地区", f"收到 {len(keys)} 个，上限 4")
    rows = database.get_db().list_public_records()
    items = []
    for key in keys:
        matched = [r for r in rows if r["cluster_key"] == key]
        if not matched:
            continue
        c = privacy_mod.aggregate_clusters(matched)[0]
        items.append(
            {
                "id": key,
                "regionName": c["regionName"],
                "score": c["score"],
                "scoreMin": c["scoreMin"],
                "scoreMax": c["scoreMax"],
                "noiseAvg": privacy_mod.noise_avg(matched),
                "confidenceAvg": c["confidenceAvg"],
                "n": c["n"],
                "speciesTop": privacy_mod.species_counts(matched),
            }
        )
    if not items:
        raise ApiError(404, "聚合点不存在", "提供的 id 均无数据")
    return {"items": items}


@router.get("/api/public/clusters/{cluster_key}/report", response_model=schemas.ReportResponse, tags=["public"])
def get_cluster_eco_report(
    cluster_key: str,
) -> dict:
    """地区生态简报（匿名只读）：聚合数据 → 大模型（LLM_API_KEY）或规则模板生成 Markdown。"""
    rows = database.get_db().list_public_records()
    matched = [r for r in rows if r["cluster_key"] == cluster_key]
    if not matched:
        raise ApiError(404, "聚合点不存在", f"cluster_key={cluster_key} 不存在")
    cluster = privacy_mod.aggregate_clusters(matched)[0]
    data = {
        "regionName": cluster["regionName"],
        "n": cluster["n"],
        "score": cluster["score"],
        "scoreMin": cluster["scoreMin"],
        "scoreMax": cluster["scoreMax"],
        "confidenceAvg": cluster["confidenceAvg"],
        "noiseAvg": privacy_mod.noise_avg(matched),
        "speciesTop": privacy_mod.species_counts(matched),
        "trend": privacy_mod.build_trend(matched),
    }
    report, source = eco_report.generate_eco_report(data)
    return {"regionName": cluster["regionName"], "source": source, "report": report}


@router.get("/api/public/me", response_model=schemas.MyPublicRecordsResponse, tags=["public"])
def get_my_public_records(authorization: str | None = Header(default=None)) -> dict:
    """我的公开记录：当前用户上传的全部记录（可撤回管理）。"""
    user = deps.get_current_user(authorization)
    rows = database.get_db().list_public_records_by_user(user["id"])
    records = [
        {
            "id": r["id"],
            "regionName": r["region_name"],
            "score": r["score"],
            "createdAt": r["created_at"],
            "isAnonymous": bool(r["is_anonymous"]),
            "username": r["username"],
        }
        for r in rows
    ]
    return {"records": records}


@router.delete("/api/public/records/{record_id}", status_code=200, tags=["public"])
def delete_public_record(
    record_id: int,
    authorization: str | None = Header(default=None),
) -> dict:
    """撤回公开记录：仅本人（user_id 匹配）可删；他人 403，不存在 404。"""
    user = deps.get_current_user(authorization)
    db = database.get_db()
    record = db.get_public_record(record_id)
    if record is None:
        raise ApiError(404, "记录不存在", f"公共记录 id={record_id} 不存在")
    if record["user_id"] != user["id"]:
        raise ApiError(403, "无权删除他人记录", "只能撤回自己的公开记录")
    db.delete_public_record(record_id)
    return {"ok": True, "id": record_id}


# ---------------------------------------------------------------------------
# 高德栅格瓦片代理（/api/tiles/...）
# 背景：高德瓦片服务器（webrd0X.is.autonavi.com）不返回 CORS 头，
#       公共地图网页（独立托管域名）在浏览器里直接加载会被 CORS 拦截；
#       由后端代理转发则无跨域限制，且可带 UA/Referer 规避防盗链。
# 用法：网页 raster source 指向 {API_BASE}/api/tiles/{z}/{x}/{y}
# ---------------------------------------------------------------------------
_TILE_SUBDOMAINS = ["webrd01", "webrd02", "webrd03", "webrd04"]
_TILE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Referer": "https://www.amap.com/",
}


@router.get("/api/tiles/{z}/{x}/{y}", tags=["map"])
def proxy_tile(z: int, x: int, y: int) -> Response:
    """代理高德栅格瓦片（style=7 路网）。z 1-19，防滥用限制。"""
    if not (1 <= z <= 19 and 0 <= x < (1 << z) and 0 <= y < (1 << z)):
        raise HTTPException(status_code=400, detail="瓦片坐标越界")
    sub = _TILE_SUBDOMAINS[(x + y + z) % len(_TILE_SUBDOMAINS)]
    # 注意：lang=zh_cn&size=1&scale=1 必须齐全，否则高德返回 404；style=8 为标准版（style=7 为旧线划样式）
    url = (
        f"https://{sub}.is.autonavi.com/appmaptile?"
        f"lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}"
    )
    try:
        resp = requests.get(url, headers=_TILE_HEADERS, timeout=8)
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"瓦片代理失败: {exc}") from exc
    return Response(content=resp.content, media_type="image/png")
