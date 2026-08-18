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


# ---------------------------------------------------------------------------
# 登录系统（用户名 + 密码）
# ---------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    """注册请求：用户名 + 密码。

    用户名/密码规则（长度、字符集、≥6 位）在路由层校验，返回 400 而非 422。
    """
    username: str
    password: str


class LoginRequest(BaseModel):
    """登录请求：用户名 + 密码。"""
    username: str
    password: str


class AuthResponse(BaseModel):
    """登录/注册响应：token + username；注册额外带 createdAt。"""
    token: str
    username: str
    createdAt: str | None = None


class MeResponse(BaseModel):
    """GET /api/auth/me 响应。"""
    username: str
    createdAt: str


class ChangePasswordRequest(BaseModel):
    """修改密码请求：旧密码 + 新密码。"""
    oldPassword: str
    newPassword: str


# ---------------------------------------------------------------------------
# 公共上传池
# ---------------------------------------------------------------------------
class OverrideCoords(BaseModel):
    """覆盖坐标（GCJ-02，与高德瓦片一致）。"""
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class PublicRecordCreate(BaseModel):
    """公开上传请求：地区名 + 坐标（可选）+ 评分 + 置信度（可选）+ 摘要（可选）。

    坐标解析顺序：overrideCoords > lat/lng > geocode 反查（路由层处理）。
    score 在路由层 clamp 到 0-100（不在此校验，避免 422）。
    """
    regionName: str = Field(..., min_length=1, max_length=100)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    score: int
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    summary: dict | None = None
    isAnonymous: bool = False
    overrideCoords: OverrideCoords | None = None


class PublicRecordResponse(BaseModel):
    """公开上传成功响应。"""
    id: int
    regionName: str
    score: int
    confidence: float
    coordsSource: str
    clusterKey: str
    createdAt: str


class ClusterItem(BaseModel):
    """聚合点单条：模糊坐标 + 加权均值 + 区间 + 时间窗（到天）。"""
    id: str
    regionName: str
    lat: float
    lng: float
    n: int
    score: float
    scoreMin: int
    scoreMax: int
    confidenceAvg: float
    createdFrom: str
    createdTo: str


class ClusterListResponse(BaseModel):
    """GET /api/public/clusters 响应。"""
    clusters: list[ClusterItem]
    total: int


class ClusterSample(BaseModel):
    """聚合点样本：昵称/匿名 + 日期（到天）+ 评分（不返回任何坐标）。"""
    nickname: str
    isAnonymous: bool
    date: str
    score: int
    confidence: float


class ClusterDetailResponse(BaseModel):
    """GET /api/public/clusters/{cluster_key} 响应。"""
    cluster: ClusterItem
    samples: list[ClusterSample]


class MyPublicRecord(BaseModel):
    """我的公开记录单条。"""
    id: int
    regionName: str
    score: int
    createdAt: str
    isAnonymous: bool
    username: str | None = None


class MyPublicRecordsResponse(BaseModel):
    """GET /api/public/me 响应。"""
    records: list[MyPublicRecord]
