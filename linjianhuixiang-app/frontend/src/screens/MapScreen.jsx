/**
 * MapScreen.jsx
 * 声景地图：
 *  - 有 batchSummary（多录音聚合综合）→ 综合视图：综合宜居度大卡（Ring）+ 物种清单（按出现次数）
 *    + 时间热力图（聚合平均）+ 空间分布（mapPoints 每段一个点），并提供「清除综合，返回首页」；
 *  - 无 batchSummary → 原有单点分析视图：分段切换「时间热力图 / 空间分布」，多绿地样点对比。
 */
import { useEffect, useState } from 'react';
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import Button from '../components/ui/Button';
import Chip from '../components/ui/Chip';
import Ring from '../components/Ring';
import HeatmapChart from '../components/charts/HeatmapChart';
import MapChart from '../components/charts/MapChart';
import { getGreenSpaces, gradeOf, livabilityDesc } from '../data/repository';

export default function MapScreen() {
  const { state, dispatch } = useApp();
  const [seg, setSeg] = useState('heat');
  const [greenIndex, setGreenIndex] = useState(0);
  const [greenSpaces, setGreenSpaces] = useState([]);
  const a = state.analysis;
  const summary = state.batchSummary;

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

  /** 综合视图：多录音聚合摘要 */
  if (summary) {
    const lv = summary.livability || {};
    const g = gradeOf(typeof lv.score === 'number' ? lv.score : 0);
    const desc = livabilityDesc(summary);
    // 段数 = mapPoints 数量（每段一个样点）；空摘要时回退物种数 / 0
    const n =
      Array.isArray(summary.mapPoints) && summary.mapPoints.length > 0
        ? summary.mapPoints.length
        : summary.speciesCount || 0;
    const species = Array.isArray(summary.species) ? summary.species : [];
    const heat = Array.isArray(summary.heatmap) && summary.heatmap.length > 0 ? summary.heatmap : null;
    const points = Array.isArray(summary.mapPoints) ? summary.mapPoints : [];

    const clearBatch = () => {
      dispatch({ type: 'CLEAR_BATCH' });
      dispatch({ type: 'TAB', tab: 'home', screen: 'home' });
    };

    return (
      <div>
        <AppBar title={`本区域 ${n} 段录音综合`} onBack={() => dispatch({ type: 'BACK' })} />

        {/* 综合宜居度大卡 */}
        <div className="liv-hero">
          <Ring value={lv.score || 0} size={128} />
          <div className="info">
            <b>综合鸟类宜居度</b>
            <span className="grade">
              {g.zh} · {g.en}
            </span>
            <p>{desc}</p>
          </div>
        </div>

        {/* 物种清单（按出现次数） */}
        <div className="eyebrow mb-2.5">物种清单 · 按出现次数</div>
        {species.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-[12.5px] font-bold">未识别到鸟种</p>
            <p className="text-[11px] text-ink-soft mt-1">可尝试降低置信度阈值后重新分析</p>
          </div>
        ) : (
          species.map((s) => (
            <div className="sum-sp" key={s.name}>
              <span className="sum-sp-name">
                {s.name}
                <i>{s.latin}</i>
              </span>
              <Chip tone="good" className="!px-2 !py-0.5">
                {s.count} 次
              </Chip>
            </div>
          ))
        )}

        {/* 时间热力图 / 空间分布 分段切换 */}
        <div className="seg" style={{ marginTop: 16 }}>
          <button className={seg === 'heat' ? 'on' : ''} onClick={() => setSeg('heat')}>
            时间热力图
          </button>
          <button className={seg === 'map' ? 'on' : ''} onClick={() => setSeg('map')}>
            空间分布
          </button>
        </div>

        {seg === 'heat' ? (
          <div className="heat-wrap">
            <h4>本区域 {n} 段录音 · 聚合平均</h4>
            <div className="cap">时段 × 频段 · 各段热力逐格平均（{n} 段）</div>
            {heat ? <HeatmapChart data={heat} /> : <div className="cap">暂无热力图数据</div>}
            <div className="legend">
              <span>弱</span>
              <span className="scale" />
              <span>强</span>
              <span className="ml-auto">频段：低 → 高</span>
            </div>
          </div>
        ) : (
          <div className="map-wrap">
            <h4>每段录音一个样点</h4>
            <div className="cap">
              {points.length} 个样点 · 按各段宜居度着色{summary.durationSec ? ` · 总时长 ${summary.durationSec}s` : ''}
            </div>
            {points.length > 0 ? <MapChart points={points} /> : <div className="cap">暂无样点数据</div>}
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

        <div className="mt-4">
          <Button variant="ghost" onClick={clearBatch}>
            清除综合，返回首页
          </Button>
        </div>
      </div>
    );
  }

  // ---- 原单点分析视图 ----
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
