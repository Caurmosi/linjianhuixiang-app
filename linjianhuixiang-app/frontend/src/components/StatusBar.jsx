/**
 * StatusBar.jsx
 * 顶部状态栏：时间 / 信号 / 电池（与原型一致）
 */
export default function StatusBar({ time = '9:41' }) {
  return (
    <div className="statusbar">
      <span>{time}</span>
      <span className="flex items-center gap-[7px]">
        <span className="text-[12px]">5G</span>
        <span className="bat">
          <i />
        </span>
      </span>
    </div>
  );
}
