"""
download_birdnet_model.py —— 下载官方 BirdNET GLOBAL 6K V2.4 模型与中文标签

默认保存到 backend/models/：
  BirdNET_GLOBAL_6K_V2.4_Model_FP16.tflite  （约 50MB，fp16）
  eBird_taxonomy_codes_V6.0.csv              （中文标签，6522 类）

用法：
  python scripts/download_birdnet_model.py            # 保存到 models/
  python scripts/download_birdnet_model.py --dir /path/to/models

镜像源：
  - 模型：Zenodo 官方记录 15050749（BirdNET_v2.4_tflite_fp16.zip）
  - 标签：GitHub birdnet-team/BirdNET-Analyzer v2.4.0 的 Labels_zh.txt
"""
from __future__ import annotations

import argparse
import io
import sys
import zipfile
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent.parent

MODEL_ZIP_URLS = [
    "https://zenodo.org/api/records/15050749/files/BirdNET_v2.4_tflite_fp16.zip/content",
    "https://zenodo.org/records/15050749/files/BirdNET_v2.4_tflite_fp16.zip",
]
LABELS_URLS = [
    "https://raw.githubusercontent.com/birdnet-team/BirdNET-Analyzer/v2.4.0/birdnet_analyzer/labels/V2.4/BirdNET_GLOBAL_6K_V2.4_Labels_zh.txt",
    "https://raw.githubusercontent.com/birdnet-team/BirdNET-Analyzer/v2.4.0/birdnet_analyzer/labels/V2.4/BirdNET_GLOBAL_6K_V2.4_Labels_en_uk.txt",
]

MODEL_FILENAME = "BirdNET_GLOBAL_6K_V2.4_Model_FP16.tflite"
LABELS_FILENAME = "eBird_taxonomy_codes_V6.0.csv"
# 压缩包内文件：audio-model-fp16.tflite（音频模型）、labels/zh.txt（中文标签）
ZIP_MODEL_ENTRY = "audio-model-fp16.tflite"
ZIP_LABELS_ENTRY = "labels/zh.txt"


def try_fetch(urls: list[str], handler, label: str) -> bool:
    for url in urls:
        try:
            print(f"  尝试 {label}: {url}")
            with requests.get(url, stream=True, timeout=60) as r:
                r.raise_for_status()
                handler(r)
            return True
        except Exception as exc:  # noqa: BLE001
            print(f"  失败：{exc}")
    return False


def download_model_zip(r, dest: Path) -> None:
    data = io.BytesIO()
    for part in r.iter_content(chunk_size=1 << 20):
        if part:
            data.write(part)
    data.seek(0)
    with zipfile.ZipFile(data) as zf:
        names = zf.namelist()
        entry = ZIP_MODEL_ENTRY if ZIP_MODEL_ENTRY in names else next(
            (n for n in names if n.lower().endswith(".tflite")), None
        )
        if entry is None:
            raise RuntimeError("压缩包内未找到 .tflite 文件")
        dest.write_bytes(zf.read(entry))
    print(f"  → {dest} ({dest.stat().st_size / 1024 / 1024:.1f} MB)")


def download_labels(r, dest: Path) -> None:
    dest.write_bytes(r.content)
    print(f"  → {dest} ({dest.stat().st_size / 1024:.0f} KB)")


def main() -> int:
    parser = argparse.ArgumentParser(description="下载 BirdNET V2.4 模型与中文标签")
    parser.add_argument("--dir", type=Path, default=BASE_DIR / "models", help="保存目录")
    args = parser.parse_args()
    args.dir.mkdir(parents=True, exist_ok=True)

    model_dest = args.dir / MODEL_FILENAME
    labels_dest = args.dir / LABELS_FILENAME

    ok_model = try_fetch(MODEL_ZIP_URLS, lambda r: download_model_zip(r, model_dest), "模型 zip")
    ok_labels = try_fetch(LABELS_URLS, lambda r: download_labels(r, labels_dest), "标签文件")

    if ok_model and ok_labels:
        print("✔ 模型与标签下载完成。重启服务后自动启用 BirdNET 引擎（/health 可查看）。")
        return 0
    print("⚠ 部分文件下载失败。服务仍可运行（启发式引擎兜底），如需真实 BirdNET 请重试或手动放置模型文件。")
    return 1 if not ok_model else 0


if __name__ == "__main__":
    sys.exit(main())
