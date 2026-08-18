/**
 * main.jsx —— 公共地图入口
 *
 * 说明：不使用 StrictMode。本页核心是 maplibre 地图实例（单例生命周期），
 * StrictMode 在开发环境会双挂载 effect，导致地图重复初始化与首屏请求重复发出，
 * 故此处保持最简渲染，由 App 内部自行管理地图销毁/重建。
 */
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

const rootElement = document.getElementById('root');

ReactDOM.createRoot(rootElement).render(<App />);
