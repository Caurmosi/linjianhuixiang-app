/**
 * MapPicker.jsx
 * 交互选地图 + 地名搜索 + GPS/手动标点 + 简化固定（综合页 / 地图页选区域）。
 *
 * 流程（先简化固定 → 再标点，核心交互顺序）：
 *  1) 编辑态（未固定）：可拖动/缩放的 <MapCanvas> + 搜索框（调后端 /api/geocode → 结果列表 →
 *     点击 flyTo）+ 模式切换 + 「简化固定」按钮（disabled={!mapReady}，不再要求已定位段数）；
 *     用户先把地图定位/缩放到目标区域；
 *  2) 点击「简化固定」→ 快照当前 center/zoom/bounds → 进入固定态（锁定视图 + 森林主题美化）；
 *  3) 固定态：GPS 段自动上图（circle 渐变）；保留 GPS/手动模式切换 + 底部「导入录音」横向列表；
 *     手动模式：点某段 → 在锁定地图上生成可拖动浮标（maplibregl.Marker draggable，DOM 事件
 *     不受地图 dragPan.disable 影响）→ 拖到位置 → 「确认固定此点」→ 该段坐标写入（from:'manual'）；
 *  4) 「完成并保存」→ onFixed({ center, zoom, bounds, points: 已定位段 }) 一次性回调父级；
 *     「重新调整」→ 清空浮标回编辑态重新定位区域。
 *
 * 搜索框为非受控 input（useRef + defaultValue + onInput + onFocus select），
 * 规避 Android IME 合成事件与 React 受控 value 冲突导致打不出字（与设置页后端地址输入同一方案）。
 */
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useApp } from '../../store/appStore.jsx';

const { Marker } = maplibregl;
import MapCanvas from './MapCanvas';
import Button from '../ui/Button';
import { getGeocode } from '../../data/repository';
import { DEFAULT_CENTER, normalizeMapData, gcj02ToWgs84, wgs84ToGcj02 } from './mapUtils';

/** 标点 name（第N段）→ 段序号下标（aggregate 生成的标点统一用「第N段」命名） */
function segmentIndexOf(point) {
  const m = /^第(\d+)段$/.exec(point && point.name ? String(point.name) : '');
  return m ? Number(m[1]) - 1 : -1;
}

/**
 * 判断地图是否矢量底图（OpenFreeMap liberty，坐标系 = WGS84）：
 *  style.sources 含 openmaptiles / ne2_shaded → true；否则 false（高德 raster = GCJ-02）。
 *  供浮标起点（selectSegment 反算）与确认写入（confirmPoint 转回）共用同一判定。
 */
function isVectorMap(map) {
  try {
    const st = typeof map.getStyle === 'function' ? map.getStyle() : null;
    return !!(st && st.sources && (st.sources.openmaptiles || st.sources.ne2_shaded));
  } catch (e) {
    return false;
  }
}

/**
 * @param {Array<number>} [props.initialCenter] [lng, lat]
 * @param {number} [props.initialZoom]
 * @param {Array<{lng,lat,name?,score?,from?}>} [props.points] 已有定位段（GPS + 已手动）
 * @param {Array<{name,score,from,hasGps}>} [props.segments] 各段录音信息（全部段，含无定位）
 * @param {(data:{center,zoom,bounds,points}) => void} [props.onFixed]
 */
export default function MapPicker({ initialCenter, initialZoom, points: initialPoints = [], segments = [], onFixed }) {
  const { dispatch } = useApp();
  const mapRef = useRef(null); // 当前活动地图实例（编辑态/固定态 MapCanvas onMapReady 交回）
  const markersRef = useRef([]); // 手动模式可拖动浮标
  const pendingSegRef = useRef(null); // 地图未就绪（简化固定异步加载中）时用户想选的段，就绪后自动补浮标
  const pendingLocRef = useRef(null); // 浮标 dragend 后的临时坐标
  const [fixed, setFixed] = useState(false); // true=已简化固定（锁定视图 + 标点）
  const [mapData, setMapData] = useState(null); // 简化固定后的快照（center/zoom/bounds）
  const [mapReady, setMapReady] = useState(false);

  // 模式：'gps'（默认）| 'manual'；手动模式当前选中段下标
  const [mode, setMode] = useState('gps');
  const [activeSeg, setActiveSeg] = useState(null);

  // 段状态：每段 { name, score, hasGps, from, point }，point 为已定位坐标（GPS/手动）
  const [segmentState, setSegmentState] = useState(() => {
    const segs = (Array.isArray(segments) ? segments : []).map((s, i) => ({
      name: s && typeof s.name === 'string' && s.name ? s.name : `第${i + 1}段`,
      score: s && Number.isFinite(Number(s.score)) ? Number(s.score) : 50,
      from: s && s.from === 'gps' ? 'gps' : 'manual',
      hasGps: !!(s && s.hasGps),
      point: null,
    }));
    // 将已有定位（aggregate 并入的 GPS 点）对齐到对应段
    (Array.isArray(initialPoints) ? initialPoints : []).forEach((p) => {
      if (!p || !Number.isFinite(Number(p.lng)) || !Number.isFinite(Number(p.lat))) return;
      const idx = segmentIndexOf(p);
      if (idx >= 0 && idx < segs.length) segs[idx].point = { ...p };
    });
    return segs;
  });

  // 已定位段（GPS + 手动）→ 地图标点 & 保存数据源
  const locatedPoints = segmentState.filter((s) => s.point).map((s) => s.point);
  const locatedCount = locatedPoints.length;
  const gpsCount = segmentState.filter((s) => s.point && s.point.from === 'gps').length;

  // 搜索：非受控 input，query 仅用于按钮禁用态与实时刷新（IME 不受控无冲突）
  const searchRef = useRef(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);

  const toast = (message) => dispatch({ type: 'TOAST', message });

  /** 清理可拖动浮标 */
  const clearMarkers = () => {
    markersRef.current.forEach((m) => {
      try {
        m.remove();
      } catch (e) {
        /* 清理失败可忽略 */
      }
    });
    markersRef.current = [];
    pendingLocRef.current = null;
  };

  // 卸载清理浮标（map.remove 会一并销毁，这里兜底）
  useEffect(() => () => clearMarkers(), []);

  /** 地名搜索：非受控，读取 ref 当前值 */
  const doSearch = async () => {
    const input = searchRef.current;
    const q = input ? input.value.trim() : '';
    if (!q) return;
    setSearching(true);
    try {
      const res = await Promise.resolve(getGeocode(q));
      const list = res && Array.isArray(res.results) ? res.results : [];
      setResults(list);
      if (list.length === 0) toast('未找到相关地点，请尝试其他关键词');
    } catch (err) {
      setResults([]);
      toast('搜索不可用，请手动拖动定位');
    } finally {
      setSearching(false);
    }
  };

  /** 点击搜索结果 → flyTo 定位（编辑态可交互地图） */
  const flyTo = (r) => {
    const map = mapRef.current;
    if (!map) {
      toast('地图加载中，请稍候');
      return;
    }
    try {
      map.flyTo({ center: [r.lng, r.lat], zoom: 15 });
    } catch (err) {
      toast('地图定位暂不可用，请稍候重试');
    }
  };

  /** 手动模式：选中某段 → 在（固定态锁定）地图上生成可拖动浮标 */
  const selectSegment = (idx) => {
    const map = mapRef.current;
    if (!map) {
      // 地图异步加载中（简化固定态 fetch 矢量 style 期间 map 尚未构造）：
      // 不直接放弃，记录待选段；地图就绪后由 handleMapReady 自动补浮标。
      pendingSegRef.current = idx;
      setActiveSeg(idx);
      toast('地图加载中，完成后自动标记该段');
      return;
    }
    clearMarkers();
    setActiveSeg(idx);
    const seg = segmentState[idx];
    // 浮标起点按地图实际坐标系取：简化固定态矢量底图（OpenFreeMap liberty，source 含
    // openmaptiles / ne2_shaded）= WGS84，而段内 seg.point 是 GCJ-02（GPS/高德搜索已转）→
    // 反算 WGS84 再 setLngLat，避免偏移百米；降级高德 raster（无矢量 source）即 GCJ-02，直接用。
    const isVector = isVectorMap(map);
    const start =
      seg && seg.point && Number.isFinite(Number(seg.point.lng)) && Number.isFinite(Number(seg.point.lat))
        ? isVector
          ? gcj02ToWgs84(Number(seg.point.lng), Number(seg.point.lat))
          : [seg.point.lng, seg.point.lat]
        : map.getCenter();
    try {
      const marker = new Marker({ draggable: true, color: '#1f5a3f' }).setLngLat(start).addTo(map);
      marker.on('dragend', () => {
        try {
          const ll = marker.getLngLat();
          pendingLocRef.current = { lng: ll.lng, lat: ll.lat };
        } catch (e) {
          /* 浮标位置读取异常可忽略 */
        }
      });
      markersRef.current.push(marker);
      map.flyTo({ center: start, zoom: 15 });
    } catch (err) {
      toast('地图交互暂不可用，请稍候重试');
    }
  };

  /** 地图就绪回调（编辑态/固定态 MapCanvas onMapReady 共用）：
   *  - 交回 map 实例并置 mapReady；
   *  - 若用户在地图就绪前（简化固定矢量 style 异步加载期间）已点选某段 → 自动补浮标。 */
  const handleMapReady = (map) => {
    try {
      mapRef.current = map;
      setMapReady(true);
      if (pendingSegRef.current != null) {
        const idx = pendingSegRef.current;
        pendingSegRef.current = null;
        // setTimeout 0：确保 mapRef.current 已在当前同步块置位后才补浮标（selectSegment 读取 mapRef）
        setTimeout(() => selectSegment(idx), 0);
      }
    } catch (e) {
      /* 地图就绪回调异常可忽略 */
    }
  };

  /** 确认固定：取浮标当前位置（dragend 记录优先）→ 写入该段坐标（from:'manual'） */
  const confirmPoint = () => {
    const map = mapRef.current;
    const marker = markersRef.current[0];
    if (activeSeg == null || !map) return;
    if (!marker) {
      toast('请先点击某段录音，生成浮标');
      return;
    }
    let loc;
    try {
      loc = pendingLocRef.current || (() => {
        const ll = marker.getLngLat();
        return { lng: ll.lng, lat: ll.lat };
      })();
    } catch (err) {
      toast('无法读取浮标位置，请重新生成');
      return;
    }
    // 坐标按地图坐标系归一化：浮标读到的是地图当前坐标系坐标——简化固定态矢量底图
    // （OpenFreeMap liberty）= WGS84，而段内 point 契约是 GCJ-02（与 GPS/高德搜索一致）→
    // 转回 GCJ-02 再存储，MapCanvas 简化态渲染时 gcj02ToWgs84 转回用户拖的位置，无偏移；
    // 若直接存 WGS84，会被 MapCanvas 当作 GCJ-02 再转一次（双重转换）→ 偏移约百米。
    // 降级高德 raster（非矢量）即 GCJ-02，原样存储。
    const vec = isVectorMap(map);
    let lng = Number(loc.lng);
    let lat = Number(loc.lat);
    if (vec) {
      const [gLng, gLat] = wgs84ToGcj02(lng, lat);
      lng = gLng;
      lat = gLat;
    }
    setSegmentState((prev) =>
      prev.map((s, i) => {
        if (i !== activeSeg) return s;
        return {
          ...s,
          point: { lng, lat, name: `第${activeSeg + 1}段`, score: s.score, from: 'manual' },
        };
      })
    );
    clearMarkers();
    setActiveSeg(null);
    toast('已固定该段位置');
  };

  /** 切换 GPS / 手动模式：清理浮标、选中态与待选段 */
  const switchMode = (m) => {
    if (m === mode) return;
    clearMarkers();
    setActiveSeg(null);
    pendingSegRef.current = null; // 地图未就绪时记录的待选段作废
    setMode(m);
  };

  /** 简化固定：快照当前地图视图进入固定态（标点环节延后到固定态完成） */
  const fix = () => {
    const map = mapRef.current;
    if (!map) {
      toast('地图加载中，请稍候');
      return;
    }
    try {
      const c = map.getCenter();
      setMapData({
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        bounds: map.getBounds().toArray(),
        points: locatedPoints.slice(),
      });
      // 固定态地图即将替换编辑态地图：清空引用避免误用已卸载实例
      mapRef.current = null;
      setMapReady(false);
      setFixed(true);
      toast('地图已简化固定，可补标未定位段');
    } catch (err) {
      toast('地图状态异常，请稍候重试');
    }
  };

  /** 完成并保存：一次性回传固定视图 + 全部已定位段 */
  const finishAndSave = () => {
    if (!mapData) {
      toast('地图尚未固定，请先简化固定');
      return;
    }
    try {
      if (typeof onFixed === 'function') {
        onFixed({
          center: mapData.center,
          zoom: mapData.zoom,
          bounds: mapData.bounds,
          points: locatedPoints.slice(),
        });
      }
    } catch (err) {
      toast('保存地图失败，请稍候重试');
    }
  };

  /** 重新调整：回编辑态重新定位区域 */
  const reAdjust = () => {
    clearMarkers();
    setActiveSeg(null);
    pendingSegRef.current = null; // 待选段作废（回编辑态重新定位区域）
    mapRef.current = null;
    setMapReady(false);
    setFixed(false);
    setMapData(null);
  };

  return (
    <div className="map-wrap">
      <div className="cap">
        {fixed
          ? '区域已简化固定 · GPS 段自动上图 · 手动模式补标未定位段 →「完成并保存」'
          : '拖动/缩放地图到目标区域 · 可搜索定位 · 确认后「简化固定」再标点'}
      </div>

      {/* 搜索框：非受控（IME 不冲突），聚焦全选便于整体替换；仅编辑态 */}
      {!fixed && (
        <div className="map-picker-search">
          <input
            ref={searchRef}
            defaultValue=""
            autoComplete="off"
            spellCheck={false}
            onFocus={(e) => e.target.select()}
            onInput={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doSearch();
            }}
            placeholder="搜索地名（如 中山公园）"
            className="save-panel-input"
            style={{ marginBottom: 6 }}
          />
          <Button variant="ghost" onClick={doSearch} disabled={searching || !query.trim()}>
            {searching ? '搜索中…' : '搜索'}
          </Button>
        </div>
      )}

      {/* 搜索结果列表：仅编辑态 */}
      {!fixed && results.length > 0 && (
        <div className="map-picker-results">
          {results.map((r, i) => (
            <button key={`${r.name}-${i}`} className="map-picker-result" onClick={() => flyTo(r)}>
              <span>{r.name}</span>
              <i>{Number(r.lng).toFixed(4)}, {Number(r.lat).toFixed(4)}</i>
            </button>
          ))}
        </div>
      )}

      {/* 模式切换：GPS 定位 / 手动选点（编辑态与固定态均保留） */}
      <div className="seg" style={{ marginBottom: 10 }}>
        <button className={mode === 'gps' ? 'on' : ''} onClick={() => switchMode('gps')}>
          GPS 定位
        </button>
        <button className={mode === 'manual' ? 'on' : ''} onClick={() => switchMode('manual')}>
          手动选点
        </button>
      </div>

      {/* GPS 模式提示：哪些段已有 GPS，哪些无定位 */}
      {mode === 'gps' && (
        <div className="cap" style={{ marginBottom: 8 }}>
          {gpsCount} 段 GPS 定位 · {segmentState.length - locatedCount} 段无定位（可切「手动选点」补齐）
        </div>
      )}

      {/* 手动模式：底部「导入录音」列表（横向可滑动）+ 确认固定；编辑态先提示固定 */}
      {mode === 'manual' &&
        (fixed ? (
          <div className="ljx-seg-panel">
            <div className="ljx-seg-panel-head">导入录音 · 点选一段 → 拖动浮标 → 确认固定</div>
            <div className="ljx-seg-list">
              {segmentState.length === 0 ? (
                <div className="cap" style={{ margin: 0 }}>暂无录音段，请先完成多段分析</div>
              ) : (
                segmentState.map((s, i) => (
                  <button
                    key={i}
                    className={`ljx-seg-chip${activeSeg === i ? ' on' : ''}${s.point ? ' located' : ''}`}
                    onClick={() => selectSegment(i)}
                  >
                    <span className="ljx-seg-dot" />
                    <b>{s.name}</b>
                    <i>{s.point ? '已定位' : s.hasGps ? 'GPS' : '无定位'}</i>
                  </button>
                ))
              )}
            </div>
            {activeSeg != null && (
              <Button variant="sun" onClick={confirmPoint} className="mt-2 w-full">
                确认固定此点
              </Button>
            )}
          </div>
        ) : (
          <div className="cap" style={{ marginBottom: 8 }}>
            先「简化固定」地图，再在固定视图上补标未定位段
          </div>
        ))}

      {/* 地图：编辑态可交互 / 固定态锁定 + 美化（key 重挂载以应用 interactive 与 .ljx-map-fixed） */}
      {fixed && mapData ? (
        <MapCanvas
          key="fixed"
          center={mapData.center}
          zoom={mapData.zoom}
          points={locatedPoints}
          interactive={false}
          simplified
          height={300}
          onMapReady={handleMapReady}
        />
      ) : (
        <MapCanvas
          key="edit"
          center={normalizeMapData({ center: initialCenter, zoom: initialZoom, points: initialPoints })?.center || DEFAULT_CENTER}
          zoom={initialZoom || 12}
          points={locatedPoints}
          interactive
          height={300}
          onMapReady={handleMapReady}
        />
      )}

      {/* 操作区：编辑态「简化固定」/ 固定态「完成并保存 + 重新调整」 */}
      {!fixed ? (
        <Button
          variant="primary"
          onClick={fix}
          disabled={!mapReady}
          className="mt-3 w-full"
        >
          简化固定
        </Button>
      ) : (
        <div className="map-picker-fixed-actions" style={{ gap: 10 }}>
          <Button variant="ghost" onClick={reAdjust} className="mt-3">
            重新调整
          </Button>
          <Button variant="primary" onClick={finishAndSave} className="mt-3">
            完成并保存
          </Button>
        </div>
      )}
    </div>
  );
}
