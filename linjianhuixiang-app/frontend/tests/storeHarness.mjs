/**
 * storeHarness.mjs
 * 测试辅助：从 src/store/appStore.jsx 源码中提取真实的 initialState 与 reducer 纯逻辑，
 * 并在 VM 沙箱中以真实 buildAnalysis / HISTORY 求值。
 *
 * 为什么需要提取而不是直接 import？
 *  - appStore.jsx 是 React JSX 文件（含 <AppContext.Provider> JSX），Node 原生无法解析 JSX；
 *  - reducer 与 initialState 本身是纯 JS（无 JSX），通过源码提取可对"真实实现"做测试，
 *    同时遵守"不修改源码"的约束。
 *
 * 提取方式：按标记定位 + 花括号配平。文件内容已知且结构稳定，若标记缺失会直接抛错。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as repository from '../src/data/repository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storePath = path.join(__dirname, '..', 'src', 'store', 'appStore.jsx');
const src = readFileSync(storePath, 'utf8');

/** 从 marker 之后第一个 '{' 开始做花括号配平，返回包含该块（含闭合 '}'）的源码片段 */
function extractBalanced(marker) {
  const markerIdx = src.indexOf(marker);
  if (markerIdx < 0) {
    throw new Error(`[storeHarness] 源码中未找到标记: ${marker}`);
  }
  const openIdx = src.indexOf('{', markerIdx + marker.length);
  if (openIdx < 0) {
    throw new Error(`[storeHarness] 标记后未找到 '{': ${marker}`);
  }
  let depth = 0;
  let i = openIdx;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) {
    throw new Error(`[storeHarness] 花括号未配平: ${marker}`);
  }
  return src.slice(markerIdx, i + 1);
}

const initialStateSrc = extractBalanced('const initialState = ');
const reducerSrc = extractBalanced('function reducer(state, action) ');

const sandbox = {
  buildAnalysis: repository.buildAnalysis,
  getHistory: repository.getHistory,
};
vm.createContext(sandbox);
vm.runInContext(
  `${initialStateSrc}\n${reducerSrc}\nthis.__initialState = initialState;\nthis.__reducer = reducer;`,
  sandbox,
  { filename: 'appStore.jsx' }
);

export const initialState = sandbox.__initialState;
export const reducer = sandbox.__reducer;
export const STORE_SOURCE_PATH = storePath;
