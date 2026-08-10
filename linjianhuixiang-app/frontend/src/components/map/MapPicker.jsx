/**
 * MapPicker.jsx
 * 交互选地图 + 地名搜索 + 简化固定（综合页 / 地图页选区域）。
 *
 * 流程：
 *  1) 编辑态：可拖动/缩放的 <MapCanvas> + 搜索框（调后端 /api/geocode → 结果列表 → 点击 flyTo）+
 *     点击地图手动加点（录音点）+ 「简化固定」按钮；
 *  2) 搜索失败 / 无后端 → Toast「搜索不可用，请手动拖动定位」；
 *  3) 简化固定 → onFixed({ center, zoom, bounds, points }) → 切到锁定视图展示 + 「重新调整」按钮。
 */
import { useRef, useState } from 'react';
import { useApp } from '../../store/appStore.jsx';
import MapCanvas from './MapCanvas';
import Button from '../ui/Button';
import { getGeocode } from '../../data/repository';
import { DEFAULT_CENTER, normalizeMapData } from './mapUtils';

export default function MapPicker({ initialCenter, initialZoom, points: initialPoints = [], onFixed }) {
  const { dispatch } = useApp();
  const mapRef = useRef(null);
  // 仅挂载时初始化一次（编辑态↔固定态切换通过 key 重挂载，天然拿到最新 initialPoints）；
  // 不用 useEffect 同步，避免父级每次渲染传新的空数组把用户已加的点清掉。
  const [points, setPoints] = useState(() => initialPoints.slice());
  const [fixed, setFixed] = useState(false);
  const [mapData, setMapData] = useState(null); // 简化固定后的快照
  const [mapReady, setMapReady] = useState(false);

  // 搜索
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);

  const toast = (message) => dispatch({ type: 'TOAST', message });

  /** 地名搜索：调后端 /api/geocode（mock 返回演示结果） */
  const doSearch = async () => {
    const q = query.trim();
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
    if (map) {
      map.flyTo({ center: [r.lng, r.lat], zoom: 15 });
    } else {
      toast('地图尚未就绪，请稍候重试');
    }
  };

  /** 点击地图手动加点（录音点 / 手动选点） */
  const addPoint = ({ lng, lat }) => {
    setPoints((prev) => [
      ...prev,
      { lng, lat, name: `点${prev.length + 1}`, score: 50, from: 'manual' },
    ]);
  };

  /** 简化固定：取当前 center/zoom/bounds + 当前 points 回调给父级，并切锁定视图 */
  const fix = () => {
    const map = mapRef.current;
    if (!map) {
      toast('地图尚未就绪，请稍候重试');
      return;
    }
    const c = map.getCenter();
    const data = {
      center: [c.lng, c.lat],
      zoom: map.getZoom(),
      bounds: map.getBounds().toArray(),
      points: points.slice(),
    };
    setMapData(data);
    setFixed(true);
    if (typeof onFixed === 'function') onFixed(data);
  };

  const reAdjust = () => {
    setFixed(false);
    setMapData(null);
  };

  return (
    <div className="map-wrap">
      <h4>选择区域</h4>
      <div className="cap">搜索地名定位 · 拖动/缩放地图 · 点击地图添加录音点</div>

      {/* 搜索框 */}
      {!fixed && (
        <div className="map-picker-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
          center={normalizeMapData({ center: initialCenter, zoom: initialZoom, points })?.center || DEFAULT_CENTER}
          zoom={initialZoom || 12}
          points={points}
          interactive
          height={300}
          onMapReady={(map) => {
            mapRef.current = map;
            setMapReady(true);
          }}
          onClick={addPoint}
        />
      )}

      {/* 操作区 */}
      {!fixed ? (
        <Button variant="primary" onClick={fix} disabled={!mapReady} className="mt-3 w-full">
          简化固定
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
