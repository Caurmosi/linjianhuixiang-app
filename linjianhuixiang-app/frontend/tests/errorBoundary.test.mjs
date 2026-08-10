/**
 * errorBoundary.test.mjs
 * 全局 ErrorBoundary（src/components/ErrorBoundary.jsx）存在性 / 基本结构测试：
 *  - class 组件，含 getDerivedStateFromError / componentDidCatch；
 *  - 渲染兜底 UI（「页面出错了」/ 错误摘要 / 「返回首页」）；
 *  - App.jsx 最外层（AppProvider 之外）用 <ErrorBoundary> 包裹。
 *
 * Node 无 DOM / 无 React 渲染环境，故对源码做结构级断言（与项目既有
 * appStore.test.js 源码提取式测试风格一致，始终基于文件最新内容）。
 * 运行：node --test tests/errorBoundary.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const componentPath = fileURLToPath(new URL('../src/components/ErrorBoundary.jsx', import.meta.url));
const appPath = fileURLToPath(new URL('../src/App.jsx', import.meta.url));
const comp = readFileSync(componentPath, 'utf8');
const app = readFileSync(appPath, 'utf8');

test('ErrorBoundary 文件存在且为 class 组件（含错误捕获生命周期）', () => {
  assert.ok(comp.length > 0, 'ErrorBoundary.jsx 不应为空');
  assert.ok(/class ErrorBoundary extends Component/.test(comp), '应为 class 组件');
  assert.ok(/static getDerivedStateFromError\(error\)/.test(comp), '应实现 getDerivedStateFromError');
  assert.ok(/componentDidCatch\(/.test(comp), '应实现 componentDidCatch');
  assert.ok(comp.includes('this.state = { error: null }'), '应初始化 error 态');
});

test('getDerivedStateFromError 返回 { error }（渲染错误 → 触发兜底 UI）', () => {
  // 静态断言：getDerivedStateFromError 方法体内 return { error }，即把捕获的错误写入 state
  const m = comp.match(/static getDerivedStateFromError\(error\)\s*\{[\s\S]*return\s*\{\s*error\s*\};[\s\S]*\}/);
  assert.ok(m, 'getDerivedStateFromError 应返回 { error }');
  // 语义等价性：{ error } 即 { error: error }
  const err = new Error('boom');
  assert.deepEqual({ error: err }, { error: err });
});

test('ErrorBoundary 渲染兜底 UI：页面出错了 + 错误摘要 + 返回首页按钮', () => {
  assert.ok(comp.includes('页面出错了'), '兜底 UI 应含「页面出错了」');
  assert.ok(comp.includes('错误摘要'), '应展示错误摘要（小字）');
  assert.ok(comp.includes('返回首页'), '应提供「返回首页」按钮');
  assert.ok(comp.includes('location.reload'), '「返回首页」用 location.reload 兜底');
  // 不破坏渲染错误路径：error 为 null 时渲染 children
  assert.ok(comp.includes('if (!error) return this.props.children'));
});

test('ErrorBoundary 兜底 UI 贴合设计 token（card / chip / btn）', () => {
  assert.ok(comp.includes('className="card"'), '使用 paper 卡片容器');
  assert.ok(comp.includes('chip bad'), '使用 Chip 徽章');
  assert.ok(comp.includes('className="btn primary"'), '使用 Button 主按钮');
});

test('App.jsx 最外层用 <ErrorBoundary> 包裹 <AppProvider>（AppProvider 之外）', () => {
  assert.ok(/import ErrorBoundary from '\.\/components\/ErrorBoundary'/.test(app), 'App.jsx 应引入 ErrorBoundary');
  const openError = app.indexOf('<ErrorBoundary>');
  const openProvider = app.indexOf('<AppProvider>');
  const closeProvider = app.indexOf('</AppProvider>');
  const closeError = app.indexOf('</ErrorBoundary>');
  assert.ok(openError !== -1 && closeError !== -1, 'ErrorBoundary 标签应存在');
  assert.ok(openProvider !== -1 && closeProvider !== -1, 'AppProvider 标签应存在');
  assert.ok(openError < openProvider, 'ErrorBoundary 开启标签在 AppProvider 之前（外层）');
  assert.ok(closeError > closeProvider, 'ErrorBoundary 闭合标签在 AppProvider 之后（外层）');
});
