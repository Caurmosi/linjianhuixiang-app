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

import time
from datetime import datetime, timezone

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from .. import config
from ..core import audio, birdnet, dsp, indices as indices_mod, livability as livability_mod
from ..core import noise as noise_mod
from ..core import baseline, synthesis
from ..db import database
from . import schemas

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
    lv = livability_mod.compute_livability(len(species), mean_conf, activity, idx, noise_ratio)

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
        }
    )
    return result
