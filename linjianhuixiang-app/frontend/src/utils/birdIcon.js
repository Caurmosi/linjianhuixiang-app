/**
 * birdIcon.js —— 参数化卡通小鸟绘制（canvas）
 *
 * 同一鸟形模板 + 按物种特征参数化：主色取自鸟种图鉴 icon 色。
 * 特征：冠羽（凤头/冠/戴胜）、长尾（蓝鹊/卷尾/长尾）、长喙（翠鸟/翡翠/啄木）、水禽体型（更圆）。
 * 全部用 arc + quadraticCurveTo（避开 ellipse 以兼容老版 WebView）。
 * 零外部资源、离线可用、风格统一。
 */
import { BIRD_BOOK } from '../data/birdBook.js';

function hexRgb(hex) {
  const h = String(hex || '#7aa86a').replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 128);
}

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
    crest: /凤头|冠|戴胜|雀鹎/.test(n),
    longTail: /蓝鹊|卷尾|长尾|寿带|绶带|鹡鸰/.test(n),
    longBeak: /翠鸟|翡翠|啄木|蜡嘴/.test(n),
    slaty: /白鹭|苍鹭|鸳鸯|鸭|鸥/.test(n),
  };
}

/** 椭圆路径（用 4 段贝塞尔近似，兼容无 ellipse 的环境） */
function ellipsePath(ctx, cx, cy, rx, ry) {
  ctx.beginPath();
  ctx.moveTo(cx + rx, cy);
  ctx.bezierCurveTo(cx + rx, cy + ry * 0.55, cx + rx * 0.55, cy + ry, cx, cy + ry);
  ctx.bezierCurveTo(cx - rx * 0.55, cy + ry, cx - rx, cy + ry * 0.55, cx - rx, cy);
  ctx.bezierCurveTo(cx - rx, cy - ry * 0.55, cx - rx * 0.55, cy - ry, cx, cy - ry);
  ctx.bezierCurveTo(cx + rx * 0.55, cy - ry, cx + rx, cy - ry * 0.55, cx + rx, cy);
  ctx.closePath();
}

/** 在 (cx, cy) 处画一只侧身站立的卡通鸟 */
export function drawBirdIcon(ctx, { cx, cy, scale = 1, name = '鸟' }) {
  const traits = birdTraits(name);
  const book = BIRD_BOOK.find((b) => b.name === name);
  const main = hexRgb(book ? book.icon : '#7aa86a');
  const { dark, light } = shades(main);
  const leg = hexRgb('#c98a4b');
  const beak = hexRgb('#e8a33d');
  const s = scale;
  const S = (v) => v * s;

  ctx.save();
  try {
    ctx.translate(cx, cy);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 腿
    ctx.beginPath();
    ctx.strokeStyle = css(leg);
    ctx.lineWidth = S(2.5);
    ctx.moveTo(S(-5), S(14));
    ctx.lineTo(S(-7), S(28));
    ctx.moveTo(S(7), S(14));
    ctx.lineTo(S(9), S(28));
    ctx.stroke();

    // 尾羽
    const tailLen = traits.longTail ? S(40) : S(20);
    ctx.beginPath();
    ctx.fillStyle = css(dark);
    ctx.moveTo(S(-14), S(4));
    ctx.quadraticCurveTo(S(-16 - tailLen * 0.55), S(-2), S(-16 - tailLen), S(10));
    ctx.quadraticCurveTo(S(-16 - tailLen * 0.6), S(18), S(-12), S(14));
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = S(1.5);
    ctx.strokeStyle = css(dark);
    ctx.stroke();

    // 身体
    const bodyW = traits.slaty ? S(24) : S(20);
    const bodyH = traits.slaty ? S(20) | 0 : S(24);
    ellipsePath(ctx, 0, 0, bodyW, bodyH);
    ctx.fillStyle = css(main);
    ctx.fill();
    ctx.lineWidth = S(1.5);
    ctx.strokeStyle = css(dark);
    ctx.stroke();

    // 腹部（浅色，覆盖在身体下半部分）
    ellipsePath(ctx, S(3), S(5), S(bodyW * 0.55), S(bodyH * 0.55));
    ctx.fillStyle = css(light);
    ctx.fill();

    // 翅膀
    ctx.beginPath();
    ctx.fillStyle = css(dark);
    ctx.moveTo(S(-7), S(-5));
    ctx.quadraticCurveTo(S(-16), S(0), S(-9), S(10));
    ctx.quadraticCurveTo(S(-3), S(7), S(-7), S(-5));
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = S(1.4);
    ctx.stroke();

    // 头
    const headR = S(10);
    ctx.beginPath();
    ctx.arc(S(15), S(-13), headR, 0, Math.PI * 2);
    ctx.fillStyle = css(main);
    ctx.fill();
    ctx.lineWidth = S(1.4);
    ctx.stroke();

    // 羽冠
    if (traits.crest) {
      ctx.beginPath();
      ctx.fillStyle = css(dark);
      ctx.moveTo(S(13), S(-22));
      ctx.quadraticCurveTo(S(18), S(-34), S(25), S(-28));
      ctx.quadraticCurveTo(S(23), S(-22), S(20), S(-20));
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = S(1.3);
      ctx.stroke();
    }

    // 喙
    const beakLen = traits.longBeak ? S(13) : S(8);
    ctx.beginPath();
    ctx.fillStyle = css(beak);
    ctx.moveTo(S(23), S(-15));
    ctx.lineTo(S(23 + beakLen), S(-10));
    ctx.lineTo(S(23), S(-9));
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = S(1.2);
    ctx.stroke();

    // 眼
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(S(17), S(-14), S(3), 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = '#222';
    ctx.arc(S(18), S(-14), S(1.6), 0, Math.PI * 2);
    ctx.fill();
  } finally {
    ctx.restore();
  }
}

/** 拍立得/徽章底座 + 鸟（分享卡片用） */
export function drawBirdBadge(ctx, { x, y, r = 62, name = '鸟' }) {
  const book = BIRD_BOOK.find((b) => b.name === name);
  const bg = book ? hexRgb(book.icon) : [122, 168, 106];
  ctx.save();
  try {
    // 浅色圆底
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${bg[0]},${bg[1]},${bg[2]},0.14)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${bg[0]},${bg[1]},${bg[2]},0.35)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawBirdIcon(ctx, { cx: x, cy: y + 6, scale: r / 42, name });
  } catch (e) {
    /* 单只鸟失败不阻塞整张卡；finally 仍会 restore */
  } finally {
    ctx.restore();
  }
}
