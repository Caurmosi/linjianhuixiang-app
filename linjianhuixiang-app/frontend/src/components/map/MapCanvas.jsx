/**
 * MapCanvas.jsx
 * 真实地图组件（MapLibre GL v6 + 高德公开栅格瓦片，无 key）。
 *
 * - 底图：高德瓦片（style=8 带注记，子域 webrd0{1..4} 随机选一个固定）；
 * - 标点：GeoJSON source + circle 层（数据驱动 interpolate 渐变配色：score≥70 绿 / 50 琥珀 / <50 红）+
 *   circle-stroke 白边 + symbol 层 label（name 或「段N」）；
 * - interactive=false：dragPan/scrollZoom/boxZoom/doubleClickZoom/keyboard/touchZoomRotate 全部禁用（简化固定视图）；
 * - 空 points → 仅底图；WebGL 不可用 → 占位提示「当前设备不支持地图渲染」；
 * - 组件卸载 → map.remove() 防泄漏。
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
  const [unsupported, setUnsupported] = useState(false);
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

  // 创建地图（挂载一次；interactive 变化由父级通过 key 重挂载）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    if (!isWebGLSupported()) {
      setUnsupported(true);
      return undefined;
    }
    const tileUrl = pickAmapTileUrl();
    const map = new MaplibreMap({
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
    mapRef.current = map;

    if (!interactive) {
      // 简化固定视图：禁用全部用户交互
      map.dragPan.disable();
      map.scrollZoom.disable();
      map.boxZoom.disable();
      map.doubleClickZoom.disable();
      map.keyboard.disable();
      map.touchZoomRotate.disable();
    }

    const onLoad = () => {
      loadedRef.current = true;
      try {
        syncPoints(map);
      } catch (e) {
        /* 标点失败不影响底图 */
      }
      const cb = propsRef.current.onMapReady;
      if (typeof cb === 'function') cb(map);
    };
    map.on('load', onLoad);

    const onClickHandler = (e) => {
      const cb = propsRef.current.onClick;
      if (typeof cb === 'function') cb({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    };
    if (interactive && onClick) map.on('click', onClickHandler);

    return () => {
      loadedRef.current = false;
      try {
        map.off('load', onLoad);
        map.off('click', onClickHandler);
        map.remove();
      } catch (e) {
        /* 清理失败可忽略 */
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div
      ref={containerRef}
      className={`ljx-map-canvas${interactive ? ' ljx-map-canvas-interactive' : ''}`}
      style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden', background: '#e8eef3' }}
    />
  );
}
