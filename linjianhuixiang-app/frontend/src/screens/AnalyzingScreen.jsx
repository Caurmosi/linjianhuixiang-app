/**
 * AnalyzingScreen.jsx
 * 分析中：声波动画 + 管线步骤进度 + 实时百分比，自动推进并在 100% 后跳转结果页
 */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store/appStore.jsx';
import { buildAnalysis } from '../data/mockData';
import { IconCheck, IconSpark } from '../components/icons';

const STAGES = [
  { name: '音频导入', desc: '.wav · 3:24 · 44.1kHz' },
  { name: '预处理 / 降噪', desc: '高通滤波（P1 可选）' },
  { name: 'BirdNET 识别', desc: '物种 · 置信度 · 时间戳' },
  { name: '声学指数', desc: 'ACI / NDSI / ADI / H' },
  { name: '声源分类 + 宜居度', desc: '生物声 / 人为噪声耦合' },
];

const DURATION = 6800; // 演示总时长 ms
const STEP = 100 / STAGES.length;

export default function AnalyzingScreen() {
  const { state, dispatch } = useApp();
  const [progress, setProgress] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    let raf = 0;
    let timer = 0;
    const start = performance.now();

    const tick = (t) => {
      const p = Math.min(100, ((t - start) / DURATION) * 100);
      setProgress(p);
      if (p < 100) {
        raf = requestAnimationFrame(tick);
      } else if (!doneRef.current) {
        doneRef.current = true;
        timer = window.setTimeout(() => {
          const overrides = state.analysisOverrides || {
            speciesCount: 9,
            livability: { score: 68, noise: 34, bio: 76, sound: 60 },
          };
          dispatch({
            type: 'COMPLETE_ANALYSIS',
            analysis: buildAnalysis(state.recording || '中山公园_晨.wav', overrides),
          });
        }, 500);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [dispatch, state.recording, state.analysisOverrides]);

  const current = Math.min(STAGES.length - 1, Math.floor(progress / STEP));
  const stagePct = Math.round(((progress - current * STEP) / STEP) * 100);
  const waveDelays = [0, 0.1, 0.2, 0.3, 0.15, 0.25, 0.05, 0.35, 0.2, 0.1, 0.3, 0.15];

  return (
    <div className="analyzing">
      <div className="wave">
        {waveDelays.map((d, i) => (
          <i key={i} style={{ animationDelay: `${d}s` }} />
        ))}
      </div>
      <h2>正在分析声景…</h2>
      <p>{state.recording || '中山公园_晨.wav'} · 端侧 TF-Lite 识别中</p>

      <div className="pipe">
        {STAGES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={s.name} className={`step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
              <div className="dot">{active ? <IconSpark size={14} /> : <IconCheck size={14} />}</div>
              <div>
                <b>{s.name}</b>
                <span>{s.desc}</span>
              </div>
              <span className="pct">{done ? '100%' : active ? `${stagePct}%` : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
