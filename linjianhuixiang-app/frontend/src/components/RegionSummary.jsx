/**
 * RegionSummary.jsx
 * 地区记录完整综合详情（公共展示组件）。
 * 输入 summary —— 一条 region 记录的 detail 快照（聚合 summary，与单 analysis 顶层字段对齐），
 * 渲染「完整综合数据」：宜居度大卡（Ring + 等级）+ 统计行（识别鸟种 / 人为噪声）+
 * 物种清单（按 count 降序或原序）+ 声学指数（四卡片）+ 时间热力图 +
 * 录音波形 + 时长。
 *
 * 说明：旧静态样点图已移除——真实地图统一由
 * 「录音分布」（MapLibre + 高德瓦片）渲染，避免静态图与真实地图并存重复。
 *
 * 空数据守卫：summary 缺失 / 任意字段缺失 / 空数组均优雅降级（占位或跳过区块），绝不崩溃。
 * 被 MapScreen 综合视图（batchSummary）与 RegionScreen 单条详情（record.detail）复用。
 */
import Ring from './Ring';
import Chip from './ui/Chip';
import Bar from './ui/Bar';
import HeatmapChart from './charts/HeatmapChart';
import WaveformChart from './charts/WaveformChart';
import { gradeOf, livabilityDesc } from '../data/repository';

/** 物种清单：优先按 count 降序，无 count（旧数据/单分析快照）时保持原序 */
function sortedSpecies(list) {
  if (!Array.isArray(list)) return [];
  return list.slice().sort((a, b) => (Number(b && b.count) || 0) - (Number(a && a.count) || 0));
}

export default function RegionSummary({ summary }) {
  // 空数据守卫：summary 缺失 / 非对象 → 占位提示
  if (!summary || typeof summary !== 'object') {
    return (
      <div className="py-6 text-center">
        <p className="text-[12.5px] font-bold">暂无综合数据</p>
        <p className="text-[11px] text-ink-soft mt-1">该条记录缺少完整快照</p>
      </div>
    );
  }

  const hasLv = summary.livability && typeof summary.livability === 'object';
  const lv = hasLv ? summary.livability : {};
  const score = typeof lv.score === 'number' ? lv.score : null;
  const noise = typeof lv.noise === 'number' ? lv.noise : null;
  const g = gradeOf(score == null ? 0 : score);
  const desc =
    score != null && noise != null
      ? livabilityDesc({ livability: { score, noise } })
      : '';

  const species = sortedSpecies(summary.species);
  const indices = Array.isArray(summary.indices) ? summary.indices : [];
  const heat =
    Array.isArray(summary.heatmap) && summary.heatmap.length > 0 ? summary.heatmap : null;
  const waveform = Array.isArray(summary.waveform) ? summary.waveform : [];
  const speciesCount =
    typeof summary.speciesCount === 'number'
      ? summary.speciesCount
      : species.length > 0
        ? species.length
        : '—';

  return (
    <div>
      {/* 宜居度大卡 */}
      <div className="liv-hero">
        <Ring value={score || 0} size={128} />
        <div className="info">
          <b>综合鸟类宜居度</b>
          <span className="grade">
            {g.zh} · {g.en}
          </span>
          {desc ? <p>{desc}</p> : null}
        </div>
      </div>

      {/* 统计行：识别鸟种 / 人为噪声 */}
      <div className="stat-row">
        <div className="stat">
          <div className="v">{speciesCount}</div>
          <div className="l">识别鸟种</div>
        </div>
        <div className="stat">
          <div className="v">{noise != null ? `${noise}%` : '—'}</div>
          <div className="l">人为噪声占比</div>
        </div>
      </div>

      {/* 物种清单（按出现次数降序） */}
      <div className="eyebrow mb-2.5">物种清单 · 按出现次数</div>
      {species.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-[12.5px] font-bold">未识别到物种</p>
          <p className="text-[11px] text-ink-soft mt-1">该次录音未识别到可确认的鸟种</p>
        </div>
      ) : (
        species.map((s) => (
          <div className="sum-sp" key={s.name}>
            <span className="sum-sp-name">
              {s.name}
              <i>{s.latin}</i>
            </span>
            <Chip tone="good" className="!px-2 !py-0.5">
              {s.count != null ? `${s.count} 次` : '—'}
            </Chip>
          </div>
        ))
      )}

      {/* 声学指数（indices 存在时渲染四卡片） */}
      {indices.length > 0 && (
        <>
          <div className="eyebrow mb-2.5 mt-5">声学指数</div>
          {indices.map((idx) => (
            <div key={idx.key} className="card idx-card plain">
              <div className="top">
                <span className="nm">{idx.key}</span>
                <span className="val">{idx.display != null ? idx.display : '—'}</span>
              </div>
              <div className="desc">
                {idx.name} — {idx.desc}
              </div>
              <Bar value={idx.pct} color="linear-gradient(90deg,var(--sun-soft),var(--sun))" />
            </div>
          ))}
        </>
      )}

      {/* 时间热力图（旧静态样点图已移除，真实地图见「录音分布」） */}
      <div className="heat-wrap" style={{ marginTop: 16 }}>
        <h4>时段 × 频段</h4>
        <div className="cap">{heat ? '鸟声活跃度 · 聚合平均' : '该条记录暂无热力图数据'}</div>
        {heat ? <HeatmapChart data={heat} /> : <div className="cap">暂无热力图数据</div>}
        <div className="legend">
          <span>弱</span>
          <span className="scale" />
          <span>强</span>
          <span className="ml-auto">频段：低 → 高</span>
        </div>
      </div>

      {/* 录音波形 + 时长 */}
      {waveform.length > 0 && (
        <div className="wave-wrap">
          <div className="wave-head">
            <h4>录音波形</h4>
            {summary.durationSec ? <span className="wave-dur">{summary.durationSec}s</span> : null}
          </div>
          <WaveformChart data={waveform} />
        </div>
      )}
    </div>
  );
}
