/**
 * ScatterChart.jsx
 * 噪声–多样性耦合散点图（SVG，复用原型绘制逻辑）
 * 横轴：人为噪声 0-100；纵轴：多样性 0-100；趋势线 + 当前样本标注
 */
export default function ScatterChart({ noise = 34, diversity = 76 }) {
  const W = 320;
  const H = 180;
  const pad = 34;
  const x0 = pad;
  const y0 = H - pad;
  const x1 = W - 8;
  const y1 = 10;
  const nx = (v) => x0 + (v / 100) * (x1 - x0);
  const ny = (v) => y0 + (v / 100) * (y1 - y0);
  const px = nx(noise);
  const py = ny(diversity);
  const ticks = [0, 25, 50, 75, 100];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      {/* 网格 + 刻度 */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={nx(t)} y1={y1} x2={nx(t)} y2={y0} stroke="#ece7da" strokeWidth="1" />
          <line x1={x0} y1={ny(t)} x2={x1} y2={ny(t)} stroke="#ece7da" strokeWidth="1" />
          <text x={nx(t)} y={y0 + 14} fontSize="9" fill="#8a9a8f" textAnchor="middle" fontFamily="Space Grotesk">
            {t}
          </text>
          <text x={x0 - 6} y={ny(t) + 3} fontSize="9" fill="#8a9a8f" textAnchor="end" fontFamily="Space Grotesk">
            {t}
          </text>
        </g>
      ))}
      {/* 趋势线：diversity ~ 95 - 0.6*noise */}
      <line
        x1={nx(0)}
        y1={ny(95)}
        x2={nx(100)}
        y2={ny(35)}
        stroke="#c25a39"
        strokeWidth="1.6"
        strokeDasharray="5 4"
        opacity="0.55"
      />
      {/* 当前样本 */}
      <circle cx={px} cy={py} r="9" fill="#2e7d52" opacity="0.18" />
      <circle cx={px} cy={py} r="5.5" fill="#2e7d52" stroke="#fff" strokeWidth="2" />
      {/* 轴标签 */}
      <text x={x1} y={y1 - 2} fontSize="9" fill="#56695e" textAnchor="end" fontFamily="Manrope">
        多样性 ↑
      </text>
      <text x={x0} y={y0 + 28} fontSize="9" fill="#56695e" fontFamily="Manrope">
        噪声 →
      </text>
      <text x={px} y={py - 14} fontSize="9.5" fill="#1f5a3f" fontWeight="700" textAnchor="middle" fontFamily="Manrope">
        当前样本
      </text>
    </svg>
  );
}
