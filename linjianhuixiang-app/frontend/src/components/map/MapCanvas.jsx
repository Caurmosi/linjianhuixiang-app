/**
 * MapCanvas.jsx
 * 真实地图组件（MapLibre GL v6 + 高德公开栅格瓦片，无 key）。
 *
 * - 底图：高德瓦片（style=7 不带注记，子域 webrd0{1..4} 随机选一个固定）；
 * - 标点：GeoJSON source + circle 层（数据驱动 interpolate 渐变配色：score≥70 绿 / 50 琥珀 / <50 红）+
 *   circle-stroke 白边 + symbol 层 label（name 或「段N」）；
 * - interactive=false：dragPan/scrollZoom/boxZoom/doubleClickZoom/keyboard/touchZoomRotate 全部禁用（简化固定视图）；
 * - 空 points → 仅底图；WebGL 不可用 → 占位提示「当前设备不支持地图渲染」；
 * - 组件卸载 → map.remove() 防泄漏。
 *
 * 运行时加固（根治地图侧白屏）：
 *  - new MaplibreMap 整体 try/catch：构造失败 → 渲染「地图加载失败（原因）」占位 + 重试按钮，
 *    错误绝不上抛给 React（否则卸载整棵树 → 白屏）；
 *  - 容器尺寸守卫：挂载时布局未就绪（clientHeight/clientWidth 为 0）先不初始化，
 *    requestAnimationFrame 后重试（最多 N 次），防尺寸 0 构造崩溃；
 *  - map.on('error') 监听：style 加载 / 瓦片异常 → 浮层「底图加载失败，请检查网络」，不崩溃。
 *
 * 纯逻辑（配色/GeoJSON/默认值）抽在 ./mapUtils.js，可 Node 环境单测。
 */
import { useEffect, useRef, useState } from 'react';
import { Map as MaplibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { pointsToGeoJSON, circleColorExpression, pickAmapTileUrl, DEFAULT_CENTER } from './mapUtils';

/** 检测 WebGL 可用性（maplibre-gl v6 移除 maplibregl.supported，用 canvas 上下文探测） */
function isWebGLSupported() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch (e) {
    return false;
  }
}

/** 标点 GeoJSON 的 source 名称 */
const POINTS_SOURCE = 'ljx-points';

/** 容器尺寸未就绪时的最大重试次数（rAF 重试） */
const MAX_SIZE_RETRY = 4;

/**
 * @param {object} props
 * @param {Array<number>} [props.center] [lng, lat]
 * @param {number} [props.zoom]
 * @param {Array<{lng,lat,name?,score?,from?}>} [props.points]
 * @param {boolean} [props.interactive] true=可拖动/缩放；false=简化固定视图
 * @param {number} [props.height] 地图高度 px
 * @param {(map: MaplibreMap) => void} [props.onMapReady] map load 后回调（MapPicker 取 center/zoom/bounds）
 * @param {({lng,lat}) => void} [props.onClick] interactive 时点击地图回调（手动加点）
 */
export default function MapCanvas({
  center = DEFAULT_CENTER,
  zoom = 12,
  points = [],
  interactive = true,
  height = 320,
  onMapReady,
  onClick,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const loadedRef = useRef(false); // map 'load' 已触发
  const initAttemptsRef = useRef(0); // 尺寸守卫重试计数
  const [unsupported, setUnsupported] = useState(false);
  const [mapError, setMapError] = useState(null); // new Map 构造失败原因（渲染占位 + 重试）
  const [tileError, setTileError] = useState(false); // style/瓦片加载失败 → 浮层提示
  const [retryTick, setRetryTick] = useState(0); // 重试计数（驱动初始化 effect 重跑）
  // 用 ref 承接最新 props，避免创建 effect 闭包过期
  const propsRef = useRef({ points, onMapReady, onClick });
  propsRef.current = { points, onMapReady, onClick };

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
    // symbol：label（name 或「段N」），allow-overlap 保证固定缩放也能看到
    map.addLayer({
      id: 'ljx-points-label',
      type: 'symbol',
      source: POINTS_SOURCE,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-offset': [0, -1.4],
        'text-anchor': 'bottom',
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#1f2a24',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    });
  };

  /** 手动重试：清空错误态并重跑初始化 effect */
  const handleRetry = () => {
    initAttemptsRef.current = 0;
    setMapError(null);
    setTileError(false);
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
    let map;
    try {
      map = new MaplibreMap({
        container,
        style: {
          version: 8,
          glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
          sources: {
            amap: { type: 'raster', tiles: [tileUrl], tileSize: 256 },
          },
          layers: [{ id: 'amap', type: 'raster', source: 'amap' }],
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
    setTileError(false);

    // 底图错误监听：style 加载失败 / 瓦片异常 → 浮层提示（不影响页面骨架）
    const onError = () => setTileError(true);
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
        syncPoints(map);
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
  }, [retryTick]);

  // points 变化 → 更新标点 source（map 已 load 时）
  useEffect(() => {
    const map = mapRef.current;
    if (map && loadedRef.current) {
      try {
        syncPoints(map);
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
          当前设备不支持地图渲染
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
        className={`ljx-map-canvas${interactive ? ' ljx-map-canvas-interactive' : ''}`}
        style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden', background: '#e8eef3' }}
      />
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
          底图加载失败，请检查网络
        </div>
      )}
    </div>
  );
}
