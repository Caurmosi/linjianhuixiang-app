/**
 * shareCard.js —— 「明信片/拼贴」分享卡片（canvas 720×960，鸟图大、散落堆叠）
 *
 * 内容：录音名/时间、宜居度评分贴纸、Top3 大宝丽得鸟图（更大、错落、轻微重叠）、
 *       鸟种便签、三维度、邮戳、品牌字标。整体感觉"随意的散落"而非居中规整。
 *
 * buildShareCardData 纯函数（可单测）；drawShareCard 渲染，每只鸟独立 try/catch。
 */
import { drawBirdBadge } from './birdIcon.js';

export const CARD_W = 720;
export const CARD_H = 960;

export function gradeColor(score) {
  if (score >= 70) return '#2e7d52';
  if (score >= 50) return '#d49a26';
  return '#c0392b';
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

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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

/** 画一只大宝丽得鸟图（白边框 + 阴影 + 鸟 + 鸟名便签），整体旋转 */
function drawPolaroidBird(ctx, { x, y, w, h, name, angleDeg }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((angleDeg * Math.PI) / 180);
  // 白纸底 + 阴影
  shadow(ctx, 'rgba(30,30,30,0.30)', 22, 6, 10);
  ctx.fillStyle = '#fafaf5';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  clearShadow(ctx);
  // 内框线
  ctx.strokeStyle = '#e8e1d2';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20);
  // 鸟（try/catch 隔离：单只失败不污染外层 ctx 状态）
  try {
    drawBirdBadge(ctx, { x: 0, y: -22, r: 92, name });
  } catch (e) {
    /* 单只鸟失败不阻塞整张卡 */
  }
  // 鸟名便签
  ctx.fillStyle = '#3d5548';
  ctx.font = `bold 18px ${FONT_HAND}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 0, h / 2 - 28);
  // 小标注
  ctx.fillStyle = '#8aa096';
  ctx.font = `12px ${FONT_SANS}`;
  ctx.fillText('· 鸟鸣印象 ·', 0, h / 2 - 10);
  ctx.restore();
}

function drawTape(ctx, { x, y, w, h, angle, color }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = 'rgba(200,170,80,0.18)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawStamp(ctx, { x, y, r, text }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.12);
  ctx.strokeStyle = 'rgba(180, 60, 40, 0.85)';
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r - 5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(180, 60, 40, 0.85)';
  ctx.font = `bold 10px ${FONT_SANS}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, -r + 16);
  ctx.font = `bold 18px ${FONT_HAND}`;
  ctx.fillText('鸟', 0, 6);
  ctx.font = `8px ${FONT_SANS}`;
  ctx.fillText('2026', 0, r - 12);
  ctx.restore();
}

/** 散落小装饰（贴纸/便签/色块） */
function drawScatter(ctx, W, H) {
  // 几个随机小色块（弱化"规整"感）
  const dots = [
    { x: 70, y: 360, c: 'rgba(232, 167, 70, 0.16)', r: 28 },
    { x: W - 80, y: 760, c: 'rgba(86, 153, 200, 0.18)', r: 22 },
    { x: 60, y: 870, c: 'rgba(207, 76, 76, 0.12)', r: 16 },
    { x: W - 100, y: 380, c: 'rgba(150, 196, 110, 0.20)', r: 18 },
  ];
  dots.forEach((d) => {
    ctx.save();
    ctx.fillStyle = d.c;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

export function drawShareCard(analysis, { width = CARD_W, height = CARD_H } = {}) {
  const data = buildShareCardData(analysis);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const W = width;
  const H = height;
  const gc = gradeColor(data.score);

  // === 1. 背景：米色牛皮纸 + 颗粒 + 划痕 ===
  ctx.fillStyle = '#f5efe0';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(170, 150, 110, 0.16)';
  const seed = (n) => ((n * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 320; i++) {
    const x = seed(i * 3 + 1) * W;
    const y = seed(i * 7 + 2) * H;
    const r = 0.5 + seed(i * 11 + 3) * 1.8;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(140, 120, 90, 0.07)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 6; i++) {
    const y = 50 + i * 160;
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.bezierCurveTo(W * 0.3, y - 6, W * 0.6, y + 8, W - 30, y - 2);
    ctx.stroke();
  }

  // === 2. 散落小装饰（弱化规整感） ===
  drawScatter(ctx, W, H);

  // === 3. 多条胶带（散落贴边） ===
  drawTape(ctx, { x: 110, y: 40, w: 220, h: 32, angle: -0.42, color: 'rgba(247, 217, 122, 0.75)' });
  drawTape(ctx, { x: 600, y: 60, w: 170, h: 22, angle: 0.38, color: 'rgba(150, 195, 240, 0.6)' });
  drawTape(ctx, { x: 90, y: 460, w: 120, h: 20, angle: 0.7, color: 'rgba(232, 167, 70, 0.4)' });

  // === 4. 录音名（手写体大标题，倾斜） ===
  ctx.save();
  ctx.translate(W / 2 + 20, 110);
  ctx.rotate(-0.035);
  ctx.fillStyle = '#22332a';
  ctx.font = `bold 38px ${FONT_HAND}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const title = data.title.length > 14 ? `${data.title.slice(0, 13)}…` : data.title;
  ctx.fillText(title, 0, 0);
  ctx.restore();

  // === 5. 时间小字（右上角小注） ===
  if (data.time) {
    ctx.fillStyle = '#7a8d80';
    ctx.font = `13px ${FONT_SANS}`;
    ctx.textAlign = 'right';
    ctx.fillText(fmtTime(data.time), W - 50, 200);
  }

  // === 6. 评分贴纸（左下角大块，倾斜更明显） ===
  const cardX = 200;
  const cardY = 230;
  ctx.save();
  ctx.translate(cardX, cardY);
  ctx.rotate(0.10); // 倾斜 +5.7°
  shadow(ctx, 'rgba(40,30,20,0.25)', 18, 5, 9);
  ctx.fillStyle = '#faf8ee';
  const cw = 240;
  const ch = 150;
  const cr = 20;
  ctx.beginPath();
  ctx.moveTo(-cw / 2 + cr, -ch / 2);
  ctx.arcTo(cw / 2, -ch / 2, cw / 2, -ch / 2 + cr, cr);
  ctx.arcTo(cw / 2, ch / 2, cw / 2 - cr, ch / 2, cr);
  ctx.arcTo(-cw / 2, ch / 2, -cw / 2, ch / 2 - cr, cr);
  ctx.arcTo(-cw / 2, -ch / 2, -cw / 2 + cr, -ch / 2, cr);
  ctx.closePath();
  ctx.fill();
  clearShadow(ctx);
  ctx.strokeStyle = gc;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = gc;
  ctx.font = `bold 88px ${FONT_SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(data.score), 0, -12);
  ctx.fillStyle = '#22332a';
  ctx.font = `bold 20px ${FONT_HAND}`;
  ctx.fillText(data.grade, 0, 50);
  // 小角标
  ctx.font = `10px ${FONT_SANS}`;
  ctx.fillStyle = '#8aa096';
  ctx.fillText('LIVABILITY', 0, 75);
  ctx.restore();

  // === 7. 三张大宝丽得鸟图（更大、散落堆叠、轻微重叠） ===
  // 设计：3 张相纸 240×280，从卡片下半部错落分布
  // 位置 + 旋转 + 互相重叠
  const polaroids = [
    { x: W * 0.42, y: 380, w: 240, h: 280, ang: -0.15, name: data.topSpecies[0]?.name },
    { x: W * 0.74, y: 480, w: 240, h: 280, ang: 0.08, name: data.topSpecies[1]?.name },
    { x: W * 0.30, y: 700, w: 240, h: 280, ang: 0.04, name: data.topSpecies[2]?.name },
  ];
  if (data.topSpecies.length) {
    polaroids.forEach((p, i) => {
      if (!p.name) return;
      const angleDeg = (p.ang * 180) / Math.PI;
      try {
        drawPolaroidBird(ctx, { x: p.x, y: p.y, w: p.w, h: p.h, name: p.name, angleDeg });
      } catch (e) {
        /* 单只拍立得失败不阻塞整张卡 */
      }
    });
  } else {
    ctx.fillStyle = '#8aa096';
    ctx.font = `16px ${FONT_HAND}`;
    ctx.textAlign = 'center';
    ctx.fillText('· 这次没听到鸟 ·', W / 2, 600);
  }

  // === 8. 三维度（小字、贴右下角） ===
  const dims = [
    { k: '生物', v: data.bio },
    { k: '声境', v: data.sound },
    { k: '噪声', v: data.noise },
  ];
  ctx.fillStyle = '#3d5548';
  ctx.font = `bold 16px ${FONT_HAND}`;
  ctx.textAlign = 'center';
  const dimsY = H - 80;
  dims.forEach((d, i) => {
    const x = W * 0.50 + (i - 1) * 110;
    ctx.fillText(`${d.k} ${d.v == null ? '—' : d.v}`, x, dimsY);
  });

  // === 9. 鸟种小字（鸟种名单小条） ===
  if (data.speciesNames.length) {
    ctx.fillStyle = '#5b7266';
    ctx.font = `13px ${FONT_HAND}`;
    ctx.textAlign = 'center';
    const names = data.speciesNames.join('、');
    const maxW = W - 80;
    let txt = names;
    while (ctx.measureText(txt + '…').width > maxW && txt.length > 1) txt = txt.slice(0, -1);
    if (txt !== names) txt += '…';
    ctx.fillText(txt, W / 2, H - 40);
  }

  // === 10. 邮戳 + 品牌字标（散落盖章感） ===
  drawStamp(ctx, { x: W - 95, y: H - 130, r: 48, text: '林间回响  ·  听见城市' });

  // 品牌字标（左下角小条）
  ctx.save();
  ctx.translate(60, H - 70);
  ctx.rotate(-0.06);
  ctx.fillStyle = '#1b5e3f';
  ctx.font = `bold 20px ${FONT_HAND}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('《林间回响》', 0, 0);
  ctx.fillStyle = '#5b7266';
  ctx.font = `12px ${FONT_HAND}`;
  ctx.fillText('用鸟声读懂城市', 0, 20);
  ctx.restore();

  return { canvas, dataUrl: canvas.toDataURL('image/png') };
}
