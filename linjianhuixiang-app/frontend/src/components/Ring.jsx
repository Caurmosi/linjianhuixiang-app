/**
 * Ring.jsx
 * 宜居度环形进度组件（conic-gradient），支持 --p 百分比与等级配色
 */

function gradeColor(value) {
  if (value >= 70) return 'var(--liv-good)';
  if (value >= 50) return 'var(--liv-mid)';
  return 'var(--liv-bad)';
}

export default function Ring({ value = 0, size = 128, color, track = 'rgba(255,255,255,.16)', den = true, sm = false }) {
  const v = Math.min(100, Math.max(0, value));
  const fill = color || gradeColor(v);
  const style = {
    width: size,
    height: size,
    background: `conic-gradient(${fill} ${v}%, ${track} 0)`,
  };
  return (
    <div className={`ring ${sm ? 'sm' : ''}`} style={style}>
      <div className="ring-inner">
        <span className="ring-num">{v}</span>
        {den && <span className="ring-den">/100</span>}
      </div>
    </div>
  );
}
