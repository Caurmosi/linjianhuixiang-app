/**
 * exportReport.js
 * 报告导出：用纯 canvas 手绘摘要卡（零新增依赖），
 * 导出为 PNG。
 * - 真机（window.AndroidBridge.saveImage 存在）：写入系统相册（MediaStore）
 * - 浏览器 / 无桥：降级为 a[download] 下载
 * 文件名：linjianhuixiang-report.png
 */
import { gradeOf } from '../data/repository';

/** 圆角矩形路径（仅绘制，不填充/描边） */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 绘制一条带标签的进度条 */
function bar(ctx, x, y, w, label, value, color) {
  const v = Math.max(0, Math.min(100, value));
  ctx.fillStyle = '#0e2a1f';
  ctx.font = '600 15px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x, y + 18);
  ctx.fillStyle = '#7a8f83';
  ctx.font = '800 18px "Manrope", "PingFang SC", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(String(v), x + w, y + 18);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ece7da';
  roundRect(ctx, x, y + 28, w, 12, 6);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, x, y + 28, Math.max(12, w * (v / 100)), 12, 6);
  ctx.fill();
}

/**
 * 导出宜居度摘要报告
 * @param {object} analysis buildAnalysis 输出
 * @returns {Promise<boolean>} 是否成功保存/触发下载
 */
export async function exportReport(analysis) {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 960;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const a = analysis || {};
  const liv = a.livability || {};
  const score = typeof liv.score === 'number' ? liv.score : 68;
  const g = gradeOf(score);
  const toneColor = g.tone === 'good' ? '#2e7d52' : g.tone === 'bad' ? '#c25a39' : '#d49a26';

  // 背景
  ctx.fillStyle = '#f7f4ec';
  ctx.fillRect(0, 0, 720, 960);

  // 顶部绿色横幅 + 装饰圆
  ctx.fillStyle = '#1e5c3c';
  ctx.fillRect(0, 0, 720, 240);
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#c4e6d2';
  ctx.beginPath();
  ctx.arc(620, 30, 170, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(70, 235, 130, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 34px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('林间回响 · 宜居度报告', 48, 92);
  ctx.fillStyle = '#d9efe4';
  ctx.font = '500 15px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('城市鸟类宜居度智能诊断', 48, 122);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '500 14px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('录音：' + (a.recording || '中山公园_晨.wav'), 48, 165);

  // 得分卡片
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 48, 268, 624, 212, 24);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,92,60,0.12)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 48, 268, 624, 212, 24);
  ctx.stroke();

  ctx.fillStyle = '#0e2a1f';
  ctx.font = '700 16px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('鸟类宜居度', 80, 318);

  ctx.fillStyle = toneColor;
  ctx.font = '800 76px "Manrope", "PingFang SC", sans-serif';
  ctx.fillText(String(score), 80, 414);
  ctx.fillStyle = '#7a8f83';
  ctx.font = '600 18px "Manrope", "PingFang SC", sans-serif';
  ctx.fillText('/100', 212, 414);

  // 等级徽章
  const chipW = 138;
  const chipH = 40;
  const chipX = 470;
  const chipY = 372;
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = toneColor;
  roundRect(ctx, chipX, chipY, chipW, chipH, 20);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = toneColor;
  ctx.font = '700 19px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(g.zh + ' · ' + g.en, chipX + chipW / 2, chipY + 26);
  ctx.textAlign = 'left';

  // 统计四格
  const stats = [
    { label: '识别鸟种', value: String(a.speciesCount ?? 0) },
    { label: '人为噪声占比', value: (liv.noise ?? 0) + '%' },
    { label: '生物多样性', value: String(liv.bio ?? 0) },
    { label: '声环境质量', value: String(liv.sound ?? 0) },
  ];
  const cellW = 624 / 4;
  stats.forEach((s, i) => {
    const x = 48 + cellW * i;
    ctx.fillStyle = '#0e2a1f';
    ctx.font = '800 30px "Manrope", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.value, x + cellW / 2, 558);
    ctx.fillStyle = '#7a8f83';
    ctx.font = '500 13px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(s.label, x + cellW / 2, 584);
    ctx.textAlign = 'left';
  });

  // 指标条
  bar(ctx, 48, 642, 624, '生物多样性', liv.bio ?? 0, '#2e7d52');
  bar(ctx, 48, 706, 624, '声环境质量', liv.sound ?? 0, '#d49a26');

  // 说明
  ctx.fillStyle = '#7a8f83';
  ctx.font = '500 13px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('报告由《林间回响》演示原型生成，数据为 mock 样例，仅供产品演示。', 48, 806);

  // 底部
  const date = new Date();
  const ds =
    date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  ctx.fillStyle = '#b9c8bf';
  ctx.font = '500 12px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('《林间回响》 v1.0.0 · 生成于 ' + ds, 48, 920);

  const url = canvas.toDataURL('image/png');

  // 真机：优先走原生桥写入系统相册（MediaStore），成功后图片出现在手机相册
  const bridge = typeof window !== 'undefined' ? window.AndroidBridge : null;
  if (bridge && typeof bridge.saveImage === 'function') {
    try {
      return bridge.saveImage(url, 'linjianhuixiang-report.png') === true;
    } catch (err) {
      // 桥调用异常 → 降级为 a[download] 方案
    }
  }

  // 浏览器 / 无桥环境：a[download] 触发下载
  const link = document.createElement('a');
  link.href = url;
  link.download = 'linjianhuixiang-report.png';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return true;
}
