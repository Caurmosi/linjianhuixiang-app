/**
 * SharePreview.jsx —— 分享卡片全屏预览（方案 B：预览 + 保存按钮）
 *
 * props:
 *   cards: [{dataUrl, title}] —— 一张或多张分享卡片
 *   onClose: () => void
 *   onEdit: (card) => void —— 可选，点「编辑」进入编辑器
 * 多张时可左右滑动切换；底部「保存当前」+「全部保存(N)」+「编辑」+「关闭」。
 * 保存：真机 AndroidBridge.saveImage 写相册（真实异步返回成功/失败，不假成功）；
 *       网页/降级 <a download>。
 */

import { useState } from 'react';

/** 保存单张卡片：真机写相册（AndroidBridge），网页触发下载。返回 Promise<boolean> */
export function saveCardImage(dataUrl, filename = 'linjianhuixiang_share.png') {
  const bridge = typeof window !== 'undefined' ? window.AndroidBridge : null;
  if (bridge && typeof bridge.saveImage === 'function') {
    return new Promise((resolve) => {
      let done = false;
      try {
        const r = bridge.saveImage(dataUrl);
        if (typeof r === 'boolean') {
          done = true;
          resolve(r);
        } else if (r && typeof r.then === 'function') {
          r.then((ok) => { if (!done) { done = true; resolve(!!ok); } })
            .catch(() => { if (!done) { done = true; resolve(false); } });
        } else {
          // 桥存在但返回非布尔（历史兼容：无返回值视为成功）
          done = true;
          resolve(true);
        }
        // 兜底：3 秒内无结果视为失败（防桥调用挂死）
        setTimeout(() => {
          if (!done) { done = true; resolve(false); }
        }, 3000);
      } catch (e) {
        done = true;
        resolve(false);
      }
    });
  }
  // 网页降级：<a download>（同步，直接视为成功）
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return Promise.resolve(true);
}

export default function SharePreview({ cards = [], onClose, onEdit }) {
  const [idx, setIdx] = useState(0);
  const [savedSet, setSavedSet] = useState(() => new Set()); // 已成功保存的下标
  const [failedSet, setFailedSet] = useState(() => new Set()); // 保存失败的下标（可重试）
  const [savingIdx, setSavingIdx] = useState(null); // 正在保存的单张
  const [savingAll, setSavingAll] = useState(false);
  const [toast, setToast] = useState(null); // {type:'ok'|'err', msg}

  if (!cards || !cards.length) return null;
  const total = cards.length;
  const cur = cards[idx];
  const curSaved = savedSet.has(idx);
  const curFailed = failedSet.has(idx);

  const flash = (type, msg) => {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 2600);
  };

  /** 保存单张（真实异步；成功才标记 saved，失败标记 failed） */
  const saveOne = async (i) => {
    if (savingIdx !== null || savingAll) return;
    setSavingIdx(i);
    setFailedSet((s) => { const n = new Set(s); n.delete(i); return n; });
    try {
      const ok = await saveCardImage(cards[i].dataUrl, `linjianhuixiang_share_${i + 1}.png`);
      if (ok) {
        setSavedSet((s) => { const n = new Set(s); n.add(i); return n; });
        flash('ok', `已保存第 ${i + 1} 张到相册`);
      } else {
        setFailedSet((s) => { const n = new Set(s); n.add(i); return n; });
        flash('err', '保存失败：可能未授权存储权限，请检查后重试');
      }
    } catch (e) {
      setFailedSet((s) => { const n = new Set(s); n.add(i); return n; });
      flash('err', '保存失败，请重试');
    } finally {
      setSavingIdx(null);
    }
  };

  /** 批量保存全部（真实逐张，显示进度） */
  const saveAll = async () => {
    if (savingAll) return;
    setSavingAll(true);
    for (let i = 0; i < total; i++) {
      if (savedSet.has(i)) continue;
      setSavingIdx(i);
      try {
        const ok = await saveCardImage(cards[i].dataUrl, `linjianhuixiang_share_${i + 1}.png`);
        if (ok) setSavedSet((s) => { const n = new Set(s); n.add(i); return n; });
        else setFailedSet((s) => { const n = new Set(s); n.add(i); return n; });
      } catch (e) {
        setFailedSet((s) => { const n = new Set(s); n.add(i); return n; });
      }
    }
    setSavingIdx(null);
    setSavingAll(false);
    const ok = savedSet.size;
    const fail = failedSet.size;
    flash(ok >= total - fail ? 'ok' : 'err', fail === 0 ? `全部 ${ok} 张已保存到相册` : `已保存 ${ok} 张，失败 ${fail} 张`);
  };

  const savedCount = savedSet.size;

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
          {total > 1 && savedCount > 0 && (
            <span style={{ fontSize: 12, color: '#7fd9a0', marginLeft: 8 }}>已保存 {savedCount}/{total}</span>
          )}
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
        {curFailed && (
          <span style={{
            position: 'absolute', top: 12, right: 12, background: 'rgba(192,57,43,.9)',
            color: '#fff', borderRadius: 10, padding: '4px 12px', fontSize: 12,
          }}>
            保存失败，可重试
          </span>
        )}
      </div>

      {/* 底部操作 */}
      <div style={{ display: 'flex', gap: 10, padding: '12px 4px 6px' }}>
        <button
          onClick={() => saveOne(idx)}
          disabled={savingIdx !== null || savingAll || curSaved}
          style={btnStyle(curSaved ? '#2e7d52' : curFailed ? '#c0392b' : '#1b7a4b')}
        >
          {savingIdx === idx ? '保存中…' : curSaved ? '已保存 ✓' : curFailed ? '重试保存' : '保存当前图片'}
        </button>
        {onEdit && (
          <button onClick={() => onEdit(cur)} disabled={savingIdx !== null || savingAll} style={btnStyle('#2f5d8a')}>
            编辑
          </button>
        )}
        {total > 1 && (
          <button onClick={saveAll} disabled={savingAll || savedSet.size === total} style={btnStyle(savedSet.size === total ? '#2e7d52' : '#5a6a8a')}>
            {savingAll ? `保存中 ${savedCount}/${total}…` : savedSet.size === total ? '全部已保存 ✓' : `全部保存（${total - savedSet.size}）`}
          </button>
        )}
      </div>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11.5, textAlign: 'center', margin: '2px 0 6px' }}>
        {toast ? (toast.type === 'ok' ? `✓ ${toast.msg}` : `⚠ ${toast.msg}`) : '保存到系统相册后，可前往相册发送给好友或分享到朋友圈'}
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
