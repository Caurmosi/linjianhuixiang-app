"""
test_db.py —— database 层单元测试：历史完整快照存储 + 旧库迁移幂等性
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.database import Database  # noqa: E402


def test_insert_history_stores_detail_snapshot(tmp_path):
    """insert_history 将 analysis 完整快照写入 detail_json，list_history 可还原为 analysis 字段。"""
    db = Database(tmp_path / "snapshot.db")
    row = {
        "name": "a.wav",
        "species": 3,
        "score": 70,
        "duration": "1:00",
        "noise": 30,
        "bio": 80,
        "sound": 65,
        "created_at": "2026-01-01T00:00:00Z",
        "analysis": {
            "recording": "a.wav",
            "species": [{"id": 1, "name": "白头鹎", "conf": 0.9}],
            "indices": [{"key": "ACI"}],
            "livability": {"score": 70, "noise": 30},
            "heatmap": [[0.1, 0.2]],
            "waveform": [0.5, 0.6],
            "segmentPoints": [{"x": 1, "y": 2, "c": "#fff", "t": ""}],
            "speciesCount": 3,
        },
    }
    db.insert_history(row)
    items = db.list_history()
    assert len(items) == 1
    analysis = items[0]["analysis"]
    assert isinstance(analysis, dict), "list_history 应把 detail_json 还原为 analysis"
    assert analysis["recording"] == "a.wav"
    assert analysis["species"][0]["name"] == "白头鹎"
    assert analysis["heatmap"] == [[0.1, 0.2]]
    assert analysis["waveform"] == [0.5, 0.6]
    assert analysis["segmentPoints"][0]["x"] == 1
    # 汇总字段保持不变
    assert items[0]["name"] == "a.wav"
    assert items[0]["species"] == 3
    assert items[0]["score"] == 70
    db.close()


def test_insert_history_without_analysis_stores_null(tmp_path):
    """无 analysis 的旧式插入：detail_json 存 NULL，list_history 返回 analysis=None。"""
    db = Database(tmp_path / "null.db")
    row = {
        "name": "b.wav",
        "species": 1,
        "score": 50,
        "duration": "0:30",
        "noise": 50,
        "bio": 60,
        "sound": 40,
        "created_at": "2026-01-01T00:00:00Z",
    }
    db.insert_history(row)
    items = db.list_history()
    assert items[0]["analysis"] is None
    db.close()


def test_corrupt_detail_json_degrades_to_none(tmp_path):
    """detail_json 非法 JSON 时解析失败置 None，不抛错。"""
    db = Database(tmp_path / "corrupt.db")
    db.insert_history(
        {
            "name": "c.wav",
            "species": 2,
            "score": 60,
            "duration": "0:45",
            "noise": 40,
            "bio": 70,
            "sound": 55,
            "analysis": {"ok": True},
        }
    )
    with db._lock:
        db._conn.execute("UPDATE history SET detail_json = '{not json' WHERE name = 'c.wav'")
        db._conn.commit()
    items = db.list_history()
    assert items[0]["analysis"] is None
    assert items[0]["name"] == "c.wav"
    db.close()


def test_migration_adds_detail_json_to_legacy_table(tmp_path):
    """旧库（history 无 detail_json 列）：init 自动补列且不报错（迁移幂等）。"""
    path = tmp_path / "legacy.db"
    conn = sqlite3.connect(str(path))
    conn.execute(
        """
        CREATE TABLE history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            species INTEGER NOT NULL,
            score INTEGER NOT NULL,
            duration TEXT NOT NULL,
            noise INTEGER NOT NULL,
            bio INTEGER NOT NULL,
            sound INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        "INSERT INTO history (name, species, score, duration, noise, bio, sound, created_at) "
        "VALUES ('legacy.wav', 5, 60, '1:00', 40, 70, 55, '2026-01-01T00:00:00Z')"
    )
    conn.commit()
    conn.close()

    # 首次 init：旧表缺列 → ALTER 补列，旧记录可读取且 analysis 为 None
    db = Database(path)
    items = db.list_history()
    assert len(items) == 1
    assert items[0]["name"] == "legacy.wav"
    assert items[0]["analysis"] is None

    # 再次 init：列已存在 → ALTER 幂等失败被捕获，不抛错
    db._init_schema()
    # 迁移后仍可正常插入带快照的记录
    db.insert_history(
        {
            "name": "new.wav",
            "species": 4,
            "score": 75,
            "duration": "2:00",
            "noise": 25,
            "bio": 85,
            "sound": 70,
            "analysis": {"recording": "new.wav", "speciesCount": 4, "heatmap": [[1.0]]},
        }
    )
    items = db.list_history()
    assert items[0]["name"] == "new.wav"
    assert items[0]["analysis"]["speciesCount"] == 4
    db.close()


# ---------------------------------------------------------------------------
# 地区记录（region_records）
# ---------------------------------------------------------------------------
def _summary(score=70, noise=30, species=6):
    return {
        "recording": "综合.wav",
        "speciesCount": species,
        "livability": {"score": score, "noise": noise, "bio": 76, "sound": 60},
        "species": [{"id": 1, "name": "白头鹎"}],
    }


def test_region_crud_roundtrip(tmp_path):
    """insert_region → list_regions/get_region → rename → delete 全链路。"""
    db = Database(tmp_path / "region.db")
    row = db.insert_region("中山公园", _summary(score=70, noise=30))
    assert row["id"] > 0
    assert row["name"] == "中山公园"
    assert row["created_at"]

    # 同名第二条 → 归组依据
    db.insert_region("中山公园", _summary(score=74, noise=28))
    db.insert_region("滨江绿地", _summary(score=47, noise=58))

    items = db.list_regions()
    assert len(items) == 3
    first = items[0]
    assert first["name"] == "中山公园"
    assert first["score"] == 70, "score 应从 detail.livability.score 提取"
    assert first["detail"]["livability"]["score"] == 70
    assert first["detail"]["speciesCount"] == 6
    # created_at 非空（自动写入）
    assert first["created_at"]

    # get_region 命中 / 未命中
    got = db.get_region(row["id"])
    assert got is not None and got["name"] == "中山公园"
    assert db.get_region(99999) is None

    # rename
    assert db.rename_region(row["id"], "森林公园") is True
    assert db.get_region(row["id"])["name"] == "森林公园"
    assert db.rename_region(99999, "x") is False

    # delete
    assert db.delete_region(row["id"]) is True
    assert db.get_region(row["id"]) is None
    assert db.delete_region(row["id"]) is False
    assert len(db.list_regions()) == 2
    db.close()


def test_region_corrupt_detail_json_degrades(tmp_path):
    """detail_json 非法 JSON 时解析为 None，score 为 None，不抛错。"""
    db = Database(tmp_path / "corrupt_region.db")
    row = db.insert_region("x", {"livability": {"score": 66}})
    with db._lock:
        db._conn.execute("UPDATE region_records SET detail_json = '{not json' WHERE id = ?", (row["id"],))
        db._conn.commit()
    item = db.get_region(row["id"])
    assert item["detail"] is None
    assert item["score"] is None
    db.close()


def test_delete_history_by_id(tmp_path):
    """delete_history：按 id 删除，存在 True / 不存在 False。"""
    db = Database(tmp_path / "del_history.db")
    row = db.insert_history(
        {
            "name": "a.wav",
            "species": 2,
            "score": 60,
            "duration": "1:00",
            "noise": 40,
            "bio": 70,
            "sound": 55,
            "analysis": {"recording": "a.wav", "speciesCount": 2},
        }
    )
    db.insert_history(
        {
            "name": "b.wav",
            "species": 3,
            "score": 70,
            "duration": "2:00",
            "noise": 30,
            "bio": 80,
            "sound": 65,
            "analysis": {"recording": "b.wav", "speciesCount": 3},
        }
    )
    assert len(db.list_history()) == 2
    assert db.delete_history(row["id"]) is True, "存在的 id 应删除成功"
    remaining = db.list_history()
    assert len(remaining) == 1
    assert remaining[0]["name"] == "b.wav"
    assert db.delete_history(row["id"]) is False, "已删除的 id 再次删除应返回 False"
    assert db.delete_history(99999) is False, "不存在的 id 应返回 False"
    db.close()
