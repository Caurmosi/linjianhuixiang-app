/**
 * MapChart.jsx
 * 空间样点分布图（SVG，复用原型绿地/水景/样点绘制逻辑）
 */
export default function MapChart({ points }) {
  const W = 320;
  const H = 170;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      {/* 有机绿地轮廓 */}
      <path
        d="M20 40 Q90 10 170 35 T300 50 Q310 110 250 140 Q160 165 70 140 Q10 110 20 40Z"
        fill="#e6f3ea"
        stroke="#c4e6d2"
        strokeWidth="1.5"
      />
      <path d="M60 90 Q120 70 180 95 Q200 130 150 145 Q90 150 60 120Z" fill="#c4e6d2" opacity="0.7" />
      {/* 水景 */}
      <ellipse cx="235" cy="60" rx="26" ry="16" fill="#bfe0f0" opacity="0.6" />
      <text x="232" y="64" fontSize="9" fill="#3a6b82" textAnchor="middle" fontFamily="Manrope">
        水景
      </text>
      {/* 样点 */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="8" fill={p.c} opacity="0.22" />
          <circle cx={p.x} cy={p.y} r="4.5" fill={p.c} stroke="#fff" strokeWidth="1.8" />
          {p.t && (
            <text x={p.x} y={p.y - 12} fontSize="9" fill={p.c} fontWeight="700" textAnchor="middle" fontFamily="Manrope">
              {p.t}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
