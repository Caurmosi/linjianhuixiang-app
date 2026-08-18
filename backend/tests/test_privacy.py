"""
test_privacy.py —— privacy 纯函数：格网聚类键 / 确定性坐标模糊 / 置信度加权聚合
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core import privacy  # noqa: E402


def test_cluster_key_format():
    """cluster_key = "{region_name}|{cellLat}:{cellLng}"，同格网一致、跨格网不同。"""
    lat, lng = 30.259, 120.132
    key = privacy.cluster_key("西湖公园", lat, lng)
    cell_lat = int(lat // privacy.CELL_DEG)
    cell_lng = int(lng // privacy.CELL_DEG)
    assert key == f"西湖公园|{cell_lat}:{cell_lng}"
    assert "|" in key and ":" in key
    # 同一格网内不同坐标 → 相同 key（30.256 与 30.259 均在 cell 6051）
    assert privacy.cluster_key("西湖公园", 30.256, 120.131) == key
    # 跨格网（0.02° ≈ 4 格）→ 不同 key
    assert privacy.cluster_key("西湖公园", 30.30, 120.20) != key
    # 同名不同地 → key 不同（格网区分）
    assert privacy.cluster_key("西湖公园", 31.0, 121.0) != key


def test_fuzz_point_deterministic_and_bounded():
    """fuzz_point：同 key 稳定；|偏移| ≤ JITTER_DEG。"""
    lat, lng = 30.259, 120.132
    key = privacy.cluster_key("西湖公园", lat, lng)
    f1 = privacy.fuzz_point(lat, lng, key)
    f2 = privacy.fuzz_point(lat, lng, key)
    assert f1 == f2, "同一 key 每次结果应一致（刷新不抖动）"
    assert abs(f1[0] - lat) <= privacy.JITTER_DEG
    assert abs(f1[1] - lng) <= privacy.JITTER_DEG
    # 不同 key → 偏移不同（确定性哈希，几乎必然不同）
    f3 = privacy.fuzz_point(lat, lng, "另一簇|6040:24026")
    assert (f1[0], f1[1]) != (f3[0], f3[1])


def _row(key, region, lat, lng, score, conf, created):
    return {
        "cluster_key": key,
        "region_name": region,
        "lat": lat,
        "lng": lng,
        "score": score,
        "confidence": conf,
        "created_at": created,
    }


def test_aggregate_weighted_formula():
    """aggregate：置信度加权均值 + 区间 + 时间窗 + 质心模糊。"""
    rows = [
        _row("A|6050:24020", "A", 30.251, 120.101, 80, 0.5, "2026-08-01T10:00:00Z"),
        _row("A|6050:24020", "A", 30.252, 120.102, 60, 0.5, "2026-08-10T10:00:00Z"),
    ]
    clusters = privacy.aggregate_clusters(rows)
    assert len(clusters) == 1
    c = clusters[0]
    assert c["id"] == "A|6050:24020"
    assert c["regionName"] == "A"
    assert c["n"] == 2
    # 权重 max(0.5, EPS)=0.5 → (80*0.5+60*0.5)/(0.5+0.5)=70.0
    assert c["score"] == 70.0
    assert c["confidenceAvg"] == 0.5
    assert c["scoreMin"] == 60 and c["scoreMax"] == 80
    assert c["createdFrom"] == "2026-08-01" and c["createdTo"] == "2026-08-10"
    # 质心 = 坐标均值 + 确定性模糊
    mean_lat, mean_lng = 30.2515, 120.1015
    fz = privacy.fuzz_point(mean_lat, mean_lng, "A|6050:24020")
    assert c["lat"] == fz[0] and c["lng"] == fz[1]


def test_aggregate_zero_confidence_falls_back_to_arithmetic():
    """全部置信度 0：conf_i' = CONF_EPS → score 退化为算术平均。"""
    rows = [
        _row("B|6050:24020", "B", 30.251, 120.101, 90, 0.0, "2026-08-01T00:00:00Z"),
        _row("B|6050:24020", "B", 30.251, 120.101, 70, 0.0, "2026-08-02T00:00:00Z"),
        _row("B|6050:24020", "B", 30.251, 120.101, 80, 0.0, "2026-08-03T00:00:00Z"),
    ]
    c = privacy.aggregate_clusters(rows)[0]
    assert c["score"] == 80.0  # (90+70+80)/3
    assert c["confidenceAvg"] == 0.0
    assert c["n"] == 3


def test_aggregate_groups_by_key():
    """不同 cluster_key 独立成簇。"""
    rows = [
        _row("A|6050:24020", "A", 30.251, 120.101, 80, 0.5, "2026-08-01T00:00:00Z"),
        _row("B|6051:24021", "B", 30.26, 120.11, 50, 0.5, "2026-08-02T00:00:00Z"),
    ]
    clusters = privacy.aggregate_clusters(rows)
    assert len(clusters) == 2
    by_id = {c["id"]: c for c in clusters}
    assert by_id["A|6050:24020"]["n"] == 1
    assert by_id["B|6051:24021"]["n"] == 1
