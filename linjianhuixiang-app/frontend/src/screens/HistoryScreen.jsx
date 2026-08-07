/**
 * HistoryScreen.jsx
 * 历史记录：完整列表（最近分析 / 更早），点击回放进入结果页
 */
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import { analysisForHistory } from '../data/mockData';
import { IconBird, IconClock, IconChevronRight } from '../components/icons';

export default function HistoryScreen() {
  const { state, dispatch } = useApp();
  const items = state.history || [];
  const recent = items.slice(0, 1);
  const earlier = items.slice(1);

  const open = (item) => {
    dispatch({ type: 'LOAD_HISTORY', analysis: analysisForHistory(item) });
  };

  const renderItem = (item) => (
    <div key={item.id} className="recent" onClick={() => open(item)}>
      <div className="thumb">
        <IconBird size={22} />
      </div>
      <div className="meta">
        <b>{item.name}</b>
        <span>
          {item.duration} · {item.species} 种鸟 · 宜居度 {item.score}
        </span>
      </div>
      <span className="go">
        <IconChevronRight size={16} />
      </span>
    </div>
  );

  return (
    <div>
      <AppBar title="历史记录" onBack={() => dispatch({ type: 'BACK' })} />

      {items.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-[13px] font-bold">暂无历史记录</p>
          <p className="text-[11.5px] text-ink-soft mt-1">完成一次分析后会自动出现在这里</p>
        </div>
      ) : (
        <>
          {recent.length > 0 && (
            <>
              <div className="eyebrow mb-2.5">最近分析</div>
              {recent.map((item) => renderItem(item))}
            </>
          )}
          {earlier.length > 0 && (
            <>
              <div className="eyebrow mb-2.5 mt-5">更早</div>
              {earlier.map((item) => renderItem(item))}
            </>
          )}
        </>
      )}

      <div className="note-line mt-4">
        <IconClock size={14} />
        点击任意记录可回放分析结果（数据为演示样例）
      </div>
    </div>
  );
}
