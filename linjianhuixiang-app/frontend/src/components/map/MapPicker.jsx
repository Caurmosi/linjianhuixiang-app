/**
 * MapPicker.jsx
 * 交互选地图 + 地名搜索 + GPS/手动选点 + 简化固定（综合页 / 地图页选区域）。
 *
 * 流程：
 *  1) 编辑态：可拖动/缩放的 <MapCanvas> + 搜索框（调后端 /api/geocode → 结果列表 → 点击 flyTo）；
 *  2) GPS 模式（默认）：各段已有 GPS 坐标直接上图，无坐标段提示「无定位，切手动」；
 *  3) 手动模式：地图下方「导入录音」横向列表 → 点某段 → 地图生成可拖动浮标（maplibregl.Marker
 *     draggable）→ 拖动到目标位置 → 「确认固定」→ 该段坐标写入（from:'manual'）→ 列表显示「已定位」；
 *  4) 简化固定：至少一段已定位时可固定 → onFixed({ center, zoom, bounds, points: 已定位段 })
 *     → 切到锁定视图展示 + 「重新调整」按钮。
 *
 * 搜索框为非受控 input（useRef + defaultValue + onInput + onFocus select），
 * 规避 Android IME 合成事件与 React 受控 value 冲突导致打不出字（与设置页后端地址输入同一方案）。
 */
import { useEffect, useRef, useState } from 'react';
import { Marker } from 'maplibre-gl';
import { useApp } from '../../store/appStore.jsx';
import MapCanvas from './MapCanvas';
import Button from '../ui/Button';
import { getGeocode } from '../../data/repository';
import { DEFAULT_CENTER, normalizeMapData } from './mapUtils';

/** 标点 name（第N段）→ 段序号下标（aggregate 生成的标点统一用「第N段」命名） */
function segmentIndexOf(point) {
  const m = /^第(\d+)段$/.exec(point && point.name ? String(point.name) : '');
  return m ? Number(m[1]) - 1 : -1;
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
  const mapRef = useRef(null); // MapCanvas onMapReady 交回的地图实例
  const markersRef = useRef([]); // 手动模式可拖动浮标
  const pendingLocRef = useRef(null); // 浮标 dragend 后的临时坐标
  const [fixed, setFixed] = useState(false);
  const [mapData, setMapData] = useState(null); // 简化固定后的快照
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

  // 已定位段（GPS + 手动）→ 地图标点 & 简化固定数据源
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

  /** 点击搜索结果 → flyTo 定位 */
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

  /** 手动模式：选中某段 → 在地图上生成可拖动浮标 */
  const selectSegment = (idx) => {
    const map = mapRef.current;
    if (!map) {
      toast('地图加载中，请稍候');
      return;
    }
    clearMarkers();
    setActiveSeg(idx);
    const seg = segmentState[idx];
    const start =
      seg && seg.point && Number.isFinite(Number(seg.point.lng))
        ? [seg.point.lng, seg.point.lat]
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
    setSegmentState((prev) =>
      prev.map((s, i) => {
        if (i !== activeSeg) return s;
        return {
          ...s,
          point: { lng: Number(loc.lng), lat: Number(loc.lat), name: `第${activeSeg + 1}段`, score: s.score, from: 'manual' },
        };
      })
    );
    clearMarkers();
    setActiveSeg(null);
    toast('已固定该段位置');
  };

  /** 切换 GPS / 手动模式：清理浮标与选中态 */
  const switchMode = (m) => {
    if (m === mode) return;
    clearMarkers();
    setActiveSeg(null);
    setMode(m);
  };

  /** 简化固定：取当前 center/zoom/bounds + 已定位段 points 回调给父级，并切锁定视图 */
  const fix = () => {
    const map = mapRef.current;
    if (!map) {
      toast('地图加载中，请稍候');
      return;
    }
    try {
      const c = map.getCenter();
      const data = {
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        bounds: map.getBounds().toArray(),
        points: locatedPoints.slice(),
      };
      setMapData(data);
      setFixed(true);
      if (typeof onFixed === 'function') onFixed(data);
    } catch (err) {
      toast('地图状态异常，请稍候重试');
    }
  };

  const reAdjust = () => {
    setFixed(false);
    setMapData(null);
  };

  return (
    <div className="map-wrap">
      <div className="cap">搜索地名定位 · GPS/手动选点 · 拖动浮标后「确认固定」</div>

      {/* 搜索框：非受控（IME 不冲突），聚焦全选便于整体替换 */}
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

      {/* 搜索结果列表 */}
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

      {/* 模式切换：GPS 定位 / 手动选点 */}
      {!fixed && (
        <div className="seg" style={{ marginBottom: 10 }}>
          <button className={mode === 'gps' ? 'on' : ''} onClick={() => switchMode('gps')}>
            GPS 定位
          </button>
          <button className={mode === 'manual' ? 'on' : ''} onClick={() => switchMode('manual')}>
            手动选点
          </button>
        </div>
      )}

      {/* GPS 模式提示：哪些段已有 GPS，哪些无定位 */}
      {!fixed && mode === 'gps' && (
        <div className="cap" style={{ marginBottom: 8 }}>
          {gpsCount} 段 GPS 定位 · {segmentState.length - locatedCount} 段无定位（可切「手动选点」补齐）
        </div>
      )}

      {/* 手动模式：底部「导入录音」列表（横向可滑动）+ 确认固定 */}
      {!fixed && mode === 'manual' && (
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
      )}

      {/* 地图：编辑态可交互 / 固定态锁定（key 重挂载以应用 interactive） */}
      {fixed && mapData ? (
        <MapCanvas
          key="fixed"
          center={mapData.center}
          zoom={mapData.zoom}
          points={mapData.points}
          interactive={false}
          height={300}
        />
      ) : (
        <MapCanvas
          key="edit"
          center={normalizeMapData({ center: initialCenter, zoom: initialZoom, points: initialPoints })?.center || DEFAULT_CENTER}
          zoom={initialZoom || 12}
          points={locatedPoints}
          interactive
          height={300}
          onMapReady={(map) => {
            // 加固：onMapReady 回调自身也 try/catch，异常不抛给 MapCanvas/React
            try {
              mapRef.current = map;
              setMapReady(true);
            } catch (e) {
              /* 地图就绪回调异常可忽略 */
            }
          }}
        />
      )}

      {/* 操作区 */}
      {!fixed ? (
        <Button
          variant="primary"
          onClick={fix}
          disabled={!mapReady || locatedCount === 0}
          className="mt-3 w-full"
        >
          {locatedCount > 0 ? `简化固定（${locatedCount} 段已定位）` : '简化固定'}
        </Button>
      ) : (
        <div className="map-picker-fixed-actions">
          <Button variant="ghost" onClick={reAdjust} className="mt-3">
            重新调整
          </Button>
        </div>
      )}
    </div>
  );
}
