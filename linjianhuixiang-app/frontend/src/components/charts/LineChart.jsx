/**
 * LineChart.jsx
 * 地区趋势折线图（SVG）：
 *  - x 轴 = 测量记录时间顺序（日期紧凑标签 MM-DD）；
 *  - y 轴 = 数值（0–100）；
 *  - 两条折线：宜居度 score（forest-500 #2e7d52）与 人为噪声 noise（clay #c25a39）。
 * 数据从 records[].detail.livability 提取；少于 2 条有效记录时提示「至少 2 次测量才能对比趋势」。
 */
import { formatShortISODate } from '../../utils/dates.js';

const COLOR_SCORE = '#2e7d52'; // forest-500
const COLOR_NOISE = '#c25a39'; // clay

export default function LineChart({ records }) {
  const points = (Array.isArray(records) ? records : [])
    .filter(
      (r) =>
        r &&
        r.detail &&
        r.detail.livability &&
        typeof r.detail.livability.score === 'number' &&
        typeof r.detail.livability.noise === 'number'
    )
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
    .map((r) => ({
      label: formatShortISODate(r.created_at),
      score: r.detail.livability.score,
      noise: r.detail.livability.noise,
    }));

  // 空数据守卫
  if (points.length === 0) {
    return <div className="cap">暂无该地区的测量数据</div>;
  }
  // 少于 2 次测量无法对比趋势
  if (points.length < 2) {
    return <div className="cap">至少 2 次测量才能对比趋势</div>;
  }

  const W = 320;
  const H = 170;
  const padL = 26;
  const padR = 14;
  const padT = 16;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const y = (v) => padT + (1 - Math.max(0, Math.min(100, v)) / 100) * plotH;
  const x = (i) => padL + (i / (points.length - 1)) * plotW;

  const linePath = (key) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      {/* 背景横向参考线（0/25/50/75/100） */}
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line
            x1={padL}
            x2={W - padR}
            y1={y(v)}
            y2={y(v)}
            stroke={v === 50 ? '#c4e6d2' : '#eef3ef'}
            strokeWidth="1"
            strokeDasharray={v === 50 ? '0' : '3 3'}
          />
          <text x={padL - 4} y={y(v) + 3} fontSize="8" fill="#8a9a8f" textAnchor="end" fontFamily="Space Grotesk">
            {v}
          </text>
        </g>
      ))}

      {/* 两条折线 */}
      <path d={linePath('score')} fill="none" stroke={COLOR_SCORE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={linePath('noise')} fill="none" stroke={COLOR_NOISE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* 数据点 */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i).toFixed(1)} cy={y(p.score).toFixed(1)} r="3.5" fill={COLOR_SCORE} stroke="#fff" strokeWidth="1.5" />
          <circle cx={x(i).toFixed(1)} cy={y(p.noise).toFixed(1)} r="3.5" fill={COLOR_NOISE} stroke="#fff" strokeWidth="1.5" />
        </g>
      ))}

      {/* x 轴日期标签 */}
      {points.map((p, i) => (
        <text key={i} x={x(i).toFixed(1)} y={H - 6} fontSize="8.5" fill="#8a9a8f" textAnchor="middle" fontFamily="Space Grotesk">
          {p.label}
        </text>
      ))}

      {/* 图例 */}
      <g transform="translate(120, 5)">
        <circle cx="4" cy="5" r="3" fill={COLOR_SCORE} />
        <text x="11" y="8.5" fontSize="9" fill="#3c4d42" fontFamily="Manrope">宜居度</text>
        <circle cx="70" cy="5" r="3" fill={COLOR_NOISE} />
        <text x="77" y="8.5" fontSize="9" fill="#3c4d42" fontFamily="Manrope">噪声%</text>
      </g>
    </svg>
  );
}
