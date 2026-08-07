/**
 * appStore.test.js —— 全局状态 reducer 单元测试（阈值-物种联动核心）
 *
 * 说明：src/store/appStore.jsx 未导出 reducer / initialState（仅导出 Provider/useApp），
 * 且为 JSX 文件无法被 Node 直接 import。为避免修改业务源码，本测试采用
 * “源码块提取”方式读取 appStore.jsx 原文中的 reducer 与 initialState，
 * 在隔离作用域内执行（两段代码均为纯函数/纯数据，仅依赖内建 API 与 buildAnalysis/HISTORY）。
 * 该方式始终基于文件最新内容，不存在复制漂移。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildAnalysis, analysisForHistory, getHistory, getSpeciesList } from '../src/data/repository.js';

const SPECIES = getSpeciesList();
const HISTORY = getHistory();

const storePath = fileURLToPath(new URL('../src/store/appStore.jsx', import.meta.url));
const src = readFileSync(storePath, 'utf8');

/** 在源码中定位 pattern 起始位置，返回 { start, open, end } */
function findBlock(pattern) {
  const m = src.match(pattern);
  assert.ok(m, `appStore.jsx 中未找到模式: ${pattern}`);
  const start = m.index; // 匹配起点
  const open = m.index + m[0].length - 1; // 左花括号位置
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return { start, open, end: i + 1 };
    }
  }
  throw new Error(`花括号不匹配: ${pattern}`);
}

const reducerBlock = findBlock(/function reducer\(state, action\) \{/);
const reducer = new Function(`return (${src.slice(reducerBlock.start, reducerBlock.end)})`)();

const initBlock = findBlock(/const initialState = \{/);
const initialState = new Function(
  'buildAnalysis',
  'getHistory',
  `return (${src.slice(initBlock.open, initBlock.end)})`
)(buildAnalysis, getHistory);

/** 与 SpeciesScreen.jsx 一致的阈值过滤公式：s.conf >= threshold */
const speciesShown = (threshold) => SPECIES.filter((s) => s.conf >= threshold);

describe('initialState 初始状态', () => {
  test('默认字段与阈值 0.5', () => {
    assert.equal(initialState.screen, 'home');
    assert.equal(initialState.tab, 'home');
    assert.deepEqual(initialState.screenStack, []);
    assert.equal(initialState.threshold, 0.5);
    assert.equal(initialState.highpass, true);
    assert.equal(initialState.realtime, false);
    assert.equal(initialState.toast, null);
  });

  test('默认 analysis 由 buildAnalysis 构建且 speciesCount=9', () => {
    assert.ok(initialState.analysis);
    assert.equal(initialState.analysis.speciesCount, 9);
    assert.equal(initialState.analysis.recording, '中山公园_晨.wav');
  });
});

describe('reducer 未知 action（default 分支）', () => {
  test('返回原 state 引用（不产生新对象）', () => {
    const next = reducer(initialState, { type: 'UNKNOWN_ACTION' });
    assert.equal(next, initialState);
  });
});

describe('reducer 导航：GO / BACK / TAB', () => {
  test('GO 记录返回栈并切换 screen', () => {
    const s = { ...initialState, screen: 'home', screenStack: [] };
    const next = reducer(s, { type: 'GO', screen: 'species' });
    assert.equal(next.screen, 'species');
    assert.deepEqual(next.screenStack, ['home']);
    assert.notEqual(next, s, '必须返回新 state');
  });

  test('BACK 弹出返回栈恢复上一屏', () => {
    let s = { ...initialState, screen: 'species', screenStack: ['home'] };
    s = reducer(s, { type: 'GO', screen: 'indices' }); // stack: ['home','species']
    s = reducer(s, { type: 'BACK' });
    assert.equal(s.screen, 'species');
    assert.deepEqual(s.screenStack, ['home']);
    s = reducer(s, { type: 'BACK' });
    assert.equal(s.screen, 'home');
    assert.deepEqual(s.screenStack, []);
  });

  test('BACK 在空栈时回退到 home 且不崩溃', () => {
    const next = reducer({ ...initialState, screenStack: [] }, { type: 'BACK' });
    assert.equal(next.screen, 'home');
    assert.deepEqual(next.screenStack, []);
  });

  test('TAB 设置 tab/screen 并清空返回栈', () => {
    const s = { ...initialState, screenStack: ['species'] };
    const next = reducer(s, { type: 'TAB', tab: 'me', screen: 'settings' });
    assert.equal(next.tab, 'me');
    assert.equal(next.screen, 'settings');
    assert.deepEqual(next.screenStack, []);
  });
});

describe('reducer 分析流程：START / COMPLETE / LOAD_HISTORY', () => {
  test('START_ANALYSIS 设置 recording 并进入 analyzing', () => {
    const next = reducer(initialState, { type: 'START_ANALYSIS', recording: '新录音.wav' });
    assert.equal(next.recording, '新录音.wav');
    assert.equal(next.screen, 'analyzing');
    assert.deepEqual(next.screenStack, []);
  });

  test('COMPLETE_ANALYSIS 写入分析结果并进入 results', () => {
    const analysis = buildAnalysis('完成.wav');
    const next = reducer(initialState, { type: 'COMPLETE_ANALYSIS', analysis });
    assert.equal(next.screen, 'results');
    assert.equal(next.tab, 'results');
    assert.equal(next.recording, '完成.wav');
    assert.equal(next.analysis, analysis);
    assert.deepEqual(next.screenStack, []);
  });

  test('LOAD_HISTORY 回放历史记录进入 results', () => {
    const analysis = analysisForHistory(HISTORY[0]);
    const next = reducer(initialState, { type: 'LOAD_HISTORY', analysis });
    assert.equal(next.screen, 'results');
    assert.equal(next.recording, HISTORY[0].name);
    assert.equal(next.analysis.speciesCount, HISTORY[0].species);
  });
});

describe('【核心】SET_THRESHOLD 阈值-物种联动', () => {
  test('默认阈值 0.50 时可见 7 种（2 种被隐藏）', () => {
    assert.equal(speciesShown(initialState.threshold).length, 7);
    const hidden = SPECIES.filter((s) => s.conf < initialState.threshold);
    assert.deepEqual(hidden.map((s) => s.name), ['灰喜鹊', '戴胜']);
  });

  test('阈值调到 0.30：全部 9 种显示', () => {
    const next = reducer(initialState, { type: 'SET_THRESHOLD', value: 0.3 });
    assert.equal(next.threshold, 0.3);
    assert.equal(speciesShown(next.threshold).length, SPECIES.length);
  });

  test('阈值调到 0.90：仅 1 种显示（隐藏更多物种）', () => {
    const next = reducer(initialState, { type: 'SET_THRESHOLD', value: 0.9 });
    assert.equal(next.threshold, 0.9);
    assert.equal(speciesShown(next.threshold).length, 1);
    assert.deepEqual(speciesShown(0.9).map((s) => s.name), ['白头鹎']);
  });

  test('阈值越界被钳制（A4）：0.94 → 0.90 显示 1 种；0.10 → 0.30 显示 9 种', () => {
    const high = reducer(initialState, { type: 'SET_THRESHOLD', value: 0.94 });
    assert.equal(high.threshold, 0.9, '超过 0.90 的上限应钳制到 0.90');
    assert.equal(speciesShown(high.threshold).length, 1);
    const low = reducer(initialState, { type: 'SET_THRESHOLD', value: 0.1 });
    assert.equal(low.threshold, 0.3, '低于 0.30 的下限应钳制到 0.30');
    assert.equal(speciesShown(low.threshold).length, SPECIES.length);
  });

  test('边界：conf 恰好等于阈值时保留（>= 语义）', () => {
    // 0.55（八哥）与 0.42（戴胜）在恰好等于阈值时应保留
    assert.equal(speciesShown(0.55).length, 7);
    assert.equal(speciesShown(0.56).length, 6);
    assert.equal(speciesShown(0.42).length, 9);
    assert.equal(speciesShown(0.43).length, 8);
    assert.equal(speciesShown(0.93).length, 1);
  });

  test('SET_THRESHOLD 不修改其他状态字段（纯函数）', () => {
    const before = JSON.parse(JSON.stringify(initialState));
    const next = reducer(initialState, { type: 'SET_THRESHOLD', value: 0.9 });
    const after = { ...before, threshold: 0.9 };
    assert.deepEqual(
      { ...next, threshold: 0.5 },
      { ...before, threshold: 0.5 },
      '除 threshold 外其余字段不应变化'
    );
    assert.equal(next.highpass, before.highpass);
    assert.equal(next.analysis, initialState.analysis, 'analysis 引用不应被替换');
    void after;
  });
});

describe('reducer 开关与 Toast', () => {
  test('SET_HIGHPASS / SET_REALTIME', () => {
    let s = reducer(initialState, { type: 'SET_HIGHPASS', value: false });
    assert.equal(s.highpass, false);
    s = reducer(s, { type: 'SET_REALTIME', value: true });
    assert.equal(s.realtime, true);
    assert.equal(s.highpass, false);
  });

  test('TOAST 设置 / TOAST_CLEAR 清空', () => {
    let s = reducer(initialState, { type: 'TOAST', message: '提示' });
    assert.equal(s.toast, '提示');
    s = reducer(s, { type: 'TOAST_CLEAR' });
    assert.equal(s.toast, null);
  });
});
