/**
 * BirdBookModal.jsx —— 鸟种图鉴弹层（App 内）
 * 两种打开方式：
 *   1. initialName：从识别结果点鸟名进入，默认展开该鸟详情；
 *   2. 浏览模式：从物种清单顶栏「图鉴」进入，列表 + 搜索。
 * 数据源：src/data/birdBook.js（与公共地图网页共用同一份内置图鉴）。
 */
import { useMemo, useState } from 'react';
import { BIRD_BOOK, searchBirds } from '../data/birdBook.js';

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 90,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(15, 30, 22, 0.45)', padding: 16,
};
const cardStyle = {
  width: '100%', maxWidth: 460, maxHeight: '86vh',
  display: 'flex', flexDirection: 'column',
  background: '#fff', borderRadius: 16, overflow: 'hidden',
  boxShadow: '0 16px 48px rgba(12, 30, 20, 0.28)',
};
const headStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '14px 16px', borderBottom: '1px solid #eef2ef',
};
const closeBtn = {
  marginLeft: 'auto', width: 30, height: 30, border: 'none',
  background: '#f0f6f2', color: '#5b7266', borderRadius: 8,
  fontSize: 18, cursor: 'pointer', lineHeight: 1,
};

function BirdRow({ bird, open, onToggle }) {
  return (
    <div
      style={{
        border: open ? '1px solid #7fbf9a' : '1px solid #e6ece8',
        borderRadius: 12, padding: '10px 12px', marginBottom: 8,
        background: open ? '#f7fcf9' : '#fff', cursor: 'pointer',
      }}
      onClick={onToggle}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 38, height: 38, borderRadius: 10, background: bird.icon,
            color: '#fff', display: 'grid', placeItems: 'center',
            fontWeight: 600, fontSize: 16, flex: 'none',
          }}
        >
          {bird.name.slice(0, 1)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#22332a' }}>{bird.name}</div>
          <div style={{ fontSize: 11, color: '#8aa096', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {bird.alias}
          </div>
        </div>
        <span
          style={{
            flex: 'none', fontSize: 10, padding: '2px 8px', borderRadius: 8,
            color: bird.protect.includes('二级') ? '#a0522d' : '#7a9186',
            background: bird.protect.includes('二级') ? '#fbf0e6' : '#eef4f0',
          }}
        >
          {bird.protect}
        </span>
      </div>
      {open && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #e6ece8', fontSize: 12.5, color: '#3d5548', lineHeight: 1.7 }}>
          <p style={{ margin: '4px 0' }}><b style={{ color: '#22332a' }}>特征</b>：{bird.feature}</p>
          <p style={{ margin: '4px 0' }}><b style={{ color: '#22332a' }}>习性</b>：{bird.habit}</p>
          <p style={{ margin: '4px 0' }}><b style={{ color: '#22332a' }}>栖息分布</b>：{bird.habitat}</p>
        </div>
      )}
    </div>
  );
}

export default function BirdBookModal({ initialName = null, onClose }) {
  const [kw, setKw] = useState('');
  const [openName, setOpenName] = useState(initialName || '');
  const list = useMemo(() => searchBirds(kw), [kw]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headStyle}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#22332a' }}>鸟种图鉴</div>
          <span style={{ fontSize: 11, color: '#7a9186', background: '#f0f6f2', borderRadius: 10, padding: '2px 8px' }}>
            {BIRD_BOOK.length} 种城市常见鸟
          </span>
          <button style={closeBtn} onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div style={{ padding: '12px 16px 4px' }}>
          <input
            type="text"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="搜索鸟名，如 麻雀 / 柳莺 / 翠鸟"
            style={{
              width: '100%', boxSizing: 'border-box', height: 36, padding: '0 12px',
              border: '1px solid #cfd9d2', borderRadius: 10, fontSize: 13, outline: 'none',
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 16px' }}>
          {list.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#8aa096', padding: '24px 0', fontSize: 13 }}>
              没有匹配的鸟类
            </div>
          ) : (
            list.map((b) => (
              <BirdRow
                key={b.name}
                bird={b}
                open={openName === b.name}
                onToggle={() => setOpenName((v) => (v === b.name ? '' : b.name))}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
