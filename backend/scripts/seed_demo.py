"""
seed_demo.py —— 写入 3 条演示历史记录（与前端 mock 一致）

用法：python scripts/seed_demo.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import database  # noqa: E402

DEMO_HISTORY = [
    {"name": "中山公园_晨.wav", "species": 9, "score": 68, "duration": "3:24", "noise": 34, "bio": 76, "sound": 60},
    {"name": "滨江绿地_午后.mp3", "species": 6, "score": 54, "duration": "2:10", "noise": 51, "bio": 62, "sound": 45},
    {"name": "西郊森林公园_黄昏.wav", "species": 12, "score": 82, "duration": "4:05", "noise": 22, "bio": 88, "sound": 74},
]


def main() -> None:
    db = database.get_db()
    existing = db.list_history(limit=1)
    if existing:
        print("历史表已有数据，跳过（如需重灌请先删除 data/linjianhuixiang.db）")
        return
    for row in DEMO_HISTORY:
        db.insert_history({**row, "created_at": ""})
    print(f"已写入 {len(DEMO_HISTORY)} 条演示历史记录")


if __name__ == "__main__":
    main()
