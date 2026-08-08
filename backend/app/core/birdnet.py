"""
birdnet.py —— 鸟种识别

两种引擎（LJX_BIRDSNET_MODE 控制，默认 auto）：
  1. birdnet：官方 BirdNET GLOBAL 6K V2.4（TFLite）。
     V2.4 模型输入为**原始 3 秒音频波形**（48kHz 单声道，144000 个 float32 样本），
     输出 6522 类 logits，再经 flat_sigmoid 映射为概率。
     推理实现与官方 BirdNET-Analyzer v2.4 对齐（3s 分窗、零填充、跨窗取均值）。
     运行时支持：tflite-runtime（Linux/Docker）→ ai-edge-litert（Windows/macOS）→ tensorflow。
  2. heuristic：内置启发式探测（无模型依赖，开箱即用）：
     检测 2–8kHz 频段内"类鸟鸣"的调性音节突发（频谱平坦度门控），
     以音节主频与内置城市鸟类频段画像匹配，输出候选物种与置信度。
     该模式用于开发/演示/离线兜底，精度远低于 BirdNET，生产请下载官方模型。

输出物种条目（与前端契约一致）：
  {id, name, latin, conf, freq, period}
"""
from __future__ import annotations

import csv
import threading
from pathlib import Path

import numpy as np

from . import dsp
from ..config import (
    BIRDSNET_LABELS_PATH,
    BIRDSNET_MODE,
    BIRDSNET_MODEL_PATH,
    CONFIDENCE_THRESHOLD,
    MAX_SPECIES,
    TARGET_SR,
)

# ---------------------------------------------------------------------------
# 城市常见鸟类频段画像（启发式匹配目标 + 中文名/时段映射）
# fmin/fmax 为典型鸣叫主频范围（Hz）；period ∈ {清晨,上午,黄昏,全天}
# ---------------------------------------------------------------------------
BIRD_PROFILES: list[dict] = [
    {"id": 1, "name": "白头鹎", "latin": "Pycnonotus sinensis", "fmin": 1800.0, "fmax": 6500.0, "period": "清晨"},
    {"id": 2, "name": "麻雀", "latin": "Passer montanus", "fmin": 2000.0, "fmax": 8000.0, "period": "全天"},
    {"id": 3, "name": "珠颈斑鸠", "latin": "Spilopelia chinensis", "fmin": 400.0, "fmax": 1200.0, "period": "清晨"},
    {"id": 4, "name": "乌鸫", "latin": "Turdus merula", "fmin": 1800.0, "fmax": 8000.0, "period": "黄昏"},
    {"id": 5, "name": "大山雀", "latin": "Parus major", "fmin": 3000.0, "fmax": 7500.0, "period": "上午"},
    {"id": 6, "name": "喜鹊", "latin": "Pica pica", "fmin": 800.0, "fmax": 3200.0, "period": "全天"},
    {"id": 7, "name": "八哥", "latin": "Acridotheres cristatellus", "fmin": 900.0, "fmax": 4000.0, "period": "黄昏"},
    {"id": 8, "name": "灰喜鹊", "latin": "Cyanopica cyanus", "fmin": 1500.0, "fmax": 6500.0, "period": "清晨"},
    {"id": 9, "name": "戴胜", "latin": "Upupa epops", "fmin": 400.0, "fmax": 2200.0, "period": "上午"},
    {"id": 10, "name": "家燕", "latin": "Hirundo rustica", "fmin": 2000.0, "fmax": 6500.0, "period": "清晨"},
    {"id": 11, "name": "黄鹂", "latin": "Oriolus chinensis", "fmin": 900.0, "fmax": 4200.0, "period": "上午"},
    {"id": 12, "name": "画眉", "latin": "Garrulax canorus", "fmin": 1500.0, "fmax": 7000.0, "period": "清晨"},
    {"id": 13, "name": "棕头鸦雀", "latin": "Sinosuthora webbiana", "fmin": 2500.0, "fmax": 7000.0, "period": "全天"},
    {"id": 14, "name": "黑脸噪鹛", "latin": "Garrulax perspicillatus", "fmin": 1500.0, "fmax": 5500.0, "period": "清晨"},
    {"id": 15, "name": "翠鸟", "latin": "Alcedo atthis", "fmin": 2000.0, "fmax": 6500.0, "period": "上午"},
    {"id": 16, "name": "小鸊鷉", "latin": "Tachybaptus ruficollis", "fmin": 1500.0, "fmax": 4200.0, "period": "清晨"},
    {"id": 17, "name": "黑水鸡", "latin": "Gallinula chloropus", "fmin": 800.0, "fmax": 3500.0, "period": "全天"},
]

LATIN_TO_PROFILE = {p["latin"].lower(): p for p in BIRD_PROFILES}

# ---------------------------------------------------------------------------
# 引擎状态（懒加载）
# ---------------------------------------------------------------------------
_engine_lock = threading.Lock()
_engine_cache: dict | None = None


class BirdnetError(Exception):
    """BirdNET 推理失败（强制 birdnet 模式但模型缺失等）。"""


def _labels_from_csv(path: Path) -> tuple[list[str], list[str]]:
    """解析标签文件，返回 (学名列表, 中文/通用名列表)（顺序即模型输出类别顺序）。
    兼容多种格式：
      - V2.4 txt：每行 `latin_中文名`（下划线分隔），如 `Pycnonotus sinensis_白头鹎`
      - V2.4 txt：每行仅学名
      - 旧版 CSV：表头 + 含空格学名列（eBird_taxonomy_codes_V6.0.csv 等）
    """
    names: list[str] = []
    common: list[str] = []
    try:
        with open(path, newline="", encoding="utf-8-sig") as f:
            content = f.read()
    except OSError:
        return names, common

    lines = [ln.strip() for ln in content.splitlines() if ln.strip()]
    for line in lines:
        # CSV 行
        if "," in line:
            row = next(csv.reader([line]))
            if not row:
                continue
            if row[0].strip().lower() in {"taxonomic_order", "code", "species_code", "index"}:
                continue  # 表头
            sci = None
            for cell in row:
                c = cell.strip()
                parts = c.split()
                if len(parts) >= 2 and parts[1][:1].islower():
                    sci = c
                    break
            if sci is None:
                sci = row[-2].strip() if len(row) >= 2 else row[-1].strip()
            if sci:
                names.append(sci)
                common.append("")
            continue
        # txt 行：`latin_common` 或仅 latin
        if "_" in line:
            latin, _, cn = line.rpartition("_")
            names.append(latin.strip())
            common.append(cn.strip())
        else:
            names.append(line)
            common.append("")
    return names, common


def _load_birdnet():
    """加载 TFLite 模型与标签。失败抛 BirdnetError。"""
    tflite = None
    try:
        import tflite_runtime.interpreter as tflite  # Linux/Docker
    except ImportError:
        try:
            import ai_edge_litert.interpreter as tflite  # Windows/macOS（新版官方包）
        except ImportError:
            try:
                from tensorflow.lite.python import interpreter as tflite  # TensorFlow 兜底
            except ImportError:
                raise BirdnetError("未安装 tflite-runtime / ai-edge-litert / tensorflow，无法使用 BirdNET 引擎")

    if not BIRDSNET_MODEL_PATH.exists():
        raise BirdnetError(f"模型文件不存在：{BIRDSNET_MODEL_PATH}")

    interpreter = tflite.Interpreter(model_path=str(BIRDSNET_MODEL_PATH))
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()
    in_shape = input_details[0]["shape"]  # 期望 (1, 144000)
    labels, common_names = _labels_from_csv(BIRDSNET_LABELS_PATH) if BIRDSNET_LABELS_PATH.exists() else ([], [])
    return {
        "interpreter": interpreter,
        "input_index": input_details[0]["index"],
        "output_index": output_details[0]["index"],
        "in_shape": in_shape,
        "labels": labels,
        "common_names": common_names,
    }


def _get_engine() -> dict:
    """返回引擎信息；auto 模式按模型是否存在选择引擎。"""
    global _engine_cache
    with _engine_lock:
        if _engine_cache is not None:
            return _engine_cache
        mode = BIRDSNET_MODE
        if mode == "auto":
            mode = "birdnet" if BIRDSNET_MODEL_PATH.exists() else "heuristic"
        info = {"mode": mode, "model_loaded": False, "labels_count": 0}
        if mode == "birdnet":
            try:
                model = _load_birdnet()
                info["model_loaded"] = True
                info["labels_count"] = len(model["labels"])
                info["model"] = model
            except BirdnetError:
                if BIRDSNET_MODE == "birdnet":
                    raise
                info["mode"] = "heuristic"  # auto 降级
        _engine_cache = info
        return _engine_cache


def get_engine_status() -> dict:
    """供 /health 展示。"""
    info = _get_engine()
    return {"engine": info["mode"], "model_loaded": info["model_loaded"], "labels_count": info["labels_count"]}


def reset_engine_cache() -> None:
    """测试用：清空引擎缓存。"""
    global _engine_cache
    with _engine_lock:
        _engine_cache = None


# ---------------------------------------------------------------------------
# 检测入口
# ---------------------------------------------------------------------------
def detect(
    y: np.ndarray,
    sr: int = TARGET_SR,
    threshold: float = CONFIDENCE_THRESHOLD,
    max_species: int = MAX_SPECIES,
) -> dict:
    """输入 48kHz mono，返回 {species:[...], activity, engine, model_loaded}。"""
    info = _get_engine()
    if info["mode"] == "birdnet":
        species, activity = _detect_birdnet(y, sr, info["model"], threshold, max_species)
    else:
        species, activity = _detect_heuristic(y, sr, threshold, max_species)
    return {
        "species": species,
        "activity": float(activity),
        "engine": info["mode"],
        "model_loaded": info["model_loaded"],
    }


def _species_entry(pid: int, name: str, latin: str, conf: float, freq: int, period: str) -> dict:
    return {
        "id": pid,
        "name": name,
        "latin": latin,
        "conf": round(min(0.99, max(0.01, conf)), 2),
        "freq": int(freq),
        "period": period,
    }


# ---------------------------------------------------------------------------
# BirdNET（TFLite）推理 —— V2.4 输入为原始 3s 波形（144000 samples @48kHz）
# ---------------------------------------------------------------------------
def _detect_birdnet(y, sr, model, threshold, max_species):
    if sr != TARGET_SR:
        y = dsp.resample_poly(y, sr, TARGET_SR)
        sr = TARGET_SR

    # 输入样本数（3s @48kHz = 144000），以模型实际 shape 为准
    chunk_frames = int(model["in_shape"][-1]) if model["in_shape"].size else TARGET_SR * 3
    if chunk_frames <= 0:
        chunk_frames = TARGET_SR * 3

    if len(y) < chunk_frames:  # 短音频：零填充到 3s
        y = np.concatenate([y, np.zeros(chunk_frames - len(y), dtype=np.float32)])

    n_chunks = max(1, int(np.ceil(len(y) / chunk_frames)))
    interpreter = model["interpreter"]
    labels = model["labels"]
    n_classes = len(labels) if labels else 6522

    chunk_scores: list[np.ndarray] = []
    for c in range(n_chunks):
        chunk = y[c * chunk_frames : (c + 1) * chunk_frames]
        if len(chunk) < chunk_frames:
            chunk = np.concatenate([chunk, np.zeros(chunk_frames - len(chunk), dtype=np.float32)])
        inp = chunk[None, ...].astype(np.float32)
        interpreter.set_tensor(model["input_index"], inp)
        interpreter.invoke()
        scores = interpreter.get_tensor(model["output_index"])[0].astype(np.float64)
        # V2.4 输出为 logits → flat_sigmoid（官方默认 sensitivity=-1, bias=1.0 即标准 sigmoid）
        if np.max(scores) > 1.0 or np.min(scores) < 0.0:
            scores = 1.0 / (1.0 + np.exp(-np.clip(scores, -20.0, 20.0)))
        scores = np.clip(scores, 0.0, 1.0)
        chunk_scores.append(scores[:n_classes])

    # 跨窗聚合：物种置信度取"各窗最大值"（某只鸟只在 3s 窗口内鸣叫，也应被计入），
    # freq = 该物种置信度 ≥ 阈值的窗口数（占据率）
    matrix = np.vstack(chunk_scores)  # (n_chunks, n_classes)
    peak = np.max(matrix, axis=0)
    mean = np.mean(matrix, axis=0)
    occupied = np.sum(matrix >= threshold, axis=0)

    order = np.argsort(-peak)
    species = []
    common_names = model.get("common_names") or []
    for rank, idx in enumerate(order):
        score = float(peak[idx])
        if score < threshold:
            break
        latin = labels[idx] if idx < len(labels) else f"species_{idx}"
        profile = LATIN_TO_PROFILE.get(latin.lower())
        cn = common_names[idx] if idx < len(common_names) and common_names[idx] else ""
        name = profile["name"] if profile else (cn or latin)
        period = profile["period"] if profile else "全天"
        freq = int(occupied[idx])
        species.append(_species_entry(rank + 1, name, latin, score, max(freq, 1), period))
        if len(species) >= max_species:
            break

    activity = min(1.0, float(np.count_nonzero(peak >= threshold)) / 12.0) if len(species) else 0.0
    return species, activity


# ---------------------------------------------------------------------------
# 启发式探测（无模型兜底）
# ---------------------------------------------------------------------------
_N_FFT = 1024
_HOP = 512
_BIO_LO, _BIO_HI = 2000.0, 8000.0
_TONAL_GATE = 0.5


def _syllables(y, sr):
    """检测类鸟鸣音节：2–8kHz 频带能量的调性突发。返回 (音节列表, 总帧占比)。"""
    S = dsp.stft_magnitude(y, sr, n_fft=_N_FFT, hop_length=_HOP)
    freqs = np.linspace(0, sr / 2.0, S.shape[0])
    bio_mask = (freqs >= _BIO_LO) & (freqs < _BIO_HI)
    bio_energy = np.mean(S[bio_mask] ** 2, axis=0)  # (T,)
    floor = float(np.median(bio_energy)) + 1e-12
    thr = max(floor * 2.5, np.percentile(bio_energy, 75) * 1.2)
    active = bio_energy > thr

    # 合并相邻帧为音节
    syllables = []
    start = None
    for t, on in enumerate(active):
        if on and start is None:
            start = t
        elif not on and start is not None:
            if t - start >= 2:  # 至少 2 帧（~21ms）
                syllables.append((start, t))
            start = None
    if start is not None and len(active) - start >= 2:
        syllables.append((start, len(active)))

    # 合并间隔 < 100ms 的音节
    merged = []
    for syl in syllables:
        if merged and syl[0] - merged[-1][1] < int(0.1 * sr / _HOP):
            merged[-1] = (merged[-1][0], syl[1])
        else:
            merged.append(syl)
    syllables = merged

    total_frames = max(1, S.shape[1])
    activity = float(sum(e - s for s, e in syllables) / total_frames)
    return S, freqs, syllables, activity


def _dominant_freq(S, freqs, start, end):
    seg = S[:, start:end]
    spec = np.mean(seg, axis=1)
    lo = int(np.searchsorted(freqs, 1000.0))
    hi = int(np.searchsorted(freqs, 11000.0))
    if hi <= lo:
        return float(freqs[np.argmax(spec)])
    band = spec[lo:hi]
    return float(freqs[lo + int(np.argmax(band))])


def _tonalness(S, freqs, start, end):
    seg = S[:, start:end]
    spec = np.mean(seg, axis=1) + 1e-12
    gm = np.exp(np.mean(np.log(spec)))
    am = np.mean(spec)
    flatness = gm / am if am > 0 else 0.0
    return float(np.clip(1.0 - flatness, 0.0, 1.0))


def _detect_heuristic(y, sr, threshold, max_species):
    S, freqs, syllables, activity = _syllables(y, sr)
    if not syllables:
        return [], activity

    # 过滤掉非调性音节（噪声宽带），统计每个音节主频与匹配度
    valid = []
    for (s, e) in syllables:
        t = _tonalness(S, freqs, s, e)
        if t < _TONAL_GATE:
            continue
        f_dom = _dominant_freq(S, freqs, s, e)
        dur = e - s
        valid.append({"dom": f_dom, "dur": dur, "tonal": t})

    if not valid:
        return [], activity

    total_dur = float(sum(v["dur"] for v in valid))
    scores: dict[int, float] = {}
    freq_counts: dict[int, int] = {}
    for v in valid:
        best_pid, best_score = None, 0.0
        for p in BIRD_PROFILES:
            center = (p["fmin"] + p["fmax"]) / 2.0
            half = max((p["fmax"] - p["fmin"]) / 2.0, 500.0)
            overlap = float(np.exp(-0.5 * ((v["dom"] - center) / half) ** 2))
            if overlap > best_score:
                best_score, best_pid = overlap, p["id"]
        if best_pid is not None:
            scores[best_pid] = scores.get(best_pid, 0.0) + best_score * v["dur"]
            freq_counts[best_pid] = freq_counts.get(best_pid, 0) + 1

    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    species = []
    # 稀疏的孤立音节（如偶发喇叭声）置信度很低：用活动占比缩放
    activity_factor = float(np.clip(activity / 0.10, 0.0, 1.0))
    for pid, raw in ranked:
        profile = BIRD_PROFILES[pid - 1]
        conf = float(np.clip((raw / total_dur) * 3.2 * activity_factor, 0.05, 0.95))
        if conf < threshold:
            continue
        species.append(_species_entry(profile["id"], profile["name"], profile["latin"], conf, freq_counts[pid], profile["period"]))
        if len(species) >= max_species:
            break
    return species, activity
