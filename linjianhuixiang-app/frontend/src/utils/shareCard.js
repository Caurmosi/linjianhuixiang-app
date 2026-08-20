/**
 * shareCard.js —— 单次录音分享卡片绘制（canvas 720×960）
 *
 * 内容：录音名 + 采样时间 / 宜居度大分 + 等级色块 / bio·sound·noise 三维度 /
 *       Top3 卡通鸟图 / 全部鸟种文字 / 品牌字标。无地区、无二维码、无跳转。
 *
 * buildShareCardData 为纯函数（可单测）；drawShareCard 负责 canvas 渲染。
 */
import { drawBirdBadge } from './birdIcon.js';

export const CARD_W = 720;
export const CARD_H = 960;

/** 等级色：≥70 绿 / ≥50 琥珀 / <50 红（与 App 全局一致） */
export function gradeColor(score) {
  if (score >= 70) return '#2e7d52';
  if (score >= 50) return '#d49a26';
  return '#c25a39';
}

/** 纯数据组织（可测）：分析结果 → 卡片数据 */
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

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 绘制分享卡片，返回 {canvas, dataUrl} */
export function drawShareCard(analysis, { width = CARD_W, height = CARD_H } = {}) {
  const data = buildShareCardData(analysis);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const W = width;
  const H = height;
  const font = (size, bold = false) =>
    `${bold ? 'bold ' : ''}${size}px "PingFang SC","Microsoft YaHei",sans-serif`;

  // 背景：品牌绿渐变（浅 → 白）
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#eaf4ec');
  g.addColorStop(0.5, '#f8fbf9');
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 顶部品牌条
  ctx.fillStyle = '#1b7a4b';
  ctx.fillRect(0, 0, W, 8);
  ctx.font = font(15, true);
  ctx.fillStyle = '#1b7a4b';
  ctx.textAlign = 'left';
  ctx.fillText('《林间回响》', 56, 54);

  // 录音名 + 时间
  ctx.textAlign = 'center';
  ctx.font = font(34, true);
  ctx.fillStyle = '#22332a';
  ctx.fillText(data.title, W / 2, 150);
  if (data.time) {
    ctx.font = font(16);
    ctx.fillStyle = '#8aa096';
    ctx.fillText(fmtTime(data.time), W / 2, 182);
  }

  // 大评分
  const gc = gradeColor(data.score);
  ctx.font = font(108, true);
  ctx.fillStyle = gc;
  ctx.fillText(String(data.score), W / 2, 330);
  ctx.font = font(20, true);
  ctx.fillStyle = '#ffffff';
  const gradeTagW = 92;
  const gradeTagX = W / 2 - gradeTagW / 2;
  roundRect(ctx, gradeTagX, 352, gradeTagW, 40, 20);
  ctx.fillStyle = gc;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(data.grade, W / 2, 380);

  // 三维度
  const dims = [
    { key: '生物多样性', val: data.bio, unit: 'bio' },
    { key: '声环境', val: data.sound, unit: 'sound' },
    { key: '人为噪声', val: data.noise, unit: 'noise' },
  ];
  const boxW = (W - 56 * 2 - 24 * 2) / 3;
  dims.forEach((d, i) => {
    const x = 56 + i * (boxW + 24);
    roundRect(ctx, x, 428, boxW, 96, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#e2ece6';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#5b7266';
    ctx.font = font(14);
    ctx.fillText(d.key, x + boxW / 2, 462);
    ctx.fillStyle = '#22332a';
    ctx.font = font(30, true);
    ctx.fillText(d.val == null ? '—' : String(d.val), x + boxW / 2, 502);
  });

  // 鸟图区（Top3）
  const birdY = 596;
  if (data.topSpecies.length) {
    data.topSpecies.forEach((sp, i) => {
      const cx = W / 2 + (i - (data.topSpecies.length - 1) / 2) * 170;
      drawBirdBadge(ctx, { x: cx, y: birdY, r: 62, name: sp.name });
      ctx.font = font(15, true);
      ctx.fillStyle = '#3d5548';
      ctx.fillText(sp.name, cx, birdY + 96);
    });
  } else {
    ctx.font = font(18);
    ctx.fillStyle = '#8aa096';
    ctx.fillText('未识别到鸟种', W / 2, birdY);
  }

  // 全部鸟种文字
  if (data.speciesNames.length) {
    ctx.font = font(15);
    ctx.fillStyle = '#5b7266';
    const names = data.speciesNames.join('、');
    const maxW = W - 112;
    ctx.textAlign = 'left';
    ctx.fillText(ellipsis(ctx, names, maxW), 56, birdY + 136);
    ctx.textAlign = 'center';
  }

  // 品牌字标
  ctx.fillStyle = '#8aa096';
  ctx.font = font(14);
  ctx.fillText('用鸟声读懂城市 · 城市鸟类宜居度声学诊断', W / 2, H - 52);

  return { canvas, dataUrl: canvas.toDataURL('image/png') };
}

/** 圆角矩形路径 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 按像素宽度截断文本并加省略号 */
function ellipsis(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) {
    t = t.slice(0, -1);
  }
  return t + '…';
}
