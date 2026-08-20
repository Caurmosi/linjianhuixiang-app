# -*- coding: utf-8 -*-
"""西湖周边演示数据（含时间序列）：生成 / 清理（公共地图网页试导出用）

用法：
  python seed_westlake.py          # 生成：清掉旧演示数据 → 上传 90 条（3 地区 × 30 天，每日同步采样）
  python seed_westlake.py --clean  # 清理：删除该账号上传的全部记录

说明：
  - 三个地区（苏堤/曲院风荷/茅家埠），2026-07-20 → 08-18 每天各测一次（同一天三地横向可比）；
  - 评分模型：基准分 + 夏末缓慢上升趋势 + 周末游客扰动 + 随机波动（随机种子固定可复现）；
  - recordedAt 需要后端支持（2026-08-20 起的版本）；评分/噪声按真实西湖场景设计。
"""
import json
import random
import sys
import urllib.request
import urllib.error
from datetime import date, timedelta

SEALOS = "https://uegbddmczvrm.cloud.sealos.io"
USERNAME = "seed_westlake_demo"
PASSWORD = "Demo@123456"

# 三地区参数（基准分 / 每周上升 / 周末扰动 / 噪声 / 物种池）
_REGION_PARAMS = [
    {
        "name": "苏堤", "lat": 30.2475, "lng": 120.1425,
        "base": 61, "trend_per_week": 0.7, "weekend_penalty": -5,
        "noise_base": 46, "noise_weekend": 14,
        "species": [("白头鹎", 0.88), ("乌鸫", 0.84), ("麻雀", 0.90), ("珠颈斑鸠", 0.77), ("暗绿绣眼鸟", 0.68)],
    },
    {
        "name": "曲院风荷", "lat": 30.2603, "lng": 120.1369,
        "base": 69, "trend_per_week": 1.2, "weekend_penalty": -2,
        "noise_base": 32, "noise_weekend": 6,
        "species": [("黑枕黄鹂", 0.78), ("红嘴蓝鹊", 0.66), ("白鹭", 0.80), ("夜鹭", 0.74), ("白头鹎", 0.85)],
    },
    {
        "name": "茅家埠", "lat": 30.2396, "lng": 120.1298,
        "base": 77, "trend_per_week": 0.8, "weekend_penalty": -1,
        "noise_base": 19, "noise_weekend": 4,
        "species": [("红嘴蓝鹊", 0.81), ("领雀嘴鹎", 0.76), ("灰头绿啄木鸟", 0.68), ("斑嘴鸭", 0.74), ("白胸翡翠", 0.63)],
    },
]
_START = date(2026, 7, 20)
_END = date(2026, 8, 18)  # 30 天


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _generate_rows():
    """3 地区 × 30 天每天一条 = 90 条；同一天三地都采样（可横向对比）。"""
    random.seed(20260820)  # 固定种子 → 数据可复现
    rows = []
    days = (_END - _START).days + 1
    for day in range(days):
        d = _START + timedelta(days=day)
        is_weekend = d.weekday() >= 5
        for p in _REGION_PARAMS:
            trend = p["trend_per_week"] * day / 7.0          # 夏末缓慢向好
            weekend = p["weekend_penalty"] if is_weekend else 0
            score = int(round(_clamp(p["base"] + trend + weekend + random.uniform(-2.5, 2.5), 20, 100)))
            noise = int(round(_clamp(p["noise_base"] + (p["noise_weekend"] if is_weekend else 0) + random.uniform(-3, 3), 0, 100)))
            bio = int(round(_clamp(score + 10 + random.uniform(-6, 6), 20, 100)))
            sound = int(round(_clamp(score - 5 + random.uniform(-5, 5), 20, 100)))
            conf = round(random.uniform(0.78, 0.92), 2)
            k = 3 + (day % 3)  # 每天 3-5 种
            species = [(n, round(_clamp(c + random.uniform(-0.05, 0.05), 0.5, 0.99), 2)) for n, c in p["species"][:k]]
            hour = 8 + (day % 2)          # 8 点 / 9 点交替
            minute = 15 + (day * 7) % 40  # 采样时刻略有不同
            rows.append((p["name"], p["lat"], p["lng"], f"{d.isoformat()}T{hour:02d}:{minute:02d}:00",
                         score, conf, bio, sound, noise, species))
    return rows


# 每条：(regionName, lat, lng, recordedAt, score, confidence, bio, sound, noise, species[])
RECORDS = _generate_rows()


def req(method: str, path: str, body=None, token=None):
    url = SEALOS + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=25) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"error": raw[:200]}


def get_token():
    """注册演示账号；已存在则登录。返回 token。"""
    code, data = req("POST", "/api/auth/register",
                     {"username": USERNAME, "password": PASSWORD})
    if code in (200, 201) and data.get("token"):
        return data["token"]
    code, data = req("POST", "/api/auth/login",
                     {"username": USERNAME, "password": PASSWORD})
    if code == 200 and data.get("token"):
        return data["token"]
    raise SystemExit(f"获取 token 失败: register={code} login={code} {data}")


def clean(token: str) -> int:
    """删除该账号名下全部记录；返回删除条数。"""
    code, data = req("GET", "/api/public/me", token=token)
    if code != 200:
        print(f"获取我的记录失败 HTTP {code}: {data}")
        return 0
    records = data.get("records", [])
    deleted = 0
    for r in records:
        c, d = req("DELETE", f"/api/public/records/{r['id']}", token=token)
        if c == 200:
            deleted += 1
        else:
            print(f"  ✗ 删除 id={r['id']} 失败 HTTP {c}: {d.get('error', d)}")
    return deleted


def seed():
    token = get_token()
    old = clean(token)
    if old:
        print(f"已清理旧演示数据 {old} 条")
    ok = 0
    for name, lat, lng, recorded_at, score, conf, bio, sound, noise, species in RECORDS:
        body = {
            "regionName": name,
            "lat": lat,
            "lng": lng,
            "score": score,
            "confidence": conf,
            "recordedAt": recorded_at,
            "summary": {
                "livability": {"score": score, "bio": bio, "sound": sound, "noise": noise},
                "species": [{"name": n, "conf": c} for n, c in species],
            },
        }
        code, data = req("POST", "/api/public/records", body, token)
        if code == 201:
            ok += 1
            print(f"  ✓ {name:6s} {recorded_at[:10]}  宜居度 {score}  噪声 {noise:2d}%  -> id={data.get('id')}")
        else:
            print(f"  ✗ {name:6s} {recorded_at[:10]} 上传失败 HTTP {code}: {data.get('error', data)}")
    print(f"完成：成功 {ok}/{len(RECORDS)} 条（同一地区多日期 → 可做时间对比）。")


if __name__ == "__main__":
    if "--clean" in sys.argv:
        token = get_token()
        n = clean(token)
        print(f"清理完成：删除 {n} 条。")
    else:
        seed()
