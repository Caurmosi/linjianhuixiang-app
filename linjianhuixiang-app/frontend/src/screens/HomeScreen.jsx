/**
 * HomeScreen.jsx
 * 首页：实时录音（主卡） / 导入环境录音（多选批量） / 历史记录 / 最近分析 / 一键演示（仅演示模式）
 */
import { useRef } from 'react';
import { useApp } from '../store/appStore.jsx';
import { analysisForHistory, buildMockAnalysis } from '../data/repository';
import { humanizeBackendError } from '../utils/errorText';
import Button from '../components/ui/Button';
import Chip from '../components/ui/Chip';
import { isMockMode } from '../config/dataConfig.js';
import { IconLeaf, IconUpload, IconPlay, IconMic, IconClock, IconBird, IconChevronRight, IconInfo } from '../components/icons';

export default function HomeScreen() {
  const { state, dispatch } = useApp();
  const fileRef = useRef(null);

  // 数据源模式：挂载时读取一次（重进页面即刷新）
  const mockMode = isMockMode();

  const startDemo = () => {
    dispatch({ type: 'START_ANALYSIS', recording: '中山公园_晨.wav' });
  };

  const onPickFile = () => {
    if (fileRef.current) fileRef.current.click();
  };

  /** 单文件导入（真机桥保存本地 + START_ANALYSIS） */
  const importSingleFile = (file) => {
    const bridge = typeof window !== 'undefined' ? window.AndroidBridge : null;
    // 无论是否走原生桥保存，都把 file 本体传给 START_ANALYSIS，
    // 供 AnalyzingScreen 在真实 API 模式（VITE_USE_MOCK=false）下上传识别
    const imported = (name) => dispatch({ type: 'START_ANALYSIS', recording: name, audioFile: file });
    // 真机：读取 base64 并交给原生桥保存到 App 本地目录
    if (bridge && typeof bridge.importAudio === 'function') {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          bridge.importAudio(String(reader.result), file.name);
          dispatch({ type: 'TOAST', message: '音频已导入并保存到本地' });
        } catch (err) {
          // 桥调用异常 → 降级为仅文件名，继续分析
          dispatch({ type: 'TOAST', message: '已导入：' + file.name });
        }
        imported(file.name);
      };
      reader.onerror = () => {
        dispatch({ type: 'TOAST', message: '已导入：' + file.name });
        imported(file.name);
      };
      reader.readAsDataURL(file);
    } else {
      // 浏览器 / 无桥环境：仅提示并走现有分析流程
      dispatch({ type: 'TOAST', message: '已导入：' + file.name });
      imported(file.name);
    }
  };

  /** 文件多选批量：1 个 → 单文件分析（结果页）；≥2 个 → START_BATCH 批量（地图综合页） */
  const onFileChange = (e) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;
    if (files.length === 1) {
      importSingleFile(files[0]);
      return;
    }
    // 批量：后端每个音频单独分析，聚合在前端完成
    dispatch({ type: 'START_BATCH', items: files.map((f) => ({ name: f.name, file: f })) });
    dispatch({ type: 'TOAST', message: `已导入 ${files.length} 个音频，开始批量分析` });
  };

  const onRecord = () => dispatch({ type: 'GO', screen: 'record' });

  const onHistory = () => dispatch({ type: 'GO', screen: 'history' });

  const openRecent = async (item) => {
    try {
      // Promise.resolve 归一化 mock 同步 / api 异步两种返回
      const analysis = await Promise.resolve(analysisForHistory(item));
      dispatch({ type: 'LOAD_HISTORY', analysis });
    } catch (err) {
      const reason = humanizeBackendError(err && err.message ? err.message : '未知错误');
      const demo = buildMockAnalysis(item.name, {
        speciesCount: item.species,
        livability: { score: item.score, noise: item.noise ?? 40, bio: item.bio ?? 70, sound: item.sound ?? 55 },
      });
      dispatch({ type: 'TOAST', message: `识别失败：${reason}，已用演示结果回放` });
      dispatch({ type: 'LOAD_HISTORY', analysis: demo });
    }
  };

  return (
    <div>
      {/* 品牌区 */}
      <div className="hero-home">
        <div className="logo">
          <div className="badge">
            <IconLeaf size={28} />
          </div>
          <div>
            <h1>林间回响</h1>
            <div className="tag">听一片绿地，知鸟是否安居</div>
          </div>
        </div>
      </div>

      {/* 数据源模式徽标（演示模式 / 真实识别） */}
      <div className="mb-3 flex justify-center">
        <Chip tone={mockMode ? 'mid' : 'good'}>{mockMode ? '演示模式' : '真实识别'}</Chip>
      </div>

      {/* 实时录音 —— 主卡片（UI 最大） */}
      <div className="record-card" onClick={onRecord}>
        <div className="up">
          <IconMic size={28} />
        </div>
        <h3>实时录音</h3>
        <p>长按录制 · 支持连续多段，逐段自动分析</p>
        <Button variant="primary" icon={<IconMic size={20} />} onClick={onRecord}>
          开始录音
        </Button>
      </div>

      {/* 导入环境录音 —— 横向扁卡片（点击任意处或右侧按钮均选音频，支持多选批量） */}
      <div className="import-card-row" onClick={onPickFile} role="button" tabIndex={0}>
        <div className="up">
          <IconUpload size={26} />
        </div>
        <div className="txt">
          <h3>导入环境录音</h3>
          <p>支持 .wav / .mp3，单段或批量导入</p>
        </div>
        <Button
          variant="ghost"
          icon={<IconUpload size={18} />}
          onClick={(e) => {
            e.stopPropagation(); // 避免冒泡到卡片重复触发 onPickFile
            onPickFile();
          }}
        >
          选择音频
        </Button>
      </div>
      <input ref={fileRef} type="file" accept="audio/*" multiple className="hidden" onChange={onFileChange} />

      {/* 历史记录 —— 次级按钮行 */}
      <div className="mb-3.5">
        <Button variant="ghost" icon={<IconClock size={20} />} onClick={onHistory}>
          历史记录
        </Button>
      </div>

      {/* 一键演示（内置样例）：仅演示模式渲染（真实识别模式隐藏） */}
      {mockMode ? (
        <div className="mb-3.5">
          <Button variant="sun" icon={<IconPlay size={20} />} onClick={startDemo}>
            一键演示（内置样例）
          </Button>
        </div>
      ) : null}

      {/* 最近分析 */}
      <div className="eyebrow mb-2.5">最近分析</div>
      {state.history.map((item) => (
        <div key={item.id} className="recent" onClick={() => openRecent(item)}>
          <div className="thumb">
            <IconBird size={22} />
          </div>
          <div className="meta">
            <b>{item.name}</b>
            <span>
              {item.species} 种鸟 · 宜居度 {item.score} · {item.duration}
            </span>
          </div>
          <span className="go">
            <IconChevronRight size={16} />
          </span>
        </div>
      ))}

      {/* 方法学卡片 */}
      <div className="method mt-4">
        <h4>
          <IconInfo size={16} />
          为什么用声音？
        </h4>
        <p>
          鸟鸣是生物多样性的“声学指纹”。识别鸟种 + 量化声景 + 耦合人为噪声，即可诊断这片绿地“适不适合鸟住”，比人工调查更低成本、可重复。
        </p>
      </div>
    </div>
  );
}
