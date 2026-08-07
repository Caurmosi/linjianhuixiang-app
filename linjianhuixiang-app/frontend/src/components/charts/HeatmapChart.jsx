/**
 * HeatmapChart.jsx
 * 时段 × 频段 鸟声活跃度热力图（SVG，复用原型数据与配色）
 */
export default function HeatmapChart({ data }) {
  const cols = 12;
  const rows = 4;
  const W = 320;
  const H = 150;
  const padL = 6;
  const padT = 6;
  const padB = 18;
  const cw = (W - padL * 2) / cols;
  const ch = (H - padT - padB) / rows;
  const labels = ['0', '3', '6', '9', '12', '15', '18', '21', '24'];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      {data.map((row, r) =>
        row.map((v, c) => (
          <rect
            key={`${r}-${c}`}
            x={(padL + c * cw).toFixed(1)}
            y={(padT + r * ch).toFixed(1)}
            width={(cw - 2).toFixed(1)}
            height={(ch - 2).toFixed(1)}
            rx="3"
            fill={`rgba(31,90,63,${(0.12 + v * 0.85).toFixed(2)})`}
          />
        ))
      )}
      {labels.map((l, i) => {
        const lx = padL + (i / 8) * (W - padL * 2);
        return (
          <text key={l} x={lx.toFixed(1)} y={H - 5} fontSize="8.5" fill="#8a9a8f" textAnchor="middle" fontFamily="Space Grotesk">
            {l}
          </text>
        );
      })}
    </svg>
  );
}
