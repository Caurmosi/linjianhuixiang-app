/**
 * RecordScreen.jsx
 * 实时录音（C）：长按录制、连续多段、每段停止后立即自动分析。
 *  - 真机优先原生桥（AndroidBridge.startNativeRecord / stopNativeRecord）；
 *  - 浏览器/无桥降级 getUserMedia + MediaRecorder（utils/recorder.js）。
 * 跳转语义（E）：单段 → 结果页（COMPLETE_ANALYSIS）；≥2 段 → 聚合 → 地图综合页（COMPLETE_BATCH）。
 */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import Button from '../components/ui/Button';
import { buildAnalysis, buildMockAnalysis } from '../data/repository';
import { humanizeBackendError } from '../utils/errorText';
import { dataUrlToBlob, getUserMediaErrorText, startWebMediaRecorder } from '../utils/recorder';
import { aggregateAnalyses } from '../utils/aggregate';
import { IconMic, IconWave, IconMap, IconTrash } from '../components/icons';

export default function RecordScreen() {
  const { state, dispatch } = useApp();

  // 本次已录段落：[{ id, name, durationSec, analyzing, failed, result }]
  const [segments, setSegments] = useState([]);
  const [recording, setRecording] = useState(false); // 当前是否按住录音中
  const recordingRef = useRef(false); // 同步守卫（防连点/多触点重复启动）
  const pendingRef = useRef(false); // 浏览器 getUserMedia 异步启动中
  const startTokenRef = useRef(0); // 递增令牌：stop 时失效未完成的异步启动
  const sessionRef = useRef(null); // 'native' | { recorder, stream, stop }
  const startAtRef = useRef(0); // 本段开始时刻（用于估算时长）
  const segIdRef = useRef(0); // 段落序号（自增，避免闭包脏读）

  const analyzingCount = segments.filter((s) => s.analyzing).length;

  // 卸载时释放进行中的录音会话（防泄漏）
  useEffect(() => {
    return () => {
      startTokenRef.current += 1;
      const session = sessionRef.current;
      if (session && session !== 'native' && session.stop) {
        try {
          void session.stop();
        } catch (e) {
          /* 卸载清理失败可忽略 */
        }
      }
    };
  }, []);

  const setRecState = (v) => {
    recordingRef.current = v;
    setRecording(v);
  };

  /** 读取原生 GPS 定位（AndroidBridge.getLocation() → "lng,lat"，6 位小数）；
   *  无桥 / 未授权 / 无已知位置 → 返回手动模式（lng/lat 空，综合页 MapPicker 手动补） */
  const readLocation = () => {
    try {
      const bridge = typeof window !== 'undefined' ? window.AndroidBridge : null;
      if (bridge && typeof bridge.getLocation === 'function') {
        const raw = bridge.getLocation();
        if (typeof raw === 'string' && raw.indexOf(',') > 0) {
          const [lng, lat] = raw.split(',').map(Number);
          if (Number.isFinite(lng) && Number.isFinite(lat)) {
            return { lng, lat, from: 'gps' };
          }
        }
      }
    } catch (err) {
      /* 定位异常按手动处理 */
    }
    return { lng: null, lat: null, from: 'manual' };
  };

  /** 开始录音：原生桥优先，浏览器降级 getUserMedia+MediaRecorder */
  const startRecording = () => {
    if (recordingRef.current || pendingRef.current) return; // 已在录 / 正在启动
    const bridge = typeof window !== 'undefined' ? window.AndroidBridge : null;
    const hasNative = bridge && typeof bridge.startNativeRecord === 'function';

    // 1) 真机新壳：原生 MediaRecorder 桥
    if (hasNative) {
      let ok = false;
      try {
        ok = bridge.startNativeRecord() === true;
      } catch (err) {
        ok = false;
      }
      if (!ok) {
        dispatch({ type: 'TOAST', message: '录音启动失败，请检查麦克风权限' });
        return;
      }
      sessionRef.current = 'native';
      startAtRef.current = Date.now();
      setRecState(true);
      return;
    }

    // 2) 真机旧壳：先申请录音权限
    if (bridge && typeof bridge.requestRecordPermission === 'function') {
      let granted = false;
      try {
        granted = bridge.requestRecordPermission() === true;
      } catch (err) {
        granted = false;
      }
      if (!granted) {
        dispatch({ type: 'TOAST', message: '未获得录音权限' });
        return;
      }
    }

    // 3) 浏览器 / 无桥：getUserMedia + MediaRecorder（异步启动）
    const token = ++startTokenRef.current;
    pendingRef.current = true;
    startWebMediaRecorder()
      .then((session) => {
        if (token !== startTokenRef.current) {
          // 启动期间已松手：立即收尾并释放麦克风，不进入录制态
          try {
            void session.stop();
          } catch (e) {
            /* 忽略 */
          }
          return;
        }
        sessionRef.current = session;
        startAtRef.current = Date.now();
        pendingRef.current = false;
        setRecState(true);
      })
      .catch((err) => {
        pendingRef.current = false;
        dispatch({ type: 'TOAST', message: `${getUserMediaErrorText(err)}，无法开始录音` });
      });
  };

  /** 停止录音 → 生成 File → 追加段落 → 立即自动分析 */
  const finishSegment = async () => {
    let file = null;
    let name = '';

    if (sessionRef.current === 'native') {
      let dataUrl = '';
      try {
        dataUrl = window.AndroidBridge.stopNativeRecord();
      } catch (err) {
        dataUrl = '';
      }
      if (!dataUrl) {
        dispatch({ type: 'TOAST', message: '录音失败，请重试' });
        sessionRef.current = null;
        return;
      }
      try {
        const blob = await dataUrlToBlob(dataUrl);
        name = `实时录音_${Date.now()}.m4a`;
        file = new File([blob], name, { type: 'audio/mp4' });
      } catch (err) {
        dispatch({ type: 'TOAST', message: '录音数据解析失败，请重试' });
        sessionRef.current = null;
        return;
      }
    } else if (sessionRef.current) {
      // 浏览器降级会话
      const session = sessionRef.current;
      try {
        file = await session.stop();
      } catch (err) {
        file = null;
      }
      if (!file) {
        dispatch({ type: 'TOAST', message: '录音数据为空，请重试' });
        sessionRef.current = null;
        return;
      }
      name = file.name;
    } else {
      return; // 无会话（异常路径）
    }
    sessionRef.current = null;

    const durationSec = Math.max(1, Math.round((Date.now() - startAtRef.current) / 1000));
    const id = ++segIdRef.current;
    const seg = { id, name, durationSec, analyzing: true, failed: false, result: null };
    setSegments((prev) => [...prev, seg]);

    // 每段停止后立即自动分析：真实上传（audioFile），失败 buildMockAnalysis 兜底（与单次一致）
    let analysis;
    try {
      analysis = await Promise.resolve(
        buildAnalysis(name, { audioFile: file, threshold: state.threshold, durationSec })
      );
    } catch (err) {
      const reason = humanizeBackendError(err && err.message ? err.message : '未知错误');
      dispatch({ type: 'TOAST', message: `第${id}段识别失败：${reason}，已用演示结果` });
      analysis = buildMockAnalysis(name, { durationSec });
    }
    // 真机 API 上传路径不回传 durationSec：统一在段结果上注入，保证聚合总时长正确
    analysis = analysis && typeof analysis === 'object' ? { ...analysis, durationSec } : analysis;
    // 录音标点：每段录音取一次 GPS（有则带坐标 from:'gps'，无则手动补 from:'manual'）
    if (analysis && typeof analysis === 'object') {
      const loc = readLocation();
      analysis = { ...analysis, lng: loc.lng, lat: loc.lat, from: loc.from };
    }
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, analyzing: false, failed: false, result: analysis } : s))
    );
  };

  const stopRecording = () => {
    // 先使进行中的异步启动失效（极短点按：松手先于 getUserMedia 返回）
    startTokenRef.current += 1;
    if (pendingRef.current) {
      pendingRef.current = false;
      return;
    }
    if (!recordingRef.current) return;
    setRecState(false);
    void finishSegment();
  };

  /** 清空单段 */
  const removeSegment = (id) => {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  };

  /** 完成：单段 → 结果页；≥2 段 → 聚合 → 地图综合页；0 段 → Toast 提示 */
  const finish = () => {
    if (recordingRef.current) {
      dispatch({ type: 'TOAST', message: '请先松手结束当前录音' });
      return;
    }
    if (analyzingCount > 0) {
      dispatch({ type: 'TOAST', message: '部分段落仍在分析，请稍候' });
      return;
    }
    const done = segments.filter((s) => s.result);
    if (done.length === 0) {
      dispatch({ type: 'TOAST', message: '请先录制至少一段' });
      return;
    }
    if (done.length === 1) {
      dispatch({ type: 'COMPLETE_ANALYSIS', analysis: done[0].result });
      return;
    }
    const summary = aggregateAnalyses(done.map((s) => s.result));
    dispatch({ type: 'COMPLETE_BATCH', summary });
  };

  const busy = recording || analyzingCount > 0;
  const btnLabel =
    segments.length === 0
      ? '完成（0 段）'
      : busy
        ? `完成（${segments.length} 段）· 分析中…`
        : `完成（${segments.length} 段）→ 查看综合`;

  return (
    <div>
      <AppBar title="实时录音" onBack={() => dispatch({ type: 'BACK' })} />

      {/* 中央大圆钮：按住录音 */}
      <div className="record-hero">
        <div
          className={`record-btn ${recording ? 'recording' : ''}`}
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          onPointerCancel={stopRecording}
          onTouchStart={(e) => {
            e.preventDefault();
            startRecording();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            stopRecording();
          }}
          onTouchCancel={stopRecording}
        >
          <IconMic size={34} />
        </div>
        <p className="record-status">{recording ? '录音中… 松手结束' : '按住录音，松手结束'}</p>
        <p className="record-hint">支持连续多段 · 每段停止后自动分析</p>
      </div>

      {/* 段落列表 */}
      <div className="eyebrow mb-2.5">本次已录 {segments.length} 段</div>
      {segments.length === 0 ? (
        <div className="record-empty">按住上方圆钮，录制一段环境声音</div>
      ) : (
        segments.map((s, i) => (
          <div className="rec-seg" key={s.id}>
            <div className="thumb">
              <IconWave size={18} />
            </div>
            <div className="meta">
              <b>
                第 {i + 1} 段 · {s.name}
              </b>
              <span>
                {s.analyzing ? (
                  '分析中…'
                ) : s.result ? (
                  <>
                    已分析 ✓ 宜居度 {s.result.livability.score}
                  </>
                ) : (
                  '分析失败'
                )}{' '}
                · {s.durationSec}s
              </span>
            </div>
            <button className="rec-del" onClick={() => removeSegment(s.id)} aria-label="删除该段">
              <IconTrash size={16} />
            </button>
          </div>
        ))
      )}

      <div className="mt-4">
        <Button variant="primary" icon={<IconMap size={20} />} disabled={busy || segments.length === 0} onClick={finish}>
          {btnLabel}
        </Button>
      </div>
    </div>
  );
}
