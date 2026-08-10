/**
 * HomeScreen.jsx
 * 首页：导入音频 / 一键演示 / 实时录音(真实识别) / 历史记录 / 最近分析
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

  const onFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
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
    e.target.value = '';
  };

  const onRecord = async () => {
    // 实时录音：真机新壳优先走原生 MediaRecorder 桥（绕开 WebView getUserMedia 不可靠，
    // vivo S30 / file:// 场景尤甚）；旧壳/无桥降级浏览器 getUserMedia；任何失败均回退演示分析
    const fallback = () => {
      // 无音频数据的演示分析（AnalyzingScreen 无 audioFile 时走 mock 组合）
      dispatch({ type: 'START_ANALYSIS', recording: '实时录音_演示.wav' });
    };
    // 完成分析：有录音 File 时传入 audioFile 供 AnalyzingScreen 真实上传识别；
    // 无音频时省略 audioFile，AnalyzingScreen 自动走 mock 组合 / 失败兜底演示数据
    const startAnalysis = (name, audioFile) => {
      dispatch({ type: 'START_ANALYSIS', recording: name, audioFile });
    };
    const ts = () => String(Date.now());
    const bridge = typeof window !== 'undefined' ? window.AndroidBridge : null;

    // dataUrl → Blob：优先 fetch；失败则手动 atob 构造（兼容老 WebView 拦截 data: fetch）
    const dataUrlToBlob = async (dataUrl) => {
      try {
        const resp = await fetch(dataUrl);
        if (resp.ok) return await resp.blob();
      } catch (e) {
        // 落到 atob 兜底
      }
      const comma = dataUrl.indexOf(',');
      const meta = /^data:([^;]*)(?:;base64)?$/i.exec(dataUrl.slice(0, comma));
      const mime = meta && meta[1] ? meta[1] : 'audio/mp4';
      const bin = atob(dataUrl.slice(comma + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    };

    // getUserMedia 失败原因细化（不吞掉具体原因）
    const getUserMediaErrorText = (err) => {
      const name = err && err.name ? err.name : '';
      switch (name) {
        case 'NotAllowedError':
          return '未获得麦克风权限，请在系统设置中允许';
        case 'NotFoundError':
          return '未找到麦克风设备';
        case 'NotReadableError':
          return '麦克风被占用';
        default:
          return `无法获取麦克风权限（${name || '未知错误'}）`;
      }
    };

    // 1) 真机新壳：原生 MediaRecorder 录音（m4a），彻底绕开 WebView getUserMedia
    if (bridge && typeof bridge.startNativeRecord === 'function') {
      let ok = false;
      try {
        ok = bridge.startNativeRecord() === true;
      } catch (err) {
        ok = false;
      }
      if (!ok) {
        dispatch({ type: 'TOAST', message: '录音启动失败，请检查麦克风权限，已回退到演示分析' });
        fallback();
        return;
      }
      dispatch({ type: 'TOAST', message: '正在录音 10 秒…' });
      window.setTimeout(async () => {
        let dataUrl = '';
        try {
          dataUrl = bridge.stopNativeRecord();
        } catch (err) {
          dataUrl = '';
        }
        if (!dataUrl) {
          dispatch({ type: 'TOAST', message: '录音失败，已回退到演示分析' });
          fallback();
          return;
        }
        try {
          const blob = await dataUrlToBlob(dataUrl);
          const name = '实时录音_' + ts() + '.m4a';
          const audioFile = new File([blob], name, { type: 'audio/mp4' });
          dispatch({ type: 'TOAST', message: '录音完成，开始分析' });
          startAnalysis(name, audioFile);
        } catch (err) {
          dispatch({ type: 'TOAST', message: '录音失败，已回退到演示分析' });
          fallback();
        }
      }, 10000);
      return;
    }

    // 2) 真机旧壳：先申请录音权限；失败则 Toast 并回退演示分析
    if (bridge && typeof bridge.requestRecordPermission === 'function') {
      let granted = false;
      try {
        granted = bridge.requestRecordPermission() === true;
      } catch (err) {
        granted = false;
      }
      if (!granted) {
        dispatch({ type: 'TOAST', message: '未获得录音权限，已回退到演示分析' });
        fallback();
        return;
      }
    }

    // 3) 浏览器 / 无桥：getUserMedia + MediaRecorder 降级路径
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
        dispatch({ type: 'TOAST', message: '当前浏览器不支持实时录音，已回退到演示分析' });
        fallback();
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options =
        typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('audio/webm')
          ? { mimeType: 'audio/webm' }
          : {};
      const recorder = new MediaRecorder(stream, options);
      const chunks = [];
      // 收集真实音频数据
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mimeType = recorder.mimeType || 'audio/webm';
        const name = '实时录音_' + ts() + '.webm';
        const blob = chunks.length > 0 ? new Blob(chunks, { type: mimeType }) : null;
        // 合并录音数据 → File，随 START_ANALYSIS 传入 AnalyzingScreen 走真实上传识别
        const audioFile = blob ? new File([blob], name, { type: mimeType }) : null;
        if (audioFile && bridge && typeof bridge.saveAudio === 'function') {
          // 转 base64 → 原生桥保存到本地
          const reader = new FileReader();
          const finish = (saved) => {
            dispatch({ type: 'TOAST', message: saved ? '录音已保存到手机' : '录音完成，开始分析' });
            startAnalysis(name, audioFile);
          };
          reader.onload = () => {
            let saved = false;
            try {
              saved = bridge.saveAudio(String(reader.result), 'linjianhuixiang_录音_' + ts() + '.webm') === true;
            } catch (err) {
              saved = false;
            }
            finish(saved);
          };
          reader.onerror = () => finish(false);
          reader.readAsDataURL(blob);
        } else {
          // 无桥 / 无数据：降级为不带 audioFile 的 START_ANALYSIS，AnalyzingScreen 走 mock 组合
          dispatch({ type: 'TOAST', message: '录音完成，开始分析' });
          startAnalysis(name, audioFile);
        }
      };
      recorder.start();
      window.setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, 10000);
      dispatch({ type: 'TOAST', message: '正在录音 10 秒…' });
    } catch (err) {
      dispatch({ type: 'TOAST', message: `${getUserMediaErrorText(err)}，已回退到演示分析` });
      fallback();
    }
  };

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

      {/* 一键演示 + 数据源模式徽标 */}
      <div className="mb-3.5">
        <Button variant="sun" icon={<IconPlay size={20} />} onClick={startDemo}>
          一键演示（内置样例）
        </Button>
        <div className="mt-2 flex justify-center">
          <Chip tone={mockMode ? 'mid' : 'good'}>{mockMode ? '演示模式' : '真实识别'}</Chip>
        </div>
      </div>

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
