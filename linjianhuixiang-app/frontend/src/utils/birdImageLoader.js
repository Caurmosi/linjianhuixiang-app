/**
 * birdImageLoader.js —— 120 种城市常见鸟的真实照片预加载
 *
 * 来源：backend/scripts/fetch_bird_photos.py 从 Bing 图片搜索抓取
 *      真实照片，中心裁剪为 320x320 JPEG（q82，单张 8~30KB）
 *      输出到 frontend/src/assets/birds/{index:03d}_{name}.jpg
 *
 * 用法：
 *   - getImageUrl(name) -> string | null   同步返回图片 URL（包内资源，已打包）
 *   - loadAll()         -> Promise<void>   异步预加载全部 Image 对象到缓存
 *   - getLoaded(name)   -> HTMLImageElement | null   同步获取已加载的 Image
 *   - isLoaded()        -> boolean         是否全部已加载完成
 *
 * 设计：
 *   - 使用 Vite import.meta.glob 一次性拿到所有图的最终 URL
 *   - 文件名形如 "001_麻雀.jpg"，按鸟名做 key（与 birdBook.js 对齐）
 *   - 预加载只跑一次，重复调用直接返回同一 Promise
 *   - 渲染逻辑：cardElements.renderPolaroid 先查 getLoaded，有就画照片，没有就降级 drawBirdBadge
 */
import { BIRD_BOOK } from '../data/birdBook.js';

// Vite 打包时把每张图替换为最终 URL，eager + import: 'default' 同步拿 URL
const modules = import.meta.glob('../assets/birds/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
});

// 文件名 {index:03d}_{name}.jpg -> 按 name 建索引
const NAME_TO_URL = {};
for (const path in modules) {
  const m = path.match(/\/(\d{3})_(.+)\.jpg$/);
  if (m) {
    NAME_TO_URL[m[2]] = modules[path];
  }
}

// === 同步 API（URL 仅需包内资源，无需等待加载）===
export function getImageUrl(name) {
  return NAME_TO_URL[name] || null;
}

// === 异步预加载：把每张图转为 HTMLImageElement 缓存（用于 canvas drawImage）===
const _cache = new Map();      // name -> HTMLImageElement
const _failures = new Set();   // 加载失败的鸟名
let _loading = null;           // Promise 缓存，避免并发
let _allDone = false;

export function loadAll() {
  if (_allDone) return Promise.resolve();
  if (_loading) return _loading;
  _loading = new Promise((resolve) => {
    const names = BIRD_BOOK.map((b) => b.name);
    let pending = 0;
    for (const n of names) {
      const url = NAME_TO_URL[n];
      if (!url) {
        _failures.add(n);
        continue;
      }
      if (_cache.has(n)) continue;
      pending++;
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        _cache.set(n, img);
        pending--;
        if (pending === 0) { _allDone = true; resolve(); }
      };
      img.onerror = () => {
        _failures.add(n);
        pending--;
        if (pending === 0) { _allDone = true; resolve(); }
      };
      img.src = url;
    }
    if (pending === 0) { _allDone = true; resolve(); }
  });
  return _loading;
}

export function getLoaded(name) {
  return _cache.get(name) || null;
}

export function isLoaded() {
  return _allDone;
}

export function loadStatus() {
  return {
    total: BIRD_BOOK.length,
    loaded: _cache.size,
    failed: _failures.size,
    pending: BIRD_BOOK.length - _cache.size - _failures.size,
  };
}
