/**
 * ResultsScreen.jsx
 * 结果总览：宜居度大卡片 + 统计 + 4 个详情入口
 */
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import Ring from '../components/Ring';
import { gradeOf, livabilityDesc } from '../data/mockData';
import { exportReport } from '../utils/exportReport';
import { IconShare, IconDoc, IconChart, IconHeat, IconGlobe } from '../components/icons';

export default function ResultsScreen() {
  const { state, dispatch } = useApp();
  const a = state.analysis;
  const score = a.livability.score;
  const g = gradeOf(score);
  const desc = livabilityDesc(a);

  const go = (screen) => dispatch({ type: 'GO', screen });
  const share = () => {
    const ok = exportReport(state.analysis);
    dispatch({ type: 'TOAST', message: ok ? '报告图片已导出' : '导出失败，请重试' });
  };

  const QUICK = [
    { icon: IconDoc, title: '物种清单', sub: '去重 / 频次', screen: 'species' },
    { icon: IconChart, title: '声学指数', sub: 'ACI/NDSI…', screen: 'indices' },
    { icon: IconHeat, title: '时间热力图', sub: '活跃度', screen: 'map' },
    { icon: IconGlobe, title: '方法学', sub: '为何可信', screen: 'method' },
  ];

  return (
    <div>
      <AppBar
        title="分析结果"
        onBack={() => dispatch({ type: 'BACK' })}
        right={
          <button className="ico-btn" onClick={share} aria-label="导出报告">
            <IconShare size={18} />
          </button>
        }
      />

      <div className="liv-hero">
        <Ring value={score} size={128} />
        <div className="info">
          <b>鸟类宜居度</b>
          <span className="grade">
            {g.zh} · {g.en}
          </span>
          <p>{desc}</p>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="v">{a.speciesCount}</div>
          <div className="l">识别鸟种</div>
        </div>
        <div className="stat">
          <div className="v">{a.livability.noise}%</div>
          <div className="l">人为噪声占比</div>
        </div>
      </div>

      <div className="eyebrow mb-2.5">查看详情</div>
      <div className="quick">
        {QUICK.map((q) => {
          const Icon = q.icon;
          return (
            <button key={q.screen} className="quick-item" onClick={() => go(q.screen)}>
              <span className="ic">
                <Icon size={20} />
              </span>
              <span>
                <b>{q.title}</b>
                <span>{q.sub}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
