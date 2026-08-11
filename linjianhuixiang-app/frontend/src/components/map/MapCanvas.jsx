/**
 * MapCanvas.jsx
 * 真实地图组件（MapLibre GL v3.6.2）。
 *
 * - 编辑态底图（默认 simplified=false）：高德公开栅格瓦片（style=7，无 key），
 *   子域 webrd0{1..4} 随机选一个固定；保持原始路网可交互。
 * - 简化固定态（simplified=true，配合 interactive=false）：改用 OpenFreeMap 矢量瓦片
 *   （https://tiles.openfreemap.org/styles/liberty），自定义 style 隐藏所有 POI/label/水名
 *   layer（layout.visibility='none'，见 utils/simplifiedStyle.js），渲染"水蓝、绿地、道路灰白"
 *   的扁平风，彻底去掉店铺/景区名/地名等无关文字注记；
 *   - 加载期间显示「简化地图加载中…」占位；
 *   - fetch 失败 → 降级为高德 raster + 去饱和/提亮/对比 + 森林绿 wash（至少比当前好看），
 *     并 Toast「简化地图加载失败，使用基础底图」。
 * - 标点：GeoJSON source + circle 层（数据驱动 interpolate 渐变配色：score≥70 绿 /
 *   50 琥珀 / <50 红）+ circle-stroke 白边；标点名称改用 maplibregl.Marker（DOM 标签，
 *   不依赖 glyphs / symbol 层，规避 demotiles 字体国内不可达导致 label 层报错）；
 * - interactive=false：dragPan/scrollZoom/boxZoom/doubleClickZoom/keyboard/touchZoomRotate 全部禁用；
 * - 空 points → 仅底图；WebGL 不可用 → 占位提示「当前设备不支持 WebGL 渲染」；
 * - 组件卸载 → map.remove() 防泄漏。
 *
 * 运行时加固（根治地图侧白屏）：
 *  - new MaplibreMap 整体 try/catch：构造失败 → 渲染「地图加载失败（原因）」占位 + 重试按钮，
 *    错误绝不上抛给 React（否则卸载整棵树 → 白屏）；
 *  - 容器尺寸守卫：挂载时布局未就绪（clientHeight/clientWidth 为 0）先不初始化，
 *    requestAnimationFrame 后重试（最多 N 次），防尺寸 0 构造崩溃；
 *  - map.on('error') 监听：style 加载 / 瓦片异常 → 浮层展示「具体错误消息」（err.error?.message
 *    或 err.message 截断），不崩溃。
 *
 * WebGL 兼容（真机 WebView 白屏根因修复）：
 *  - maplibre-gl 固定 v3.6.2（最后一个支持 WebGL1 的稳定版）；v4+ 强制 WebGL2，
 *    老 Android WebView 仅 WebGL1 时 new Map 失败 → 白屏；
 *  - isWebGLSupported 同时探测 webgl2 / webgl / experimental-webgl，避免误判。
 *
 * 纯逻辑（配色/GeoJSON/默认值/style 简化）抽在 ./mapUtils.js 与 ../utils/simplifiedStyle.js，
 * 可 Node 环境单测。
 */
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { pointsToGeoJSON, circleColorExpression, scoreToColor, pickAmapTileUrl, DEFAULT_CENTER } from './mapUtils';
import { fetchSimplifiedStyle, isPoiOrLabelLayer, SIMPLIFIED_STYLE_URL, SIMPLIFIED_STYLE_TIMEOUT } from '../../utils/simplifiedStyle';
import { useApp } from '../../store/appStore.jsx';

const { Map: MaplibreMap, Marker } = maplibregl;

/**
 * 检测 WebGL 可用性。
 * v3.6.2 同时支持 WebGL2 与 WebGL1，因此优先探测 webgl2，再回退 webgl / experimental-webgl。
 * （v4+ 移除 WebGL1，仅检测 webgl 会在只支持 WebGL1 的真机上误判通过 → 白屏。）
 */
export function isWebGLSupported() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch (e) {
    return false;
  }
}

/** 标点 GeoJSON 的 source 名称 */
const POINTS_SOURCE = 'ljx-points';

/** 容器尺寸未就绪时的最大重试次数（rAF 重试） */
const MAX_SIZE_RETRY = 4;

/** 错误消息截断展示（浮层空间有限） */
function truncateMessage(msg, max = 64) {
  if (typeof msg !== 'string' || !msg) return '底图加载失败，请检查网络';
  return msg.length > max ? `${msg.slice(0, max - 3)}...` : msg;
}

/** 提取 map error 事件的具体错误消息 */
function errorTextOf(err) {
  if (!err) return '底图加载失败，请检查网络';
  const src = (err.error && (err.error.message || err.error.error)) || err.message;
  return truncateMessage(src);
}

/**
 * @param {object} props
 * @param {Array<number>} [props.center] [lng, lat]
 * @param {number} [props.zoom]
 * @param {Array<{lng,lat,name?,score?,from?}>} [props.points]
 * @param {boolean} [props.interactive] true=可拖动/缩放；false=锁定视图（禁用全部交互）
 * @param {boolean} [props.simplified] true=简化固定态：OpenFreeMap 矢量瓦片隐藏 POI/label，
 *    加载失败降级高德 raster + 美化；false=高德 raster（编辑态默认）。与 interactive 独立。
 * @param {number} [props.height] 地图高度 px
 * @param {(map: MaplibreMap) => void} [props.onMapReady] map load 后回调（MapPicker 取 center/zoom/bounds）
 * @param {({lng,lat}) => void} [props.onClick] interactive 时点击地图回调（手动加点）
 */
export default function MapCanvas({
  center = DEFAULT_CENTER,
  zoom = 12,
  points = [],
  interactive = true,
  simplified = false,
  height = 320,
  onMapReady,
  onClick,
}) {
  const { dispatch } = useApp();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const labelMarkersRef = useRef([]); // 标点名称 DOM 标签（maplibregl.Marker，不依赖 glyphs）
  const loadedRef = useRef(false); // map 'load' 已触发
  const initAttemptsRef = useRef(0); // 尺寸守卫重试计数
  const [unsupported, setUnsupported] = useState(false);
  const [mapError, setMapError] = useState(null); // new Map 构造失败原因（渲染占位 + 重试）
  const [tileError, setTileError] = useState(null); // style/瓦片加载失败 → 浮层展示具体错误消息
  const [retryTick, setRetryTick] = useState(0); // 重试计数（驱动初始化 effect 重跑）
  // 简化态：OpenFreeMap 矢量 style（异步获取）。null+未失败 = 加载中；失败 → 降级高德 raster。
  const [vectorStyle, setVectorStyle] = useState(null);
  const [vectorStyleFailed, setVectorStyleFailed] = useState(false);
  // 用 ref 承接最新 props，避免创建 effect 闭包过期
  const propsRef = useRef({ points, onMapReady, onClick, simplified });
  propsRef.current = { points, onMapReady, onClick, simplified };

  /** 标点名称标签（DOM Marker）：删除旧的并依据当前 points 重建（锁定/编辑态均需要） */
  const syncLabelMarkers = (map) => {
    try {
      labelMarkersRef.current.forEach((m) => {
        try {
          m.remove();
        } catch (e) {
          /* 单个标签清理失败可忽略 */
        }
      });
      labelMarkersRef.current = [];
      const list = Array.isArray(propsRef.current.points) ? propsRef.current.points : [];
      list.forEach((p) => {
        if (!p || typeof p !== 'object') return;
        const lng = Number(p.lng);
        const lat = Number(p.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
        const name = typeof p.name === 'string' && p.name ? p.name : '';
        if (!name) return;
        const color = scoreToColor(p.score);
        const el = document.createElement('div');
        el.className = 'ljx-map-label';
        const dot = document.createElement('i');
        dot.style.background = color;
        const txt = document.createElement('b');
        txt.textContent = name;
        el.appendChild(dot);
        el.appendChild(txt);
        const mk = new Marker({ element: el, anchor: 'bottom' })
          .setLngLat([lng, lat])
          .addTo(map);
        labelMarkersRef.current.push(mk);
      });
    } catch (e) {
      /* 标签渲染失败不影响底图与 circle 标点 */
    }
  };

  /** 向地图添加/更新标点图层（load 后调用；重复调用走 setData） */
  const syncPoints = (map) => {
    const geojson = pointsToGeoJSON(propsRef.current.points);
    if (map.getSource(POINTS_SOURCE)) {
      map.getSource(POINTS_SOURCE).setData(geojson);
      return;
    }
    map.addSource(POINTS_SOURCE, { type: 'geojson', data: geojson });
    // circle：数据驱动渐变配色 + 白边
    map.addLayer({
      id: 'ljx-points-circle',
      type: 'circle',
      source: POINTS_SOURCE,
      paint: {
        'circle-color': circleColorExpression(),
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 7, 16, 9],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.9,
      },
    });
  };

  /** 手动重试：清空错误态并重跑初始化 effect */
  const handleRetry = () => {
    initAttemptsRef.current = 0;
    setMapError(null);
    setTileError(null);
    setRetryTick((t) => t + 1);
  };

  // 创建地图（挂载一次；retryTick 变化时重跑——尺寸守卫重试 / 手动重试）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    if (!isWebGLSupported()) {
      setUnsupported(true);
      return undefined;
    }

    // 容器尺寸守卫：布局未就绪（宽/高为 0）时先不初始化，rAF 后重试（防尺寸 0 构造崩溃）
    if (container.clientHeight === 0 || container.clientWidth === 0) {
      initAttemptsRef.current += 1;
      if (initAttemptsRef.current >= MAX_SIZE_RETRY) {
        setMapError('容器尺寸未就绪，无法初始化地图');
        return undefined;
      }
      const raf = window.requestAnimationFrame(() => setRetryTick((t) => t + 1));
      return () => window.cancelAnimationFrame(raf);
    }
    initAttemptsRef.current = 0;

    const tileUrl = pickAmapTileUrl();
    const isSimplified = simplified === true;

    // 简化态：先异步获取 OpenFreeMap 矢量 style（隐藏 POI/label/水名，缓存 24h）。
    // 加载中不构造地图（渲染「简化地图加载中…」占位），避免先闪出高德 POI 底图再切换。
    if (isSimplified && !vectorStyle && !vectorStyleFailed) {
      let cancelled = false;
      fetchSimplifiedStyle(SIMPLIFIED_STYLE_URL, { timeout: SIMPLIFIED_STYLE_TIMEOUT })
        .then((style) => {
          if (!cancelled) {
            setVectorStyle(style);
            setVectorStyleFailed(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setVectorStyleFailed(true);
            try {
              dispatch({ type: 'TOAST', message: '简化地图加载失败，使用基础底图' });
            } catch (e) {
              /* Toast 异常不抛给 React */
            }
          }
        });
      return () => {
        cancelled = true;
      };
    }

    // 简化态成功 → 直接用矢量 style（POI/label/水名已隐藏、水/绿地已调色，见 fetchSimplifiedStyle）。
    // 其余情况（编辑态 / 简化态 fetch 失败降级）→ 高德 raster 底图：
    //  - !interactive：叠加去饱和/提亮/对比 + 森林绿 wash（降级方案，至少比当前好看）；
    //  - 编辑态：保持高德原始清晰路网。
    const amapLayer = {
      id: 'amap',
      type: 'raster',
      source: 'amap',
    };
    if (!interactive) {
      amapLayer.paint = {
        'raster-saturation': -0.85, // 大幅去饱和 → 简笔风
        'raster-contrast': 0.25, // 略增强对比，色块更分明
        'raster-brightness-min': 0.12, // 提亮暗部
        'raster-brightness-max': 0.92, // 提亮整体（水/绿地更清透）
        'raster-hue-rotate': 0,
      };
    }
    // 森林绿半透明 overlay：覆盖全世界的 fill polygon，仅锁定视图叠加（编辑态不加）
    const greenWashSource = {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]],
            },
          },
        ],
      },
    };
    const layers = [amapLayer];
    if (!interactive) {
      layers.push({
        id: 'ljx-green-wash',
        type: 'fill',
        source: 'ljx-green-wash',
        paint: { 'fill-color': '#2e7d52', 'fill-opacity': 0.06 },
      });
    }
    let map;
    try {
      // 矢量 style 在构造时传入（加载期间已用占位过渡，避免 POI 底图闪现）。
      // 标点 source/layer（ljx-points / ljx-points-circle）在 load 事件里按需添加，
      // 与矢量 style 的 layer id 相互独立，syncPoints 对两套 style 均适用。
      map = new MaplibreMap({
        container,
        style:
          isSimplified && vectorStyle
            ? vectorStyle
            : {
                version: 8,
                // 注意：不再声明 glyphs / symbol 层——demotiles 字体国内不可达会致 label 层报错；
                // 标点名称改用 DOM Marker（syncLabelMarkers）。
                sources: {
                  amap: { type: 'raster', tiles: [tileUrl], tileSize: 256 },
                  ...(interactive ? {} : { 'ljx-green-wash': greenWashSource }),
                },
                layers,
              },
        center,
        zoom,
        attributionControl: false,
      });
    } catch (err) {
      // 构造失败（WebGL 上下文异常 / 参数非法等）→ 占位提示 + 重试，绝不抛给 React
      const reason = err && err.message ? String(err.message) : '未知错误';
      setMapError(reason);
      return undefined;
    }
    mapRef.current = map;
    setMapError(null);
    setTileError(null);

    // 底图错误监听：style 加载失败 / 瓦片异常 → 浮层展示具体错误消息（不影响页面骨架）
    const onError = (err) => {
      try {
        setTileError(errorTextOf(err));
      } catch (e) {
        setTileError('底图加载失败，请检查网络');
      }
    };
    map.on('error', onError);

    if (!interactive) {
      // 简化固定视图：禁用全部用户交互
      try {
        map.dragPan.disable();
        map.scrollZoom.disable();
        map.boxZoom.disable();
        map.doubleClickZoom.disable();
        map.keyboard.disable();
        map.touchZoomRotate.disable();
      } catch (e) {
        /* 交互禁用失败可忽略（不影响底图渲染） */
      }
    }

    const onLoad = () => {
      loadedRef.current = true;
      try {
        // 兜底：简化态矢量 style 中凡属 POI/label/水名的 layer 一律隐藏（与 fetchSimplifiedStyle
        // 同一规则，双保险——即便个别 layer 未被预先隐藏，也绝不显示店铺/地名/道路编号等文字注记）。
        // setLayoutProperty 对 fill/line/symbol 等所有 layer 类型均支持 visibility。
        if (isSimplified && typeof map.getStyle === 'function') {
          const st = map.getStyle();
          (st && Array.isArray(st.layers) ? st.layers : []).forEach((l) => {
            if (l && isPoiOrLabelLayer(l.id) && map.getLayer(l.id)) {
              map.setLayoutProperty(l.id, 'visibility', 'none');
            }
          });
        }
        syncPoints(map);
        syncLabelMarkers(map);
      } catch (e) {
        /* 标点失败不影响底图 */
      }
      const cb = propsRef.current.onMapReady;
      if (typeof cb === 'function') {
        try {
          cb(map);
        } catch (e) {
          /* 回调异常不抛给 React */
        }
      }
    };
    map.on('load', onLoad);

    const onClickHandler = (e) => {
      const cb = propsRef.current.onClick;
      if (typeof cb === 'function') {
        try {
          cb({ lng: e.lngLat.lng, lat: e.lngLat.lat });
        } catch (e) {
          /* 点击回调异常不抛给 React */
        }
      }
    };
    if (interactive && onClick) map.on('click', onClickHandler);

    return () => {
      loadedRef.current = false;
      try {
        labelMarkersRef.current.forEach((m) => {
          try {
            m.remove();
          } catch (e) {
            /* 忽略 */
          }
        });
        labelMarkersRef.current = [];
        map.off('error', onError);
        map.off('load', onLoad);
        map.off('click', onClickHandler);
        map.remove();
      } catch (e) {
        /* 清理失败可忽略 */
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryTick, vectorStyle, vectorStyleFailed, simplified]);

  // points 变化 → 更新标点 source 与名称标签（map 已 load 时）
  useEffect(() => {
    const map = mapRef.current;
    if (map && loadedRef.current) {
      try {
        syncPoints(map);
        syncLabelMarkers(map);
      } catch (e) {
        /* 忽略 */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  if (unsupported) {
    return (
      <div
        className="map-wrap map-unsupported"
        style={{ height }}
      >
        <div className="cap" style={{ marginBottom: 0 }}>
          当前设备不支持 WebGL 渲染
        </div>
        <p className="text-[11px] text-ink-soft mt-1">可改用搜索定位 / 手动拖动选择区域</p>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="map-wrap map-unsupported" style={{ height }}>
        <div className="cap" style={{ marginBottom: 0 }}>
          地图加载失败（{mapError}）
        </div>
        <p className="text-[11px] text-ink-soft mt-1">可点击重试，或改用搜索定位 / 手动选择区域</p>
        <button
          className="btn ghost"
          style={{ marginTop: 10, padding: '9px 14px', width: 'auto', fontSize: 13, borderRadius: 11 }}
          onClick={handleRetry}
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        ref={containerRef}
        className={`ljx-map-canvas${interactive ? ' ljx-map-canvas-interactive' : ' ljx-map-fixed'}`}
        style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden', background: '#e8eef3' }}
      />
      {/* 简化态：矢量 style 异步加载中 → 占位提示（期间不构造地图，避免先闪高德 POI 底图） */}
      {simplified === true && !vectorStyle && !vectorStyleFailed && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12.5,
            fontWeight: 600,
            color: '#5c6b52',
            background: '#eef3ea',
            borderRadius: 12,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          简化地图加载中…
        </div>
      )}
      {tileError && (
        <div
          style={{
            position: 'absolute',
            left: 10,
            right: 10,
            top: 10,
            padding: '7px 10px',
            fontSize: 11,
            fontWeight: 600,
            color: '#8a4b12',
            background: 'rgba(251, 242, 221, 0.94)',
            border: '1px solid #ecd9a8',
            borderRadius: 10,
            pointerEvents: 'none',
            zIndex: 3,
            textAlign: 'center',
          }}
        >
          {tileError}
        </div>
      )}
    </div>
  );
}
