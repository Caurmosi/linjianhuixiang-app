/**
 * TrendChart.jsx —— 宜居度趋势折线图（纯 SVG，无图表库依赖）
 * 输入 points: [{date, score, confidence, noise}]（时间升序）
 * 画 score 主折线 + 点标注；Y 轴 0-100；hover 显示值（简化：点旁 title）
 */
import { useMemo } from 'react';

const W = 560;
const H = 180;
const PAD_L = 34;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 26;

function linePath(pts, x, y) {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
}

export default function TrendChart({ points }) {
  const data = useMemo(() => (Array.isArray(points) ? points : []), [points]);
  if (!data.length) return <div className="ljx-trend-empty">暂无趋势数据（需要同一地区多次采样）</div>;

  const n = data.length;
  const x = (i) => (n === 1 ? PAD_L + (W - PAD_L - PAD_R) / 2 : PAD_L + (i * (W - PAD_L - PAD_R)) / (n - 1));
  const y = (v) => PAD_T + (1 - Math.max(0, Math.min(100, v)) / 100) * (H - PAD_T - PAD_B);
  const path = linePath(data, x, y);

  // Y 轴网格线 0/25/50/75/100
  const grid = [0, 25, 50, 75, 100].map((v) => (
    <g key={v}>
      <line x1={PAD_L} y1={y(v)} x2={W - PAD_R} y2={y(v)} stroke="#e8eeea" strokeWidth="1" />
      <text x={PAD_L - 6} y={y(v) + 3.5} textAnchor="end" fontSize="9" fill="#8aa096">{v}</text>
    </g>
  ));

  return (
    <div className="ljx-trend">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="宜居度趋势折线图">
        {grid}
        <path d={path} fill="none" stroke="#2e7d52" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((p, i) => (
          <g key={`${p.date}-${i}`}>
            <circle cx={x(i)} cy={y(p.score)} r="3.5" fill="#2e7d52" stroke="#fff" strokeWidth="1.5">
              <title>{`${p.date} · ${p.score} 分${p.noise != null ? ` · 噪声 ${p.noise}%` : ''}`}</title>
            </circle>
            <text x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="9" fill="#5b7266">
              {p.date}
            </text>
          </g>
        ))}
      </svg>
      <div className="ljx-trend-legend">
        <span className="ljx-trend-dot" /> 宜居度评分（0-100）　·　共 {n} 次采样
      </div>
    </div>
  );
}
