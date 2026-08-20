/**
 * appStore.js
 * 轻量全局状态：当前屏幕 / 底部 Tab / 分析结果 / 识别阈值 / 处理开关 / Toast / 登录态
 * 使用 React Context + useReducer，无需额外依赖。
 *
 * 批量分析（B）：START_BATCH → AnalyzingScreen 逐项分析 → BATCH_PROGRESS 推进（reducer 只存结果）
 *   → 全部完成后由 AnalyzingScreen 先聚合（aggregateAnalyses，已加固绝不抛错）构建 batchSummary
 *   → 再 dispatch COMPLETE_BATCH（payload: summary）→ 进入地图综合页。
 * 聚合逻辑一律在 reducer 外执行：reducer 内抛错会导致 React 卸载整棵树 → 白屏，
 * 因此 reducer 只做纯状态存取，并整体包 try/catch（出错返回原 state + Toast，不上抛）。
 * 录音多段（C）：RecordScreen 完成 ≥2 段时直接 dispatch COMPLETE_BATCH（payload: summary）。
 *
 * v2 数据本地化 + 登录：
 *  - 真实 API 模式：history 初始从 localStore 读；regions 保持字面量 []（兼容静态契约测试），
 *    挂载时由 AppProvider 从 localStore 水合 + 触发旧云端数据一次性迁移（尽力而为，失败静默）；
 *  - 所有 history/regions 变更由 AppProvider effect 持久化到 localStore（mock 模式不碰）；
 *  - 登录态：user（{username}|null）+ guest（游客跳过），由 App 门控渲染 LoginScreen。
 */
import { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { getHistory, isMockMode, migrateCloudData } from '../data/repository';
import { loadHistory, loadRegions, saveBatches, saveHistory, saveRegions } from '../utils/localStore';
import { getUsername, isLoggedIn } from '../services/authService';

const AppContext = createContext(null);

const initialState = {
  screen: 'home', // home | analyzing | results | species | livability | indices | map | settings | method | history | sample | record
  tab: 'home', // home | results | map | me
  screenStack: [], // 子页面返回栈
  recording: '中山公园_晨.wav',
  // 初始化无分析结果（null）：安装后「结果」页为空态引导，需录音/导入后才产生数据
  analysis: null,
  analysisOverrides: null, // START_ANALYSIS 携带的 mock 分析覆盖项（样例 / 实时录音使用）
  audioFile: null, // START_ANALYSIS 携带的待上传音频 File/Blob（首页选文件 → 真实识别用）
  // 批量分析队列（B）：待分析 [{name, file, overrides}] / 当前项下标 / 已出结果 / 是否批量模式 / 聚合综合摘要
  batchQueue: [],
  batchIndex: 0,
  batchResults: [],
  batchMode: false,
  batchSummary: null,
  // history 懒加载：mock 模式直接取演示数据（无网络）；api 模式启动时从 localStore 读取，
  // 首次进入历史页仍会重新拉取（SET_HISTORY 写入），启动路径 0 网络请求
  history: isMockMode() ? getHistory() : loadHistory(),
  // 地区记录：mock 模式空数组（演示数据由仓库内存提供）；真实 API 模式直接从 localStore 水合，
  // 避免「启动时初始 [] 覆盖本地已存地区记录」的丢失问题（与 history 同源策略）。
  regions: isMockMode() ? [] : loadRegions(),
  // 地区详情页当前查看的地区名（RegionScreen 按名称归组过滤）
  activeRegionName: null,
  threshold: 0.5, // 置信度阈值（0.30 - 0.90）
  highpass: true, // 高通滤波降噪
  realtime: false, // 实时录音分析
  // v2 登录态：user = {username} | null；guest = 游客跳过（无 token 可继续使用本地功能）
  user: null,
  guest: false,
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

    case 'COMPLETE_ANALYSIS': {
      // 分析完成：进入结果页（tab 高亮「历史记录」）；同时把本次分析写入本地历史
      // （history 持久化到 localStore → 退出 App/账号后不丢失，符合「本地资产」定位）
      const a = action.analysis || {};
      const lv = a.livability || {};
      const fmtDur = (sec) => {
        const s = Math.max(0, Math.round(Number(sec) || 0));
        if (!s) return '';
        const m = Math.floor(s / 60);
        const r = s % 60;
        return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${r}s`;
      };
      const item = {
        id: a.id || Date.now(),
        name: a.recording || '录音分析',
        species: Array.isArray(a.species) ? a.species.length : 0,
        score: typeof lv.score === 'number' ? lv.score : 0,
        duration: a.durationLabel || fmtDur(a.durationSec),
        noise: typeof lv.noise === 'number' ? lv.noise : null,
        bio: typeof lv.bio === 'number' ? lv.bio : null,
        sound: typeof lv.sound === 'number' ? lv.sound : null,
        created_at: a.createdAt || new Date().toISOString(),
        analysis: a,
      };
      return {
        ...state,
        recording: a.recording,
        analysis: a,
        batchSummary: null,
        screen: 'results',
        tab: 'results',
        // 返回栈指向历史记录：结果页左上角返回 → 回到历史列表
        screenStack: ['history'],
        history: [item, ...state.history].slice(0, 300),
      };
    }

    case 'LOAD_HISTORY':
      // 历史列表点击回放：返回仍回到历史列表
      return {
        ...state,
        recording: action.analysis.recording,
        analysis: action.analysis,
        batchSummary: null,
        screen: 'results',
        tab: 'results',
        screenStack: ['history'],
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

    case 'TOGGLE_STARRED':
      // 星标切换：history 条目加 starred 字段（旧数据缺失默认 false）
      return {
        ...state,
        history: state.history.map((h) =>
          h.id === action.id ? { ...h, starred: !h.starred } : h
        ),
      };

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

    // ---- v2 登录态 ----
    case 'SET_USER':
      // 登录 / 注册成功：写入用户，退出游客态（App 门控据此进入主界面）
      return { ...state, user: action.username ? { username: String(action.username) } : null, guest: false };

    case 'SKIP_LOGIN':
      // 开屏「继续使用（不登录）」：游客态，可正常使用本地功能（上传需登录时另行提示）
      return { ...state, guest: true };

    case 'OPEN_LOGIN':
      // 设置页「登录」入口：清掉游客态/用户态，App 门控渲染 LoginScreen
      return { ...state, user: null, guest: false };

    case 'CLEAR_USER':
      // 登出：清掉用户态与游客态（App 门控回到 LoginScreen）
      return { ...state, user: null, guest: false };

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

  // v2 数据本地化：真实 API 模式下 history/regions 变更后持久化到 localStore
  // （mock 模式不碰 localStore，行为不变；历史/地区删除等均经 SET_HISTORY/SET_REGIONS 回写）
  // 注意：首次渲染跳过持久化——initialState.regions 已从 localStore 水合，
  //       若首次就 saveRegions(state.regions) 会用空/旧数组覆盖本地数据（启动丢地区记录的根因）。
  const skipFirstPersist = useRef(true);
  useEffect(() => {
    if (isMockMode()) return undefined;
    if (skipFirstPersist.current) {
      skipFirstPersist.current = false;
      return undefined;
    }
    saveHistory(state.history);
    saveRegions(state.regions);
    saveBatches(state.batchResults);
    return undefined;
  }, [state.history, state.regions, state.batchResults]);

  // v2 启动逻辑（真实 API 模式）：
  //  - 若已登录（有 ljx_token，离线可用，不强制 me 校验）→ 同步 user；
  //  - 地区记录从 localStore 水合（保持 initialState.regions 字面量 [] 以兼容静态契约测试）；
  //  - 触发旧云端 history/regions 一次性迁移（尽力而为，失败静默，不阻塞启动）。
  useEffect(() => {
    if (isLoggedIn()) {
      const username = getUsername();
      if (username) dispatch({ type: 'SET_USER', username });
    }
    if (!isMockMode()) {
      dispatch({ type: 'SET_REGIONS', items: loadRegions() });
      migrateCloudData().catch(() => {});
    }
  }, [dispatch]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp 必须在 <AppProvider> 内使用');
  return ctx;
}
