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
