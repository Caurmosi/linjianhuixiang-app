/**
 * birdImageLoader.js —— 122 种城市常见鸟的真实照片
 *
 * 来源：backend/scripts/fetch_bird_photos.py 从 Bing 图片搜索抓取
 *      真实照片，中心裁剪为 320x320 JPEG（q82，单张 8~30KB）
 *      文件名：bird_001.jpg ~ bird_122.jpg（纯英文，避开 percent-encode 问题）
 *
 * 重要：文件名为纯英文（无中文）。Android WebView 的 file:// 协议对
 *       percent-encoded 路径支持差，中文文件名在 build 后会编码失败，
 *       改为 ASCII 文件名可彻底规避此问题。
 *
 * 用法：
 *   - getImageUrl(name)  -> string|null
 *   - loadAll()          -> Promise<void>
 *   - getLoaded(name)    -> HTMLImageElement|null
 *   - isLoaded()         -> boolean
 */
import { BIRD_BOOK } from '../data/birdBook.js';

import m1 from '../assets/birds/bird_001.jpg?url';
import m2 from '../assets/birds/bird_002.jpg?url';
import m3 from '../assets/birds/bird_003.jpg?url';
import m4 from '../assets/birds/bird_004.jpg?url';
import m5 from '../assets/birds/bird_005.jpg?url';
import m6 from '../assets/birds/bird_006.jpg?url';
import m7 from '../assets/birds/bird_007.jpg?url';
import m8 from '../assets/birds/bird_008.jpg?url';
import m9 from '../assets/birds/bird_009.jpg?url';
import m10 from '../assets/birds/bird_010.jpg?url';
import m11 from '../assets/birds/bird_011.jpg?url';
import m12 from '../assets/birds/bird_012.jpg?url';
import m13 from '../assets/birds/bird_013.jpg?url';
import m14 from '../assets/birds/bird_014.jpg?url';
import m15 from '../assets/birds/bird_015.jpg?url';
import m16 from '../assets/birds/bird_016.jpg?url';
import m17 from '../assets/birds/bird_017.jpg?url';
import m18 from '../assets/birds/bird_018.jpg?url';
import m19 from '../assets/birds/bird_019.jpg?url';
import m20 from '../assets/birds/bird_020.jpg?url';
import m21 from '../assets/birds/bird_021.jpg?url';
import m22 from '../assets/birds/bird_022.jpg?url';
import m23 from '../assets/birds/bird_023.jpg?url';
import m24 from '../assets/birds/bird_024.jpg?url';
import m25 from '../assets/birds/bird_025.jpg?url';
import m26 from '../assets/birds/bird_026.jpg?url';
import m27 from '../assets/birds/bird_027.jpg?url';
import m28 from '../assets/birds/bird_028.jpg?url';
import m29 from '../assets/birds/bird_029.jpg?url';
import m30 from '../assets/birds/bird_030.jpg?url';
import m31 from '../assets/birds/bird_031.jpg?url';
import m32 from '../assets/birds/bird_032.jpg?url';
import m33 from '../assets/birds/bird_033.jpg?url';
import m34 from '../assets/birds/bird_034.jpg?url';
import m35 from '../assets/birds/bird_035.jpg?url';
import m36 from '../assets/birds/bird_036.jpg?url';
import m37 from '../assets/birds/bird_037.jpg?url';
import m38 from '../assets/birds/bird_038.jpg?url';
import m39 from '../assets/birds/bird_039.jpg?url';
import m40 from '../assets/birds/bird_040.jpg?url';
import m41 from '../assets/birds/bird_041.jpg?url';
import m42 from '../assets/birds/bird_042.jpg?url';
import m43 from '../assets/birds/bird_043.jpg?url';
import m44 from '../assets/birds/bird_044.jpg?url';
import m45 from '../assets/birds/bird_045.jpg?url';
import m46 from '../assets/birds/bird_046.jpg?url';
import m47 from '../assets/birds/bird_047.jpg?url';
import m48 from '../assets/birds/bird_048.jpg?url';
import m49 from '../assets/birds/bird_049.jpg?url';
import m50 from '../assets/birds/bird_050.jpg?url';
import m51 from '../assets/birds/bird_051.jpg?url';
import m52 from '../assets/birds/bird_052.jpg?url';
import m53 from '../assets/birds/bird_053.jpg?url';
import m54 from '../assets/birds/bird_054.jpg?url';
import m55 from '../assets/birds/bird_055.jpg?url';
import m56 from '../assets/birds/bird_056.jpg?url';
import m57 from '../assets/birds/bird_057.jpg?url';
import m58 from '../assets/birds/bird_058.jpg?url';
import m59 from '../assets/birds/bird_059.jpg?url';
import m60 from '../assets/birds/bird_060.jpg?url';
import m61 from '../assets/birds/bird_061.jpg?url';
import m62 from '../assets/birds/bird_062.jpg?url';
import m63 from '../assets/birds/bird_063.jpg?url';
import m64 from '../assets/birds/bird_064.jpg?url';
import m65 from '../assets/birds/bird_065.jpg?url';
import m66 from '../assets/birds/bird_066.jpg?url';
import m67 from '../assets/birds/bird_067.jpg?url';
import m68 from '../assets/birds/bird_068.jpg?url';
import m69 from '../assets/birds/bird_069.jpg?url';
import m70 from '../assets/birds/bird_070.jpg?url';
import m71 from '../assets/birds/bird_071.jpg?url';
import m72 from '../assets/birds/bird_072.jpg?url';
import m73 from '../assets/birds/bird_073.jpg?url';
import m74 from '../assets/birds/bird_074.jpg?url';
import m75 from '../assets/birds/bird_075.jpg?url';
import m76 from '../assets/birds/bird_076.jpg?url';
import m77 from '../assets/birds/bird_077.jpg?url';
import m78 from '../assets/birds/bird_078.jpg?url';
import m79 from '../assets/birds/bird_079.jpg?url';
import m80 from '../assets/birds/bird_080.jpg?url';
import m81 from '../assets/birds/bird_081.jpg?url';
import m82 from '../assets/birds/bird_082.jpg?url';
import m83 from '../assets/birds/bird_083.jpg?url';
import m84 from '../assets/birds/bird_084.jpg?url';
import m85 from '../assets/birds/bird_085.jpg?url';
import m86 from '../assets/birds/bird_086.jpg?url';
import m87 from '../assets/birds/bird_087.jpg?url';
import m88 from '../assets/birds/bird_088.jpg?url';
import m89 from '../assets/birds/bird_089.jpg?url';
import m90 from '../assets/birds/bird_090.jpg?url';
import m91 from '../assets/birds/bird_091.jpg?url';
import m92 from '../assets/birds/bird_092.jpg?url';
import m93 from '../assets/birds/bird_093.jpg?url';
import m94 from '../assets/birds/bird_094.jpg?url';
import m95 from '../assets/birds/bird_095.jpg?url';
import m96 from '../assets/birds/bird_096.jpg?url';
import m97 from '../assets/birds/bird_097.jpg?url';
import m98 from '../assets/birds/bird_098.jpg?url';
import m99 from '../assets/birds/bird_099.jpg?url';
import m100 from '../assets/birds/bird_100.jpg?url';
import m101 from '../assets/birds/bird_101.jpg?url';
import m102 from '../assets/birds/bird_102.jpg?url';
import m103 from '../assets/birds/bird_103.jpg?url';
import m104 from '../assets/birds/bird_104.jpg?url';
import m105 from '../assets/birds/bird_105.jpg?url';
import m106 from '../assets/birds/bird_106.jpg?url';
import m107 from '../assets/birds/bird_107.jpg?url';
import m108 from '../assets/birds/bird_108.jpg?url';
import m109 from '../assets/birds/bird_109.jpg?url';
import m110 from '../assets/birds/bird_110.jpg?url';
import m111 from '../assets/birds/bird_111.jpg?url';
import m112 from '../assets/birds/bird_112.jpg?url';
import m113 from '../assets/birds/bird_113.jpg?url';
import m114 from '../assets/birds/bird_114.jpg?url';
import m115 from '../assets/birds/bird_115.jpg?url';
import m116 from '../assets/birds/bird_116.jpg?url';
import m117 from '../assets/birds/bird_117.jpg?url';
import m118 from '../assets/birds/bird_118.jpg?url';
import m119 from '../assets/birds/bird_119.jpg?url';
import m120 from '../assets/birds/bird_120.jpg?url';
import m121 from '../assets/birds/bird_121.jpg?url';
import m122 from '../assets/birds/bird_122.jpg?url';

// BIRD_BOOK 顺序 → URL（与 import 块下标严格同步；新增鸟种时同步追加 import + 此处）
const URL_BY_INDEX = [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15, m16, m17, m18, m19, m20, m21, m22, m23, m24, m25, m26, m27, m28, m29, m30, m31, m32, m33, m34, m35, m36, m37, m38, m39, m40, m41, m42, m43, m44, m45, m46, m47, m48, m49, m50, m51, m52, m53, m54, m55, m56, m57, m58, m59, m60, m61, m62, m63, m64, m65, m66, m67, m68, m69, m70, m71, m72, m73, m74, m75, m76, m77, m78, m79, m80, m81, m82, m83, m84, m85, m86, m87, m88, m89, m90, m91, m92, m93, m94, m95, m96, m97, m98, m99, m100, m101, m102, m103, m104, m105, m106, m107, m108, m109, m110, m111, m112, m113, m114, m115, m116, m117, m118, m119, m120, m121, m122];

// 中文名 → URL（O(1) 查表；防御 BIRD_BOOK 含空洞条目）
const URL_BY_NAME = {};
for (let i = 0; i < BIRD_BOOK.length; i++) {
  if (!BIRD_BOOK[i] || !BIRD_BOOK[i].name) continue;
  URL_BY_NAME[BIRD_BOOK[i].name] = URL_BY_INDEX[i];
}

/* =====================================================================
 * 鸟名模糊匹配
 * 识别结果（BirdNET 中文名）未必与图鉴 121 种完全一致（如"拟八哥"→"八哥"、
 * "树麻雀"→"麻雀"、"白头翁"→"白头鹎"）。逐个加图鉴不是办法，
 * 用「精确 → 别名/包含 → 编辑距离」三级匹配兜住大部分情况。
 * ===================================================================== */
function editDist(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

/**
 * 识别鸟名 → 图鉴鸟种（返回 BIRD_BOOK 条目或 null）
 * 评分：1.0 精确；0.92 别名包含/名称包含；编辑距离相似度 = 1 - dist/max(len)
 */
export function resolveBirdName(name) {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  if (!n) return null;
  let best = null; let bestScore = 0;
  for (const b of BIRD_BOOK) {
    if (!b || !b.name) continue; // 防御空洞
    // 1. 精确
    if (b.name.toLowerCase() === n) return b;
    // 2. 别名包含（英文名/俗名，如 '北美红雀 · Northern Cardinal'）
    const alias = (b.alias || '').toLowerCase();
    if (alias.includes(n)) { if (0.92 > bestScore) { best = b; bestScore = 0.92; } continue; }
    const bn = b.name.toLowerCase();
    // 3. 名称互相包含（"树麻雀"⊃"麻雀"、"拟八哥"⊃"八哥"）
    if (bn.includes(n) || n.includes(bn)) {
      if (0.85 > bestScore) { best = b; bestScore = 0.85; }
      continue;
    }
    // 4. 编辑距离相似度（处理"白头翁"→"白头鹎"这类错字）
    const sim = 1 - editDist(n, bn) / Math.max(n.length, bn.length);
    if (sim >= 0.55 && sim > bestScore) { best = b; bestScore = sim; }
  }
  return best;
}

/** 取图 URL：自动模糊匹配（识别名 → 图鉴名） */
export function getImageUrl(name) {
  const hit = resolveBirdName(name);
  return hit ? URL_BY_NAME[hit.name] : null;
}

// 异步预加载：用 img.decode() 确保图片真正可绘制，再放入缓存
// （onload 触发时只是下载完成，decode() 才是真正可被 canvas drawImage）
const _cache = new Map();
const _failures = new Set();
let _loading = null;
let _allDone = false;

export function loadAll() {
  if (_allDone) return Promise.resolve();
  if (_loading) return _loading;
  _loading = new Promise((resolve) => {
    let pending = 0;
    for (let i = 0; i < BIRD_BOOK.length; i++) {
      const bird = BIRD_BOOK[i];
      if (!bird || !bird.name) continue; // 防御空洞
      const n = bird.name;
      const url = URL_BY_INDEX[i];
      if (!url) { _failures.add(n); continue; }
      if (_cache.has(n)) continue;
      pending++;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        // 关键：用 decode() 等待真正可绘制，避免 onload 触发但 naturalWidth 仍 0 的边缘 case
        img.decode().then(
          () => { _cache.set(n, img); pending--; if (pending === 0) { _allDone = true; resolve(); } },
          () => { _failures.add(n); pending--; if (pending === 0) { _allDone = true; resolve(); } }
        );
      };
      img.onerror = () => { _failures.add(n); pending--; if (pending === 0) { _allDone = true; resolve(); } };
      img.src = url;
    }
    if (pending === 0) { _allDone = true; resolve(); }
  });
  return _loading;
}

/** 取已加载的 Image：内部先模糊匹配到图鉴名，再用图鉴名查缓存 */
export function getLoaded(name) {
  const hit = resolveBirdName(name);
  if (!hit) return null;
  return _cache.get(hit.name) || null;
}

export function isLoaded() { return _allDone; }

export function loadStatus() {
  return { total: BIRD_BOOK.length, loaded: _cache.size, failed: _failures.size, pending: BIRD_BOOK.length - _cache.size - _failures.size };
}
