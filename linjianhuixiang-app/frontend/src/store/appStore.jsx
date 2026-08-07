/**
 * appStore.js
 * 轻量全局状态：当前屏幕 / 底部 Tab / 分析结果 / 识别阈值 / 处理开关 / Toast
 * 使用 React Context + useReducer，无需额外依赖。
 */
import { createContext, useContext, useReducer } from 'react';
import { buildAnalysis, getHistory } from '../data/repository';

const AppContext = createContext(null);

const initialState = {
  screen: 'home', // home | analyzing | results | species | livability | indices | map | settings | method | history | sample
  tab: 'home', // home | results | map | me
  screenStack: [], // 子页面返回栈
  recording: '中山公园_晨.wav',
  analysis: buildAnalysis('中山公园_晨.wav', { speciesCount: 9, livability: { score: 68, noise: 34, bio: 76, sound: 60 } }),
  analysisOverrides: null, // START_ANALYSIS 携带的 mock 分析覆盖项（样例 / 实时录音使用）
  history: getHistory(),
  threshold: 0.5, // 置信度阈值（0.30 - 0.90）
  highpass: true, // 高通滤波降噪
  realtime: false, // 实时录音分析
  toast: null,
};

function reducer(state, action) {
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
      return { ...state, recording: action.recording, analysisOverrides: action.overrides || null, screen: 'analyzing', screenStack: [] };

    case 'COMPLETE_ANALYSIS':
      return {
        ...state,
        recording: action.analysis.recording,
        analysis: action.analysis,
        screen: 'results',
        tab: 'results',
        screenStack: [],
      };

    case 'LOAD_HISTORY':
      return {
        ...state,
        recording: action.analysis.recording,
        analysis: action.analysis,
        screen: 'results',
        tab: 'results',
        screenStack: [],
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
