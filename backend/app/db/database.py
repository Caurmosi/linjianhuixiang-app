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
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS auth_tokens (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS public_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    username TEXT,
                    is_anonymous INTEGER NOT NULL DEFAULT 0,
                    region_name TEXT NOT NULL,
                    lat REAL NOT NULL,
                    lng REAL NOT NULL,
                    cluster_key TEXT NOT NULL,
                    score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
                    confidence REAL NOT NULL DEFAULT 0 CHECK(confidence BETWEEN 0 AND 1),
                    coords_source TEXT NOT NULL DEFAULT 'manual',
                    summary_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_public_cluster_key ON public_records(cluster_key);
                CREATE INDEX IF NOT EXISTS idx_public_user ON public_records(user_id);
                CREATE INDEX IF NOT EXISTS idx_public_created_at ON public_records(created_at);
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

    # ---------------------------------------------------------------- 登录（users / auth_tokens）
    def create_user(self, username: str, password_hash: str) -> dict:
        """创建用户；用户名已存在时抛 sqlite3.IntegrityError（调用方转 409）。"""
        with self._lock:
            created_at = _now()
            cur = self._conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (str(username), str(password_hash), created_at),
            )
            self._conn.commit()
            return {"id": int(cur.lastrowid), "username": str(username), "created_at": created_at}

    def get_user_by_username(self, username: str) -> dict | None:
        """按用户名取用户（含 password_hash 供校验）；不存在返回 None。"""
        with self._lock:
            row = self._conn.execute(
                "SELECT id, username, password_hash, created_at FROM users WHERE username = ?",
                (str(username),),
            ).fetchone()
        return dict(row) if row else None

    def get_user_by_id(self, user_id: int) -> dict | None:
        """按 id 取用户；不存在返回 None。"""
        with self._lock:
            row = self._conn.execute(
                "SELECT id, username, password_hash, created_at FROM users WHERE id = ?",
                (int(user_id),),
            ).fetchone()
        return dict(row) if row else None

    def create_token(self, token: str, user_id: int) -> dict:
        """写入服务端 token（长期有效，不过期）。"""
        with self._lock:
            created_at = _now()
            self._conn.execute(
                "INSERT INTO auth_tokens (token, user_id, created_at) VALUES (?, ?, ?)",
                (str(token), int(user_id), created_at),
            )
            self._conn.commit()
            return {"token": str(token), "user_id": int(user_id), "created_at": created_at}

    def get_user_by_token(self, token: str) -> dict | None:
        """按 token 查登录态：返回 {id, username, created_at}；token 无效返回 None。"""
        with self._lock:
            row = self._conn.execute(
                "SELECT u.id AS id, u.username AS username, u.created_at AS created_at "
                "FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
                (str(token),),
            ).fetchone()
        return dict(row) if row else None

    def delete_token(self, token: str) -> bool:
        """删除 token（登出）；存在返回 True，不存在返回 False。"""
        with self._lock:
            cur = self._conn.execute("DELETE FROM auth_tokens WHERE token = ?", (str(token),))
            self._conn.commit()
            return cur.rowcount > 0

    def update_password(self, user_id: int, new_hash: str) -> bool:
        """更新密码哈希；用户存在返回 True。"""
        with self._lock:
            cur = self._conn.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (str(new_hash), int(user_id)),
            )
            self._conn.commit()
            return cur.rowcount > 0

    def delete_user_tokens(self, user_id: int) -> int:
        """删除某用户的全部 token（改密码后强制下线所有设备）；返回删除条数。"""
        with self._lock:
            cur = self._conn.execute(
                "DELETE FROM auth_tokens WHERE user_id = ?", (int(user_id),)
            )
            self._conn.commit()
            return cur.rowcount

    # ---------------------------------------------------------------- 公共上传池
    @staticmethod
    def _public_row(row: sqlite3.Row) -> dict:
        """公共记录行 → 对外 dict：is_anonymous 转 bool、summary_json 解析为 summary。"""
        item = dict(row)
        item["is_anonymous"] = bool(item["is_anonymous"])
        item["lat"] = float(item["lat"])
        item["lng"] = float(item["lng"])
        item["score"] = int(item["score"])
        item["confidence"] = float(item["confidence"])
        raw = item.pop("summary_json", None)
        try:
            item["summary"] = json.loads(raw) if raw else {}
        except (json.JSONDecodeError, TypeError):
            item["summary"] = {}
        return item

    def insert_public_record(self, data: dict) -> dict:
        """写入一条公共记录并返回完整行。

        data 键：user_id / username / is_anonymous / region_name / lat / lng /
        cluster_key / score / confidence / coords_source / summary_json / created_at。
        """
        with self._lock:
            created_at = data.get("created_at", _now())
            cur = self._conn.execute(
                """
                INSERT INTO public_records
                    (user_id, username, is_anonymous, region_name, lat, lng, cluster_key,
                     score, confidence, coords_source, summary_json, created_at)
                VALUES
                    (:user_id, :username, :is_anonymous, :region_name, :lat, :lng, :cluster_key,
                     :score, :confidence, :coords_source, :summary_json, :created_at)
                """,
                {
                    "user_id": int(data["user_id"]),
                    "username": data.get("username"),
                    "is_anonymous": 1 if data.get("is_anonymous") else 0,
                    "region_name": str(data["region_name"]),
                    "lat": float(data["lat"]),
                    "lng": float(data["lng"]),
                    "cluster_key": str(data["cluster_key"]),
                    "score": int(data["score"]),
                    "confidence": float(data.get("confidence", 0.0)),
                    "coords_source": str(data.get("coords_source", "manual")),
                    "summary_json": data.get("summary_json") or "{}",
                    "created_at": created_at,
                },
            )
            new_id = int(cur.lastrowid)
            self._conn.commit()
        row = self.get_public_record(new_id)
        assert row is not None  # 刚插入必存在
        return row

    def list_public_records(self, viewport: dict | None = None) -> list[dict]:
        """返回全部公共记录（可选视口过滤）。

        viewport 键：min_lng / max_lng / min_lat / max_lat（均可选，独立生效）。
        """
        sql = (
            "SELECT id, user_id, username, is_anonymous, region_name, lat, lng, cluster_key, "
            "score, confidence, coords_source, summary_json, created_at FROM public_records"
        )
        conditions: list[str] = []
        params: list = []
        vp = viewport or {}
        if vp.get("min_lng") is not None:
            conditions.append("lng >= ?")
            params.append(float(vp["min_lng"]))
        if vp.get("max_lng") is not None:
            conditions.append("lng <= ?")
            params.append(float(vp["max_lng"]))
        if vp.get("min_lat") is not None:
            conditions.append("lat >= ?")
            params.append(float(vp["min_lat"]))
        if vp.get("max_lat") is not None:
            conditions.append("lat <= ?")
            params.append(float(vp["max_lat"]))
        if conditions:
            sql += " WHERE " + " AND ".join(conditions)
        sql += " ORDER BY id"
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        return [self._public_row(r) for r in rows]

    def get_public_record(self, id: int) -> dict | None:
        """按 id 取单条公共记录；不存在返回 None。"""
        with self._lock:
            row = self._conn.execute(
                "SELECT id, user_id, username, is_anonymous, region_name, lat, lng, cluster_key, "
                "score, confidence, coords_source, summary_json, created_at "
                "FROM public_records WHERE id = ?",
                (int(id),),
            ).fetchone()
        return self._public_row(row) if row else None

    def list_public_records_by_user(self, user_id: int) -> list[dict]:
        """当前用户上传的全部公共记录。"""
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, user_id, username, is_anonymous, region_name, lat, lng, cluster_key, "
                "score, confidence, coords_source, summary_json, created_at "
                "FROM public_records WHERE user_id = ? ORDER BY id",
                (int(user_id),),
            ).fetchall()
        return [self._public_row(r) for r in rows]

    def delete_public_record(self, id: int) -> bool:
        """按 id 物理删除公共记录（撤回）；存在返回 True，不存在返回 False。"""
        with self._lock:
            cur = self._conn.execute("DELETE FROM public_records WHERE id = ?", (int(id),))
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
