"""
livability.py —— 宜居度耦合计算（0–100 分 + 等级）

三个耦合维度：
  - bio   （生物多样性，0–100）：物种数（对数）、ADI、平均置信度、鸟声活动
  - sound （声环境质量，0–100）：NDSI（归一化）、H 均匀度、噪声占比
  - noise （人为噪声占比，0–100）：见 noise.py

score = 0.55 * bio + 0.45 * sound
等级：≥70 宜居(Good) / ≥50 一般(Moderate) / <50 受压(Stressed)
（与前端 mockData.gradeOf 阈值完全一致）

校准锚点（用于演示数据回归验证，见 tests/test_indices.py）：
  好样地（~9 种、NDSI≈0.4、噪声≈34）→ score≈70、bio≈76、sound≈62
  差样地（噪声主导）→ score < 50
"""
from __future__ import annotations

import math


def grade_of(score: float) -> tuple[str, str]:
    if score >= 70:
        return "宜居", "Good"
    if score >= 50:
        return "一般", "Moderate"
    return "受压", "Stressed"


def compute_livability(species_count: int, mean_conf: float, activity: float, indices: dict, noise: float) -> dict:
    adi = indices.get("adi", 0.0)
    ndsi = indices.get("ndsi", 0.0)
    h = indices.get("h", 0.0)

    # 噪声会掩蔽鸟声、压缩有效栖息空间：生物多样性随噪声占比线性折减
    bio = 18.0 + 16.0 * math.log1p(max(0, species_count)) + 22.0 * adi + 7.0 * mean_conf + 3.0 * activity - 0.12 * noise
    bio = float(max(0.0, min(100.0, bio)))

    ndsi_norm = (ndsi + 1.0) / 2.0
    sound = 10.0 + 30.0 * ndsi_norm + 22.0 * h + 18.0 * (1.0 - noise / 100.0)
    sound = float(max(0.0, min(100.0, sound)))

    score = 0.55 * bio + 0.45 * sound
    score = int(round(max(0.0, min(100.0, score))))
    grade, grade_en = grade_of(score)

    return {
        "score": score,
        "grade": grade,
        "gradeEn": grade_en,
        "bio": int(round(bio)),
        "sound": int(round(sound)),
        "noise": int(round(noise)),
    }
