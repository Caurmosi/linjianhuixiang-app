/**
 * shareCard.js —— 「明信片/拼贴」风格分享卡片（canvas 720×960）
 *
 * 内容：录音名/时间、宜居度评分贴纸、Top3 宝丽得鸟图（散落旋转）、三维度、品牌字标。
 * 单次录音，无地区、无二维码、无跳转。
 *
 * buildShareCardData 为纯函数（可单测）；drawShareCard 负责 canvas 渲染，
 * 单只鸟绘制 try/catch 隔离（WebView 兼容性更好）。
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

/** 纯数据组织（可测） */
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

/** 单只宝丽得鸟图（白色边框 + 阴影 + 鸟 + 鸟名便签），整体旋转 */
function drawPolaroidBird(ctx, { x, y, w, h, name, angleDeg }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((angleDeg * Math.PI) / 180);
  shadow(ctx, 'rgba(30,30,30,0.28)', 18, 5, 8);
  // 白色相纸
  ctx.fillStyle = '#fafaf5';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  clearShadow(ctx);
  // 内框线（米色）
  ctx.strokeStyle = '#e8e1d2';
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16);
  // 鸟
  try {
    drawBirdBadge(ctx, { x: 0, y: -10, r: 56, name });
  } catch (e) {
    /* 单只鸟失败不阻塞整张卡 */
  }
  // 鸟名便签（手写体小条）
  ctx.fillStyle = '#3d5548';
  ctx.font = `bold 15px ${FONT_HAND}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 0, h / 2 - 22);
  // 底部"日期"小注（白条上，倾斜更自然）
  ctx.fillStyle = '#8aa096';
  ctx.font = `11px ${FONT_SANS}`;
  ctx.fillText('· 鸟鸣印象 ·', 0, h / 2 - 7);
  ctx.restore();
}

/** 胶带效果（半透明矩形，旋转贴边） */
function drawTape(ctx, { x, y, w, h, angle, color = 'rgba(247, 217, 122, 0.55)' }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  // 胶带边缘的细微条纹感
  ctx.strokeStyle = 'rgba(200,170,80,0.18)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

/** 邮戳（圆形 + 文字环绕） */
function drawStamp(ctx, { x, y, r = 52, text = '林间回响  ·  听见城市' }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.12);
  // 外圈双线
  ctx.strokeStyle = 'rgba(180, 60, 40, 0.85)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r - 5, 0, Math.PI * 2);
  ctx.stroke();
  // 顶部弧形文字（用 fillText 简化排版）
  ctx.fillStyle = 'rgba(180, 60, 40, 0.85)';
  ctx.font = `bold 10px ${FONT_SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, -r + 16);
  // 中心小图样
  ctx.font = `bold 18px ${FONT_HAND}`;
  ctx.fillText('鸟', 0, 6);
  ctx.font = `8px ${FONT_SANS}`;
  ctx.fillText('2026', 0, r - 12);
  ctx.restore();
}

/** 绘制明信片风格分享卡片，返回 { canvas, dataUrl } */
export function drawShareCard(analysis, { width = CARD_W, height = CARD_H } = {}) {
  const data = buildShareCardData(analysis);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const W = width;
  const H = height;
  const gc = gradeColor(data.score);

  // === 1. 背景：米色牛皮纸 + 散落微圆点 ===
  ctx.fillStyle = '#f5efe0';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(170, 150, 110, 0.18)';
  // 撒"颗粒"——固定种子（保证可复现）
  const seed = (n) => ((n * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 240; i++) {
    const x = seed(i * 3 + 1) * W;
    const y = seed(i * 7 + 2) * H;
    const r = 0.6 + seed(i * 11 + 3) * 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 几条"划痕"（做旧）
  ctx.strokeStyle = 'rgba(140, 120, 90, 0.08)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 5; i++) {
    const y = 60 + i * 200;
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.bezierCurveTo(W * 0.3, y - 6, W * 0.6, y + 8, W - 30, y - 2);
    ctx.stroke();
  }

  // === 2. 左上角：胶带（黄/蓝各一条，倾斜贴边） ===
  drawTape(ctx, { x: 130, y: 40, w: 220, h: 32, angle: -0.42, color: 'rgba(247, 217, 122, 0.7)' });
  drawTape(ctx, { x: 600, y: 56, w: 160, h: 22, angle: 0.38, color: 'rgba(150, 195, 240, 0.55)' });

  // === 3. 录音名（手写体，倾斜 -2°） ===
  ctx.save();
  ctx.translate(W / 2, 132);
  ctx.rotate(-0.035);
  ctx.fillStyle = '#22332a';
  ctx.font = `bold 38px ${FONT_HAND}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 长标题缩
  const title = data.title.length > 14 ? `${data.title.slice(0, 13)}…` : data.title;
  ctx.fillText(title, 0, 0);
  ctx.restore();

  // === 4. 时间小字（右下角便签感） ===
  if (data.time) {
    ctx.fillStyle = '#7a8d80';
    ctx.font = `13px ${FONT_SANS}`;
    ctx.textAlign = 'right';
    ctx.fillText(fmtTime(data.time), W - 50, 200);
  }

  // === 5. 评分贴纸（大块彩色圆角矩形 + 大数字 + 等级） ===
  const cardX = W / 2;
  const cardY = 320;
  ctx.save();
  ctx.translate(cardX, cardY);
  ctx.rotate(0.075); // 倾斜 +4.3°
  shadow(ctx, 'rgba(40,30,20,0.22)', 16, 4, 8);
  ctx.fillStyle = '#faf8ee';
  ctx.beginPath();
  // 圆角矩形
  const cw = 260;
  const ch = 120;
  const cr = 18;
  ctx.moveTo(-cw / 2 + cr, -ch / 2);
  ctx.arcTo(cw / 2, -ch / 2, cw / 2, -ch / 2 + cr, cr);
  ctx.arcTo(cw / 2, ch / 2, cw / 2 - cr, ch / 2, cr);
  ctx.arcTo(-cw / 2, ch / 2, -cw / 2, ch / 2 - cr, cr);
  ctx.arcTo(-cw / 2, -ch / 2, -cw / 2 + cr, -ch / 2, cr);
  ctx.closePath();
  ctx.fill();
  clearShadow(ctx);
  // 红色"印章"边
  ctx.strokeStyle = gc;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // 大数字
  ctx.fillStyle = gc;
  ctx.font = `bold 76px ${FONT_SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(data.score), 0, -8);
  // 等级
  ctx.fillStyle = '#22332a';
  ctx.font = `bold 18px ${FONT_HAND}`;
  ctx.fillText(data.grade, 0, 40);
  ctx.restore();

  // === 6. 三张宝丽得鸟图（错落旋转） ===
  const polaroids = [
    { x: W / 2 - 170, y: 580, name: data.topSpecies[0]?.name },
    { x: W / 2 + 10, y: 540, name: data.topSpecies[1]?.name },
    { x: W / 2 + 190, y: 600, name: data.topSpecies[2]?.name },
  ];
  const angles = [-0.16, 0.09, -0.07]; // -9° / +5° / -4°
  if (data.topSpecies.length) {
    polaroids.forEach((p, i) => {
      if (!p.name) return;
      try {
        drawPolaroidBird(ctx, { x: p.x, y: p.y, w: 200, h: 230, name: p.name, angleDeg: (angles[i] || 0) * (180 / Math.PI) });
      } catch (e) {
        /* 单只拍立得失败不阻塞整张卡 */
      }
    });
  } else {
    ctx.fillStyle = '#8aa096';
    ctx.font = `15px ${FONT_HAND}`;
    ctx.textAlign = 'center';
    ctx.fillText('· 这次没听到鸟 ·', W / 2, 580);
  }

  // === 7. 三维度（手写小字横排） ===
  const dims = [
    { k: '生物', v: data.bio },
    { k: '声境', v: data.sound },
    { k: '噪声', v: data.noise },
  ];
  ctx.fillStyle = '#3d5548';
  ctx.font = `bold 14px ${FONT_HAND}`;
  ctx.textAlign = 'center';
  const baseX = W / 2;
  dims.forEach((d, i) => {
    const x = baseX + (i - 1) * 140;
    ctx.fillText(`${d.k} ${d.v == null ? '—' : d.v}`, x, 770);
  });

  // === 8. 鸟种小字（手写体，倾斜小纸条） ===
  if (data.speciesNames.length) {
    ctx.save();
    ctx.translate(W / 2, 815);
    ctx.rotate(-0.03);
    ctx.fillStyle = '#5b7266';
    ctx.font = `13px ${FONT_HAND}`;
    ctx.textAlign = 'center';
    const names = data.speciesNames.join('、');
    const maxW = W - 100;
    let txt = names;
    while (ctx.measureText(txt + '…').width > maxW && txt.length > 1) txt = txt.slice(0, -1);
    if (txt !== names) txt += '…';
    ctx.fillText(txt, 0, 0);
    ctx.restore();
  }

  // === 9. 邮戳 + 品牌字标（右下角） ===
  drawStamp(ctx, { x: W - 95, y: H - 110, r: 46 });

  // 品牌字标（手写盖章风，左下角）
  ctx.save();
  ctx.translate(60, H - 75);
  ctx.rotate(-0.06);
  ctx.fillStyle = '#1b5e3f';
  ctx.font = `bold 22px ${FONT_HAND}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('《林间回响》', 0, 0);
  ctx.fillStyle = '#5b7266';
  ctx.font = `12px ${FONT_HAND}`;
  ctx.fillText('用鸟声读懂城市', 0, 22);
  ctx.restore();

  return { canvas, dataUrl: canvas.toDataURL('image/png') };
}
