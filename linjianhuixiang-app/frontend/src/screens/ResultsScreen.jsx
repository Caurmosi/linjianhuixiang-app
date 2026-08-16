/**
 * ResultsScreen.jsx
 * 结果总览：宜居度大卡片 + 统计 + 4 个详情入口
 */
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import Ring from '../components/Ring';
import Chip from '../components/ui/Chip';
import WaveformChart from '../components/charts/WaveformChart';
import { gradeOf, livabilityDesc } from '../data/repository';
import { exportReport } from '../utils/exportReport';
import { IconShare, IconDoc, IconChart, IconHeat, IconGlobe } from '../components/icons';

/** 置信度档位 → Chip tone（高=绿 / 中=琥珀 / 低=红），贴合设计 token */
const CONF_TONE = { '高': 'good', '中': 'mid', '低': 'bad' };

export default function ResultsScreen() {
  const { state, dispatch } = useApp();
  const a = state.analysis;
  const score = a.livability.score;
  const g = gradeOf(score);
  const desc = livabilityDesc(a);
  // 置信度：旧数据（无 confidence）缺失时整行不渲染（向前兼容）
  const conf = a.livability && typeof a.livability.confidence === 'number' ? a.livability.confidence : null;
  const confLabel = conf != null && a.livability.confidenceLabel ? a.livability.confidenceLabel : null;

  const go = (screen) => dispatch({ type: 'GO', screen });
  const share = async () => {
    const ok = await exportReport(state.analysis);
    dispatch({ type: 'TOAST', message: ok ? '报告已保存到手机相册' : '保存失败，请重试' });
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
          {conf != null && confLabel ? (
            <div className="conf-badge">
              <Chip tone={CONF_TONE[confLabel] || 'default'} className="!px-2 !py-0.5">
                置信度 {confLabel}（{Math.round(conf * 100)}%）
              </Chip>
            </div>
          ) : null}
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

      {Array.isArray(a.waveform) && a.waveform.length > 0 ? (
        <div className="wave-wrap">
          <div className="wave-head">
            <h4>录音波形</h4>
            {a.durationSec ? <span className="wave-dur">{a.durationSec}s</span> : null}
          </div>
          <WaveformChart data={a.waveform} />
        </div>
      ) : null}

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
