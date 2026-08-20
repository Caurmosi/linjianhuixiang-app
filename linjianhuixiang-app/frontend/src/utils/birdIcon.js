/**
 * birdIcon.js —— 参数化卡通小鸟绘制（canvas）
 *
 * 同一鸟形模板 + 按物种特征参数化：主色取自鸟种图鉴 icon 色，特征按鸟名关键词判断。
 * 特征：冠羽（凤头/冠/戴胜）、长尾（蓝鹊/卷尾/长尾）、长喙（翠鸟/翡翠/啄木）。
 * 零外部资源、离线可用、风格统一。
 */
import { BIRD_BOOK } from '../data/birdBook.js';

/** hex → [r,g,b] */
function hexRgb(hex) {
  const h = String(hex || '#889988').replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 128);
}

/** 主色 → 深一档（翅膀/描边）与浅一档（腹部） */
function shades(rgb, kDark = 0.72, kLight = 1.35) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const dark = rgb.map((v) => clamp(v * kDark));
  const light = rgb.map((v) => clamp(Math.min(255, v * kLight)));
  return { dark, light };
}

const css = (rgb) => `rgb(${rgb.join(',')})`;

/** 按鸟名判断特征 */
export function birdTraits(name) {
  const n = String(name || '');
  return {
    crest: /凤头|冠|戴胜|雀鹎/.test(n),       // 头顶羽冠
    longTail: /蓝鹊|卷尾|长尾|寿带|绶带|鹡鸰/.test(n), // 长尾
    longBeak: /翠鸟|翡翠|啄木|蜡嘴/.test(n),   // 长喙
    slaty: /白鹭|苍鹭|鸳鸯|鸭|鸥/.test(n),     // 水禽 → 更圆的体型
  };
}

/** 在 (cx, cy) 处画一只侧身站立的卡通鸟（canvas 2D） */
export function drawBirdIcon(ctx, { cx, cy, scale = 1, name = '鸟' }) {
  const traits = birdTraits(name);
  const book = BIRD_BOOK.find((b) => b.name === name);
  const main = hexRgb(book ? book.icon : '#7aa86a');
  const { dark, light } = shades(main);
  const s = scale;
  const S = (v) => v * s;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = S(2.4);
  ctx.strokeStyle = css(dark);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 腿
  ctx.beginPath();
  ctx.strokeStyle = css(shades(hexRgb('#c98a4b'))[0]);
  ctx.lineWidth = S(3);
  ctx.moveTo(S(-6), S(16));
  ctx.lineTo(S(-8), S(30));
  ctx.moveTo(S(8), S(16));
  ctx.lineTo(S(10), S(30));
  ctx.stroke();

  // 尾羽
  ctx.beginPath();
  ctx.fillStyle = css(dark);
  const tailLen = traits.longTail ? S(46) : S(22);
  ctx.moveTo(S(-16), S(6));
  ctx.quadraticCurveTo(S(-18 - tailLen * 0.6), S(-2), S(-18 - tailLen), S(12));
  ctx.quadraticCurveTo(S(-18 - tailLen * 0.7), S(20), S(-14), S(16));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 身体（椭圆）
  const bodyW = traits.slaty ? S(26) : S(22);
  const bodyH = traits.slaty ? S(22) : S(26);
  ctx.beginPath();
  ctx.ellipse(S(0), S(0), bodyW, bodyH, 0, 0, Math.PI * 2);
  ctx.fillStyle = css(main);
  ctx.fill();
  ctx.stroke();

  // 腹部（浅色）
  ctx.beginPath();
  ctx.ellipse(S(4), S(6), bodyW * 0.55, bodyH * 0.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = css(light);
  ctx.fill();

  // 翅膀
  ctx.beginPath();
  ctx.moveTo(S(-8), S(-6));
  ctx.quadraticCurveTo(S(-18), S(0), S(-10), S(12));
  ctx.quadraticCurveTo(S(-4), S(8), S(-8), S(-6));
  ctx.closePath();
  ctx.fillStyle = css(dark);
  ctx.fill();
  ctx.stroke();

  // 头
  const headR = S(11);
  ctx.beginPath();
  ctx.arc(S(16), S(-14), headR, 0, Math.PI * 2);
  ctx.fillStyle = css(main);
  ctx.fill();
  ctx.stroke();

  // 羽冠（凤头）
  if (traits.crest) {
    ctx.beginPath();
    ctx.moveTo(S(14), S(-24));
    ctx.quadraticCurveTo(S(20), S(-38), S(28), S(-32));
    ctx.quadraticCurveTo(S(26), S(-24), S(22), S(-22));
    ctx.closePath();
    ctx.fillStyle = css(dark);
    ctx.fill();
    ctx.stroke();
  }

  // 喙
  const beakLen = traits.longBeak ? S(14) : S(9);
  ctx.beginPath();
  ctx.moveTo(S(25), S(-16));
  ctx.lineTo(S(25 + beakLen), S(-11));
  ctx.lineTo(S(25), S(-10));
  ctx.closePath();
  ctx.fillStyle = css(shades(hexRgb('#e8a33d'))[0]);
  ctx.fill();
  ctx.stroke();

  // 眼
  ctx.beginPath();
  ctx.arc(S(19), S(-15), S(3.2), 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(S(20), S(-15), S(1.8), 0, Math.PI * 2);
  ctx.fillStyle = '#222222';
  ctx.fill();

  ctx.restore();
}

/** 在圆底上画一只鸟（分享卡片鸟图用） */
export function drawBirdBadge(ctx, { x, y, r = 46, name = '鸟' }) {
  // 浅色圆底
  const book = BIRD_BOOK.find((b) => b.name === name);
  const bg = book ? hexRgb(book.icon) : [122, 168, 106];
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${bg[0]},${bg[1]},${bg[2]},0.14)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${bg[0]},${bg[1]},${bg[2]},0.35)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawBirdIcon(ctx, { cx: x, cy: y + 6, scale: r / 42, name });
  ctx.restore();
}
