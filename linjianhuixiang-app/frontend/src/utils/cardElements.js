/**
 * cardElements.js —— 分享卡片「元素树」模型 + Canvas 渲染器
 *
 * 设计：
 *  - 卡片 = 元素树 {style, width, height, elements:[{id,type,x,y,w,h,rot,z,data}]}
 *  - 渲染器 renderCardElements(ctx, tree)：按 z 排序逐元素绘制（所见即所得）
 *  - 编辑器（CardEditor）操作同一个元素树，导出时用本渲染器出图
 *  - buildDefaultTree(analysis) 从分析结果生成默认「明信片」布局（兼容旧 drawShareCard 观感）
 */

import { drawBirdBadge } from './birdIcon.js';

export const CARD_W = 720;
export const CARD_H = 960;

export function gradeColor(score) {
  if (score >= 70) return '#2e7d52';
  if (score >= 50) return '#d49a26';
  return '#c0392b';
}

const FONT_HAND = `"STKaiti","KaiTi","楷体","Microsoft YaHei",sans-serif`;
const FONT_SERIF = `"Songti SC","SimSun","宋体","Times New Roman",serif`;
const FONT_SANS = `"PingFang SC","Microsoft YaHei",sans-serif`;

function shadow(ctx, color = 'rgba(40,40,40,0.18)', blur = 14, ox = 4, oy = 6) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = ox;
  ctx.shadowOffsetY = oy;
}
function clearShadow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}
function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function buildShareCardData(analysis) {
  const lv = (analysis && analysis.livability) || {};
  const score = typeof lv.score === 'number' ? lv.score : 0;
  const species = Array.isArray(analysis && analysis.species)
    ? analysis.species.slice().sort((a, b) => (b.conf || 0) - (a.conf || 0))
    : [];
  return {
    title: (analysis && analysis.recording) || '录音分析',
    time: (analysis && analysis.createdAt) || '',
    score,
    grade: lv.grade || (score >= 70 ? '宜居' : score >= 50 ? '一般' : '受压'),
    gradeEn: lv.gradeEn || '',
    bio: typeof lv.bio === 'number' ? lv.bio : null,
    sound: typeof lv.sound === 'number' ? lv.sound : null,
    noise: typeof lv.noise === 'number' ? lv.noise : null,
    topSpecies: species.slice(0, 3).map((s) => ({ name: s.name, conf: s.conf })),
    speciesNames: species.map((s) => s.name),
  };
}

export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* =====================================================================
 * 风格主题（style）
 * 每套 = 背景 / 前景 / 强调 / 字体族 / 装饰开关
 * ===================================================================== */
export const CARD_STYLES = [
  {
    id: 'postcard', name: '明信片',
    bg: '#f5efe0', grain: true, textureLines: true,
    fg: '#22332a', sub: '#7a8d80', accent: '#1b5e3f',
    paper: '#fafaf5', tape: ['rgba(247,217,122,0.75)', 'rgba(150,195,240,0.6)', 'rgba(232,167,70,0.4)'],
    stampColor: 'rgba(180,60,40,0.85)', stampOn: true,
    fontTitle: FONT_HAND, fontBody: FONT_SANS,
  },
  {
    id: 'minimal', name: '极简白',
    bg: '#ffffff', grain: false, textureLines: false,
    fg: '#1f2933', sub: '#9aa5b1', accent: '#3e4c59',
    paper: '#ffffff', tape: ['rgba(230,232,236,0.9)', 'rgba(200,210,220,0.7)'],
    stampColor: 'rgba(80,90,100,0.7)', stampOn: false,
    fontTitle: FONT_SANS, fontBody: FONT_SANS,
  },
  {
    id: 'eco', name: '清新生态',
    bg: '#f2f8f0', grain: true, textureLines: false,
    fg: '#24442e', sub: '#6b8f76', accent: '#2e7d52',
    paper: '#fbfdf9', tape: ['rgba(180,220,180,0.7)', 'rgba(140,200,160,0.6)'],
    stampColor: 'rgba(46,125,82,0.8)', stampOn: true,
    fontTitle: FONT_HAND, fontBody: FONT_SANS,
  },
  {
    id: 'vintage', name: '复古胶片',
    bg: '#efe6d0', grain: true, textureLines: true,
    fg: '#3a2f22', sub: '#8a7a5c', accent: '#8a5a2b',
    paper: '#f4ecdb', tape: ['rgba(190,160,110,0.7)', 'rgba(160,140,90,0.55)'],
    stampColor: 'rgba(120,80,40,0.85)', stampOn: true,
    fontTitle: FONT_SERIF, fontBody: FONT_SANS,
  },
  {
    id: 'night', name: '暗夜',
    bg: '#1c2430', grain: true, textureLines: false,
    fg: '#e8edf2', sub: '#8fa0b0', accent: '#7fb3e8',
    paper: '#24303e', tape: ['rgba(90,120,160,0.55)', 'rgba(120,90,160,0.5)'],
    stampColor: 'rgba(160,190,230,0.8)', stampOn: true,
    fontTitle: FONT_SANS, fontBody: FONT_SANS,
  },
  {
    id: 'journal', name: '手账',
    bg: '#fffaf0', grain: false, textureLines: true,
    fg: '#4a3b2a', sub: '#a08a70', accent: '#c96a4a',
    paper: '#fffdf7', tape: ['rgba(250,220,150,0.8)', 'rgba(200,160,220,0.55)', 'rgba(160,200,240,0.55)'],
    stampColor: 'rgba(201,106,74,0.8)', stampOn: true,
    fontTitle: FONT_HAND, fontBody: FONT_HAND,
  },
];

export function getStyle(id) {
  return CARD_STYLES.find((s) => s.id === id) || CARD_STYLES[0];
}

/* =====================================================================
 * 默认元素树（明信片布局，由 buildShareCardData 生成）
 * ===================================================================== */
let _uid = 100;
export function uid() { return `el_${_uid++}`; }

/** 元素坐标约定：x/y 为中心点（渲染时 translate(x,y)+rotate 后以中心绘制） */
export function buildDefaultTree(analysis) {
  const d = buildShareCardData(analysis);
  const gc = gradeColor(d.score);
  const els = [
    { id: uid(), type: 'bg', x: CARD_W / 2, y: CARD_H / 2, w: CARD_W, h: CARD_H, rot: 0, z: 0, data: {} },
  ];
  // 胶带
  els.push(
    { id: uid(), type: 'tape', x: 110, y: 40, w: 220, h: 32, rot: -0.42, z: 1, data: { color: 0 } },
    { id: uid(), type: 'tape', x: 600, y: 60, w: 170, h: 22, rot: 0.38, z: 1, data: { color: 1 } },
    { id: uid(), type: 'tape', x: 90, y: 460, w: 120, h: 20, rot: 0.7, z: 1, data: { color: 2 } },
  );
  // 标题（手写体大标题）
  els.push(
    { id: uid(), type: 'text', x: CARD_W / 2 + 20, y: 110, w: 460, h: 56, rot: -0.035, z: 2,
      data: { text: d.title.length > 14 ? `${d.title.slice(0, 13)}…` : d.title, fontSize: 38, font: 'hand', color: '#22332a', align: 'center', bold: true } },
  );
  // 时间
  if (d.time) {
    els.push(
      { id: uid(), type: 'text', x: CARD_W - 50, y: 200, w: 300, h: 24, rot: 0, z: 2,
        data: { text: fmtTime(d.time), fontSize: 13, font: 'sans', color: '#7a8d80', align: 'right', bold: false } },
    );
  }
  // 评分贴纸
  els.push(
    { id: uid(), type: 'score', x: 200, y: 230, w: 240, h: 150, rot: 0.10, z: 3,
      data: { score: d.score, grade: d.grade, color: gc } },
  );
  // Top3 拍立得
  const polaroids = [
    { x: CARD_W * 0.42, y: 380, ang: -0.15 },
    { x: CARD_W * 0.74, y: 480, ang: 0.08 },
    { x: CARD_W * 0.30, y: 700, ang: 0.04 },
  ];
  if (d.topSpecies.length) {
    d.topSpecies.forEach((s, i) => {
      if (!s.name) return;
      els.push(
        { id: uid(), type: 'polaroid', x: polaroids[i].x, y: polaroids[i].y, w: 240, h: 280, rot: polaroids[i].ang, z: 4,
          data: { birdName: s.name, index: i } },
      );
    });
  } else {
    els.push(
      { id: uid(), type: 'text', x: CARD_W / 2, y: 600, w: 400, h: 40, rot: 0, z: 4,
        data: { text: '· 这次没听到鸟 ·', fontSize: 16, font: 'hand', color: '#8aa096', align: 'center', bold: false } },
    );
  }
  // 三维度
  const dims = [
    { k: '生物', v: d.bio },
    { k: '声境', v: d.sound },
    { k: '噪声', v: d.noise },
  ];
  els.push(
    { id: uid(), type: 'dims', x: CARD_W * 0.50, y: CARD_H - 80, w: 360, h: 30, rot: 0, z: 5, data: { dims, color: '#3d5548' } },
  );
  // 鸟种名单
  if (d.speciesNames.length) {
    els.push(
      { id: uid(), type: 'text', x: CARD_W / 2, y: CARD_H - 40, w: CARD_W - 80, h: 26, rot: 0, z: 5,
        data: { text: d.speciesNames.join('、'), fontSize: 13, font: 'hand', color: '#5b7266', align: 'center', bold: false, maxW: CARD_W - 80 } },
    );
  }
  // 邮戳 + 品牌
  els.push(
    { id: uid(), type: 'stamp', x: CARD_W - 95, y: CARD_H - 130, w: 100, h: 100, rot: -0.12, z: 6, data: { text: '林间回响 · 听见城市' } },
  );
  els.push(
    { id: uid(), type: 'brand', x: 60, y: CARD_H - 70, w: 220, h: 60, rot: -0.06, z: 6, data: { title: '《林间回响》', sub: '用鸟声读懂城市' } },
  );
  return { style: 'postcard', width: CARD_W, height: CARD_H, elements: els };
}

/* =====================================================================
 * 元素渲染器（单元素）
 * ===================================================================== */
function renderBg(ctx, el, style) {
  const W = el.w; const H = el.h;
  const st = style;
  ctx.fillStyle = st.bg;
  ctx.fillRect(-W / 2, -H / 2, W, H);
  if (st.grain) {
    ctx.fillStyle = 'rgba(170,150,110,0.16)';
    const seed = (n) => ((n * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 320; i++) {
      const x = seed(i * 3 + 1) * W - W / 2;
      const y = seed(i * 7 + 2) * H - H / 2;
      const r = 0.5 + seed(i * 11 + 3) * 1.8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (st.textureLines) {
    ctx.strokeStyle = 'rgba(140,120,90,0.07)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 6; i++) {
      const y = -H / 2 + 50 + i * 160;
      ctx.beginPath();
      ctx.moveTo(-W / 2 + 20, y);
      ctx.bezierCurveTo(-W * 0.2, y - 6, W * 0.1, y + 8, W / 2 - 30, y - 2);
      ctx.stroke();
    }
  }
}

function renderTape(ctx, el, style) {
  const st = style;
  const idx = typeof el.data.color === 'number' ? el.data.color : 0;
  const color = st.tape[idx % st.tape.length] || 'rgba(240,220,140,0.7)';
  ctx.fillStyle = color;
  ctx.fillRect(-el.w / 2, -el.h / 2, el.w, el.h);
  ctx.strokeStyle = 'rgba(200,170,80,0.18)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(-el.w / 2, -el.h / 2, el.w, el.h);
}

function renderText(ctx, el, style) {
  const d = el.data;
  const fontMap = { hand: FONT_HAND, serif: FONT_SERIF, sans: FONT_SANS };
  ctx.fillStyle = d.color || style.fg;
  ctx.font = `${d.bold ? 'bold ' : ''}${d.fontSize || 20}px ${fontMap[d.font] || FONT_SANS}`;
  ctx.textAlign = d.align || 'left';
  ctx.textBaseline = 'middle';
  const maxW = d.maxW || el.w;
  let txt = d.text || '';
  if (d.ellipsis && ctx.measureText(txt).width > maxW) {
    while (ctx.measureText(txt + '…').width > maxW && txt.length > 1) txt = txt.slice(0, -1);
    txt += '…';
  }
  ctx.fillText(txt, d.align === 'center' ? 0 : d.align === 'right' ? el.w / 2 : -el.w / 2, 0);
}

function renderScore(ctx, el, style) {
  const d = el.data;
  const cw = el.w; const ch = el.h; const cr = 20;
  shadow(ctx, 'rgba(40,30,20,0.25)', 18, 5, 9);
  ctx.fillStyle = style.paper;
  roundedRect(ctx, -cw / 2, -ch / 2, cw, ch, cr);
  ctx.fill();
  clearShadow(ctx);
  ctx.strokeStyle = d.color;
  ctx.lineWidth = 3;
  roundedRect(ctx, -cw / 2, -ch / 2, cw, ch, cr);
  ctx.stroke();
  ctx.fillStyle = d.color;
  ctx.font = `bold 88px ${FONT_SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(d.score), 0, -12);
  ctx.fillStyle = style.fg;
  ctx.font = `bold 20px ${FONT_HAND}`;
  ctx.fillText(d.grade || '', 0, 50);
  ctx.font = `10px ${FONT_SANS}`;
  ctx.fillStyle = style.sub;
  ctx.fillText('LIVABILITY', 0, 75);
}

function renderPolaroid(ctx, el, style) {
  const name = el.data.birdName;
  const w = el.w; const h = el.h;
  shadow(ctx, 'rgba(30,30,30,0.30)', 22, 6, 10);
  ctx.fillStyle = style.paper;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  clearShadow(ctx);
  ctx.strokeStyle = 'rgba(232,225,210,0.8)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20);
  if (name) {
    try {
      drawBirdBadge(ctx, { x: 0, y: -22, r: 92, name });
    } catch (e) { /* 单只失败不阻塞 */ }
    ctx.fillStyle = style.fg;
    ctx.font = `bold 18px ${FONT_HAND}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 0, h / 2 - 28);
    ctx.fillStyle = style.sub;
    ctx.font = `12px ${FONT_SANS}`;
    ctx.fillText('· 鸟鸣印象 ·', 0, h / 2 - 10);
  } else {
    ctx.fillStyle = style.sub;
    ctx.font = `14px ${FONT_HAND}`;
    ctx.textAlign = 'center';
    ctx.fillText('· 无鸟 ·', 0, 0);
  }
}

function renderDims(ctx, el, style) {
  const d = el.data;
  ctx.fillStyle = d.color || style.fg;
  ctx.font = `bold 16px ${FONT_HAND}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = d.dims.length;
  d.dims.forEach((dim, i) => {
    const x = (i - (n - 1) / 2) * 110;
    ctx.fillText(`${dim.k} ${dim.v == null ? '—' : dim.v}`, x, 0);
  });
}

function renderStamp(ctx, el, style) {
  const r = el.w / 2;
  ctx.strokeStyle = style.stampColor;
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r - 5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = style.stampColor;
  ctx.font = `bold 10px ${FONT_SANS}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(el.data.text || '林间回响', 0, -r + 16);
  ctx.font = `bold 18px ${FONT_HAND}`;
  ctx.fillText('鸟', 0, 6);
  ctx.font = `8px ${FONT_SANS}`;
  ctx.fillText('2026', 0, r - 12);
}

function renderBrand(ctx, el, style) {
  const d = el.data;
  ctx.fillStyle = style.accent;
  ctx.font = `bold 20px ${FONT_HAND}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(d.title || '《林间回响》', 0, 0);
  ctx.fillStyle = style.sub;
  ctx.font = `12px ${FONT_HAND}`;
  ctx.fillText(d.sub || '用鸟声读懂城市', 0, 20);
}

/** 渲染单个元素（已 translate+rotate，坐标为中心原点） */
export function renderOneElement(ctx, el, style) {
  ctx.save();
  ctx.translate(el.x, el.y);
  ctx.rotate(el.rot || 0);
  switch (el.type) {
    case 'bg': renderBg(ctx, el, style); break;
    case 'tape': renderTape(ctx, el, style); break;
    case 'text': renderText(ctx, el, style); break;
    case 'score': renderScore(ctx, el, style); break;
    case 'polaroid': renderPolaroid(ctx, el, style); break;
    case 'dims': renderDims(ctx, el, style); break;
    case 'stamp': renderStamp(ctx, el, style); break;
    case 'brand': renderBrand(ctx, el, style); break;
    default: break;
  }
  ctx.restore();
}

/** 按元素树渲染整张卡片；每元素独立 try/catch（单元素失败不阻塞整卡） */
export function renderCardElements(ctx, tree) {
  const style = getStyle(tree.style);
  const sorted = (tree.elements || []).slice().sort((a, b) => (a.z || 0) - (b.z || 0));
  for (const el of sorted) {
    try {
      renderOneElement(ctx, el, style);
    } catch (e) {
      /* 单元素失败继续 */
    }
  }
}

/** 从元素树导出 PNG dataUrl（供保存/分享） */
export function renderTreeToCanvas(tree, scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((tree.width || CARD_W) * scale);
  canvas.height = Math.round((tree.height || CARD_H) * scale);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(scale, scale);
  renderCardElements(ctx, tree);
  ctx.restore();
  return { canvas, dataUrl: canvas.toDataURL('image/png') };
}

/** 兼容旧接口：直接由 analysis 出图 */
export function drawShareCard(analysis, { width = CARD_W, height = CARD_H } = {}) {
  const tree = buildDefaultTree(analysis);
  const { canvas, dataUrl } = renderTreeToCanvas(tree, width / CARD_W);
  return { canvas, dataUrl };
}
