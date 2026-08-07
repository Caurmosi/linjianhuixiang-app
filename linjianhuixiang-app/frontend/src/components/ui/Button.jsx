/**
 * Button.jsx
 * 按钮：primary | ghost | sun，支持图标
 */
export default function Button({ variant = 'primary', icon, children, onClick, className = '', disabled = false }) {
  return (
    <button className={`btn ${variant} ${className}`} onClick={onClick} disabled={disabled}>
      {icon}
      {children}
    </button>
  );
}
