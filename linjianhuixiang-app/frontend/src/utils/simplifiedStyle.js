/**
 * simplifiedStyle.js —— 简化固定视图的矢量底图 style 处理（纯逻辑，可 Node 环境单测）
 *
 * 背景：高德 raster 瓦片（style=7）即使经去饱和/提亮/绿 wash 处理后，底图仍含
 * 大量 POI 文字注记（店铺/景区名/地名/道路编号），用户反馈"只改了色调，没去掉无关信息"。
 * 方案：改用 OpenFreeMap 矢量瓦片（https://tiles.openfreemap.org/styles/liberty，
 * 实测国内可达，返回 111 层 style.json），自定义 style 隐藏所有 POI/label/水名/
 * 道路名盾牌/机场名 文字注记层，渲染矢量化"水蓝、绿地、道路灰白"的扁平风格。
 *
 * 本模块职责：
 *  - fetchSimplifiedStyle(url, opts)：fetch style.json → 克隆 → 隐藏 POI/label/水名/
 *    道路名盾牌 layer（layout.visibility = 'none'）→ 微调 water 淡蓝 / landcover_wood 深绿 →
 *    写入单槽缓存（同 url 24h 复用）→ 返回克隆（调用方改坏返回值不影响缓存）；
 *  - fetch 失败抛错，由 MapCanvas 降级到高德 raster + 美化 paint。
 * 注意：只隐藏水名文字层（waterway_name / *label），waterway 线本身的 line layer 不隐藏。
 */

/** OpenFreeMap liberty style 地址（矢量瓦片 sources.openmaptiles） */
export const SIMPLIFIED_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** fetch 超时（OpenFreeMap 国内可达但偶发慢） */
export const SIMPLIFIED_STYLE_TIMEOUT = 8000;

/** 缓存有效期：24h */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** 单槽缓存：同一 url 24h 内复用，避免每次渲染都重复下载 43KB style.json */
export const simplifiedStyleCache = { url: null, style: null, ts: 0 };

/** 水名文字层（不匹配 ^poi_/^label_/.*_label$ 的额外名单；水线 line 层不在其中） */
const WATER_NAME_LAYERS = new Set([
  'waterway_name',
  'water_name',
  'waterway_line_label',
  'water_name_point_label',
  'water_name_line_label',
]);

/** 微调色：水体 fill → 淡蓝（水蓝） */
const WATER_FILL_COLOR = '#a4caea';
/** 微调色：林地 fill → 深绿（绿地） */
const WOOD_FILL_COLOR = '#81c784';

/**
 * 判断 layer.id 是否属于「POI / 地名注记 / 水名文字 / 道路名盾牌」类（简化态应隐藏）。
 * 规则（按 OpenFreeMap liberty 实测 111 层）：
 *  - poi_ / label_ 前缀、.*_label$ 后缀（poi_r20/poi_r7/poi_transit、label_village/label_town/
 *    label_state/label_city/label_country_* 等）；
 *  - 水名文字层（waterway_name、water_name、waterway_line_label/water_name_point_label/
 *    water_name_line_label）——waterway 线本身的 line layer 不隐藏；
 *  - 道路名 / 道路编号盾牌（highway-name-*、highway-shield-*、road_shield_*，如 S307 编号）
 *    与机场名（airport）——同样是用户投诉的「无关文字注记」。
 * @param {unknown} id layer.id
 * @returns {boolean}
 */
export function isPoiOrLabelLayer(id) {
  if (typeof id !== 'string' || !id) return false;
  return (
    WATER_NAME_LAYERS.has(id) ||
    /^(poi_|label_|.*_label$)/.test(id) ||
    /^(highway-name|highway-shield|road_shield|airport$)/.test(id)
  );
}

/**
 * 克隆 style：深克隆（JSON 往返）。style.json 为纯 JSON 数据，JSON 往返在
 * 各 WebView（含老 Android）均可用。
 * 目的：hidePoiLayers / applySimplifiedPalette / maplibre 消费端对 style 的任何
 * 修改都不触碰缓存与网络响应对象，保证「同一 url 24h 缓存复用」不被污染。
 * @param {object} style
 * @returns {object}
 */
export function cloneStyle(style) {
  if (!style || typeof style !== 'object') return style;
  try {
    return JSON.parse(JSON.stringify(style));
  } catch (e) {
    // 极端情况（非纯 JSON）退化为逐层浅拷贝
    return {
      ...style,
      layers: Array.isArray(style.layers) ? style.layers.map((l) => ({ ...l })) : style.layers,
    };
  }
}

/**
 * 隐藏所有 POI / 地名注记 / 水名文字 / 道路名盾牌 / 机场名 layer（layout.visibility = 'none'）。
 * 会就地修改传入 style 的 layers 数组（调用方应传入克隆）。
 * @param {object} style
 * @returns {object}
 */
export function hidePoiLayers(style) {
  if (!style || !Array.isArray(style.layers)) return style;
  style.layers.forEach((layer) => {
    if (layer && typeof layer === 'object' && isPoiOrLabelLayer(layer.id)) {
      layer.layout = { ...(layer.layout || {}), visibility: 'none' };
    }
  });
  return style;
}

/**
 * 简化态色调微调（避免过度调色，只动 1-2 类 layer）：
 *  - 水体 fill（water）→ 淡蓝 #a4caea（水蓝）
 *  - 林地 fill（landcover_wood / landuse_wood / forest）→ 深绿 #81c784（绿地）
 * 其余（背景纸色 / park / grassland / wetland / 道路灰白）保持 OpenFreeMap 原样。
 * 会就地修改传入 style 的 layers 数组。
 * @param {object} style
 * @returns {object}
 */
export function applySimplifiedPalette(style) {
  if (!style || !Array.isArray(style.layers)) return style;
  style.layers.forEach((layer) => {
    if (!layer || typeof layer !== 'object' || layer.type !== 'fill') return;
    const paint = { ...(layer.paint || {}) };
    if (/^water/.test(layer.id)) paint['fill-color'] = WATER_FILL_COLOR;
    if (/wood|forest/.test(layer.id)) paint['fill-color'] = WOOD_FILL_COLOR;
    if (Object.keys(paint).length > 0) layer.paint = paint;
  });
  return style;
}

/**
 * 获取「简化固定」用矢量 style：
 *  1. 缓存命中（同 url 且 24h 内）→ 直接返回克隆；
 *  2. 否则 fetch url（AbortController 超时）→ 克隆 → hidePoiLayers → applySimplifiedPalette
 *     → 写入缓存 → 返回克隆。
 * @param {string} url style.json 地址
 * @param {{timeout?: number}} [opts]
 * @returns {Promise<object>} 修改后的 style 对象（含 visibility:'none' 的 POI/label 层）
 * @throws 网络失败 / 非 2xx / 超时 → 抛错（由 MapCanvas 降级）
 */
export async function fetchSimplifiedStyle(url, { timeout = SIMPLIFIED_STYLE_TIMEOUT } = {}) {
  if (typeof url !== 'string' || !url) throw new Error('invalid simplified style url');

  const cache = simplifiedStyleCache;
  if (cache.url === url && cache.style && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cloneStyle(cache.style);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res || !res.ok) {
    throw new Error(`simplified style fetch failed: HTTP ${res ? res.status : 'no response'}`);
  }
  const raw = await res.json();

  const style = hidePoiLayers(cloneStyle(raw));
  applySimplifiedPalette(style);

  cache.url = url;
  cache.style = style;
  cache.ts = Date.now();
  return cloneStyle(style);
}
