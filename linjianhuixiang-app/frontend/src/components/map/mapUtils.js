/**
 * mapUtils.js —— 地图纯函数（可测试，不依赖 WebGL / DOM）
 *
 * 渐变配色契约（与 MapCanvas circle 层 expression 一致）：
 *  - score ≥ 70 → 绿 #2e7d52（宜居）
 *  - score = 50 → 琥珀 #d49a26（一般）
 *  - score ≤ 0 → 红 #c25a39（受压）
 *  - 中间线性过渡（0→50 红→琥珀，50→70 琥珀→绿，70+ 稳定绿），满足「渐变色」需求。
 */

/** 渐变关键停靠点（score → 颜色） */
export const COLOR_STOPS = [
  { score: 0, color: '#c25a39' },
  { score: 50, color: '#d49a26' },
  { score: 70, color: '#2e7d52' },
  { score: 100, color: '#2e7d52' },
];

/** #rrggbb → [r, g, b] */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** [r,g,b] → #rrggbb */
function rgbToHex([r, g, b]) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * 宜居度 score → 渐变颜色（线性插值，钳制到 [0,100]）。
 * 与 MapLibre circle-color expression（circleColorExpression）使用同一组停靠点，
 * 保证预览逻辑与渲染逻辑一致。
 * @param {number} score
 * @returns {string} '#rrggbb'
 */
export function scoreToColor(score) {
  const s = Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 50;
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    const lo = COLOR_STOPS[i - 1];
    const hi = COLOR_STOPS[i];
    if (s <= hi.score) {
      const t = (s - lo.score) / Math.max(0.0001, hi.score - lo.score);
      const loRgb = hexToRgb(lo.color);
      const hiRgb = hexToRgb(hi.color);
      return rgbToHex(loRgb.map((v, k) => v + (hiRgb[k] - v) * t));
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1].color;
}

/**
 * MapLibre 数据驱动 circle-color expression（interpolate 渐变）。
 * 用法：layers: [{ type: 'circle', paint: { 'circle-color': circleColorExpression() } }]
 */
export function circleColorExpression() {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'score'], 50],
    ...COLOR_STOPS.flatMap((s) => [s.score, s.color]),
  ];
}

/**
 * 标点数组 → GeoJSON FeatureCollection（供 MapLibre source 使用）。
 * 过滤非法坐标；score 缺失按 50；label 缺省「段N」。
 * @param {Array<{lng:number,lat:number,name?:string,score?:number,from?:string}>} points
 */
export function pointsToGeoJSON(points) {
  const list = Array.isArray(points) ? points : [];
  const features = [];
  list.forEach((p, i) => {
    if (!p || typeof p !== 'object') return;
    const lng = Number(p.lng);
    const lat = Number(p.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        name: typeof p.name === 'string' && p.name ? p.name : `段${i + 1}`,
        score: Number.isFinite(Number(p.score)) ? Number(p.score) : 50,
        from: p.from === 'gps' ? 'gps' : 'manual',
      },
    });
  });
  return { type: 'FeatureCollection', features };
}

/**
 * 规范化 mapData（{center, zoom, bounds, points}）。
 * center 非法/缺失 → null（调用方据此走「无地图」分支）。
 */
export function normalizeMapData(mapData) {
  if (!mapData || typeof mapData !== 'object') return null;
  const c = mapData.center;
  const center = Array.isArray(c) && c.length === 2 && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1]))
    ? [Number(c[0]), Number(c[1])]
    : null;
  if (!center) return null;
  return {
    center,
    zoom: Number.isFinite(Number(mapData.zoom)) ? Number(mapData.zoom) : 12,
    bounds: Array.isArray(mapData.bounds) ? mapData.bounds : null,
    points: Array.isArray(mapData.points) ? mapData.points : [],
  };
}

/** 从 summary（聚合摘要 / 地区记录 detail）读取规范化 map；无 map 返回 null */
export function mapFromSummary(summary) {
  if (!summary || typeof summary !== 'object') return null;
  return normalizeMapData(summary.map);
}

/** 高德瓦片子域随机（webrd0{1..4} 随机选一个固定，实测无需 key） */
export function pickAmapTileUrl() {
  const sub = 1 + Math.floor(Math.random() * 4);
  return `https://webrd0${sub}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}`;
}

/** 默认中心：北京市天安门附近（GCJ-02） */
export const DEFAULT_CENTER = [116.397428, 39.90923];
