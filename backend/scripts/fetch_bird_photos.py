#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_bird_photos.py —— 从 Bing 图片搜索抓取 121 种城市常见鸟的真实照片，
统一中心裁剪为 320x320 JPEG（质量 82）打包进前端 assets/birds/。

用法：
  python fetch_bird_photos.py                    # 全量下载 121 种
  python fetch_bird_photos.py --only 麻雀,翠鸟   # 只下载指定鸟种（验证用）
  python fetch_bird_photos.py --out DIR          # 自定义输出目录（默认前端 assets/birds）

输出：
  {out}/{index:03d}_{name}.jpg   压缩后的照片
  {out}/../birds_report.json     下载结果报告（含每种的来源 URL 与失败原因）
"""
import argparse
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BIRD_BOOK_PATH = os.path.normpath(
    os.path.join(BASE_DIR, '..', '..', 'linjianhuixiang-app', 'frontend', 'src', 'data', 'birdBook.js')
)
DEFAULT_OUT = os.path.normpath(
    os.path.join(BASE_DIR, '..', '..', 'linjianhuixiang-app', 'frontend', 'src', 'assets', 'birds')
)

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
TARGET_SIZE = 320
JPEG_Q = 82
MIN_SIDE = 240          # 原图最小边长，太小的模糊
MAX_BYTES = 4 * 1024 * 1024  # 原图最大字节数
BING_TIMEOUT = 20
DL_TIMEOUT = 25
RETRY = 2

# 已知带水印/版权印的图库域名（搜索结果里直接跳过）
WATERMARK_HOSTS = (
    '699pic.com', '699pic', 'nipic.com', 'nipic', 'vcg.com', 'veer.com',
    '58pic.com', '58pic', 'tupian114', 'tupianku', 'pixabay',
    'sohu.com', 'sohu', 'qq.com', 'gtimg',
    # 占位图 / 防盗图来源
    'zol.com.cn', 'zol-img.com.cn', 'bcebos.com', 'bcebos',
    'gtimg', 'qpic.cn', 'qlogo',
)
# 已知干净图源（优先）
GOOD_HOSTS = (
    'birdnet.cn', 'nximg.cn', 'pconline.com.cn', 'sinaimg.cn',
    '163.com', '126.net', 'photoblog', 'fengniao', 'flickr',
    'bird.org.cn', 'chinesebird', 'cnbird',
)


def is_blocked(url):
    return any(h in url for h in WATERMARK_HOSTS)


def parse_bird_book(path):
    """解析 birdBook.js，返回 [{index, name, en, latin}]"""
    src = open(path, encoding='utf-8').read()
    # 整条记录：{ name: '中文', alias: '...', ... }  alias 可能单引号或双引号
    pat = re.compile(r"\{\s*name:\s*'([^']+)',\s*alias:\s*(['\"])(.*?)\2,", re.S)
    birds = []
    for m in pat.finditer(src):
        name, alias = m.group(1).strip(), m.group(3).strip()
        # 英文名 = alias 按 · 分割后的最后一段（去掉学名部分）
        parts = [p.strip() for p in alias.split('·')]
        en = parts[-1] if parts else alias
        birds.append({'index': len(birds) + 1, 'name': name, 'en': en, 'latin': parts[0] if len(parts) > 1 else en})
    return birds


def bing_search(query, count=24):
    """Bing 国内版图片搜索，返回 murl 列表"""
    url = ('https://cn.bing.com/images/async?q=' + urllib.parse.quote(query) +
           f'&first=0&count={count}&mmasync=1')
    req = urllib.request.Request(url, headers={
        'User-Agent': UA,
        'Referer': 'https://cn.bing.com/images/search?q=' + urllib.parse.quote(query),
        'Accept-Language': 'zh-CN,zh;q=0.9',
    })
    with urllib.request.urlopen(req, timeout=BING_TIMEOUT) as r:
        html = r.read().decode('utf-8', 'ignore')
    murls = re.findall(r'murl&quot;:&quot;(.*?)&quot;', html)
    out = []
    for u in murls:
        u = u.replace('\\/', '/').replace('&amp;', '&')
        if u.lower().startswith('http://'):
            u = 'https://' + u[7:]  # 统一 https
        if u.startswith('https://') and not is_blocked(u):
            out.append(u)
    # 去重保序
    seen, dedup = set(), []
    for u in out:
        if u not in seen:
            seen.add(u)
            dedup.append(u)
    return dedup


def fetch_image(url):
    """下载图片字节，失败返回 None"""
    req = urllib.request.Request(url, headers={
        'User-Agent': UA,
        'Referer': 'https://cn.bing.com/',
        'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
    })
    with urllib.request.urlopen(req, timeout=DL_TIMEOUT) as r:
        data = r.read()
    if len(data) > MAX_BYTES:
        raise ValueError(f'too large {len(data)}B')
    return data


def process_one(data):
    """校验并压缩为 TARGET_SIZE 正方形 JPEG，返回 JPEG 字节；失败抛异常"""
    img = Image.open(io.BytesIO(data))
    fmt = (img.format or '').upper()
    if fmt == 'GIF':
        raise ValueError('gif 动图跳过')
    w, h = img.size
    if min(w, h) < MIN_SIDE:
        raise ValueError(f'尺寸过小 {w}x{h}')
    # 转 RGB（RGBA 合成白底；P 模式转 RGB）
    if img.mode in ('RGBA', 'LA', 'P'):
        img = img.convert('RGBA')
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
        img = bg
    else:
        img = img.convert('RGB')
    # 中心正方形裁剪
    s = min(w, h)
    left, top = (w - s) // 2, (h - s) // 2
    img = img.crop((left, top, left + s, top + s))
    img = img.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=JPEG_Q, optimize=True, progressive=True)
    return buf.getvalue()


def download_bird(bird, out_dir, queries):
    """对一种鸟尝试多组搜索词，返回 (jpg_bytes, source_url, query) 或 (None, err, used_queries)"""
    last_err = None
    used = []
    for q in queries:
        used.append(q)
        try:
            urls = bing_search(q)
        except Exception as e:
            last_err = f'搜索失败[{q}]: {e}'
            time.sleep(1)
            continue
        if not urls:
            last_err = f'无结果[{q}]'
            time.sleep(0.4)
            continue
        for url in urls:
            for attempt in range(RETRY):
                try:
                    data = fetch_image(url)
                    jpg = process_one(data)
                    return jpg, url, q
                except Exception as e:
                    last_err = f'{type(e).__name__}: {str(e)[:60]}'
                    continue
        time.sleep(0.8)
    return None, last_err, used


# 每只鸟的多重搜索词（先泛后精；前 4 组失败后追加"实拍/观鸟"等排除水印图库的关键词）
def build_queries(b):
    return [
        f"{b['name']} 鸟",
        f"{b['name']} 实拍",
        f"{b['name']} 观鸟",
        f"{b['name']} 摄影",
        b['en'],
        b['latin'],
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='', help='只下载指定鸟种（逗号分隔中文名）')
    ap.add_argument('--out', default=DEFAULT_OUT)
    args = ap.parse_args()

    birds = parse_bird_book(BIRD_BOOK_PATH)
    print(f'[解析] birdBook.js 共 {len(birds)} 种鸟')

    if args.only:
        names = [n.strip() for n in args.only.split(',') if n.strip()]
        birds = [b for b in birds if b['name'] in names]
        print(f'[过滤] 仅下载 {len(birds)} 种: {[b["name"] for b in birds]}')

    os.makedirs(args.out, exist_ok=True)
    report = {'target': TARGET_SIZE, 'q': JPEG_Q, 'total': len(birds), 'ok': 0, 'fail': 0, 'items': []}

    for i, b in enumerate(birds, 1):
        queries = build_queries(b)
        jpg, src, used_q = download_bird(b, args.out, queries)
        fname = f"{b['index']:03d}_{b['name']}.jpg"
        if jpg:
            with open(os.path.join(args.out, fname), 'wb') as f:
                f.write(jpg)
            report['ok'] += 1
            report['items'].append({'name': b['name'], 'file': fname, 'src': src, 'query': used_q, 'ok': True})
            print(f"[{i}/{len(birds)}] OK  {b['name']:6s} {len(jpg)//1024}KB <- {src[:70]}")
        else:
            report['fail'] += 1
            report['items'].append({'name': b['name'], 'file': fname, 'err': src, 'query': used_q, 'ok': False})
            print(f"[{i}/{len(birds)}] FAIL {b['name']:6s} 原因: {src}")
        time.sleep(0.4)

    report_path = os.path.join(args.out, '..', 'birds_report.json')
    with open(os.path.normpath(report_path), 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f'\n[完成] OK={report["ok"]} FAIL={report["fail"]}  报告: {os.path.normpath(report_path)}')
    if report['fail']:
        print('[失败清单]', '、'.join(it['name'] for it in report['items'] if not it['ok']))


if __name__ == '__main__':
    sys.exit(main())
