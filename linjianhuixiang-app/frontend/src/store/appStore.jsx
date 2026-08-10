/**
 * appStore.js
 * 轻量全局状态：当前屏幕 / 底部 Tab / 分析结果 / 识别阈值 / 处理开关 / Toast
 * 使用 React Context + useReducer，无需额外依赖。
 *
 * 批量分析（B）：START_BATCH → AnalyzingScreen 逐项分析 → BATCH_PROGRESS 推进（reducer 只存结果）
 *   → 全部完成后由 AnalyzingScreen 先聚合（aggregateAnalyses，已加固绝不抛错）构建 batchSummary
 *   → 再 dispatch COMPLETE_BATCH（payload: summary）→ 进入地图综合页。
 * 聚合逻辑一律在 reducer 外执行：reducer 内抛错会导致 React 卸载整棵树 → 白屏，
 * 因此 reducer 只做纯状态存取，并整体包 try/catch（出错返回原 state + Toast，不上抛）。
 * 录音多段（C）：RecordScreen 完成 ≥2 段时直接 dispatch COMPLETE_BATCH（payload: summary）。
 */
import { createContext, useContext, useReducer } from 'react';
import { buildMockAnalysis, getHistory, isMockMode } from '../data/repository';

const AppContext = createContext(null);

const initialState = {
  screen: 'home', // home | analyzing | results | species | livability | indices | map | settings | method | history | sample | record
  tab: 'home', // home | results | map | me
  screenStack: [], // 子页面返回栈
  recording: '中山公园_晨.wav',
  // 初始化用纯本地 mock 生成（绝不发网络请求，后端不可达也能 1s 内出 UI）
  analysis: buildMockAnalysis('中山公园_晨.wav', { speciesCount: 9, livability: { score: 68, noise: 34, bio: 76, sound: 60 } }),
  analysisOverrides: null, // START_ANALYSIS 携带的 mock 分析覆盖项（样例 / 实时录音使用）
  audioFile: null, // START_ANALYSIS 携带的待上传音频 File/Blob（首页选文件 → 真实识别用）
  // 批量分析队列（B）：待分析 [{name, file, overrides}] / 当前项下标 / 已出结果 / 是否批量模式 / 聚合综合摘要
  batchQueue: [],
  batchIndex: 0,
  batchResults: [],
  batchMode: false,
  batchSummary: null,
  // history 懒加载：mock 模式直接取演示数据（无网络）；api 模式启动时置空，
  // 首次进入历史页才发起请求（SET_HISTORY 写入），启动路径 0 网络请求
  history: isMockMode() ? getHistory() : [],
  // 地区记录：进入地图页时加载（SET_REGIONS 写入）；mock 模式也从内存态仓库取数
  regions: [],
  // 地区详情页当前查看的地区名（RegionScreen 按名称归组过滤）
  activeRegionName: null,
  threshold: 0.5, // 置信度阈值（0.30 - 0.90）
  highpass: true, // 高通滤波降噪
  realtime: false, // 实时录音分析
  toast: null,
};

function reducer(state, action) {
  try {
    /** 批量完成后的统一落点：写综合摘要 + 跳地图综合页 + 清空队列状态 */
    const completeBatch = (summary) => ({
      ...state,
      batchSummary: summary,
      screen: 'map',
      tab: 'map',
      batchMode: false,
      batchQueue: [],
      batchIndex: 0,
      batchResults: [],
      screenStack: [],
    });

    switch (action.type) {
    case 'GO':
      // 进入子页面（结果详情等），记录返回栈
      return { ...state, screenStack: [...state.screenStack, state.screen], screen: action.screen };

    case 'BACK': {
      const stack = state.screenStack.slice();
      const prev = stack.pop() || 'home';
      return { ...state, screenStack: stack, screen: prev };
    }

    case 'TAB':
      return { ...state, tab: action.tab, screen: action.screen, screenStack: [] };

    case 'START_ANALYSIS':
      // 新一次单文件分析：清空旧批量综合摘要，避免地图页残留上一批数据
      return {
        ...state,
        recording: action.recording,
        audioFile: action.audioFile || null,
        analysisOverrides: action.overrides || null,
        batchSummary: null,
        screen: 'analyzing',
        screenStack: [],
      };

    case 'COMPLETE_ANALYSIS':
      return {
        ...state,
        recording: action.analysis.recording,
        analysis: action.analysis,
        batchSummary: null,
        screen: 'results',
        tab: 'results',
        screenStack: [],
      };

    case 'LOAD_HISTORY':
      return {
        ...state,
        recording: action.analysis.recording,
        analysis: action.analysis,
        batchSummary: null,
        screen: 'results',
        tab: 'results',
        screenStack: [],
      };

    case 'START_BATCH':
      // 批量分析：items = [{name, file, overrides}]，进入 analyzing，清空旧状态
      return {
        ...state,
        batchQueue: Array.isArray(action.items) ? action.items.slice() : [],
        batchIndex: 0,
        batchResults: [],
        batchMode: true,
        batchSummary: null,
        audioFile: null,
        analysisOverrides: null,
        screen: 'analyzing',
        screenStack: [],
      };

    case 'BATCH_PROGRESS':
      // 逐项分析完成：按 index 存入结果、batchIndex + 1。
      // 聚合已移出 reducer——全部完成后的跳转由 AnalyzingScreen 先聚合再 dispatch
      // COMPLETE_BATCH；reducer 只做纯状态存取（聚合/跳转逻辑不再放这里，防 dispatch 崩溃白屏）
      {
        const results = state.batchResults.slice();
        results[action.index] = action.result;
        return { ...state, batchResults: results, batchIndex: state.batchIndex + 1 };
      }

    case 'COMPLETE_BATCH':
      // 直接以综合摘要跳地图（录音多段 / 已在外部算好摘要的场景复用）
      return completeBatch(action.summary);

    case 'CLEAR_BATCH':
      // 清除综合摘要与队列状态（地图综合页「清除综合，返回」）
      return {
        ...state,
        batchSummary: null,
        batchMode: false,
        batchQueue: [],
        batchIndex: 0,
        batchResults: [],
      };

    case 'SET_HISTORY':
      // 懒加载写入历史列表（首次进入历史页 fetch 后回填；失败置空数组）
      return { ...state, history: Array.isArray(action.items) ? action.items : [] };

    case 'SET_REGIONS':
      // 写入地区记录列表（进入地图页 / 保存 / 删除 / 重命名后刷新）
      return { ...state, regions: Array.isArray(action.items) ? action.items : [] };

    case 'SET_BATCH_MAP':
      // 综合摘要简化固定地图（MapPicker「简化固定」回调）：写入 batchSummary.map，
      // 保存地区记录时随 detail 落库（RegionScreen 按 detail.map 渲染真实地图）
      return {
        ...state,
        batchSummary: state.batchSummary ? { ...state.batchSummary, map: action.map || null } : state.batchSummary,
      };

    case 'OPEN_REGION':
      // 进入地区详情：记录地区名（同名记录归组展示 / 趋势对比）
      return {
        ...state,
        screenStack: [...state.screenStack, state.screen],
        screen: 'region',
        activeRegionName: action.name,
      };

    case 'SET_THRESHOLD':
      // 钳制到 [0.30, 0.90]，与 UI 滑杆范围一致（A4）
      return { ...state, threshold: Math.min(0.9, Math.max(0.3, action.value)) };

    case 'SET_HIGHPASS':
      return { ...state, highpass: action.value };

    case 'SET_REALTIME':
      return { ...state, realtime: action.value };

    case 'TOAST':
      return { ...state, toast: action.message };

    case 'TOAST_CLEAR':
      return { ...state, toast: null };

    default:
      return state;
    }
  } catch (err) {
    // 守卫：reducer 内任何意外都不得上抛——dispatch 抛错会导致 React 卸载整棵组件树 → 白屏。
    // 返回原 state + Toast 提示，页面保持可用
    return { ...state, toast: state.toast || '页面状态异常，请重试' };
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp 必须在 <AppProvider> 内使用');
  return ctx;
}
