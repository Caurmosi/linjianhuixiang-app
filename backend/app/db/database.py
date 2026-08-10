"""
database.py —— SQLite 持久化

三张表：
  - history：历史记录（前端契约字段 + created_at）
  - analyses：完整分析结果（detail_json），供 GET /api/* 返回"最近一次分析"视图
  - region_records：地区记录（名称 + 完整 summary 快照），支持删除 / 重命名 / 同名归组趋势对比
线程安全：单连接 + 全局锁（FastAPI 同步端点运行在线程池）。
"""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

from ..config import DB_PATH


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Database:
    def __init__(self, path: Path | str = DB_PATH):
        self.path = str(path)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    species INTEGER NOT NULL,
                    score INTEGER NOT NULL,
                    duration TEXT NOT NULL,
                    noise INTEGER NOT NULL,
                    bio INTEGER NOT NULL,
                    sound INTEGER NOT NULL,
                    detail_json TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS analyses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    recording TEXT NOT NULL,
                    detail_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS region_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    detail_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )
            # 兼容旧库：history 表早期版本无 detail_json 列
            # （SQLite 不支持 ALTER TABLE ... ADD COLUMN IF NOT EXISTS，用 try/except 保证幂等）
            try:
                self._conn.execute("ALTER TABLE history ADD COLUMN detail_json TEXT")
            except sqlite3.OperationalError:
                pass
            self._conn.commit()

    # ------------------------------------------------------------------ 历史
    def insert_history(self, row: dict) -> dict:
        with self._lock:
            analysis = row.get("analysis")
            params = {
                "name": row["name"],
                "species": row["species"],
                "score": row["score"],
                "duration": row["duration"],
                "noise": row["noise"],
                "bio": row["bio"],
                "sound": row["sound"],
                "created_at": row.get("created_at", _now()),
                "detail_json": json.dumps(analysis, ensure_ascii=False) if analysis is not None else None,
            }
            cur = self._conn.execute(
                """
                INSERT INTO history
                    (name, species, score, duration, noise, bio, sound, detail_json, created_at)
                VALUES
                    (:name, :species, :score, :duration, :noise, :bio, :sound, :detail_json, :created_at)
                """,
                params,
            )
            self._conn.commit()
            row["id"] = int(cur.lastrowid)
        return row

    def list_history(self, limit: int = 100) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, name, species, score, duration, noise, bio, sound, created_at, detail_json "
                "FROM history ORDER BY id DESC LIMIT ?",
                (int(limit),),
            ).fetchall()
        items = []
        for r in rows:
            item = dict(r)
            raw = item.pop("detail_json", None)
            if raw:
                try:
                    item["analysis"] = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    item["analysis"] = None
            else:
                item["analysis"] = None
            items.append(item)
        return items

    def delete_history(self, id: int) -> bool:
        """按 id 删除历史记录；存在返回 True，不存在返回 False。"""
        with self._lock:
            cur = self._conn.execute("DELETE FROM history WHERE id = ?", (int(id),))
            self._conn.commit()
            return cur.rowcount > 0

    # ---------------------------------------------------------------- 地区记录
    def insert_region(self, name: str, detail: dict) -> dict:
        """保存一条地区记录（detail 为完整 summary 快照），返回 {id, name, created_at}。"""
        with self._lock:
            created_at = _now()
            cur = self._conn.execute(
                "INSERT INTO region_records (name, detail_json, created_at) VALUES (?, ?, ?)",
                (str(name), json.dumps(detail, ensure_ascii=False), created_at),
            )
            self._conn.commit()
            return {"id": int(cur.lastrowid), "name": str(name), "created_at": created_at}

    def list_regions(self) -> list[dict]:
        """返回全部地区记录 [{id, name, created_at, detail, score}]，score 由 detail.livability.score 提取。"""
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, name, created_at, detail_json FROM region_records ORDER BY id"
            ).fetchall()
        items = []
        for r in rows:
            detail = None
            try:
                detail = json.loads(r["detail_json"]) if r["detail_json"] else None
            except (json.JSONDecodeError, TypeError):
                detail = None
            score = None
            if isinstance(detail, dict) and isinstance(detail.get("livability"), dict):
                s = detail["livability"].get("score")
                if isinstance(s, int):
                    score = s
            items.append(
                {
                    "id": r["id"],
                    "name": r["name"],
                    "created_at": r["created_at"],
                    "detail": detail,
                    "score": score,
                }
            )
        return items

    def get_region(self, id: int) -> dict | None:
        """按 id 取单条地区记录；不存在返回 None。"""
        for item in self.list_regions():
            if item["id"] == int(id):
                return item
        return None

    def delete_region(self, id: int) -> bool:
        """按 id 删除地区记录；存在返回 True，不存在返回 False。"""
        with self._lock:
            cur = self._conn.execute("DELETE FROM region_records WHERE id = ?", (int(id),))
            self._conn.commit()
            return cur.rowcount > 0

    def rename_region(self, id: int, new_name: str) -> bool:
        """重命名地区记录；存在返回 True，不存在返回 False。"""
        with self._lock:
            cur = self._conn.execute(
                "UPDATE region_records SET name = ? WHERE id = ?",
                (str(new_name), int(id)),
            )
            self._conn.commit()
            return cur.rowcount > 0

    # ------------------------------------------------------------------ 分析
    def save_analysis(self, detail: dict) -> int:
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO analyses (recording, detail_json, created_at) VALUES (?, ?, ?)",
                (detail.get("recording", ""), json.dumps(detail, ensure_ascii=False), _now()),
            )
            self._conn.commit()
            return int(cur.lastrowid)

    def latest_analysis(self) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT detail_json FROM analyses ORDER BY id DESC LIMIT 1"
            ).fetchone()
        if row is None:
            return None
        try:
            return json.loads(row["detail_json"])
        except (json.JSONDecodeError, TypeError):
            return None

    def close(self) -> None:
        with self._lock:
            self._conn.close()


_db: Database | None = None
_db_lock = threading.Lock()


def get_db() -> Database:
    global _db
    with _db_lock:
        if _db is None:
            _db = Database()
        return _db


def close_db() -> None:
    """关闭全局连接（测试/优雅停机用）。"""
    global _db
    with _db_lock:
        if _db is not None:
            _db.close()
            _db = None


def reset_db_for_tests(path: Path) -> Database:
    """测试用：使用独立 DB 文件。"""
    close_db()
    global _db
    with _db_lock:
        _db = Database(path)
        return _db
