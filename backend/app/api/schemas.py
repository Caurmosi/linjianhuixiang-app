"""
schemas.py —— 响应模型（与前端数据契约一一对应，见 frontend/tests/dataContract.test.js）
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class Species(BaseModel):
    id: int
    name: str
    latin: str
    conf: float = Field(ge=0.0, le=1.0)
    freq: int
    period: Literal["清晨", "上午", "黄昏", "全天"]


class IndexItem(BaseModel):
    key: Literal["ACI", "NDSI", "ADI", "H"]
    name: str
    display: str
    pct: int = Field(ge=0, le=100)
    desc: str


class Livability(BaseModel):
    score: int = Field(ge=0, le=100)
    grade: Literal["宜居", "一般", "受压"]
    gradeEn: Literal["Good", "Moderate", "Stressed"]
    bio: int = Field(ge=0, le=100)
    sound: int = Field(ge=0, le=100)
    noise: int = Field(ge=0, le=100)
    # 评分可信度（0-1 两位小数 + 高/中/低档位）；旧数据缺失时回落默认（向前兼容）
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    confidenceLabel: Literal["高", "中", "低"] = "低"


class MapPoint(BaseModel):
    x: int
    y: int
    c: str
    t: str


class GreenSpace(BaseModel):
    id: str | None = None
    name: str
    points: list[MapPoint]


class HistoryItem(BaseModel):
    id: int
    name: str
    species: int
    score: int
    duration: str
    noise: int
    bio: int
    sound: int
    created_at: str | None = None
    # 每次分析的完整快照（前端回放优先恢复；旧记录无快照时为 None）
    analysis: dict | None = None


class RegionRecord(BaseModel):
    """地区记录（地区记录列表 / 单条），detail 为完整 summary 快照，score 由 detail.livability.score 提取。"""
    id: int
    name: str
    created_at: str
    detail: dict | None = None
    score: int | None = None


class RegionCreate(BaseModel):
    """保存地区记录请求体：name 地区名 + summary 综合摘要完整快照。"""
    name: str = Field(..., min_length=1, description="地区名称，如同名视为同一地区")
    summary: dict


class RegionRename(BaseModel):
    """重命名地区记录请求体。"""
    name: str = Field(..., min_length=1, description="新地区名称")


class GeocodeItem(BaseModel):
    """地名搜索结果单项：name 展示名 + lng/lat 坐标（高德 GCJ-02，与瓦片一致）。"""
    name: str
    lng: float
    lat: float


class GeocodeResult(BaseModel):
    """GET /api/geocode 响应：query + 前 3 条结果（geocode 优先，place 兜底）。"""
    query: str
    results: list[GeocodeItem] = []


class AnalysisResult(BaseModel):
    recording: str
    species: list[Species]
    indices: list[IndexItem]
    livability: Livability
    heatmap: list[list[float]]
    mapPoints: list[MapPoint]
    suggestions: list[str]
    speciesCount: int
    # 附加信息（前端忽略未知字段，不影响契约）
    engine: str | None = None
    durationSec: float | None = None
    # 录音波形（峰值包络，[0,1] 归一化）与按时间切片的声景样点
    waveform: list[float] = []
    segmentPoints: list[MapPoint] = []


class Health(BaseModel):
    status: str
    service: str
    version: str
    engine: str
    modelLoaded: bool
    labelsCount: int
    db: str
    uptimeSec: float
    timestamp: str
