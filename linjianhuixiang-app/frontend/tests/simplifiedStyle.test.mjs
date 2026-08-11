/**
 * simplifiedStyle.test.mjs
 * OpenFreeMap 矢量 style 简化逻辑测试：
 *  - isPoiOrLabelLayer：POI / 地名注记 / 水名文字层识别；
 *  - hidePoiLayers：POI/label/水名 layer visibility='none'，基础图层（water/wood/waterway/road）保留；
 *  - applySimplifiedPalette：water fill 淡蓝、landuse_wood fill 深绿，只调 1-2 类；
 *  - fetchSimplifiedStyle：成功返回隐藏后克隆；网络失败 / HTTP 错误 / 超时 / 非法 url 抛错；
 *    缓存 24h 命中复用、过期重新 fetch、不同 url 刷新缓存；返回对象为克隆不污染缓存。
 * 说明：Node 环境无 DOM，测试通过桩 globalThis.fetch 驱动，不改动真实网络。
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchSimplifiedStyle,
  isPoiOrLabelLayer,
  hidePoiLayers,
  applySimplifiedPalette,
  cloneStyle,
  simplifiedStyleCache,
  SIMPLIFIED_STYLE_URL,
  CACHE_TTL_MS,
} from '../src/utils/simplifiedStyle.js';

/** 模拟 OpenFreeMap liberty style（111 层结构子集）：含背景/自然/水/林地/道路 + POI/label/水名/道路名盾牌 */
function makeMockStyle() {
  return {
    version: 8,
    sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f8f4e8' } },
      { id: 'natural_earth', type: 'background', paint: { 'background-color': '#ede8d8' } },
      { id: 'water', type: 'fill', source: 'openmaptiles', paint: { 'fill-color': '#a0c8f0' } },
      { id: 'waterway', type: 'line', source: 'openmaptiles', paint: { 'line-color': '#a0c8f0' } },
      { id: 'landcover_wood', type: 'fill', source: 'openmaptiles', paint: { 'fill-color': '#93c9a2' } },
      { id: 'landcover_grass', type: 'fill', source: 'openmaptiles', paint: { 'fill-color': '#cde3b0' } },
      { id: 'park', type: 'fill', source: 'openmaptiles', paint: { 'fill-color': '#b9d98a' } },
      { id: 'road_motorway', type: 'line', source: 'openmaptiles', paint: { 'line-color': '#ffffff' } },
      { id: 'road_primary', type: 'line', source: 'openmaptiles', paint: { 'line-color': '#f3f0e6' } },
      { id: 'road_one_way_arrow', type: 'symbol', source: 'openmaptiles', layout: { 'icon-image': 'arrow' } },
      { id: 'building', type: 'fill', source: 'openmaptiles', paint: { 'fill-color': '#e0ddd0' } },
      { id: 'poi_r20', type: 'symbol', source: 'openmaptiles', layout: { 'text-field': 'name' } },
      { id: 'poi_r7', type: 'symbol', source: 'openmaptiles', layout: { 'text-field': 'name' } },
      { id: 'poi_transit', type: 'symbol', source: 'openmaptiles' },
      { id: 'label_other', type: 'symbol', source: 'openmaptiles' },
      { id: 'label_village', type: 'symbol', source: 'openmaptiles', layout: { 'text-field': 'name' } },
      { id: 'label_town', type: 'symbol', source: 'openmaptiles' },
      { id: 'label_city', type: 'symbol', source: 'openmaptiles' },
      { id: 'label_state', type: 'symbol', source: 'openmaptiles' },
      { id: 'label_country_other', type: 'symbol', source: 'openmaptiles' },
      { id: 'waterway_name', type: 'symbol', source: 'openmaptiles', layout: { 'text-field': 'name' } },
      { id: 'waterway_line_label', type: 'symbol', source: 'openmaptiles' },
      { id: 'water_name_point_label', type: 'symbol', source: 'openmaptiles' },
      { id: 'water_name_line_label', type: 'symbol', source: 'openmaptiles' },
      { id: 'highway-name-path', type: 'symbol', source: 'openmaptiles', layout: { 'text-field': 'name' } },
      { id: 'highway-name-minor', type: 'symbol', source: 'openmaptiles', layout: { 'text-field': 'name' } },
      { id: 'highway-name-major', type: 'symbol', source: 'openmaptiles', layout: { 'text-field': 'name' } },
      { id: 'highway-shield-non-us', type: 'symbol', source: 'openmaptiles', layout: { 'text-field': 'ref' } },
      { id: 'highway-shield-us-interstate', type: 'symbol', source: 'openmaptiles', layout: { 'text-field': 'ref' } },
      { id: 'road_shield_us', type: 'symbol', source: 'openmaptiles', layout: { 'text-field': 'ref' } },
      { id: 'airport', type: 'symbol', source: 'openmaptiles', layout: { 'text-field': 'name' } },
      { id: 'place_other', type: 'symbol', source: 'openmaptiles' },
    ],
  };
}

/** 替换 globalThis.fetch；返回恢复函数 */
function installFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = original;
  };
}

const layerById = (style, id) => style.layers.find((l) => l.id === id);

describe('isPoiOrLabelLayer（POI / 地名 / 水名 / 道路名盾牌文字层识别）', () => {
  test('poi_ / label_ 前缀、.*_label$ 后缀均判为注记层', () => {
    for (const id of [
      'poi_r20', 'poi_r7', 'poi_r1', 'poi_transit',
      'label_other', 'label_village', 'label_town', 'label_state', 'label_city', 'label_country_other',
      'road_label', 'boundary_label', 'waterway_line_label', 'water_name_point_label', 'water_name_line_label',
    ]) {
      assert.equal(isPoiOrLabelLayer(id), true, `${id} 应为注记层`);
    }
  });

  test('waterway_name / water_name 水名判为注记层', () => {
    assert.equal(isPoiOrLabelLayer('waterway_name'), true);
    assert.equal(isPoiOrLabelLayer('water_name'), true);
  });

  test('道路名 / 道路编号盾牌（如 S307）/ 机场名判为注记层（用户投诉的核心文字）', () => {
    for (const id of [
      'highway-name-path', 'highway-name-minor', 'highway-name-major',
      'highway-shield-non-us', 'highway-shield-us-interstate', 'road_shield_us',
      'airport',
    ]) {
      assert.equal(isPoiOrLabelLayer(id), true, `${id} 应判为文字注记层`);
    }
  });

  test('基础图层（背景/自然/水/林地/道路/水系线/单向箭头/建筑）不是注记层', () => {
    for (const id of [
      'background', 'natural_earth', 'water', 'waterway', 'landcover_wood',
      'landcover_grass', 'landcover_wetland', 'park', 'road_motorway', 'road_primary',
      'road_one_way_arrow', 'road_one_way_arrow_opposite', 'building', 'place_other',
    ]) {
      assert.equal(isPoiOrLabelLayer(id), false, `${id} 不应被判为注记层`);
    }
  });

  test('空 / 非字符串 → false', () => {
    assert.equal(isPoiOrLabelLayer(''), false);
    assert.equal(isPoiOrLabelLayer(null), false);
    assert.equal(isPoiOrLabelLayer(undefined), false);
    assert.equal(isPoiOrLabelLayer(42), false);
  });
});

describe('hidePoiLayers（隐藏所有 POI/label/水名/道路名盾牌 layer）', () => {
  test('注记层 layout.visibility 置 none，基础图层布局原样保留', () => {
    const style = makeMockStyle();
    hidePoiLayers(style);
    for (const id of [
      'poi_r20', 'poi_r7', 'poi_transit', 'label_other', 'label_village', 'label_town',
      'label_city', 'label_state', 'label_country_other', 'waterway_name',
      'waterway_line_label', 'water_name_point_label', 'water_name_line_label',
      'highway-name-path', 'highway-name-minor', 'highway-name-major',
      'highway-shield-non-us', 'highway-shield-us-interstate', 'road_shield_us',
      'airport',
    ]) {
      assert.equal(layerById(style, id).layout.visibility, 'none', `${id} 应被隐藏`);
    }
    // 基础图层：没有 visibility 字段，layout 原样（water 无 layout）
    assert.equal(layerById(style, 'background').layout, undefined);
    assert.equal(layerById(style, 'water').layout, undefined);
    assert.equal(layerById(style, 'waterway').layout, undefined);
    assert.equal(layerById(style, 'road_one_way_arrow').layout.visibility, undefined, '单向箭头图标层保留');
    assert.deepEqual(layerById(style, 'road_motorway').paint, { 'line-color': '#ffffff' });
    assert.deepEqual(layerById(style, 'landcover_wood').paint, { 'fill-color': '#93c9a2' });
    // place_other 不隐藏（未在规则内）
    assert.equal(layerById(style, 'place_other').layout, undefined);
  });

  test('waterway 线本身的 line layer 不隐藏（只隐藏水名文字）', () => {
    const style = makeMockStyle();
    hidePoiLayers(style);
    assert.equal(layerById(style, 'waterway').layout, undefined, 'waterway line 层不应被隐藏');
    assert.equal(layerById(style, 'waterway_name').layout.visibility, 'none', 'waterway_name 文字层应被隐藏');
  });

  test('空 layers / 非对象 → 原样返回不抛错', () => {
    assert.equal(hidePoiLayers(null), null);
    const empty = {};
    assert.equal(hidePoiLayers(empty), empty, '空对象安全返回原引用');
    const noLayers = { version: 8, sources: {} };
    assert.equal(hidePoiLayers(noLayers), noLayers);
  });
});

describe('applySimplifiedPalette（水蓝 / 绿地微调，只动 1-2 类）', () => {
  test('water fill → 淡蓝 #a4caea；landcover_wood fill → 深绿 #81c784', () => {
    const style = makeMockStyle();
    applySimplifiedPalette(style);
    assert.equal(layerById(style, 'water').paint['fill-color'], '#a4caea', '水体应为淡蓝');
    assert.equal(layerById(style, 'landcover_wood').paint['fill-color'], '#81c784', '林地应为深绿');
  });

  test('非 fill 层与其它层色调不动（waterway line / grass / park / background）', () => {
    const style = makeMockStyle();
    applySimplifiedPalette(style);
    assert.equal(layerById(style, 'waterway').paint['line-color'], '#a0c8f0', '水系线层不应被改色');
    assert.deepEqual(layerById(style, 'landcover_grass').paint, { 'fill-color': '#cde3b0' }, '草地保持原色');
    assert.deepEqual(layerById(style, 'park').paint, { 'fill-color': '#b9d98a' }, '公园保持原色（不过度调色）');
    assert.equal(layerById(style, 'background').paint['background-color'], '#f8f4e8', '背景纸色保持原样');
  });
});

describe('fetchSimplifiedStyle（网络 + 隐藏 + 调色 + 缓存）', () => {
  beforeEach(() => {
    simplifiedStyleCache.url = null;
    simplifiedStyleCache.style = null;
    simplifiedStyleCache.ts = 0;
  });

  test('成功：返回隐藏 POI/水名/道路名盾牌 + 调色的 style，且不污染原始响应对象', async () => {
    const raw = makeMockStyle();
    const restore = installFetch(async () => ({ ok: true, status: 200, json: async () => raw }));
    try {
      const style = await fetchSimplifiedStyle(SIMPLIFIED_STYLE_URL, { timeout: 2000 });
      assert.equal(layerById(style, 'poi_r20').layout.visibility, 'none');
      assert.equal(layerById(style, 'label_village').layout.visibility, 'none');
      assert.equal(layerById(style, 'waterway_name').layout.visibility, 'none');
      assert.equal(layerById(style, 'highway-name-major').layout.visibility, 'none', '道路名文字应隐藏');
      assert.equal(layerById(style, 'highway-shield-non-us').layout.visibility, 'none', '道路编号盾牌应隐藏');
      assert.equal(layerById(style, 'airport').layout.visibility, 'none', '机场名应隐藏');
      assert.equal(layerById(style, 'water').paint['fill-color'], '#a4caea');
      assert.equal(layerById(style, 'landcover_wood').paint['fill-color'], '#81c784');
      assert.equal(layerById(style, 'waterway').layout, undefined, '水系线层保留');
      // 原始响应对象不被修改（cloneStyle 深克隆）
      assert.equal(layerById(raw, 'poi_r20').layout.visibility, undefined, '原始 layout 不应被加 visibility');
      assert.deepEqual(layerById(raw, 'water').paint, { 'fill-color': '#a0c8f0' }, '原始 water paint 不应被改');
    } finally {
      restore();
    }
  });

  test('缓存命中（同 url 24h 内）→ 复用，不再 fetch', async () => {
    let fetchCount = 0;
    const restore = installFetch(async () => {
      fetchCount += 1;
      return { ok: true, status: 200, json: async () => makeMockStyle() };
    });
    try {
      await fetchSimplifiedStyle(SIMPLIFIED_STYLE_URL, { timeout: 2000 });
      await fetchSimplifiedStyle(SIMPLIFIED_STYLE_URL, { timeout: 2000 });
      assert.equal(fetchCount, 1, '第二次应命中缓存');
      assert.equal(simplifiedStyleCache.url, SIMPLIFIED_STYLE_URL);
      assert.ok(Date.now() - simplifiedStyleCache.ts < CACHE_TTL_MS);
    } finally {
      restore();
    }
  });

  test('缓存返回克隆：改坏返回值不影响后续复用', async () => {
    let fetchCount = 0;
    const restore = installFetch(async () => {
      fetchCount += 1;
      return { ok: true, status: 200, json: async () => makeMockStyle() };
    });
    try {
      const s1 = await fetchSimplifiedStyle(SIMPLIFIED_STYLE_URL, { timeout: 2000 });
      layerById(s1, 'water').paint['fill-color'] = '#000000';
      layerById(s1, 'label_city').layout.visibility = 'visible';
      const s2 = await fetchSimplifiedStyle(SIMPLIFIED_STYLE_URL, { timeout: 2000 });
      assert.equal(layerById(s2, 'water').paint['fill-color'], '#a4caea', '缓存内容未被调用方污染');
      assert.equal(layerById(s2, 'label_city').layout.visibility, 'none');
      assert.equal(fetchCount, 1, '仍应命中缓存');
    } finally {
      restore();
    }
  });

  test('缓存过期（>24h）→ 重新 fetch 并刷新缓存', async () => {
    let fetchCount = 0;
    const restore = installFetch(async () => {
      fetchCount += 1;
      return { ok: true, status: 200, json: async () => makeMockStyle() };
    });
    try {
      await fetchSimplifiedStyle(SIMPLIFIED_STYLE_URL, { timeout: 2000 });
      assert.equal(fetchCount, 1);
      // 将缓存时间戳拨到过期
      simplifiedStyleCache.ts = Date.now() - (CACHE_TTL_MS + 1000);
      await fetchSimplifiedStyle(SIMPLIFIED_STYLE_URL, { timeout: 2000 });
      assert.equal(fetchCount, 2, '缓存过期应重新 fetch');
      assert.ok(Date.now() - simplifiedStyleCache.ts < CACHE_TTL_MS, '缓存时间应被刷新');
    } finally {
      restore();
    }
  });

  test('不同 url → 重新 fetch，缓存只保留最新（单槽，无内存膨胀）', async () => {
    let fetchCount = 0;
    const restore = installFetch(async () => {
      fetchCount += 1;
      return { ok: true, status: 200, json: async () => makeMockStyle() };
    });
    try {
      const urlA = 'https://a.invalid/style.json';
      const urlB = 'https://b.invalid/style.json';
      await fetchSimplifiedStyle(urlA, { timeout: 2000 });
      await fetchSimplifiedStyle(urlB, { timeout: 2000 });
      await fetchSimplifiedStyle(urlA, { timeout: 2000 });
      assert.equal(fetchCount, 3, 'urlA→urlB→urlA 均未命中旧缓存（单槽只认最新 url）');
      assert.equal(simplifiedStyleCache.url, urlA);
    } finally {
      restore();
    }
  });

  test('HTTP 非 2xx → 抛错', async () => {
    const restore = installFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    try {
      await assert.rejects(fetchSimplifiedStyle('https://err.invalid/style.json', { timeout: 2000 }), /HTTP 500/);
    } finally {
      restore();
    }
  });

  test('网络失败 → 抛错', async () => {
    const restore = installFetch(async () => {
      throw new Error('network down');
    });
    try {
      await assert.rejects(fetchSimplifiedStyle('https://down.invalid/style.json', { timeout: 2000 }), /network down/);
    } finally {
      restore();
    }
  });

  test('超时（AbortController）→ 抛错', async () => {
    const restore = installFetch((_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted by timeout')));
      })
    );
    try {
      await assert.rejects(fetchSimplifiedStyle('https://slow.invalid/style.json', { timeout: 50 }), /aborted by timeout/);
    } finally {
      restore();
    }
  });

  test('非法 url → 抛错（不发起 fetch）', async () => {
    let fetchCount = 0;
    const restore = installFetch(async () => {
      fetchCount += 1;
      return { ok: true, status: 200, json: async () => makeMockStyle() };
    });
    try {
      await assert.rejects(fetchSimplifiedStyle(''), /invalid simplified style url/);
      await assert.rejects(fetchSimplifiedStyle(null), /invalid simplified style url/);
      assert.equal(fetchCount, 0, '非法 url 不应触发网络请求');
    } finally {
      restore();
    }
  });
});

describe('cloneStyle（深克隆保护缓存与网络响应）', () => {
  test('顶层/每层/paint 均独立：改克隆不伤原对象', () => {
    const style = makeMockStyle();
    const cloned = cloneStyle(style);
    assert.notEqual(cloned, style);
    assert.notEqual(cloned.layers[0], style.layers[0]);
    assert.notEqual(cloned.layers[0].paint, style.layers[0].paint, '嵌套 paint 对象也应独立');
    cloned.layers[0].paint['background-color'] = '#000000';
    assert.equal(style.layers[0].paint['background-color'], '#f8f4e8', '克隆的 paint 修改不影响原对象');
    cloned.layers[0].layout = { visibility: 'none' };
    assert.equal(style.layers[0].layout, undefined, '克隆新增 layout 不影响原对象');
    cloned.layers.push({ id: 'extra' });
    assert.equal(style.layers.length, 32, '克隆的 layers 数组独立');
  });

  test('空值安全返回', () => {
    assert.equal(cloneStyle(null), null);
    assert.equal(cloneStyle(undefined), undefined);
  });
});
