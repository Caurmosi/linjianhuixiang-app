/**
 * ErrorBoundary.jsx
 * 全局渲染错误兜底（根治「批量导入后白屏」的直接机制）。
 *
 * React 渲染 / 生命周期阶段任何未捕获异常都会导致整棵组件树卸载 → 页面纯白。
 * 本组件放在 <AppProvider> 外层包裹整个应用：任何子组件渲染 / 生命周期抛错时，
 * 不再卸载整棵树，而是渲染一张贴合设计 token 的兜底页（绝不白屏）。
 *
 * 局限说明（与任务一致）：ErrorBoundary 只能捕获渲染 / 生命周期错误，
 * 无法捕获事件回调 / 异步回调中的错误——所以地图运行时与聚合链路需各自加固
 * （见 MapCanvas / MapPicker / aggregate / appStore 的 try/catch 守卫）。
 *
 * 兜底页「返回首页」：本组件位于 AppProvider 之外拿不到 useApp().dispatch，
 * 因此采用 location.reload() 兜底（重新加载即回到首页 home）。
 */
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  /** 渲染阶段抛错 → 置 error 态（触发兜底 UI） */
  static getDerivedStateFromError(error) {
    return { error };
  }

  /** 生命周期阶段抛错 → 记录到控制台（便于排查），不 setState 避免死循环 */
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] 捕获渲染错误:', error, info);
  }

  /** 返回首页：ErrorBoundary 在 AppProvider 外无法 dispatch，reload 兜底 */
  handleHome = () => {
    if (typeof window !== 'undefined' && window.location) {
      window.location.reload();
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const message = error && error.message ? String(error.message) : '未知错误';
    return (
      <div className="app-bg min-h-screen w-full flex items-center justify-center py-4 sm:px-4">
        <div className="phone-frame">
          <div className="screen">
            <div className="content">
              <div className="card" style={{ marginTop: 48 }}>
                <span className="chip bad">页面异常</span>
                <h2 className="h-title" style={{ marginTop: 14, fontSize: 21 }}>
                  页面出错了
                </h2>
                <p className="text-[12px] text-ink-soft mt-2">
                  页面渲染遇到异常，已为你保留兜底页。可点击下方按钮返回首页重试。
                </p>
                <p className="text-[11px] text-ink-soft mt-2" style={{ wordBreak: 'break-all' }}>
                  错误摘要：{message}
                </p>
                <button className="btn primary" style={{ marginTop: 18 }} onClick={this.handleHome}>
                  返回首页
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
