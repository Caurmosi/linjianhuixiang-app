"""
generate_sample.py —— 生成测试音频（合成信号，验证端到端管线）

输出：
  assets/sample_bird.wav     模拟清晨鸟鸣（30s）
  assets/sample_traffic.wav  模拟交通噪声（30s）

用法：python scripts/generate_sample.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core import synth  # noqa: E402

ASSETS = Path(__file__).resolve().parent.parent / "assets"


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    bird = synth.make_bird_sample(duration=30.0)
    traffic = synth.make_traffic_sample(duration=30.0)
    (ASSETS / "sample_bird.wav").write_bytes(synth.to_wav_bytes(bird))
    (ASSETS / "sample_traffic.wav").write_bytes(synth.to_wav_bytes(traffic))
    print("已生成：")
    print(f"  {ASSETS / 'sample_bird.wav'}")
    print(f"  {ASSETS / 'sample_traffic.wav'}")
    print("验证：curl -F file=@assets/sample_bird.wav http://localhost:8000/api/analyze")


if __name__ == "__main__":
    main()
