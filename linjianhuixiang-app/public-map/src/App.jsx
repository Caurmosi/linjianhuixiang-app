/**
 * App.jsx —— 《林间回响》城市鸟类宜居度公共地图（单页）
 *
 * 功能：
 *  - 高德栅格瓦片底图（webrd0{1-4}，无 key，GCJ-02 与聚合点同坐标系，无需转换）；
 *  - 聚合点 circle 层：circle-color 按 score 渐变（0 红 #c25a39 → 50 琥珀 #d49a26 → 70+ 绿 #2e7d52），
 *    circle-radius 按 Math.sqrt(n) 缩放（8~24px），白边；
 *  - 视口 moveend 节流（300ms）带 bbox 重新拉取聚合点；
 *  - 点击 circle → Popup：地区名 / 样本数 / 加权均分（大字）/ 评分区间 / 置信度均值 / 日期范围 /
 *    样本明细（最多 20 条，超出提示）；底部注明坐标已模糊；
 *  - 空态 / 加载失败态 / WebGL 不支持态兜底。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/* ===================== 常量 ===================== */

const API_BASE = (import.meta.env.VITE_API_BASE || 'https://uegbddmczvrm.cloud.sealos.io').replace(/\/+$/, '');

/** 初始中心：杭州附近（GCJ-02），zoom 11 */
const DEFAULT_CENTER = [120.15, 30.26];
const DEFAULT_ZOOM = 11;

/** moveend 请求节流间隔（ms） */
const MOVEEND_THROTTLE_MS = 300;

/** 单次拉取聚合点数量上限（与后端契约一致） */
const LIMIT = 200;

/** 弹窗中样本明细最多展示条数 */
const MAX_SAMPLES = 20;

/** 容器尺寸未就绪时的最大重试次数 */
const MAX_SIZE_RETRY = 4;

/** 高德栅格瓦片：经后端代理（/api/tiles），解决 CORS + 防盗链 404（必须 lang=zh_cn&size=1&scale=1） */
const AMAP_TILE_URLS = [
  `${API_BASE}/api/tiles/{z}/{x}/{y}?sub=1`,
  `${API_BASE}/api/tiles/{z}/{x}/{y}?sub=2`,
  `${API_BASE}/api/tiles/{z}/{x}/{y}?sub=3`,
  `${API_BASE}/api/tiles/{z}/{x}/{y}?sub=4`,
];

const CLUSTER_SOURCE_ID = 'ljx-clusters-source';
const CLUSTER_LAYER_ID = 'ljx-clusters-layer';

/** WebGL 探测（maplibre 3.6.2 兼容 WebGL1/2） */
function isWebGLSupported() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    );
  } catch (e) {
    return false;
  }
}

/** circle-color 数据驱动表达式：score 线性渐变 0 红 → 50 琥珀 → 70+ 绿（与参考配色一致） */
function circleColorExpression() {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'score'], 50],
    0, '#c25a39',
    50, '#d49a26',
    70, '#2e7d52',
    100, '#2e7d52',
  ];
}

/** circle-radius 数据驱动表达式：Math.sqrt(n) 缩放，n=1 → 8px，n=900 → 24px，超出自动钳制 */
function circleRadiusExpression() {
  return [
    'interpolate',
    ['linear'],
    ['sqrt', ['coalesce', ['get', 'n'], 1]],
    1, 8,
    30, 24,
  ];
}

/** 聚合点数组 → GeoJSON FeatureCollection（过滤非法坐标，字段补默认值） */
function buildClusterGeoJSON(clusters) {
  const list = Array.isArray(clusters) ? clusters : [];
  const features = [];
  list.forEach((c) => {
    if (!c || typeof c !== 'object') return;
    const lng = Number(c.lng);
    const lat = Number(c.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        id: c.id != null ? String(c.id) : '',
        regionName: c.regionName || '',
        n: Number.isFinite(Number(c.n)) ? Number(c.n) : 1,
        score: Number.isFinite(Number(c.score)) ? Number(c.score) : 50,
        scoreMin: Number.isFinite(Number(c.scoreMin)) ? Number(c.scoreMin) : null,
        scoreMax: Number.isFinite(Number(c.scoreMax)) ? Number(c.scoreMax) : null,
        confidenceAvg: Number.isFinite(Number(c.confidenceAvg)) ? Number(c.confidenceAvg) : null,
        createdFrom: c.createdFrom || '',
        createdTo: c.createdTo || '',
      },
    });
  });
  return { type: 'FeatureCollection', features };
}

/** HTML 转义（弹窗内 nickname / regionName 为用户输入，防 XSS） */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 日期格式化：ISO / 时间戳 / 纯日期字符串 → YYYY-MM-DD（无法解析时原样截断） */
function formatDate(value) {
  if (value == null || value === '') return '—';
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const t = new Date(s);
  if (!Number.isNaN(t.getTime())) {
    const y = t.getFullYear();
    const mo = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  return s.slice(0, 16);
}

/** 数值格式化：保留 1 位小数；非法值显示 — */
function formatScore(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(1) : '—';
}

/* ===================== 数据请求 ===================== */

/** 拉取 bbox 内聚合点；bbox 为空时后端按全局处理 */
async function fetchClusters(bbox) {
  const params = new URLSearchParams();
  if (bbox) {
    params.set('minLng', String(Number(bbox.minLng).toFixed(6)));
    params.set('maxLng', String(Number(bbox.maxLng).toFixed(6)));
    params.set('minLat', String(Number(bbox.minLat).toFixed(6)));
    params.set('maxLat', String(Number(bbox.maxLat).toFixed(6)));
  }
  params.set('limit', String(LIMIT));
  const url = `${API_BASE}/api/public/clusters?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.clusters)) throw new Error('响应格式错误');
  return {
    clusters: data.clusters,
    total: Number.isFinite(Number(data.total)) ? Number(data.total) : 0,
  };
}

/** 拉取聚合点详情 + 样本列表（id 含 | 和 :，必须 encodeURIComponent） */
async function fetchClusterDetail(id) {
  const url = `${API_BASE}/api/public/clusters/${encodeURIComponent(id)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data;
}

/** 世界范围 bbox（首屏取全局 total 用） */
function worldBbox() {
  return { minLng: -180, maxLng: 180, minLat: -85, maxLat: 85 };
}

/** bbox 外扩 20%（避免视口边缘聚合点被裁掉），并设置最小外扩幅度 */
function expandBbox(bbox) {
  const dLng = Math.max(0.01, (bbox.maxLng - bbox.minLng) * 0.2);
  const dLat = Math.max(0.01, (bbox.maxLat - bbox.minLat) * 0.2);
  return {
    minLng: bbox.minLng - dLng,
    maxLng: bbox.maxLng + dLng,
    minLat: bbox.minLat - dLat,
    maxLat: bbox.maxLat + dLat,
  };
}

/* ===================== 弹窗 HTML ===================== */

/**
 * 构建 Popup 内容。
 * @param {object} p 聚合点 properties
 * @param {Array|null} samples 样本列表；null 表示「加载中」或「加载失败」（由 loading/errorMsg 区分）
 * @param {boolean} loading 是否处于样本加载中
 * @param {string} [errorMsg] 样本加载失败提示
 */
function buildPopupHTML(p, samples, loading, errorMsg) {
  const regionName = p.regionName || '未知地区';
  const n = Number.isFinite(Number(p.n)) ? Number(p.n) : '—';
  const score = formatScore(p.score);
  const scoreMin = formatScore(p.scoreMin);
  const scoreMax = formatScore(p.scoreMax);
  const confidenceAvg = formatScore(p.confidenceAvg);
  const from = formatDate(p.createdFrom);
  const to = formatDate(p.createdTo);

  let samplesHtml = '';
  if (loading) {
    samplesHtml = '<div class="ljx-popup-hint">样本加载中…</div>';
  } else if (errorMsg) {
    samplesHtml = `<div class="ljx-popup-hint ljx-popup-error">${escapeHtml(errorMsg)}</div>`;
  } else if (!samples || samples.length === 0) {
    samplesHtml = '<div class="ljx-popup-hint">暂无样本明细</div>';
  } else {
    const rows = samples
      .slice(0, MAX_SAMPLES)
      .map((s) => {
        const isAnon = s && s.isAnonymous === true;
        const name = isAnon ? '匿名用户' : s && s.nickname ? s.nickname : '匿名用户';
        return `<div class="ljx-popup-sample">
          <span class="ljx-popup-sample-name">${escapeHtml(name)}</span>
          <span class="ljx-popup-sample-date">${formatDate(s.date)}</span>
          <span class="ljx-popup-sample-score">${formatScore(s.score)}</span>
        </div>`;
      })
      .join('');
    const more =
      samples.length > MAX_SAMPLES
        ? `<div class="ljx-popup-more">… 仅显示前 ${MAX_SAMPLES} 条，共 ${samples.length} 条样本</div>`
        : '';
    samplesHtml = `<div class="ljx-popup-samples-title">样本明细（${samples.length}）</div>${rows}${more}`;
  }

  return `<div class="ljx-popup">
    <div class="ljx-popup-title">${escapeHtml(regionName)}</div>
    <div class="ljx-popup-score-row">
      <div class="ljx-popup-score">${score}</div>
      <div class="ljx-popup-score-label">宜居度加权均分</div>
    </div>
    <div class="ljx-popup-meta">
      <div class="ljx-popup-meta-item"><span>样本数</span><b>${n}</b></div>
      <div class="ljx-popup-meta-item"><span>评分区间</span><b>${scoreMin} ~ ${scoreMax}</b></div>
      <div class="ljx-popup-meta-item"><span>置信度均值</span><b>${confidenceAvg}</b></div>
      <div class="ljx-popup-meta-item"><span>日期范围</span><b>${from} ~ ${to}</b></div>
    </div>
    ${samplesHtml}
    <div class="ljx-popup-note">坐标为近似位置（已模糊数百米）</div>
  </div>`;
}

/* ===================== 组件 ===================== */

export default function App() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  // 数据状态
  const [clusters, setClusters] = useState([]);
  const [total, setTotal] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState(null); // 首屏加载失败
  const [banner, setBanner] = useState(null); // 后续刷新失败的轻提示
  const [tileError, setTileError] = useState(null); // 底图瓦片异常轻提示

  // 地图状态
  const [unsupported, setUnsupported] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [retryTick, setRetryTick] = useState(0);

  // refs（异步回调/事件闭包内使用最新值）
  const clustersRef = useRef([]);
  const hasLoadedRef = useRef(false);
  const mapLoadedRef = useRef(false);
  const activePopupRef = useRef(null);
  const sizeRetryRef = useRef(0);
  const moveTimerRef = useRef(null);
  const bannerTimerRef = useRef(null);
  const tileTimerRef = useRef(null);
  const lastMoveFetchRef = useRef(0);
  const requestSeqRef = useRef(0);

  /* ---------- 数据拉取 ---------- */

  const loadClusters = useCallback(async (bbox, { updateTotal = false } = {}) => {
    const seq = ++requestSeqRef.current;
    try {
      const { clusters: list, total: t } = await fetchClusters(bbox);
      if (seq !== requestSeqRef.current) return; // 过期响应丢弃
      clustersRef.current = list;
      setClusters(list);
      hasLoadedRef.current = true;
      setHasLoaded(true);
      setError(null);
      setBanner(null);
      if (updateTotal) setTotal(t);
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      if (!hasLoadedRef.current) {
        setError('加载失败，请稍后重试');
      } else {
        setBanner('刷新失败，请稍后重试');
        clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = setTimeout(() => setBanner(null), 4000);
      }
    }
  }, []);

  /** 视口 moveend：300ms 节流后带 bbox 重新拉取 */
  const scheduleViewportFetch = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const now = Date.now();
    const elapsed = now - lastMoveFetchRef.current;
    const run = () => {
      lastMoveFetchRef.current = Date.now();
      const b = map.getBounds();
      loadClusters(
        expandBbox({
          minLng: b.getWest(),
          maxLng: b.getEast(),
          minLat: b.getSouth(),
          maxLat: b.getNorth(),
        })
      );
    };
    if (elapsed >= MOVEEND_THROTTLE_MS) {
      run();
    } else {
      clearTimeout(moveTimerRef.current);
      moveTimerRef.current = setTimeout(run, MOVEEND_THROTTLE_MS - elapsed);
    }
  }, [loadClusters]);

  /** 点击聚合点 → 弹窗（先展示概览，再异步拉样本） */
  const showClusterPopup = useCallback(async (map, feature) => {
    const p = feature.properties || {};
    const coords = feature.geometry.coordinates;
    if (activePopupRef.current) {
      try {
        activePopupRef.current.remove();
      } catch (e) {
        /* 忽略 */
      }
      activePopupRef.current = null;
    }
    const popup = new maplibregl.Popup({
      offset: 20,
      maxWidth: '340px',
      closeButton: true,
      closeOnClick: false,
      className: 'ljx-popup-wrap',
    })
      .setLngLat(coords)
      .setHTML(buildPopupHTML(p, null, true))
      .addTo(map);
    activePopupRef.current = popup;

    const clusterId = p.id;
    if (!clusterId) return;
    try {
      const data = await fetchClusterDetail(clusterId);
      const samples = data && Array.isArray(data.samples) ? data.samples : [];
      if (!popup.isOpen()) return;
      popup.setHTML(buildPopupHTML(p, samples, false));
    } catch (err) {
      if (!popup.isOpen()) return;
      popup.setHTML(buildPopupHTML(p, null, false, '样本加载失败，请稍后重试'));
    }
  }, []);

  /* ---------- 地图生命周期 ---------- */

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    if (!isWebGLSupported()) {
      setUnsupported(true);
      return undefined;
    }

    // 容器尺寸守卫：布局未就绪时 rAF 重试（防 0 尺寸构造崩溃）
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      sizeRetryRef.current += 1;
      if (sizeRetryRef.current > MAX_SIZE_RETRY) {
        setMapError('地图容器尺寸未就绪');
        return undefined;
      }
      const raf = window.requestAnimationFrame(() => setRetryTick((t) => t + 1));
      return () => window.cancelAnimationFrame(raf);
    }
    sizeRetryRef.current = 0;

    let map;
    try {
      map = new maplibregl.Map({
        container,
        style: {
          version: 8,
          sources: {
            amap: {
              type: 'raster',
              tiles: AMAP_TILE_URLS,
              tileSize: 256,
              attribution: '© 高德地图',
            },
          },
          layers: [{ id: 'amap-raster', type: 'raster', source: 'amap' }],
        },
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: false,
      });
    } catch (err) {
      setMapError(err && err.message ? String(err.message) : '地图初始化失败');
      return undefined;
    }
    mapRef.current = map;
    setMapError(null);

    const onError = () => {
      setTileError('底图加载异常，请检查网络');
      clearTimeout(tileTimerRef.current);
      tileTimerRef.current = setTimeout(() => setTileError(null), 6000);
    };
    map.on('error', onError);

    const onLoad = () => {
      mapLoadedRef.current = true;
      try {
        if (!map.getSource(CLUSTER_SOURCE_ID)) {
          map.addSource(CLUSTER_SOURCE_ID, {
            type: 'geojson',
            data: buildClusterGeoJSON(clustersRef.current),
          });
        }
        if (!map.getLayer(CLUSTER_LAYER_ID)) {
          map.addLayer({
            id: CLUSTER_LAYER_ID,
            type: 'circle',
            source: CLUSTER_SOURCE_ID,
            paint: {
              'circle-color': circleColorExpression(),
              'circle-radius': circleRadiusExpression(),
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.92,
            },
          });
        }
        // 首屏：拉取全局聚合点（同时取样本总数 total）
        loadClusters(worldBbox(), { updateTotal: true });
      } catch (e) {
        setError('加载失败，请稍后重试');
      }
    };
    map.on('load', onLoad);

    const onMapClick = (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER_ID] });
      if (!features || features.length === 0) return;
      showClusterPopup(map, features[0]);
    };
    map.on('click', onMapClick);

    // 点击空白区域关闭弹窗
    const onMapClickEmpty = (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER_ID] });
      if (!features || features.length === 0) {
        if (activePopupRef.current) {
          try {
            activePopupRef.current.remove();
          } catch (err) {
            /* 忽略 */
          }
          activePopupRef.current = null;
        }
      }
    };
    map.on('click', onMapClickEmpty);

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };
    map.on('mouseenter', CLUSTER_LAYER_ID, onMouseEnter);
    map.on('mouseleave', CLUSTER_LAYER_ID, onMouseLeave);

    const onMoveEnd = () => scheduleViewportFetch();
    map.on('moveend', onMoveEnd);

    return () => {
      mapLoadedRef.current = false;
      clearTimeout(moveTimerRef.current);
      clearTimeout(bannerTimerRef.current);
      clearTimeout(tileTimerRef.current);
      if (activePopupRef.current) {
        try {
          activePopupRef.current.remove();
        } catch (e) {
          /* 忽略 */
        }
        activePopupRef.current = null;
      }
      try {
        map.off('error', onError);
        map.off('load', onLoad);
        map.off('click', onMapClick);
        map.off('click', onMapClickEmpty);
        map.off('mouseenter', CLUSTER_LAYER_ID, onMouseEnter);
        map.off('mouseleave', CLUSTER_LAYER_ID, onMouseLeave);
        map.off('moveend', onMoveEnd);
        map.remove();
      } catch (e) {
        /* 忽略清理错误 */
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryTick]);

  /* clusters 变化 → 更新 GeoJSON source */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    try {
      const source = map.getSource(CLUSTER_SOURCE_ID);
      if (source) source.setData(buildClusterGeoJSON(clusters));
    } catch (e) {
      /* 忽略 */
    }
  }, [clusters]);

  /** 重试：重置错误态并重建地图（load 事件会重新发起首屏请求） */
  const handleRetry = () => {
    requestSeqRef.current += 1; // 使在途请求全部失效
    setError(null);
    setMapError(null);
    setBanner(null);
    setTileError(null);
    setUnsupported(false);
    hasLoadedRef.current = false;
    setHasLoaded(false);
    sizeRetryRef.current = 0;
    setRetryTick((t) => t + 1);
  };

  const initialLoading = !hasLoaded && !error && !mapError && !unsupported;
  const showEmpty = !error && !mapError && !unsupported && hasLoaded && clusters.length === 0;

  /* ---------- 渲染 ---------- */

  return (
    <div className="ljx-page">
      <header className="ljx-header">
        <div className="ljx-header-title">林间回响 · 城市鸟类宜居度公共地图</div>
        <div className="ljx-header-sub">
          <span className="ljx-header-total">样本总数：{total == null ? '—' : total}</span>
          <span className="ljx-header-note">坐标为近似位置，已模糊处理</span>
        </div>
      </header>

      <main className="ljx-map-wrap">
        <div ref={containerRef} className="ljx-map-canvas" />

        {unsupported && (
          <div className="ljx-overlay">
            <div className="ljx-overlay-card">
              <p>当前设备不支持 WebGL 渲染，无法显示地图</p>
            </div>
          </div>
        )}

        {!unsupported && mapError && (
          <div className="ljx-overlay">
            <div className="ljx-overlay-card">
              <p>地图加载失败（{mapError}）</p>
              <button type="button" className="ljx-btn" onClick={handleRetry}>
                重试
              </button>
            </div>
          </div>
        )}

        {initialLoading && (
          <div className="ljx-overlay">
            <div className="ljx-overlay-card">
              <p>加载中…</p>
            </div>
          </div>
        )}

        {showEmpty && (
          <div className="ljx-overlay">
            <div className="ljx-overlay-card">
              <p>还没有公开数据，快去 App 上传第一条吧</p>
            </div>
          </div>
        )}

        {!unsupported && error && (
          <div className="ljx-overlay">
            <div className="ljx-overlay-card">
              <p>{error}</p>
              <button type="button" className="ljx-btn" onClick={handleRetry}>
                重试
              </button>
            </div>
          </div>
        )}

        {banner && !error && <div className="ljx-banner">{banner}</div>}
        {tileError && <div className="ljx-banner ljx-banner-warn">{tileError}</div>}

        {/* 图例：底部左侧 红→黄→绿 */}
        <div className="ljx-legend">
          <span className="ljx-legend-title">宜居度</span>
          <span className="ljx-legend-label">低</span>
          <span className="ljx-legend-bar" />
          <span className="ljx-legend-label">高</span>
        </div>

        <div className="ljx-attribution">© 高德地图</div>
      </main>
    </div>
  );
}
