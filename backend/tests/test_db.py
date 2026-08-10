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
