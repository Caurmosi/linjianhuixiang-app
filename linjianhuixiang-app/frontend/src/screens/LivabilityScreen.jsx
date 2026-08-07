/**
 * LivabilityScreen.jsx
 * 宜居度详情：环形 + 双指标 + 噪声-多样性耦合散点图 + 提升建议
 */
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import Ring from '../components/Ring';
import Bar from '../components/ui/Bar';
import ScatterChart from '../components/charts/ScatterChart';
import { gradeOf } from '../data/mockData';
import { IconStar } from '../components/icons';

export default function LivabilityScreen() {
  const { state, dispatch } = useApp();
  const a = state.analysis;
  const { score, bio, sound, noise } = a.livability;
  const g = gradeOf(score);

  const desc =
    score >= 70
      ? '噪声干扰低，生物声丰富，绿地整体适合鸟类安居。'
      : score >= 50
        ? '噪声–多样性耦合评分处于中位，受人为噪声中度干扰。'
        : '人为噪声占比较高，鸟类活动明显受限，建议优先开展降噪干预。';

  const gradeCls = g.tone === 'good' ? 'grade-good' : g.tone === 'bad' ? 'grade-bad' : '';

  return (
    <div>
      <AppBar title="鸟类宜居度" onBack={() => dispatch({ type: 'BACK' })} />

      <div className="liv-detail-hero">
        <Ring value={score} size={120} sm track="var(--line)" />
        <div className="txt">
          <b>{g.zh}</b>
          <span className={`grade ${gradeCls}`}>{g.en}</span>
          <p className="muted">{desc}</p>
        </div>
      </div>

      {/* 双指标 */}
      <div className="comp">
        <div className="top">
          <b>生物多样性（丰富度 + 指数）</b>
          <span className="val">{bio}</span>
        </div>
        <Bar value={bio} />
      </div>
      <div className="comp">
        <div className="top">
          <b>声环境质量（安静度）</b>
          <span className="val">{sound}</span>
        </div>
        <Bar value={sound} color="linear-gradient(90deg,var(--sun-soft),var(--sun))" />
      </div>

      {/* 耦合散点图 */}
      <div className="rel-card">
        <h4>噪声 – 多样性耦合关系</h4>
        <div className="cap">
          样本位于“噪声 {noise}% / 多样性 {bio}”，略优于同噪声水平趋势线。
        </div>
        <ScatterChart noise={noise} diversity={bio} />
      </div>

      {/* 提升建议 */}
      <div className="sugg">
        <h4>
          <IconStar size={16} />
          提升建议
        </h4>
        <ul>
          {a.suggestions.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
