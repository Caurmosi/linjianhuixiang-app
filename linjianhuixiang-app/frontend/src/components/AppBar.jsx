/**
 * AppBar.jsx
 * 页面标题栏：返回按钮 + 标题 + 右侧操作区
 */
import { IconBack } from './icons';

export default function AppBar({ title, onBack, right }) {
  return (
    <div className="appbar">
      <button className="back" onClick={onBack} aria-label="返回">
        <IconBack size={18} />
      </button>
      <h2>{title}</h2>
      <span className="flex-1" />
      {right || <span />}
    </div>
  );
}
