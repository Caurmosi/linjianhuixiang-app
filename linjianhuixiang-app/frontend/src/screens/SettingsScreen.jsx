/**
 * SettingsScreen.jsx
 * 设置（「我的」Tab 内容）：置信度阈值滑杆 / 高通滤波开关 / 实时录音开关 / 导出与说明
 */
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import Toggle from '../components/ui/Toggle';
import Chip from '../components/ui/Chip';
import { exportReport } from '../utils/exportReport';
import { IconFilter, IconWave, IconMic, IconShare, IconInfo, IconChart, IconChevronRight } from '../components/icons';

export default function SettingsScreen() {
  const { state, dispatch } = useApp();

  const setThreshold = (v) => dispatch({ type: 'SET_THRESHOLD', value: v });

  const onExport = () => {
    const ok = exportReport(state.analysis);
    dispatch({ type: 'TOAST', message: ok ? '报告图片已导出（PDF 为后续版本）' : '导出失败，请重试' });
  };

  return (
    <div>
      <AppBar title="设置" onBack={() => dispatch({ type: 'BACK' })} />

      {/* 识别参数 */}
      <div className="eyebrow mb-2">识别参数</div>
      <div className="set-list">
        <div className="set-row">
          <div className="ic">
            <IconFilter size={18} />
          </div>
          <div className="t" style={{ flex: 1 }}>
            <b>置信度阈值</b>
            <span>低于该值不计入清单</span>
          </div>
        </div>
        <div className="px-4 pb-4 pt-1">
          <div className="flex justify-between items-baseline">
            <span className="faint text-[12px]">0.30</span>
            <span className="slider-val">{state.threshold.toFixed(2)}</span>
            <span className="faint text-[12px]">0.90</span>
          </div>
          <input
            type="range"
            min="0.30"
            max="0.90"
            step="0.01"
            value={state.threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
          />
        </div>
      </div>

      {/* 处理与分析 */}
      <div className="eyebrow mb-2">处理与分析</div>
      <div className="set-list">
        <div className="set-row">
          <div className="ic">
            <IconWave size={18} />
          </div>
          <div className="t" style={{ flex: 1 }}>
            <b>高通滤波降噪</b>
            <span>削弱低频人为噪声 (P1)</span>
          </div>
          <Toggle checked={state.highpass} onChange={(v) => dispatch({ type: 'SET_HIGHPASS', value: v })} />
        </div>
        <div className="set-row">
          <div className="ic">
            <IconMic size={18} />
          </div>
          <div className="t" style={{ flex: 1 }}>
            <b>实时录音分析</b>
            <span>录完即分析 (P1)</span>
          </div>
          <Toggle checked={state.realtime} onChange={(v) => dispatch({ type: 'SET_REALTIME', value: v })} />
        </div>
      </div>

      {/* 导出与说明 */}
      <div className="eyebrow mb-2">导出与说明</div>
      <div className="set-list">
        <div className="set-row" onClick={onExport}>
          <div className="ic">
            <IconShare size={18} />
          </div>
          <div className="t" style={{ flex: 1 }}>
            <b>导出格式</b>
            <span>图片（PNG）已支持 · PDF 后续版本</span>
          </div>
          <Chip>PNG</Chip>
        </div>
        <div className="set-row" onClick={() => dispatch({ type: 'GO', screen: 'method' })}>
          <div className="ic">
            <IconInfo size={18} />
          </div>
          <div className="t" style={{ flex: 1 }}>
            <b>方法学与关于</b>
            <span>为何用声音 · 算法说明</span>
          </div>
          <IconChevronRight size={16} className="text-ink-faint" />
        </div>
        <div className="set-row" onClick={() => dispatch({ type: 'GO', screen: 'sample' })}>
          <div className="ic">
            <IconChart size={18} />
          </div>
          <div className="t" style={{ flex: 1 }}>
            <b>样例音频管理</b>
            <span>BirdNET 官方样例</span>
          </div>
          <IconChevronRight size={16} className="text-ink-faint" />
        </div>
      </div>
    </div>
  );
}
