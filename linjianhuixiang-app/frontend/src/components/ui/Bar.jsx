/**
 * Bar.jsx
 * 进度条（0-100），支持自定义渐变
 */
export default function Bar({ value = 0, color, height }) {
  const v = Math.min(100, Math.max(0, value));
  const bg = color || 'linear-gradient(90deg,var(--forest-400),var(--forest-600))';
  return (
    <div className="bar" style={height ? { height } : undefined}>
      <i style={{ width: `${v}%`, background: bg }} />
    </div>
  );
}
