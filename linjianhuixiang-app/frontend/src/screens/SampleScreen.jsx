/**
 * SampleScreen.jsx
 * 样例音频：BirdNET 官方样例等 mock 音频列表，点击进入分析闭环
 * 不同样例携带不同 buildAnalysis overrides，结果有区分度
 */
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import Button from '../components/ui/Button';
import { IconWave, IconPlay, IconChevronRight } from '../components/icons';

const SAMPLES = [
  {
    id: 'zhongshan',
    name: '中山公园_晨.wav',
    duration: '3:24',
    source: 'BirdNET 官方样例',
    overrides: { speciesCount: 9, livability: { score: 68, noise: 34, bio: 76, sound: 60 } },
  },
  {
    id: 'xijiao',
    name: '西郊森林公园_黄昏.wav',
    duration: '4:05',
    source: 'BirdNET 官方样例',
    overrides: { speciesCount: 12, livability: { score: 82, noise: 22, bio: 88, sound: 74 } },
  },
  {
    id: 'binjiang',
    name: '滨江绿地_午后.mp3',
    duration: '2:10',
    source: '公共数据集样例',
    overrides: { speciesCount: 6, livability: { score: 54, noise: 51, bio: 62, sound: 45 } },
  },
  {
    id: 'chengshi',
    name: '城市广场_车流.mp3',
    duration: '1:58',
    source: '演示内置样例',
    overrides: { speciesCount: 4, livability: { score: 38, noise: 67, bio: 41, sound: 33 } },
  },
];

export default function SampleScreen() {
  const { dispatch } = useApp();

  const run = (sample) => {
    dispatch({ type: 'START_ANALYSIS', recording: sample.name, overrides: sample.overrides });
  };

  return (
    <div>
      <AppBar title="样例音频" onBack={() => dispatch({ type: 'BACK' })} />

      <div className="eyebrow mb-2.5">内置样例（BirdNET 官方 / 公共数据集）</div>
      {SAMPLES.map((s) => (
        <div key={s.id} className="recent" onClick={() => run(s)}>
          <div className="thumb">
            <IconWave size={22} />
          </div>
          <div className="meta">
            <b>{s.name}</b>
            <span>
              {s.duration} · {s.source}
            </span>
          </div>
          <span className="go">
            <IconChevronRight size={16} />
          </span>
        </div>
      ))}

      <Button variant="sun" icon={<IconPlay size={20} />} className="mt-4" onClick={() => run(SAMPLES[0])}>
        一键演示（中山公园样例）
      </Button>

      <div className="note-line mt-4">
        <IconWave size={14} />
        样例均为演示数据，选择后将进入分析流程并生成对应的 mock 结果
      </div>
    </div>
  );
}
