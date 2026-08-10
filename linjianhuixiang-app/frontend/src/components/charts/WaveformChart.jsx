/**
 * WaveformChart.jsx
 * 录音波形图（SVG 竖线 bar，复用现有图表风格：viewBox、无 axis、圆角）
 * data：number 数组（[0,1] 峰值包络）；height 默认 64；color 默认森林绿
 */
export default function WaveformChart({ data, height = 64, color = 'var(--forest-500)' }) {
  const W = 320;
  const H = height;
  const hasData = Array.isArray(data) && data.length > 0;

  if (!hasData) {
    return (
      <div
        style={{
          height: H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: '#8a9a8f',
        }}
      >
        暂无波形
      </div>
    );
  }

  const pad = 2;
  const barW = (W - pad * 2) / data.length;
  const cy = H / 2;
  const maxH = H - 4;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      {data.map((v, i) => {
        const h = Math.max(1.5, Math.min(1, v) * maxH);
        const bw = Math.max(1, barW * 0.7);
        return (
          <rect
            key={i}
            x={(pad + i * barW + (barW - bw) / 2).toFixed(2)}
            y={(cy - h / 2).toFixed(2)}
            width={bw.toFixed(2)}
            height={h.toFixed(2)}
            rx="1"
            fill={color}
            opacity={(0.3 + 0.7 * v).toFixed(2)}
          />
        );
      })}
    </svg>
  );
}
