/**
 * Toggle.jsx
 * 受控开关
 */
export default function Toggle({ checked = false, onChange }) {
  return (
    <div
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChange(!checked);
        }
      }}
    >
      <i />
    </div>
  );
}
