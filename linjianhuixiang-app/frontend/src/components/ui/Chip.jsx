/**
 * Chip.jsx
 * 标签 / 徽章：default | good | mid | bad
 */
export default function Chip({ tone = 'default', children, className = '' }) {
  const cls = tone === 'default' ? '' : tone;
  return <span className={`chip ${cls} ${className}`}>{children}</span>;
}
