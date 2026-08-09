/**
 * SettingsScreen.jsx
 * 设置（「我的」Tab 内容）：置信度阈值滑杆 / 高通滤波开关 / 实时录音开关 / 后端地址 / 导出与说明
 */
import { useRef, useState } from 'react';
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import Button from '../components/ui/Button';
import Toggle from '../components/ui/Toggle';
import Chip from '../components/ui/Chip';
import { exportReport } from '../utils/exportReport';
import { getApiBase, getDataSource } from '../config/dataConfig.js';
import { IconFilter, IconWave, IconMic, IconShare, IconInfo, IconChart, IconChevronRight } from '../components/icons';

export default function SettingsScreen() {
  const { state, dispatch } = useApp();

  // 数据源模式：组件挂载时读取一次（进入设置页即重挂载）；保存后端地址后 Toast 触发重渲染也会同步刷新
  const dataSource = getDataSource();
  const apiBase = getApiBase();

  const setThreshold = (v) => dispatch({ type: 'SET_THRESHOLD', value: v });

  // 后端地址：非受控输入（ref + defaultValue），避免 Android IME 合成事件与 React 受控 value 冲突导致打不出字。
  // 重新进入设置页时组件重挂载，defaultValue 重新从 localStorage 读取 → 回显最新值。
  const apiInputRef = useRef(null);

  const onSaveApiBase = () => {
    const input = apiInputRef.current;
    if (!input) return;
    try {
      const v = input.value.trim().replace(/\/$/, '');
      if (v) localStorage.setItem('ljx_api_base', v);
      else localStorage.removeItem('ljx_api_base');
      // 直接写回 input.value 回显规范化后的地址（非受控，不经 React 状态，无 IME 冲突）
      input.value = v;
      dispatch({ type: 'TOAST', message: '后端地址已保存，下次分析自动使用真实识别' });
    } catch (err) {
      dispatch({ type: 'TOAST', message: '保存失败：' + (err && err.message ? err.message : '存储不可用') });
    }
  };

  const onExport = async () => {
    const ok = await exportReport(state.analysis);
    dispatch({ type: 'TOAST', message: ok ? '报告已保存到手机相册（PDF 为后续版本）' : '保存失败，请重试' });
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
        <div className="set-row">
          <div className="ic">
            <IconFilter size={18} />
          </div>
          <div className="t" style={{ flex: 1 }}>
            <b>后端地址</b>
            <span>留空 = 同源 /api，局域网联调填 http://IP:端口</span>
          </div>
        </div>
        <div className="px-4 pb-4 pt-1">
          {/* 数据源模式指示：一眼看出当前跑演示还是真实识别 */}
          <div className="mb-2.5 flex items-center gap-2">
            <Chip tone={dataSource === 'api' ? 'good' : 'mid'}>{dataSource === 'api' ? '真实识别' : '演示模式'}</Chip>
            {dataSource === 'api' ? (
              <span className="faint min-w-0 flex-1 truncate text-[12px]">后端 {apiBase}</span>
            ) : (
              <span className="faint min-w-0 flex-1 text-[12px]">填写后端地址后自动切换真实识别</span>
            )}
          </div>
          <div className="api-base-row">
            <input
              ref={apiInputRef}
              className="api-base-input"
              type="text"
              defaultValue={apiBase || ''}
              placeholder="如 http://192.168.1.5:8000"
              autoComplete="off"
              spellCheck={false}
            />
            <Button variant="primary" onClick={onSaveApiBase}>
              保存
            </Button>
          </div>
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
