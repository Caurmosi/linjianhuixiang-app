/**
 * HomeScreen.jsx
 * 首页：导入音频 / 一键演示 / 实时录音(mock) / 历史记录 / 最近分析
 */
import { useRef } from 'react';
import { useApp } from '../store/appStore.jsx';
import { analysisForHistory } from '../data/mockData';
import Button from '../components/ui/Button';
import { IconLeaf, IconUpload, IconPlay, IconMic, IconClock, IconBird, IconChevronRight, IconInfo } from '../components/icons';

export default function HomeScreen() {
  const { state, dispatch } = useApp();
  const fileRef = useRef(null);

  const startDemo = () => {
    dispatch({ type: 'START_ANALYSIS', recording: '中山公园_晨.wav' });
  };

  const onPickFile = () => {
    if (fileRef.current) fileRef.current.click();
  };

  const onFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) dispatch({ type: 'START_ANALYSIS', recording: file.name });
    e.target.value = '';
  };

  const onRecord = async () => {
    // 实时录音（mock 闭环）：真录音 3 秒，分析仍为 mock
    const fallback = () => {
      dispatch({
        type: 'START_ANALYSIS',
        recording: '实时录音_演示.wav',
        overrides: { speciesCount: 7, livability: { score: 62, noise: 41, bio: 70, sound: 55 } },
      });
    };

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
        dispatch({ type: 'TOAST', message: '当前浏览器不支持实时录音，已回退到演示分析' });
        fallback();
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = () => {}; // mock：不处理真实音频数据
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        dispatch({ type: 'TOAST', message: '录音完成，开始分析' });
        dispatch({
          type: 'START_ANALYSIS',
          recording: '实时录音_3s.wav',
          overrides: { speciesCount: 7, livability: { score: 62, noise: 41, bio: 70, sound: 55 } },
        });
      };
      recorder.start();
      window.setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, 3000);
      dispatch({ type: 'TOAST', message: '正在录音 3 秒…' });
    } catch (err) {
      dispatch({ type: 'TOAST', message: '无法获取麦克风权限，已回退到演示分析' });
      fallback();
    }
  };

  const onHistory = () => dispatch({ type: 'GO', screen: 'history' });

  const openRecent = (item) => {
    dispatch({ type: 'LOAD_HISTORY', analysis: analysisForHistory(item) });
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

      {/* 导入录音 */}
      <div className="import-card">
        <div className="up">
          <IconUpload size={28} />
        </div>
        <h3>导入环境录音</h3>
        <p>支持 .wav / .mp3，单段或批量导入</p>
        <Button variant="primary" icon={<IconUpload size={20} />} onClick={onPickFile}>
          选择音频文件
        </Button>
        <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={onFileChange} />
      </div>

      {/* 一键演示 */}
      <Button variant="sun" icon={<IconPlay size={20} />} className="mb-3.5" onClick={startDemo}>
        一键演示（内置样例）
      </Button>

      {/* 实时录音 / 历史记录 */}
      <div className="row2">
        <Button variant="ghost" icon={<IconMic size={20} />} onClick={onRecord}>
          实时录音
        </Button>
        <Button variant="ghost" icon={<IconClock size={20} />} onClick={onHistory}>
          历史记录
        </Button>
      </div>

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
