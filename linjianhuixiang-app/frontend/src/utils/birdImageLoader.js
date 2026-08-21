/**
 * birdImageLoader.js —— 120 种城市常见鸟的真实照片
 *
 * 来源：backend/scripts/fetch_bird_photos.py 从 Bing 图片搜索抓取
 *      真实照片，中心裁剪为 320x320 JPEG（q82，单张 8~30KB）
 *      输出到 frontend/src/assets/birds/{index:03d}_{name}.jpg
 *
 * 重要：使用 Vite 显式 import + ?url 后缀（不用 import.meta.glob），
 *       保证 build 时每张图都被 emit 到 dist/assets/，可被 APK 正常加载。
 *
 * 用法：
 *   - getImageUrl(name)  -> string|null   同步返回图片 URL（包内资源）
 *   - loadAll()          -> Promise<void> 异步预加载全部 Image 缓存
 *   - getLoaded(name)    -> HTMLImageElement|null 同步获取已加载的 Image
 *   - isLoaded()         -> boolean
 */
import { BIRD_BOOK } from '../data/birdBook.js';

import m1 from '../assets/birds/001_麻雀.jpg?url';
import m2 from '../assets/birds/002_白头鹎.jpg?url';
import m3 from '../assets/birds/003_乌鸫.jpg?url';
import m4 from '../assets/birds/004_珠颈斑鸠.jpg?url';
import m5 from '../assets/birds/005_喜鹊.jpg?url';
import m6 from '../assets/birds/006_灰喜鹊.jpg?url';
import m7 from '../assets/birds/007_大山雀.jpg?url';
import m8 from '../assets/birds/008_银喉长尾山雀.jpg?url';
import m9 from '../assets/birds/009_红头长尾山雀.jpg?url';
import m10 from '../assets/birds/010_棕头鸦雀.jpg?url';
import m11 from '../assets/birds/011_画眉.jpg?url';
import m12 from '../assets/birds/012_八哥.jpg?url';
import m13 from '../assets/birds/013_鹊鸲.jpg?url';
import m14 from '../assets/birds/014_白鹡鸰.jpg?url';
import m15 from '../assets/birds/015_北红尾鸲.jpg?url';
import m16 from '../assets/birds/016_红胁蓝尾鸲.jpg?url';
import m17 from '../assets/birds/017_黄腰柳莺.jpg?url';
import m18 from '../assets/birds/018_黄眉柳莺.jpg?url';
import m19 from '../assets/birds/019_暗绿绣眼鸟.jpg?url';
import m20 from '../assets/birds/020_家燕.jpg?url';
import m21 from '../assets/birds/021_金腰燕.jpg?url';
import m22 from '../assets/birds/022_白腰雨燕.jpg?url';
import m23 from '../assets/birds/023_普通翠鸟.jpg?url';
import m24 from '../assets/birds/024_戴胜.jpg?url';
import m25 from '../assets/birds/025_大斑啄木鸟.jpg?url';
import m26 from '../assets/birds/026_斑姬啄木鸟.jpg?url';
import m27 from '../assets/birds/027_灰椋鸟.jpg?url';
import m28 from '../assets/birds/028_丝光椋鸟.jpg?url';
import m29 from '../assets/birds/029_黑领椋鸟.jpg?url';
import m30 from '../assets/birds/030_斑鸫.jpg?url';
import m31 from '../assets/birds/031_黄腹鹪莺.jpg?url';
import m32 from '../assets/birds/032_纯色山鹪莺.jpg?url';
import m33 from '../assets/birds/033_红耳鹎.jpg?url';
import m34 from '../assets/birds/034_黄臀鹎.jpg?url';
import m35 from '../assets/birds/035_小鸊鷉.jpg?url';
import m36 from '../assets/birds/036_黑水鸡.jpg?url';
import m37 from '../assets/birds/037_白鹭.jpg?url';
import m38 from '../assets/birds/038_池鹭.jpg?url';
import m39 from '../assets/birds/039_夜鹭.jpg?url';
import m40 from '../assets/birds/040_灰头麦鸡.jpg?url';
import m41 from '../assets/birds/041_绿头鸭.jpg?url';
import m42 from '../assets/birds/042_斑嘴鸭.jpg?url';
import m43 from '../assets/birds/043_鸳鸯.jpg?url';
import m44 from '../assets/birds/044_凤头鸊鷉.jpg?url';
import m45 from '../assets/birds/045_白骨顶.jpg?url';
import m46 from '../assets/birds/046_苍鹭.jpg?url';
import m47 from '../assets/birds/047_大白鹭.jpg?url';
import m48 from '../assets/birds/048_牛背鹭.jpg?url';
import m49 from '../assets/birds/049_矶鹬.jpg?url';
import m50 from '../assets/birds/050_黑翅长脚鹬.jpg?url';
import m51 from '../assets/birds/051_红隼.jpg?url';
import m52 from '../assets/birds/052_黑翅鸢.jpg?url';
import m53 from '../assets/birds/053_普通鵟.jpg?url';
import m54 from '../assets/birds/054_领角鸮.jpg?url';
import m55 from '../assets/birds/055_斑头鸺鹠.jpg?url';
import m56 from '../assets/birds/056_棕背伯劳.jpg?url';
import m57 from '../assets/birds/057_红尾伯劳.jpg?url';
import m58 from '../assets/birds/058_白喉红臀鹎.jpg?url';
import m59 from '../assets/birds/059_领雀嘴鹎.jpg?url';
import m60 from '../assets/birds/060_黑短脚鹎.jpg?url';
import m61 from '../assets/birds/061_黑枕黄鹂.jpg?url';
import m62 from '../assets/birds/062_黑卷尾.jpg?url';
import m63 from '../assets/birds/063_发冠卷尾.jpg?url';
import m64 from '../assets/birds/064_黑脸噪鹛.jpg?url';
import m65 from '../assets/birds/065_白颊噪鹛.jpg?url';
import m66 from '../assets/birds/066_红嘴相思鸟.jpg?url';
import m67 from '../assets/birds/067_黄腹山雀.jpg?url';
import m68 from '../assets/birds/068_黄颊山雀.jpg?url';
import m69 from '../assets/birds/069_煤山雀.jpg?url';
import m70 from '../assets/birds/070_白眉鹀.jpg?url';
import m71 from '../assets/birds/071_黄喉鹀.jpg?url';
import m72 from '../assets/birds/072_灰头鹀.jpg?url';
import m73 from '../assets/birds/073_小鹀.jpg?url';
import m74 from '../assets/birds/074_黄雀.jpg?url';
import m75 from '../assets/birds/075_金翅雀.jpg?url';
import m76 from '../assets/birds/076_燕雀.jpg?url';
import m77 from '../assets/birds/077_黑尾蜡嘴雀.jpg?url';
import m78 from '../assets/birds/078_黑头蜡嘴雀.jpg?url';
import m79 from '../assets/birds/079_红嘴蓝鹊.jpg?url';
import m80 from '../assets/birds/080_松鸦.jpg?url';
import m81 from '../assets/birds/081_红喉歌鸲.jpg?url';
import m82 from '../assets/birds/082_蓝喉歌鸲.jpg?url';
import m83 from '../assets/birds/083_红尾水鸲.jpg?url';
import m84 from '../assets/birds/084_白顶溪鸲.jpg?url';
import m85 from '../assets/birds/085_紫啸鸫.jpg?url';
import m86 from '../assets/birds/086_白眉鸫.jpg?url';
import m87 from '../assets/birds/087_赤颈鸫.jpg?url';
import m88 from '../assets/birds/088_乌灰鸫.jpg?url';
import m89 from '../assets/birds/089_灰背鸫.jpg?url';
import m90 from '../assets/birds/090_灰头绿啄木鸟.jpg?url';
import m91 from '../assets/birds/091_星头啄木鸟.jpg?url';
import m92 from '../assets/birds/092_大杜鹃.jpg?url';
import m93 from '../assets/birds/093_四声杜鹃.jpg?url';
import m94 from '../assets/birds/094_噪鹃.jpg?url';
import m95 from '../assets/birds/095_三宝鸟.jpg?url';
import m96 from '../assets/birds/096_灰鹡鸰.jpg?url';
import m97 from '../assets/birds/097_黄鹡鸰.jpg?url';
import m98 from '../assets/birds/098_树鹨.jpg?url';
import m99 from '../assets/birds/099_水鹨.jpg?url';
import m100 from '../assets/birds/100_大嘴乌鸦.jpg?url';
import m101 from '../assets/birds/101_小嘴乌鸦.jpg?url';
import m102 from '../assets/birds/102_达乌里寒鸦.jpg?url';
import m103 from '../assets/birds/103_红嘴山鸦.jpg?url';
import m104 from '../assets/birds/104_崖沙燕.jpg?url';
import m105 from '../assets/birds/105_毛脚燕.jpg?url';
import m106 from '../assets/birds/106_冕柳莺.jpg?url';
import m107 from '../assets/birds/107_极北柳莺.jpg?url';
import m108 from '../assets/birds/108_蓝歌鸲.jpg?url';
import m109 from '../assets/birds/109_红尾鸫.jpg?url';
import m110 from '../assets/birds/110_白腹鸫.jpg?url';
import m111 from '../assets/birds/111_黄眉鹀.jpg?url';
import m112 from '../assets/birds/112_田鹀.jpg?url';
import m113 from '../assets/birds/113_锡嘴雀.jpg?url';
import m114 from '../assets/birds/114_普通朱雀.jpg?url';
import m115 from '../assets/birds/115_北朱雀.jpg?url';
import m116 from '../assets/birds/116_长尾雀.jpg?url';
import m117 from '../assets/birds/117_朱顶雀.jpg?url';
import m118 from '../assets/birds/118_星鸦.jpg?url';
import m119 from '../assets/birds/119_栗耳短脚鹎.jpg?url';
import m120 from '../assets/birds/120_虎斑地鸫.jpg?url';

// 文件名 → URL（与 import 块同步）
const URL_BY_NAME = {
  '麻雀': m1,
  '白头鹎': m2,
  '乌鸫': m3,
  '珠颈斑鸠': m4,
  '喜鹊': m5,
  '灰喜鹊': m6,
  '大山雀': m7,
  '银喉长尾山雀': m8,
  '红头长尾山雀': m9,
  '棕头鸦雀': m10,
  '画眉': m11,
  '八哥': m12,
  '鹊鸲': m13,
  '白鹡鸰': m14,
  '北红尾鸲': m15,
  '红胁蓝尾鸲': m16,
  '黄腰柳莺': m17,
  '黄眉柳莺': m18,
  '暗绿绣眼鸟': m19,
  '家燕': m20,
  '金腰燕': m21,
  '白腰雨燕': m22,
  '普通翠鸟': m23,
  '戴胜': m24,
  '大斑啄木鸟': m25,
  '斑姬啄木鸟': m26,
  '灰椋鸟': m27,
  '丝光椋鸟': m28,
  '黑领椋鸟': m29,
  '斑鸫': m30,
  '黄腹鹪莺': m31,
  '纯色山鹪莺': m32,
  '红耳鹎': m33,
  '黄臀鹎': m34,
  '小鸊鷉': m35,
  '黑水鸡': m36,
  '白鹭': m37,
  '池鹭': m38,
  '夜鹭': m39,
  '灰头麦鸡': m40,
  '绿头鸭': m41,
  '斑嘴鸭': m42,
  '鸳鸯': m43,
  '凤头鸊鷉': m44,
  '白骨顶': m45,
  '苍鹭': m46,
  '大白鹭': m47,
  '牛背鹭': m48,
  '矶鹬': m49,
  '黑翅长脚鹬': m50,
  '红隼': m51,
  '黑翅鸢': m52,
  '普通鵟': m53,
  '领角鸮': m54,
  '斑头鸺鹠': m55,
  '棕背伯劳': m56,
  '红尾伯劳': m57,
  '白喉红臀鹎': m58,
  '领雀嘴鹎': m59,
  '黑短脚鹎': m60,
  '黑枕黄鹂': m61,
  '黑卷尾': m62,
  '发冠卷尾': m63,
  '黑脸噪鹛': m64,
  '白颊噪鹛': m65,
  '红嘴相思鸟': m66,
  '黄腹山雀': m67,
  '黄颊山雀': m68,
  '煤山雀': m69,
  '白眉鹀': m70,
  '黄喉鹀': m71,
  '灰头鹀': m72,
  '小鹀': m73,
  '黄雀': m74,
  '金翅雀': m75,
  '燕雀': m76,
  '黑尾蜡嘴雀': m77,
  '黑头蜡嘴雀': m78,
  '红嘴蓝鹊': m79,
  '松鸦': m80,
  '红喉歌鸲': m81,
  '蓝喉歌鸲': m82,
  '红尾水鸲': m83,
  '白顶溪鸲': m84,
  '紫啸鸫': m85,
  '白眉鸫': m86,
  '赤颈鸫': m87,
  '乌灰鸫': m88,
  '灰背鸫': m89,
  '灰头绿啄木鸟': m90,
  '星头啄木鸟': m91,
  '大杜鹃': m92,
  '四声杜鹃': m93,
  '噪鹃': m94,
  '三宝鸟': m95,
  '灰鹡鸰': m96,
  '黄鹡鸰': m97,
  '树鹨': m98,
  '水鹨': m99,
  '大嘴乌鸦': m100,
  '小嘴乌鸦': m101,
  '达乌里寒鸦': m102,
  '红嘴山鸦': m103,
  '崖沙燕': m104,
  '毛脚燕': m105,
  '冕柳莺': m106,
  '极北柳莺': m107,
  '蓝歌鸲': m108,
  '红尾鸫': m109,
  '白腹鸫': m110,
  '黄眉鹀': m111,
  '田鹀': m112,
  '锡嘴雀': m113,
  '普通朱雀': m114,
  '北朱雀': m115,
  '长尾雀': m116,
  '朱顶雀': m117,
  '星鸦': m118,
  '栗耳短脚鹎': m119,
  '虎斑地鸫': m120,
};

// 同步 API
export function getImageUrl(name) {
  return URL_BY_NAME[name] || null;
}

// 异步预加载：把每张图转为 HTMLImageElement 缓存（用于 canvas drawImage）
const _cache = new Map();
const _failures = new Set();
let _loading = null;
let _allDone = false;

export function loadAll() {
  if (_allDone) return Promise.resolve();
  if (_loading) return _loading;
  _loading = new Promise((resolve) => {
    const names = BIRD_BOOK.map((b) => b.name);
    let pending = 0;
    for (const n of names) {
      const url = URL_BY_NAME[n];
      if (!url) { _failures.add(n); continue; }
      if (_cache.has(n)) continue;
      pending++;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => { _cache.set(n, img); pending--; if (pending === 0) { _allDone = true; resolve(); } };
      img.onerror = () => { _failures.add(n); pending--; if (pending === 0) { _allDone = true; resolve(); } };
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
  return { total: BIRD_BOOK.length, loaded: _cache.size, failed: _failures.size, pending: BIRD_BOOK.length - _cache.size - _failures.size };
}
