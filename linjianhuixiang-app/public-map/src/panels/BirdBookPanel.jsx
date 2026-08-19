/**
 * BirdBookPanel.jsx —— 鸟种图鉴面板（内置城市常见鸟类百科）
 * 顶部搜索过滤 + 卡片网格；点击卡片展开详情。
 */
import { useMemo, useState } from 'react';
import { BIRD_BOOK, searchBirds } from '../data/birdBook.js';

function BirdCard({ bird }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`ljx-bird-card${open ? ' open' : ''}`} onClick={() => setOpen((v) => !v)}>
      <div className="ljx-bird-head">
        <span className="ljx-bird-ico" style={{ background: bird.icon }}>{bird.name.slice(0, 1)}</span>
        <div className="ljx-bird-title">
          <b>{bird.name}</b>
          <span>{bird.alias}</span>
        </div>
        <span className={`ljx-bird-protect ${bird.protect.includes('二级') ? 'lv2' : ''}`}>{bird.protect}</span>
      </div>
      {open && (
        <div className="ljx-bird-detail">
          <p><b>特征</b>：{bird.feature}</p>
          <p><b>习性</b>：{bird.habit}</p>
          <p><b>栖息分布</b>：{bird.habitat}</p>
        </div>
      )}
    </div>
  );
}

export default function BirdBookPanel({ onClose }) {
  const [kw, setKw] = useState('');
  const list = useMemo(() => searchBirds(kw), [kw]);
  return (
    <div className="ljx-panel ljx-panel-birds">
      <div className="ljx-panel-head">
        <h2>鸟种图鉴</h2>
        <span className="ljx-panel-count">{list.length} / {BIRD_BOOK.length} 种</span>
        <button type="button" className="ljx-panel-close" onClick={onClose} title="关闭">×</button>
      </div>
      <input
        type="text"
        className="ljx-input ljx-input-search"
        placeholder="搜索鸟名，如 麻雀 / 柳莺 / 翠鸟"
        value={kw}
        onChange={(e) => setKw(e.target.value)}
      />
      <div className="ljx-bird-grid">
        {list.map((b) => <BirdCard key={b.name} bird={b} />)}
        {list.length === 0 && <div className="ljx-panel-empty">没有匹配的鸟类</div>}
      </div>
    </div>
  );
}
