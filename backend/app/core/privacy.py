"""
privacy.py —— 公共地图隐私纯函数（标准库实现，无外部依赖）

- cluster_key：地区名 + 坐标格网（CELL_DEG≈550m）→ 聚类键
- fuzz_point：确定性坐标模糊（±JITTER_DEG≈250m），同一 key 每次结果稳定
- aggregate_clusters：按 cluster_key 分组做置信度加权聚合（CONF_EPS 防除零）
"""
from __future__ import annotations

import hashlib
from typing import Iterable

# 格网边长（度）：约 550m，城市尺度（简化不随纬度修正，见设计文档 §5.1）
CELL_DEG = 0.005
# 坐标模糊半径（度）：±约 250m
JITTER_DEG = 0.0025
# 置信度权重底值：防除零 + 低置信度低权但不为 0（全 0 时退化为算术平均）
CONF_EPS = 0.05


def cluster_key(region_name: str, lat: float, lng: float) -> str:
    """坐标格网聚类键：`{region_name}|{cellLat}:{cellLng}`。

    使用 floor 除法，负坐标（南纬/西经）也得到一致的格网编号。
    """
    cell_lat = int(lat // CELL_DEG)
    cell_lng = int(lng // CELL_DEG)
    return f"{region_name}|{cell_lat}:{cell_lng}"


def fuzz_point(lat: float, lng: float, key: str) -> tuple[float, float]:
    """确定性坐标模糊：sha256(key) 前 8 字节生成两个 [0,1) 偏移，叠加到 (lat, lng)。

    同一 key 每次结果一致（聚合点刷新不抖动）；|偏移| ≤ JITTER_DEG（约 ±250m）。
    """
    digest = hashlib.sha256(key.encode("utf-8")).digest()
    r1 = int.from_bytes(digest[0:4], "big") / (2**32)
    r2 = int.from_bytes(digest[4:8], "big") / (2**32)
    d_lat = (r1 - 0.5) * 2 * JITTER_DEG
    d_lng = (r2 - 0.5) * 2 * JITTER_DEG
    return round(lat + d_lat, 6), round(lng + d_lng, 6)


def aggregate_clusters(rows: Iterable[dict]) -> list[dict]:
    """按 cluster_key 聚合公共记录（查询时实时聚合，无缓存）。

    每行须含：cluster_key, region_name, lat, lng, score, confidence, created_at。
    输出单条：
        {id, regionName, lat, lng, n, score, scoreMin, scoreMax,
         confidenceAvg, createdFrom, createdTo}
    - score = Σ(score × max(conf, CONF_EPS)) / Σ(max(conf, CONF_EPS))，保留 1 位小数
    - confidenceAvg = 置信度算术均值，保留 2 位小数
    - 质心 = 坐标均值后 fuzz_point（确定性模糊）
    """
    groups: dict[str, list[dict]] = {}
    for row in rows:
        groups.setdefault(row["cluster_key"], []).append(row)

    clusters = []
    for key, items in groups.items():
        n = len(items)
        scores = [float(r["score"]) for r in items]
        confs = [float(r["confidence"]) for r in items]
        weights = [max(c, CONF_EPS) for c in confs]
        weight_sum = sum(weights)
        # 权重恒 ≥ CONF_EPS > 0，不会除零
        score_avg = round(sum(s * w for s, w in zip(scores, weights)) / weight_sum, 1)
        conf_avg = round(sum(confs) / n, 2)
        score_min = int(min(scores))
        score_max = int(max(scores))
        dates = [str(r["created_at"])[:10] for r in items]
        mean_lat = sum(float(r["lat"]) for r in items) / n
        mean_lng = sum(float(r["lng"]) for r in items) / n
        lat, lng = fuzz_point(mean_lat, mean_lng, key)
        clusters.append(
            {
                "id": key,
                "regionName": items[0]["region_name"],
                "lat": lat,
                "lng": lng,
                "n": n,
                "score": score_avg,
                "scoreMin": score_min,
                "scoreMax": score_max,
                "confidenceAvg": conf_avg,
                "createdFrom": min(dates),
                "createdTo": max(dates),
            }
        )
    return clusters
