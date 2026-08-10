/**
 * AnalyzingScreen.jsx
 * 分析中：
 *  - 单文件模式：声波动画 + 管线步骤进度 + 实时百分比，自动推进并在 100% 后跳转结果页；
 *  - 批量模式（START_BATCH）：逐项 await buildAnalysis，BATCH_PROGRESS 推进，
 *    显示「分析 {index+1}/{total}」+ 当前录音名 + 进度动画；全部完成后在本组件内
 *    先聚合（aggregateAnalyses，已加固绝不抛错）再 dispatch COMPLETE_BATCH 跳地图综合页。
 *    聚合不放在 reducer 内——dispatch 阶段抛错会卸载 React 树 → 白屏，故聚合一律在组件侧完成。
 * 失败兜底：单项失败用 buildMockAnalysis（与单次一致），继续下一项，绝不中断。
 */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store/appStore.jsx';
import { buildAnalysis, buildMockAnalysis } from '../data/repository';
import { aggregateAnalyses } from '../utils/aggregate';
import { humanizeBackendError } from '../utils/errorText';
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
const BATCH_STEP_MS = 420; // 批量逐项最小展示时长（mock 同步返回时保证动画可见）

export default function AnalyzingScreen() {
  const { state, dispatch } = useApp();
  const [progress, setProgress] = useState(0);
  const doneRef = useRef(false);
  // 批量各段结果累积（本地权威：dispatch 是异步的，聚合不能依赖下次 render 才有的 batchResults）
  const batchAccRef = useRef([]);
  const batchMode = state.batchMode === true;
  const batchTotal = (state.batchQueue && state.batchQueue.length) || 0;

  // ---- 批量模式：逐项分析并推进 ----
  useEffect(() => {
    if (!batchMode) return undefined;
    let cancelled = false;
    const items = state.batchQueue || [];
    const idx = state.batchIndex;
    if (idx >= items.length) return undefined;
    const item = items[idx];
    const overrides = item && item.overrides ? item.overrides : {};
    const recording = item && item.name ? item.name : '录音';

    const run = async () => {
      let analysis;
      try {
        analysis = await Promise.resolve(
          buildAnalysis(recording, { ...overrides, audioFile: item.file, threshold: state.threshold })
        );
      } catch (err) {
        // 单项失败：与单次一致的降级策略（buildMockAnalysis 兜底），继续下一项
        const reason = humanizeBackendError(err && err.message ? err.message : '未知错误');
        dispatch({ type: 'TOAST', message: `第 ${idx + 1} 项识别失败：${reason}，已用演示结果兜底` });
        analysis = buildMockAnalysis(recording, overrides);
      }
      // 至少展示一小段时间，让「分析 N/M」可感知（真实上传耗时通常已超过该值）
      await new Promise((resolve) => window.setTimeout(resolve, BATCH_STEP_MS));
      if (cancelled) return;

      // 累积本段结果（本地权威，不依赖 dispatch 异步回读）
      batchAccRef.current[idx] = analysis;

      if (idx >= items.length - 1) {
        // 最后一项：全部结果已齐 → 同步聚合（aggregateAnalyses 已加固绝不抛错）→ 跳地图综合页。
        // 聚合在 dispatch 之前同步完成：避免 await 间隙被 effect cleanup 打断导致跳转丢失。
        const results = batchAccRef.current.filter(Boolean);
        let summary;
        try {
          summary = aggregateAnalyses(results);
        } catch (err) {
          // 防御分支：aggregateAnalyses 自带兜底理论上不会触发，此处保底不白屏
          dispatch({ type: 'TOAST', message: '综合分析失败，请重试' });
          summary = aggregateAnalyses(results);
        }
        // 连续 dispatch（React 18 自动批处理为一次渲染）：落结果 + 写综合摘要跳地图
        dispatch({ type: 'BATCH_PROGRESS', index: idx, result: analysis });
        dispatch({ type: 'COMPLETE_BATCH', summary });
        return;
      }

      dispatch({ type: 'BATCH_PROGRESS', index: idx, result: analysis });
    };

    run();
    return () => {
      cancelled = true;
    };
    // batchQueue 为同一引用直至完成，batchIndex 变化驱动逐项推进
  }, [dispatch, batchMode, state.batchIndex, state.batchQueue, state.threshold]);

  // ---- 单文件模式：动画 + 并行请求（现有行为） ----
  useEffect(() => {
    if (batchMode) return undefined;
    let raf = 0;
    let timer = 0;
    let cancelled = false;
    const start = performance.now();

    // 立即并行发起真实请求（与动画并行，不阻塞；后端不可达时动画结束即兜底演示结果，绝不无限转圈）
    const overrides = {
      ...(state.analysisOverrides || {}),
      audioFile: state.audioFile,
      threshold: state.threshold,
    };
    const recording = state.recording || '中山公园_晨.wav';
    // Promise.resolve 归一化「mock 同步返回对象 / api 异步返回 Promise」两种形态
    const pending = Promise.resolve(buildAnalysis(recording, overrides));

    const finish = async () => {
      if (cancelled) return;
      try {
        const analysis = await pending;
        if (cancelled) return;
        dispatch({ type: 'COMPLETE_ANALYSIS', analysis });
      } catch (err) {
        // 识别失败（后端可达但处理出错 / 不可达等）：透传真实原因 + 演示数据兜底，不预设「不可达」
        if (cancelled) return;
        const reason = humanizeBackendError(err && err.message ? err.message : '未知错误');
        const demo = buildMockAnalysis(recording, overrides);
        dispatch({ type: 'TOAST', message: `识别失败：${reason}，本次显示演示结果` });
        dispatch({ type: 'COMPLETE_ANALYSIS', analysis: demo });
      }
    };

    const tick = (t) => {
      const p = Math.min(100, ((t - start) / DURATION) * 100);
      setProgress(p);
      if (p < 100 && !cancelled) {
        raf = requestAnimationFrame(tick);
      } else if (!cancelled && !doneRef.current) {
        doneRef.current = true;
        // 动画完成：等待真实请求落定（已并行进行，最坏 ~1.2s 内必然 settle），再统一跳转
        timer = window.setTimeout(() => {
          finish();
        }, 500);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [dispatch, batchMode, state.recording, state.analysisOverrides, state.audioFile, state.threshold]);

  const waveDelays = [0, 0.1, 0.2, 0.3, 0.15, 0.25, 0.05, 0.35, 0.2, 0.1, 0.3, 0.15];

  // ---- 批量模式渲染：分析 N/M + 当前录音名 + 进度动画 ----
  if (batchMode) {
    const current = Math.min(batchTotal, state.batchIndex + 1);
    const currentName = batchTotal > 0 && state.batchQueue[state.batchIndex] ? state.batchQueue[state.batchIndex].name : '';
    const pct = batchTotal > 0 ? Math.round((state.batchIndex / batchTotal) * 100) : 0;
    return (
      <div className="analyzing">
        <div className="wave">
          {waveDelays.map((d, i) => (
            <i key={i} style={{ animationDelay: `${d}s` }} />
          ))}
        </div>
        <h2>正在分析声景…</h2>
        <p>
          分析 {current}/{batchTotal} · {currentName}
        </p>

        <div className="pipe batch-pipe">
          <div className="step active">
            <div className="dot">
              <IconSpark size={14} />
            </div>
            <div>
              <b>批量逐段识别</b>
              <span>每段独立分析 · 全部完成后聚合为区域综合</span>
            </div>
            <span className="pct">{pct}%</span>
          </div>
        </div>

        <div className="bar batch-bar">
          <i style={{ width: `${pct}%` }} />
        </div>
        <p className="batch-hint">已分析 {Math.min(batchTotal, state.batchIndex)} / {batchTotal} 段，请稍候…</p>
      </div>
    );
  }

  // ---- 单文件模式渲染（现有） ----
  const current = Math.min(STAGES.length - 1, Math.floor(progress / STEP));
  const stagePct = Math.round(((progress - current * STEP) / STEP) * 100);

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
