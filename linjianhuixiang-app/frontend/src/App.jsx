/**
 * App.jsx
 * 应用外壳：手机画布 + 屏幕路由 + 底部导航 + Toast
 * 说明：真机上由系统绘制真实顶部系统栏，H5 不再渲染模拟状态栏；
 * components/ 目录下的状态栏组件文件保留作参考但不挂载。
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

export default function App() {
  return (
    // 全局 ErrorBoundary 包在 AppProvider 外面：任何子组件渲染/生命周期抛错
    // 都渲染兜底页而非卸载整棵树（白屏的根治手段）
    <ErrorBoundary>
      <AppProvider>
        <div className="app-bg min-h-screen w-full flex items-center justify-center py-4 sm:px-4">
          <div className="phone-frame">
            <div className="screen">
              <div className="content">
                <ActiveScreen />
              </div>
              <BottomNavHost />
              <Toast />
            </div>
          </div>
        </div>
      </AppProvider>
    </ErrorBoundary>
  );
}
