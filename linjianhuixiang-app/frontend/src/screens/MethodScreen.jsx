/**
 * MethodScreen.jsx
 * 方法学与关于：为什么用声音 + 分析管线 + 数据可信度
 */
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import { IconLeaf, IconInfo } from '../components/icons';

const STEPS = [
  { n: '01', t: '音频导入', d: '.wav / .mp3 端侧读取，支持批量' },
  { n: '02', t: '预处理 / 降噪', d: '高通滤波（P1 可选），去除低频人为噪声' },
  { n: '03', t: 'BirdNET 识别', d: '端侧 TF-Lite 模型，输出物种 / 置信度 / 时间戳' },
  { n: '04', t: '声学指数', d: 'ACI / NDSI / ADI / H 量化声景健康度' },
  { n: '05', t: '声源分类 + 宜居度', d: '生物声与人为噪声耦合，输出 0-100 宜居度' },
];

export default function MethodScreen() {
  const { state, dispatch } = useApp();

  return (
    <div>
      <AppBar title="方法学与关于" onBack={() => dispatch({ type: 'BACK' })} />

      <div className="method mb-3.5">
        <h4>
          <IconLeaf size={16} />
          为什么用声音？
        </h4>
        <p>
          鸟鸣是生物多样性的“声学指纹”。相比人工样线调查，声学监测更低成本、可重复，且能同时量化人为噪声干扰，据此诊断绿地“适不适合鸟住”。
        </p>
      </div>

      <div className="card mb-3.5">
        <h4 className="h-title text-[15px] mb-3">分析管线</h4>
        {STEPS.map((s) => (
          <div key={s.n} className="flex gap-3 py-2.5">
            <span className="font-mono text-[12px] font-bold text-forest-500 w-6">{s.n}</span>
            <div>
              <b className="block text-[13.5px]">{s.t}</b>
              <span className="text-[11.5px] text-ink-soft">{s.d}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card plain" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
        <h4 className="h-title text-[15px] mb-2">数据可信度</h4>
        <p className="text-[12.5px] text-ink-soft" style={{ lineHeight: 1.6 }}>
          识别基于 BirdNET 端侧模型（TF-Lite）；指数与宜居度算法参照公开声学生态学文献。当前数据为演示样例（公开数据集验证思路），正式发布前需以实地录音校准阈值。
        </p>
      </div>

      <div className="note-line mt-4">
        <IconInfo size={14} />
        版本 1.0.0 · 《林间回响》城市鸟类宜居度智能诊断
      </div>
    </div>
  );
}
