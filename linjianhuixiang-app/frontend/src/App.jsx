/**
 * App.jsx
 * 应用外壳：手机画布 + 屏幕路由 + 底部导航 + Toast + 开屏登录门控
 * 说明：真机上由系统绘制真实顶部系统栏，H5 不再渲染模拟状态栏；
 * components/ 目录下的状态栏组件文件保留作参考但不挂载。
 *
 * v2 开屏登录（用户 2026-08-18 决策）：
 *  - App 启动读 ljx_token：有则进主界面（离线可用，不强制 me 校验）；
 *  - 无 token 且未「继续使用（不登录）」跳过 → 渲染 LoginScreen（开屏登录/注册合一页）；
 *  - 跳过即游客（无 token）：本地功能可用，上传到公共地图时提示需登录。
 */
import { useEffect } from 'react';
import { AppProvider, useApp } from './store/appStore.jsx';
import ErrorBoundary from './components/ErrorBoundary';
import BottomNav from './components/BottomNav';
import HomeScreen from './screens/HomeScreen';
import AnalyzingScreen from './screens/AnalyzingScreen';
import RecordScreen from './screens/RecordScreen';
import ResultsScreen from './screens/ResultsScreen';
import SpeciesScreen from './screens/SpeciesScreen';
import LivabilityScreen from './screens/LivabilityScreen';
import IndicesScreen from './screens/IndicesScreen';
import MapScreen from './screens/MapScreen';
import SettingsScreen from './screens/SettingsScreen';
import MethodScreen from './screens/MethodScreen';
import HistoryScreen from './screens/HistoryScreen';
import SampleScreen from './screens/SampleScreen';
import RegionScreen from './screens/RegionScreen';
import LoginScreen from './screens/LoginScreen';
import { isLoggedIn } from './services/authService';

const SCREENS = {
  home: HomeScreen,
  analyzing: AnalyzingScreen,
  record: RecordScreen,
  results: ResultsScreen,
  species: SpeciesScreen,
  livability: LivabilityScreen,
  indices: IndicesScreen,
  map: MapScreen,
  settings: SettingsScreen,
  method: MethodScreen,
  history: HistoryScreen,
  sample: SampleScreen,
  region: RegionScreen,
};

function ActiveScreen() {
  const { state } = useApp();
  const Screen = SCREENS[state.screen] || HomeScreen;
  return <Screen />;
}

function BottomNavHost() {
  const { state, dispatch } = useApp();
  if (state.screen === 'analyzing') return null; // 分析中全屏，隐藏底栏
  const onTab = (id) => {
    const screen = { home: 'home', results: 'results', map: 'map', me: 'settings' }[id];
    dispatch({ type: 'TAB', tab: id, screen });
  };
  return <BottomNav tab={state.tab} onTab={onTab} />;
}

function Toast() {
  const { state, dispatch } = useApp();
  useEffect(() => {
    if (!state.toast) return undefined;
    const t = window.setTimeout(() => dispatch({ type: 'TOAST_CLEAR' }), 2400);
    return () => window.clearTimeout(t);
  }, [state.toast, dispatch]);
  if (!state.toast) return null;
  return <div className="toast">{state.toast}</div>;
}

function AppShell() {
  const { state } = useApp();
  // v2 开屏登录门控：
  //  - 已登录（有 ljx_token）→ 主界面（离线可用）；
  //  - 未登录且未跳过（guest）→ 渲染 LoginScreen。
  //    登录成功（SET_USER）或游客跳过（SKIP_LOGIN）后自动进入主界面。
  const showLogin = !state.user && !state.guest && !isLoggedIn();
  return (
    <div className="app-bg min-h-screen w-full flex items-center justify-center py-4 sm:px-4">
      <div className="phone-frame">
        <div className="screen">
          {showLogin ? (
            <LoginScreen />
          ) : (
            <>
              <div className="content">
                <ActiveScreen />
              </div>
              <BottomNavHost />
            </>
          )}
          <Toast />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    // 全局 ErrorBoundary 包在 AppProvider 外面：任何子组件渲染/生命周期抛错
    // 都渲染兜底页而非卸载整棵树（白屏的根治手段）
    <ErrorBoundary>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </ErrorBoundary>
  );
}
