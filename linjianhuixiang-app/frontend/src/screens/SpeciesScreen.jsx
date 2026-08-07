/**
 * SpeciesScreen.jsx
 * 物种清单：阈值 chip + 时段筛选 + 物种表格（置信度 / 频次 / 时段）
 * 受全局置信度阈值影响：低于阈值的物种从清单中隐藏
 */
import { useState } from 'react';
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import Bar from '../components/ui/Bar';
import { IconBird, IconInfo } from '../components/icons';

const PERIODS = ['全部', '清晨', '上午', '黄昏', '全天'];

export default function SpeciesScreen() {
  const { state, dispatch } = useApp();
  const [period, setPeriod] = useState('全部');
  const { species } = state.analysis;
  const threshold = state.threshold;

  const shown = species.filter((s) => s.conf >= threshold);
  const list = period === '全部' ? shown : shown.filter((s) => s.period === period);
  const countOf = (p) => (p === '全部' ? shown.length : shown.filter((s) => s.period === p).length);

  return (
    <div>
      <AppBar
        title="物种清单"
        onBack={() => dispatch({ type: 'BACK' })}
        right={<span className="chip">阈值 {threshold.toFixed(2)}</span>}
      />

      {/* 时段筛选 */}
      <div className="filterbar">
        {PERIODS.map((p) => (
          <button key={p} className={`fchip ${period === p ? 'on' : ''}`} onClick={() => setPeriod(p)}>
            {p} {countOf(p)}
          </button>
        ))}
      </div>

      <div className="tbl-head">
        <span>物种</span>
        <span>置信度</span>
        <span>频次</span>
        <span>时段</span>
      </div>

      {list.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-[13px] font-bold">无符合阈值的物种</p>
          <p className="text-[11.5px] text-ink-soft mt-1">请到「我的 → 设置」降低置信度阈值</p>
        </div>
      ) : (
        list.map((s) => (
          <div className="sp-row" key={s.id}>
            <div className="name">
              <div className="avatar">
                <IconBird size={18} />
              </div>
              <div>
                <b>{s.name}</b>
                <span>{s.latin}</span>
              </div>
            </div>
            <div className="conf">
              <span className="c">{s.conf.toFixed(2)}</span>
              <Bar value={s.conf * 100} />
            </div>
            <span className="freq">{s.freq}</span>
            <span className="time">{s.period}</span>
          </div>
        ))
      )}

      <div className="note-line">
        <IconInfo size={14} />
        已按 {threshold.toFixed(2)} 阈值去重，显示 {list.length} / {shown.length} 种，相对多样性评估，非绝对计数
      </div>
    </div>
  );
}
