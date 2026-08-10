/**
 * MapScreen.jsx
 * 声景地图：分段切换「时间热力图 / 空间分布」；
 * 空间分布支持多绿地切换（中山公园 / 滨江绿地 / 西郊森林公园）
 */
import { useEffect, useState } from 'react';
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import HeatmapChart from '../components/charts/HeatmapChart';
import MapChart from '../components/charts/MapChart';
import Chip from '../components/ui/Chip';
import { getGreenSpaces } from '../data/repository';

export default function MapScreen() {
  const { state, dispatch } = useApp();
  const [seg, setSeg] = useState('heat');
  const [greenIndex, setGreenIndex] = useState(0);
  const [greenSpaces, setGreenSpaces] = useState([]);
  const a = state.analysis;

  // 异步加载多绿地数据（mock 同步返回；api 后端不可达降级空数组，守卫渲染防白屏）
  useEffect(() => {
    let alive = true;
    Promise.resolve(getGreenSpaces())
      .then((g) => {
        if (alive) setGreenSpaces(Array.isArray(g) ? g : []);
      })
      .catch(() => {
        if (alive) setGreenSpaces([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const green = greenSpaces[greenIndex] || greenSpaces[0] || { name: '暂无数据', points: [] };

  return (
    <div>
      <AppBar title="声景地图" onBack={() => dispatch({ type: 'BACK' })} />

      <div className="seg">
        <button className={seg === 'heat' ? 'on' : ''} onClick={() => setSeg('heat')}>
          时间热力图
        </button>
        <button className={seg === 'map' ? 'on' : ''} onClick={() => setSeg('map')}>
          空间分布
        </button>
      </div>

      {seg === 'heat' ? (
        <div className="heat-wrap">
          <h4>本次录音 时段 × 频段</h4>
          <div className="cap">真实时频能量 · {a.recording || '中山公园_晨.wav'}</div>
          <HeatmapChart data={a.heatmap} />
          <div className="legend">
            <span>弱</span>
            <span className="scale" />
            <span>强</span>
            <span className="ml-auto">频段：低 → 高</span>
          </div>
        </div>
      ) : a.segmentPoints && a.segmentPoints.length > 0 ? (
        <div className="map-wrap">
          <h4>本次录音声景分布</h4>
          <div className="cap">录音按时间切片 · {a.segmentPoints.length} 个片段</div>
          <MapChart points={a.segmentPoints} />
          <div className="legend">
            <Chip tone="good" className="!px-2 !py-0.5">
              宜居
            </Chip>
            <Chip tone="mid" className="!px-2 !py-0.5">
              一般
            </Chip>
            <Chip tone="bad" className="!px-2 !py-0.5">
              受压
            </Chip>
          </div>
        </div>
      ) : (
        <div className="map-wrap">
          <h4>样点空间分布</h4>
          {/* 多绿地切换器（segmentPoints 缺失时回退：模拟对比样点） */}
          <div className="seg green-switch" style={{ marginBottom: 10 }}>
            {greenSpaces.map((g, i) => (
              <button key={g.id} className={i === greenIndex ? 'on' : ''} onClick={() => setGreenIndex(i)}>
                {g.name}
              </button>
            ))}
          </div>
          <div className="cap">
            {green.name} · {green.points.length} 个监测样点 · 模拟对比样点
          </div>
          <MapChart points={green.points} />
          <div className="legend">
            <Chip tone="good" className="!px-2 !py-0.5">
              宜居
            </Chip>
            <Chip tone="mid" className="!px-2 !py-0.5">
              一般
            </Chip>
            <Chip tone="bad" className="!px-2 !py-0.5">
              受压
            </Chip>
          </div>
        </div>
      )}
    </div>
  );
}
