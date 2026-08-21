/**
 * CardEditor.jsx —— 分享卡片编辑器
 *
 * 基于「元素树」（cardElements.js）：
 *  - 画布 720×960 等比例缩放到容器，canvas 实时渲染
 *  - 点选元素 → 虚线框 + 3 个手柄（移动 / 缩放 / 旋转）
 *  - 拖拽移动、拖缩放手柄缩放、拖旋转柄旋转
 *  - 双击文字元素 → 编辑文本；工具栏可加文字/拍立得、删元素、切风格
 *  - 「保存图片」用 renderTreeToCanvas 出图（真机写相册 / 网页下载）
 *
 * props:
 *   initialTree: 元素树（来自 buildDefaultTree(analysis)）
 *   onClose: () => void
 *   onSave: (tree) => void —— 保存后回调（可带出最终树）
 */

import { useEffect, useRef, useState } from 'react';
import { renderCardElements, renderTreeToCanvas, getStyle, CARD_STYLES, uid } from '../utils/cardElements.js';
import { saveCardImage } from './SharePreview.jsx';
import { BIRD_BOOK } from '../data/birdBook.js';
import { loadAll as loadBirdImages, isLoaded as birdsLoaded, loadStatus } from '../utils/birdImageLoader.js';

const W = 720;
const H = 960;

/* ---------- 命中检测：点击 → 元素 id（z 降序，考虑旋转） ---------- */
function hitTest(el, px, py) {
  const dx = px - el.x;
  const dy = py - el.y;
  const rad = -(el.rot || 0);
  const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
  const halfW = el.w / 2 + 4;
  const halfH = el.h / 2 + 4;
  return Math.abs(rx) <= halfW && Math.abs(ry) <= halfH;
}

export default function CardEditor({ initialTree, onClose, onSave }) {
  const [tree, setTree] = useState(() =>
    initialTree ? JSON.parse(JSON.stringify(initialTree)) : { style: 'postcard', width: W, height: H, elements: [] }
  );
  const [selId, setSelId] = useState(null);
  const [dragMode, setDragMode] = useState(null); // null | 'move' | 'resize' | 'rotate'
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showAddBird, setShowAddBird] = useState(false);
  const [birdSearch, setBirdSearch] = useState('');
  const [birdsReady, setBirdsReady] = useState(birdsLoaded()); // 120 张图是否已加载到 Image 缓存
  const [editingText, setEditingText] = useState(null); // 正在编辑的文字元素 {id, text, fontSize, color}
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const stateRef = useRef({ tree, selId, dragMode });
  stateRef.current = { tree, selId, dragMode };

  /* 预加载 120 张真实鸟图到 Image 缓存（保证实时渲染时同步 drawImage 成功） */
  useEffect(() => {
    if (birdsReady) return;
    let mounted = true;
    loadBirdImages().then(() => { if (mounted) setBirdsReady(true); });
    return () => { mounted = false; };
  }, [birdsReady]);

  /* ---------- 画布：自动 fit + 用户可 pan / zoom（"手机画板"体验） ---------- */
  const [fitScale, setFitScale] = useState(1);   // 自动 fit 容器后的 base scale
  const [zoom, setZoom] = useState(1);           // 用户额外缩放 0.4~2.0
  const [pan, setPan] = useState({ x: 0, y: 0 }); // 画布在容器内的平移（内部坐标）
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const cw = el.clientWidth - 8;
      const ch = el.clientHeight - 8;
      if (cw > 0 && ch > 0) {
        setFitScale(Math.min(cw / W, ch / H));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const displayScale = fitScale * zoom;
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  /* ---------- 渲染 ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = displayScale;
    canvas.style.width = `${W * s}px`;
    canvas.style.height = `${H * s}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(s, 0, 0, s, 0, 0);
    renderCardElements(ctx, stateRef.current.tree);
    const sel = stateRef.current.tree.elements.find((e) => e.id === stateRef.current.selId);
    if (sel) drawSelection(ctx, sel, s);
  }, [tree, selId, displayScale]);

  function drawSelection(ctx, el) {
    ctx.save();
    ctx.translate(el.x, el.y);
    ctx.rotate(el.rot || 0);
    ctx.strokeStyle = '#1b7a4b';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(-el.w / 2, -el.h / 2, el.w, el.h);
    ctx.setLineDash([]);
    // 手柄
    const hs = 12;
    const hc = '#1b7a4b';
    const handles = [
      { x: -el.w / 2, y: -el.h / 2, type: 'resize' },
      { x: el.w / 2, y: -el.h / 2, type: 'resize' },
      { x: 0, y: -el.h / 2 - 22, type: 'rotate' },
    ];
    handles.forEach((hd) => {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = hc;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(hd.x - hs / 2, hd.y - hs / 2, hs, hs);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  /* ---------- 坐标换算（画布已通过 CSS transform 缩放/平移，需除以 displayScale 再扣回 pan） ---------- */
  function toCanvasXY(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const s = displayScale || 1;
    return {
      x: (e.clientX - rect.left) / s + pan.x,
      y: (e.clientY - rect.top) / s + pan.y,
    };
  }

  function findHandle(el, px, py) {
    // 旋转柄（在元素上方 22px，未旋转命中简单化：整体先转回）
    const rad = -(el.rot || 0);
    const dx = px - el.x;
    const dy = py - el.y;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    const hs = 16;
    // rotate handle
    if (Math.abs(rx) <= hs / 2 && Math.abs(ry - (-el.h / 2 - 22)) <= hs / 2) return 'rotate';
    // resize handle（右上角）
    if (Math.abs(rx - el.w / 2) <= hs && Math.abs(ry - (-el.h / 2)) <= hs) return 'resize';
    if (Math.abs(rx + el.w / 2) <= hs && Math.abs(ry + el.h / 2) <= hs) return 'resize';
    return null;
  }

  /* ---------- pointer 交互 ---------- */
  const dragRef = useRef(null);
  function onPointerDown(e) {
    const { x, y } = toCanvasXY(e);
    const st = stateRef.current;
    // 先检测选中元素的手柄
    if (st.selId) {
      const el = st.tree.elements.find((i) => i.id === st.selId);
      if (el) {
        const hd = findHandle(el, x, y);
        if (hd) {
          e.preventDefault();
          setDragMode(hd);
          dragRef.current = { startX: x, startY: y, el, mode: hd };
          return;
        }
      }
    }
    // 命中检测：z 降序找点中的元素
    const sorted = st.tree.elements.slice().sort((a, b) => (b.z || 0) - (a.z || 0));
    const hit = sorted.find((el) => el.type !== 'bg' && hitTest(el, x, y));
    setSelId(hit ? hit.id : null);
    if (hit) {
      e.preventDefault();
      setDragMode('move');
      dragRef.current = { startX: x, startY: y, el: hit, mode: 'move' };
    } else {
      // **没命中元素 → 拖动整个画布（pan）**
      e.preventDefault();
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startPan = { ...pan };
      dragRef.current = {
        mode: 'pan', startClientX, startClientY, startPan,
        // 兼容 onPointerMove 里的 dx/dy 计算
        startX: x, startY: y, el: null,
      };
      setDragMode('pan');
    }
  }

  function onPointerMove(e) {
    const dr = dragRef.current;
    if (!dr || !dr.mode) return;
    if (dr.mode === 'pan') {
      // 用 clientX/Y 算 pan 偏移（更稳，不依赖 canvas 当前 scale）
      const ndcx = (e.clientX - dr.startClientX) / (displayScale || 1);
      const ndcy = (e.clientY - dr.startClientY) / (displayScale || 1);
      setPan({ x: dr.startPan.x - ndcx, y: dr.startPan.y - ndcy });
      return;
    }
    const { x, y } = toCanvasXY(e);
    const dx = x - dr.startX;
    const dy = y - dr.startY;
    setTree((t) => ({
      ...t,
      elements: t.elements.map((el) => {
        if (el.id !== dr.el.id) return el;
        if (dr.mode === 'move') return { ...el, x: el.x + dx, y: el.y + dy };
        if (dr.mode === 'resize') {
          // 缩放：以中心为基准近似（拖右上角）
          const nw = Math.max(40, el.w + dx * 2);
          const nh = Math.max(40, el.h + dy * 2);
          return { ...el, w: nw, h: nh };
        }
        if (dr.mode === 'rotate') {
          const a = Math.atan2(y - el.y, x - el.x);
          return { ...el, rot: a };
        }
        return el;
      }),
    }));
    dragRef.current = { ...dr, startX: x, startY: y };
  }

  function onPointerUp() {
    setDragMode(null);
    dragRef.current = null;
  }

  /* ---------- 元素操作 ---------- */
  const updateEl = (id, patch) =>
    setTree((t) => ({ ...t, elements: t.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

  const addText = () => {
    const id = uid();
    setTree((t) => ({
      ...t,
      elements: [
        ...t.elements,
        { id, type: 'text', x: W / 2, y: H / 2, w: 300, h: 40, rot: 0, z: 9,
          data: { text: '双击编辑文字', fontSize: 22, font: 'hand', color: '#22332a', align: 'center', bold: false } },
      ],
    }));
    setSelId(id);
  };

  const addPolaroid = (birdName) => {
    const id = uid();
    setTree((t) => ({
      ...t,
      elements: [
        ...t.elements,
        { id, type: 'polaroid', x: W / 2, y: H / 2 + 60, w: 200, h: 240, rot: 0.05, z: 9,
          data: { birdName, index: 99 } },
      ],
    }));
    setSelId(id);
    setShowAddBird(false);
  };

  const removeSelected = () => {
    if (!selId) return;
    setTree((t) => ({ ...t, elements: t.elements.filter((e) => e.id !== selId) }));
    setSelId(null);
  };

  const changeStyle = (styleId) => setTree((t) => ({ ...t, style: styleId }));

  const editSelText = () => {
    const el = tree.elements.find((e) => e.id === selId);
    if (!el || el.type !== 'text') return;
    // 用 inline 弹层替代 window.prompt（Android WebView 下 prompt 标题显示 file://，体验差）
    setEditingText({ id: el.id, text: el.data.text || '', fontSize: el.data.fontSize || 22, color: el.data.color || '#22332a' });
  };

  const commitEditText = (newText) => {
    if (editingText) {
      const el = tree.elements.find((e) => e.id === editingText.id);
      if (el) updateEl(el.id, { data: { ...el.data, text: newText } });
    }
    setEditingText(null);
  };

  const onSaveImage = async () => {
    setSaving(true);
    try {
      const { dataUrl } = renderTreeToCanvas(stateRef.current.tree);
      const ok = await saveCardImage(dataUrl, `linjianhuixiang_share_edit.png`);
      setToast(ok ? '已保存到相册 ✓' : '保存失败，请检查存储权限');
    } catch (e) {
      setToast('保存失败');
    } finally {
      setSaving(false);
      window.setTimeout(() => setToast(null), 2600);
    }
  };

  const style = getStyle(tree.style);
  const selEl = tree.elements.find((e) => e.id === selId);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 98, background: '#16211b', display: 'flex', flexDirection: 'column' }}>
      {/* 顶栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <button onClick={onClose} style={topBtn}>‹ 返回</button>
        <span style={{ color: '#fff', fontSize: 15, fontWeight: 700, flex: 1 }}>编辑分享卡片</span>
        <button onClick={onSaveImage} disabled={saving} style={{ ...topBtn, background: '#1b7a4b', color: '#fff', fontWeight: 700 }}>
          {saving ? '保存中…' : '保存图片'}
        </button>
      </div>

      {/* 风格条 */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {CARD_STYLES.map((s) => (
          <button
            key={s.id}
            onClick={() => changeStyle(s.id)}
            style={{
              flex: 'none', padding: '6px 14px', borderRadius: 14, fontSize: 13,
              border: tree.style === s.id ? '2px solid #4db382' : '1px solid rgba(255,255,255,0.25)',
              background: tree.style === s.id ? 'rgba(77,179,130,0.15)' : 'transparent',
              color: tree.style === s.id ? '#6fe0a8' : '#c9d4cd', cursor: 'pointer',
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* 画布区（占满中间剩余空间；画布可 pan + zoom，像手机画板） */}
      <div
        ref={wrapRef}
        onPointerDown={(e) => { onPointerDown(e); }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={editSelText}
        style={{
          flex: 1,
          position: 'relative',
          background: '#0e1a14',
          overflow: 'hidden',
          touchAction: 'none',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
        }}
      >
        {/* 画布：CSS transform 做缩放+平移；canvas 物理 720×960 始终不变 */}
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{
            width: W * displayScale,
            height: H * displayScale,
            transform: `translate(${pan.x * displayScale}px, ${pan.y * displayScale}px)`,
            transformOrigin: '0 0',
            borderRadius: 8,
            boxShadow: '0 12px 44px rgba(0,0,0,.5)',
            cursor: dragMode === 'pan' ? 'grabbing' : dragMode === 'move' ? 'grabbing' : dragMode ? 'grabbing' : 'grab',
            background: style.bg,
            touchAction: 'none',
            userSelect: 'none',
            flexShrink: 0,
          }}
        />
        {/* 选中元素信息条 */}
        {selEl && (
          <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', color: '#fff', borderRadius: 12, padding: '6px 16px', fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {selEl.type === 'text' ? '文字（双击编辑）' : selEl.type === 'polaroid' ? `鸟图：${selEl.data.birdName || ''}` : selEl.type} · 拖拽移动 · 角柄缩放 · 上柄旋转
          </div>
        )}
        {toast && (
          <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.78)', color: toast.includes('失败') ? '#ff8a80' : '#7fd9a0', borderRadius: 10, padding: '6px 16px', fontSize: 13, pointerEvents: 'none' }}>
            {toast}
          </div>
        )}
      </div>

      {/* 底部 dock：工具栏 + 缩放控制 */}
      <div style={{ background: '#16211b', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={addText} style={{ ...dockBtn, flex: 1 }}>+ 文字</button>
          <button onClick={() => setShowAddBird(true)} style={{ ...dockBtn, flex: 1 }}>+ 鸟图</button>
          <button onClick={removeSelected} disabled={!selId} style={{ ...dockBtn, flex: 1, color: selId ? '#ff8a80' : '#555' }}>删除</button>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#9fb3a7', fontSize: 12 }}>
          <span style={{ minWidth: 64, fontVariantNumeric: 'tabular-nums' }}>缩放 {Math.round(zoom * 100)}%</span>
          <input
            type="range" min="0.4" max="2" step="0.05"
            value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: '#4db382' }}
          />
          <button onClick={resetView} style={{ ...dockBtn, padding: '6px 12px', flex: 'none' }}>↺ 复位</button>
        </div>
        <div style={{ color: '#7a8d80', fontSize: 11, textAlign: 'center', lineHeight: 1.5 }}>
          拖空白处平移画布 · 拖元素移动/角柄缩放/上柄旋转 · 双击文字改内容
        </div>
      </div>

      {/* 选鸟弹层（支持 120 种真实鸟图，按鸟名搜索过滤） */}
      {showAddBird && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(10,20,14,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowAddBird(false)}>
          <div style={{ background: '#fff', borderRadius: 16, maxWidth: 480, width: '100%', maxHeight: '78%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 15, borderBottom: '1px solid #eef2ef' }}>选择要添加的鸟（{BIRD_BOOK.length} 种）</div>
            <div style={{ padding: 10, borderBottom: '1px solid #eef2ef' }}>
              <input
                value={birdSearch}
                onChange={(e) => setBirdSearch(e.target.value)}
                placeholder="搜索鸟名 / 学名 / 英文名"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cfd9d2', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {BIRD_BOOK
                .filter((b) => {
                  if (!birdSearch.trim()) return true;
                  const k = birdSearch.trim().toLowerCase();
                  return b.name.toLowerCase().includes(k) || (b.alias || '').toLowerCase().includes(k);
                })
                .map((b) => (
                  <button key={b.name} onClick={() => addPolaroid(b.name)} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #cfd9d2', background: '#f4faf6', color: '#176a42', fontSize: 13, cursor: 'pointer' }}>
                    {b.name}
                  </button>
                ))}
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid #eef2ef', fontSize: 12, color: '#7a9186' }}>
              {birdsReady ? '✓ 鸟图已就绪' : `加载鸟图中…（${loadStatus().loaded}/${loadStatus().total}）`}
            </div>
          </div>
        </div>
      )}

      {/* inline 文字编辑弹层（替代 WebView 的 window.prompt 体验） */}
      {editingText && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,20,14,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => commitEditText(editingText.text)}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 460, padding: 18 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#1b3a2a' }}>编辑文字</div>
            <textarea
              autoFocus
              value={editingText.text}
              onChange={(e) => setEditingText((v) => ({ ...v, text: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEditText(editingText.text); }
                if (e.key === 'Escape') { e.preventDefault(); setEditingText(null); }
              }}
              rows={3}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cfd9d2', fontSize: 15, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button onClick={() => setEditingText(null)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #cfd9d2', background: '#f5f7f6', color: '#5b7266', fontSize: 14, cursor: 'pointer' }}>取消</button>
              <button onClick={() => commitEditText(editingText.text)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#1b7a4b', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>确定</button>
            </div>
            <div style={{ fontSize: 11, color: '#9eb3a7', marginTop: 8, textAlign: 'center' }}>Enter 确定 · Esc 取消</div>
          </div>
        </div>
      )}
    </div>
  );
}

const topBtn = {
  border: 'none', background: 'rgba(255,255,255,0.12)', color: '#dfe8e1',
  borderRadius: 12, padding: '8px 16px', fontSize: 14, cursor: 'pointer',
};
// 底部 dock 按钮
const dockBtn = {
  padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
  border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)',
  color: '#dfe8e1', cursor: 'pointer',
};
