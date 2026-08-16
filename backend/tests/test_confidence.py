"""
test_confidence.py —— 宜居度置信度（confidence）单元测试

验证：
  - confidence_of 公式权重正确（四信号合成、clamp、round 2）；
  - 语义场景：无鸟声环境音 → 低；清晰鸟鸣 → 高；短录音 → 中偏低；
  - 等级阈值分档边界（0.7 / 0.4）；
  - compute_livability 返回值携带 confidence / confidenceLabel；
  - duration_sec=None 按 0 处理（duration 项 = 0）。
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.livability import compute_livability, confidence_label_of, confidence_of  # noqa: E402


def _indices():
    return {"adi": 0.7, "ndsi": 0.4, "h": 0.8}


# ---------------------------------------------------------------------------
# confidence_of 公式
# ---------------------------------------------------------------------------
def test_confidence_of_formula_high_bird():
    # 清晰鸟鸣：activity≈0.8、mean_conf≈0.8、species≥5、时长≥60s
    # = 0.35*0.8 + 0.30*0.8 + 0.20*1 + 0.15*1 = 0.28+0.24+0.20+0.15 = 0.87
    assert confidence_of(0.8, 0.8, 5, 60) == 0.87
    assert confidence_of(0.8, 0.8, 9, 120) == 0.87, "species/duration 超上限应封顶，不超 1"


def test_confidence_of_no_bird_ambient():
    # 无鸟声环境音（activity=0、species=0、mean_conf=0），满时长录音 60s → 仅时长项 0.15
    assert confidence_of(0.0, 0.0, 0, 60) == 0.15
    # 更短的"无鸟声"录音：0.35*0 + 0.30*0 + 0.20*0 + 0.15*(30/60) = 0.075 → 0.07
    assert confidence_of(0.0, 0.0, 0, 30) == 0.07


def test_confidence_of_short_recording():
    # 短录音（5s、少量识别、中等活动）：duration 项低 → 整体中偏低
    c = confidence_of(0.5, 0.6, 2, 5)
    expected = round(0.35 * 0.5 + 0.30 * 0.6 + 0.20 * min(1, 2 / 5) + 0.15 * min(1, 5 / 60), 2)
    assert c == expected
    assert c < 0.5, "短录音置信度应中偏低"


def test_confidence_of_clamped_and_rounded():
    # 全部上限 → clamp 到 1.0
    assert confidence_of(2.0, 3.0, 999, 999) == 1.0
    # 全零 → 0.0
    assert confidence_of(0.0, 0.0, 0, None) == 0.0
    # 负数/异常输入不越界
    assert 0.0 <= confidence_of(-1.0, -1.0, -3, -5) <= 1.0


def test_confidence_of_duration_none_is_zero():
    assert confidence_of(0.5, 0.6, 3, None) == confidence_of(0.5, 0.6, 3, 0)
    assert confidence_of(0.5, 0.6, 3, None) == round(0.35 * 0.5 + 0.30 * 0.6 + 0.20 * 0.6 + 0.15 * 0.0, 2)


# ---------------------------------------------------------------------------
# 等级分档（≥0.7 高 / ≥0.4 中 / <0.4 低）
# ---------------------------------------------------------------------------
def test_confidence_label_boundaries():
    assert confidence_label_of(0.7) == "高"
    assert confidence_label_of(0.87) == "高"
    assert confidence_label_of(0.69) == "中"
    assert confidence_label_of(0.4) == "中"
    assert confidence_label_of(0.45) == "中"
    assert confidence_label_of(0.39) == "低"
    assert confidence_label_of(0.15) == "低"
    assert confidence_label_of(0.0) == "低"


# ---------------------------------------------------------------------------
# compute_livability 返回值携带 confidence 字段
# ---------------------------------------------------------------------------
def test_compute_livability_includes_confidence():
    lv = compute_livability(6, 0.8, 0.8, _indices(), 30.0, duration_sec=60)
    assert "confidence" in lv
    assert "confidenceLabel" in lv
    assert isinstance(lv["confidence"], float)
    assert 0.0 <= lv["confidence"] <= 1.0
    assert lv["confidenceLabel"] in {"高", "中", "低"}
    # 既有字段不受影响
    for f in ["score", "grade", "gradeEn", "bio", "sound", "noise"]:
        assert f in lv, f"livability 缺少既有字段 {f}"


def test_compute_livability_confidence_consistency():
    # 高分场景 → 高置信度档位
    lv = compute_livability(6, 0.85, 0.85, _indices(), 25.0, duration_sec=90)
    assert lv["confidence"] >= 0.7
    assert lv["confidenceLabel"] == "高"
    # 低活动无物种 → 低置信度档位
    low = compute_livability(0, 0.0, 0.0, _indices(), 40.0, duration_sec=60)
    assert low["confidence"] == 0.15
    assert low["confidenceLabel"] == "低"


def test_compute_livability_default_duration_none():
    lv_none = compute_livability(5, 0.7, 0.7, _indices(), 30.0)
    lv_zero = compute_livability(5, 0.7, 0.7, _indices(), 30.0, duration_sec=0)
    assert lv_none["confidence"] == lv_zero["confidence"], "duration_sec 缺省应与 0 等价"
