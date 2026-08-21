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
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const stateRef = useRef({ tree, selId, dragMode });
  stateRef.current = { tree, selId, dragMode };

  /* ---------- 渲染 ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = canvas.width / W;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    renderCardElements(ctx, stateRef.current.tree);
    const sel = stateRef.current.tree.elements.find((e) => e.id === stateRef.current.selId);
    if (sel) drawSelection(ctx, sel);
  }, [tree, selId]);

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

  /* ---------- 坐标换算 ---------- */
  function toCanvasXY(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scale = W / rect.width;
    return {
      x: (e.clientX - rect.left) * scale,
      y: (e.clientY - rect.top) * scale,
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
    }
  }

  function onPointerMove(e) {
    const dr = dragRef.current;
    if (!dr || !dr.mode) return;
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
    const v = window.prompt('编辑文字', el.data.text || '');
    if (v != null) updateEl(el.id, { data: { ...el.data, text: v } });
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

      {/* 画布 + 工具栏 */}
      <div style={{ flex: 1, display: 'flex', gap: 10, padding: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {/* 画布 */}
        <div ref={wrapRef} style={{ position: 'relative', height: '100%', aspectRatio: `${W}/${H}`, maxHeight: '100%', touchAction: 'none' }}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onDoubleClick={editSelText}
            style={{
              width: '100%', height: '100%', borderRadius: 10,
              boxShadow: '0 12px 44px rgba(0,0,0,.5)', cursor: dragMode ? 'grabbing' : 'pointer',
              background: style.bg,
            }}
          />
          {/* 选中元素信息条 */}
          {selEl && (
            <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: 12, padding: '5px 14px', fontSize: 12, whiteSpace: 'nowrap' }}>
              {selEl.type === 'text' ? '文字（双击编辑）' : selEl.type === 'polaroid' ? `鸟图：${selEl.data.birdName || ''}` : selEl.type} · 拖拽移动 · 角柄缩放 · 上柄旋转
            </div>
          )}
        </div>

        {/* 工具栏 */}
        <div style={{ width: 150, flex: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={addText} style={toolBtn}>+ 添加文字</button>
          <button onClick={() => setShowAddBird(true)} style={toolBtn}>+ 添加鸟图</button>
          <button onClick={removeSelected} disabled={!selId} style={{ ...toolBtn, color: selId ? '#ff8a80' : '#777' }}>删除选中</button>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.15)', margin: '4px 0' }} />
          <div style={{ color: '#9fb3a7', fontSize: 12, lineHeight: 1.6 }}>
            提示：<br />· 拖拽移动元素<br />· 拖角柄缩放<br />· 拖上方圆柄旋转<br />· 双击文字改内容
          </div>
          {toast && (
            <div style={{ marginTop: 'auto', color: toast.includes('失败') ? '#ff8a80' : '#7fd9a0', fontSize: 12, textAlign: 'center' }}>
              {toast}
            </div>
          )}
        </div>
      </div>

      {/* 选鸟弹层 */}
      {showAddBird && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(10,20,14,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowAddBird(false)}>
          <div style={{ background: '#fff', borderRadius: 16, maxWidth: 420, width: '100%', maxHeight: '70%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '14px 16px', fontWeight: 700, fontSize: 15, borderBottom: '1px solid #eef2ef' }}>选择要添加的鸟</div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['麻雀', '白头鹎', '乌鸫', '珠颈斑鸠', '家燕', '大杜鹃', '红嘴蓝鹊', '普通翠鸟', '白鹭', '夜鹭', '斑嘴鸭', '绿头鸭', '黑枕黄鹂', '灰头绿啄木鸟', '红隼', '领角鸮', '喜鹊', '金翅雀', '黄腹山雀', '黑尾蜡嘴雀'].map((b) => (
                <button key={b} onClick={() => addPolaroid(b)} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #cfd9d2', background: '#f4faf6', color: '#176a42', fontSize: 13, cursor: 'pointer' }}>
                  {b}
                </button>
              ))}
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid #eef2ef', fontSize: 12, color: '#7a9186' }}>
              也可在图鉴页选择任意鸟种添加（更多物种后续支持）
            </div>
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
const toolBtn = {
  width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
  border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)',
  color: '#dfe8e1', cursor: 'pointer',
};
