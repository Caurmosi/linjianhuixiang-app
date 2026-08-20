# -*- coding: utf-8 -*-
"""西湖周边演示数据（含时间序列）：生成 / 清理（公共地图网页试导出用）

用法：
  python seed_westlake.py          # 生成：清掉旧演示数据 → 上传 15 条（7 地区 × 1-3 时间点）
  python seed_westlake.py --clean  # 清理：删除该账号上传的全部记录

说明：
  - 同一地区多次采样（recordedAt 指定不同日期）→ 网页「评分趋势」与「导出明细 CSV」可做时间对比；
  - recordedAt 需要后端支持（2026-08-20 起的版本）；旧后端会忽略该字段（时间统一为当天）；
  - 评分/噪声按真实西湖场景设计（周末游客噪声高、西线静谧鸟种丰富）。
"""
import json
import sys
import urllib.request
import urllib.error

SEALOS = "https://uegbddmczvrm.cloud.sealos.io"
USERNAME = "seed_westlake_demo"
PASSWORD = "Demo@123456"

# 每条：(regionName, lat, lng, recordedAt, score, confidence, bio, sound, noise, species[])
RECORDS = [
    # ---- 苏堤：3 个时间点（周末人多噪声高 → 工作日回落）----
    ("苏堤", 30.2475, 120.1425, "2026-08-08T09:20:00", 56, 0.81, 62, 52, 55,
     [("白头鹎", 0.85), ("麻雀", 0.90), ("乌鸫", 0.78), ("珠颈斑鸠", 0.74)]),
    ("苏堤", 30.2475, 120.1425, "2026-08-12T08:50:00", 64, 0.84, 70, 60, 40,
     [("白头鹎", 0.88), ("乌鸫", 0.82), ("暗绿绣眼鸟", 0.71), ("珠颈斑鸠", 0.77)]),
    ("苏堤", 30.2475, 120.1425, "2026-08-18T07:40:00", 62, 0.82, 68, 58, 45,
     [("白头鹎", 0.87), ("乌鸫", 0.83), ("麻雀", 0.91), ("珠颈斑鸠", 0.76), ("暗绿绣眼鸟", 0.68)]),
    # ---- 曲院风荷：3 个时间点（夏末鸟况渐佳）----
    ("曲院风荷", 30.2603, 120.1369, "2026-08-03T08:10:00", 66, 0.83, 76, 64, 35,
     [("黑枕黄鹂", 0.72), ("白头鹎", 0.84), ("白鹭", 0.78)]),
    ("曲院风荷", 30.2603, 120.1369, "2026-08-10T08:30:00", 71, 0.86, 80, 68, 30,
     [("黑枕黄鹂", 0.76), ("红嘴蓝鹊", 0.62), ("夜鹭", 0.74), ("白头鹎", 0.85)]),
    ("曲院风荷", 30.2603, 120.1369, "2026-08-17T08:05:00", 74, 0.88, 82, 70, 28,
     [("黑枕黄鹂", 0.79), ("红嘴蓝鹊", 0.66), ("白鹭", 0.81), ("夜鹭", 0.73), ("白头鹎", 0.85)]),
    # ---- 茅家埠：3 个时间点（西线秘境，持续向好）----
    ("茅家埠", 30.2396, 120.1298, "2026-08-05T07:50:00", 74, 0.87, 82, 72, 22,
     [("红嘴蓝鹊", 0.78), ("领雀嘴鹎", 0.73), ("斑嘴鸭", 0.70)]),
    ("茅家埠", 30.2396, 120.1298, "2026-08-14T08:00:00", 77, 0.89, 86, 74, 19,
     [("红嘴蓝鹊", 0.81), ("领雀嘴鹎", 0.75), ("灰头绿啄木鸟", 0.66), ("斑嘴鸭", 0.72)]),
    ("茅家埠", 30.2396, 120.1298, "2026-08-19T07:30:00", 79, 0.90, 88, 76, 18,
     [("红嘴蓝鹊", 0.82), ("领雀嘴鹎", 0.77), ("灰头绿啄木鸟", 0.69), ("斑嘴鸭", 0.74), ("白胸翡翠", 0.63)]),
    # ---- 花港观鱼：2 个时间点 ----
    ("花港观鱼", 30.2353, 120.1400, "2026-08-07T09:10:00", 63, 0.82, 70, 60, 40,
     [("白头鹎", 0.84), ("乌鸫", 0.76), ("黄眉柳莺", 0.60)]),
    ("花港观鱼", 30.2353, 120.1400, "2026-08-15T08:40:00", 66, 0.84, 72, 62, 36,
     [("白头鹎", 0.86), ("乌鸫", 0.79), ("黄眉柳莺", 0.62), ("普通翠鸟", 0.58)]),
    # ---- 白堤：2 个时间点（游客密集）----
    ("白堤", 30.2633, 120.1507, "2026-08-09T10:00:00", 44, 0.78, 50, 42, 68,
     [("麻雀", 0.87), ("白头鹎", 0.70)]),
    ("白堤", 30.2633, 120.1507, "2026-08-16T09:30:00", 48, 0.79, 52, 45, 62,
     [("麻雀", 0.88), ("白头鹎", 0.72), ("家燕", 0.64)]),
    # ---- 单点（对照）----
    ("湖滨步行街", 30.2510, 120.1580, "2026-08-11T11:00:00", 38, 0.75, 40, 35, 78,
     [("麻雀", 0.85), ("珠颈斑鸠", 0.71)]),
    ("太子湾公园", 30.2275, 120.1440, "2026-08-13T08:20:00", 58, 0.80, 64, 55, 40,
     [("乌鸫", 0.84), ("白头鹎", 0.80), ("黑尾蜡嘴雀", 0.67)]),
]


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
