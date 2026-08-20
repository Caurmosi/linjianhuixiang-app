/**
 * SharePreview.jsx —— 分享卡片全屏预览（方案 B：预览 + 保存按钮）
 *
 * props:
 *   cards: [{dataUrl, title}] —— 一张或多张分享卡片
 *   onClose: () => void
 * 多张时可左右滑动切换；底部「保存当前」+「全部保存(N)」+「关闭」。
 * 保存：真机 AndroidBridge.saveImage 写相册；网页/降级 <a download>。
 */

import { useState } from 'react';

/** 保存单张卡片：真机写相册（AndroidBridge），网页触发下载 */
export function saveCardImage(dataUrl, filename = 'linjianhuixiang_share.png') {
  const bridge = typeof window !== 'undefined' ? window.AndroidBridge : null;
  if (bridge && typeof bridge.saveImage === 'function') {
    return bridge.saveImage(dataUrl);
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}

export default function SharePreview({ cards = [], onClose }) {
  const [idx, setIdx] = useState(0);
  const [saved, setSaved] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [allDone, setAllDone] = useState(false);

  if (!cards || !cards.length) return null;
  const total = cards.length;
  const cur = cards[idx];

  const saveOne = (i) => {
    saveCardImage(cards[i].dataUrl, `linjianhuixiang_share_${i + 1}.png`);
    setSaved((s) => {
      const n = new Set(s);
      n.add(i);
      if (n.size === total) setAllDone(true);
      return n;
    });
  };

  const saveAll = async () => {
    setSaving(true);
    for (let i = 0; i < total; i++) saveOne(i);
    setSaving(false);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 96,
        display: 'flex', flexDirection: 'column',
        background: 'rgba(12, 26, 18, 0.92)', padding: 12,
      }}
    >
      {/* 顶部：标题 + 关闭 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 10px' }}>
        <span style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>
          分享卡片{total > 1 ? `（${idx + 1}/${total}）` : ''}
        </span>
        <button
          onClick={onClose}
          style={{
            border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff',
            borderRadius: 16, padding: '6px 16px', fontSize: 13,
          }}
        >
          关闭
        </button>
      </div>

      {/* 卡片预览区 */}
      <div
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', position: 'relative',
        }}
      >
        {total > 1 && (
          <button
            onClick={() => setIdx((i) => (i - 1 + total) % total)}
            style={{
              position: 'absolute', left: 4, zIndex: 2, width: 38, height: 38, borderRadius: 20,
              border: 'none', background: 'rgba(255,255,255,0.16)', color: '#fff', fontSize: 20,
            }}
          >
            ‹
          </button>
        )}
        <img
          src={cur.dataUrl}
          alt={cur.title || '分享卡片'}
          style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,.4)' }}
        />
        {total > 1 && (
          <button
            onClick={() => setIdx((i) => (i + 1) % total)}
            style={{
              position: 'absolute', right: 4, zIndex: 2, width: 38, height: 38, borderRadius: 20,
              border: 'none', background: 'rgba(255,255,255,0.16)', color: '#fff', fontSize: 20,
            }}
          >
            ›
          </button>
        )}
      </div>

      {/* 底部操作 */}
      <div style={{ display: 'flex', gap: 10, padding: '12px 4px 6px' }}>
        <button
          onClick={() => saveOne(idx)}
          disabled={saving || saved.has(idx)}
          style={btnStyle(saved.has(idx) ? '#2e7d52' : '#1b7a4b')}
        >
          {saved.has(idx) ? '已保存 ✓' : '保存当前图片'}
        </button>
        {total > 1 && (
          <button onClick={saveAll} disabled={saving || allDone} style={btnStyle(allDone ? '#2e7d52' : '#2f5d8a')}>
            {allDone ? '全部已保存 ✓' : `全部保存（${total}）`}
          </button>
        )}
      </div>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11.5, textAlign: 'center', margin: '2px 0 6px' }}>
        已保存到相册后，可前往相册发送给好友或分享到朋友圈
      </p>
    </div>
  );
}

function btnStyle(bg) {
  return {
    flex: 1, height: 46, border: 'none', borderRadius: 14, color: '#fff',
    fontSize: 15, fontWeight: 700, background: bg, cursor: 'pointer',
  };
}
