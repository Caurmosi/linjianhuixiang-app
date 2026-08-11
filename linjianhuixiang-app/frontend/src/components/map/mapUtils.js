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

/** 高德瓦片子域随机（webrd0{1..4} 随机选一个固定，实测无需 key）。
 *  style=7：路网底图，注记/POI 相对少（style=8 注记过多），但实测仍含
 *  「西白瞳村/竹林精舍/S307」等 POI 文字且无法关闭 → 简化固定视图已改用
 *  OpenFreeMap 矢量瓦片（见 utils/simplifiedStyle.js + MapCanvas simplified prop），
 *  本函数仅保留给编辑态默认底图（兼容现状）。 */
export function pickAmapTileUrl() {
  const sub = 1 + Math.floor(Math.random() * 4);
  return `https://webrd0${sub}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}`;
}

/**
 * 手动固定某一段的坐标：返回新数组，将 points[idx] 更新为指定位置
 * （保留原 name/score，from 置为 'manual'）。
 * idx 越界 / 坐标非法 / 非数组 → 返回原数组（不修改）。
 * @param {Array<object>} points 标点数组（{lng,lat,name,score,from}）
 * @param {number} idx 段序号下标
 * @param {{lng:number, lat:number}} loc 手动固定坐标
 * @returns {Array<object>}
 */
export function fixedPoint(points, idx, loc) {
  const list = Array.isArray(points) ? points : [];
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) return list;
  if (!loc || !Number.isFinite(Number(loc.lng)) || !Number.isFinite(Number(loc.lat))) return list;
  const prev = list[idx] && typeof list[idx] === 'object' ? list[idx] : {};
  const next = list.slice();
  next[idx] = {
    lng: Number(loc.lng),
    lat: Number(loc.lat),
    name: typeof prev.name === 'string' && prev.name ? prev.name : `段${idx + 1}`,
    score: Number.isFinite(Number(prev.score)) ? Number(prev.score) : 50,
    from: 'manual',
  };
  return next;
}

/** 默认中心：北京市天安门附近（GCJ-02） */
export const DEFAULT_CENTER = [116.397428, 39.90923];

/* ============================================================
 * WGS84 → GCJ-02（火星坐标系）纠偏
 * Android 定位桥 getLocation() 返回 WGS84，而高德瓦片 / 搜索定位均为
 * GCJ-02（火星坐标），直接混用会偏移数百米。聚合时对 GPS 点（from==='gps'）
 * 应用本转换；手动选点 / 搜索定位坐标本身已是 GCJ-02，不再转换。
 * 算法为业界通用「火星坐标」标准转换（含中国境外偏好转范围判断）。
 * ============================================================ */
const GCJ_PI = Math.PI;
const GCJ_A = 6378245.0; // 长半轴
const GCJ_EE = 0.00669342162296594323; // 偏心率平方

/** 判断是否在中国境外（境外无偏转需求，直接返回原坐标） */
function gcjOutOfChina(lng, lat) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

/** 纬度偏移量辅助（火星算法） */
function gcjTransformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * GCJ_PI) + 20.0 * Math.sin(2.0 * x * GCJ_PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * GCJ_PI) + 40.0 * Math.sin((y / 3.0) * GCJ_PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * GCJ_PI) + 320 * Math.sin((y * GCJ_PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

/** 经度偏移量辅助（火星算法） */
function gcjTransformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * GCJ_PI) + 20.0 * Math.sin(2.0 * x * GCJ_PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * GCJ_PI) + 40.0 * Math.sin((x / 3.0) * GCJ_PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * GCJ_PI) + 300.0 * Math.sin((x / 30.0) * GCJ_PI)) * 2.0) / 3.0;
  return ret;
}

/**
 * WGS84 → GCJ-02（火星坐标）转换。
 * @param {number} lng 经度（WGS84）
 * @param {number} lat 纬度（WGS84）
 * @returns {[number, number]} [gcjLng, gcjLat]；境外 / 非法输入返回原值（或 [NaN, NaN]）
 */
export function wgs84ToGcj02(lng, lat) {
  const lngN = Number(lng);
  const latN = Number(lat);
  if (!Number.isFinite(lngN) || !Number.isFinite(latN)) return [NaN, NaN];
  if (gcjOutOfChina(lngN, latN)) return [lngN, latN];

  let dLat = gcjTransformLat(lngN - 105.0, latN - 35.0);
  let dLng = gcjTransformLng(lngN - 105.0, latN - 35.0);
  const radLat = (latN / 180.0) * GCJ_PI;
  let magic = Math.sin(radLat);
  magic = 1 - GCJ_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic)) * GCJ_PI);
  dLng = (dLng * 180.0) / ((GCJ_A / sqrtMagic) * Math.cos(radLat) * GCJ_PI);
  const mgLat = latN + dLat;
  const mgLng = lngN + dLng;
  return [mgLng, mgLat];
}
