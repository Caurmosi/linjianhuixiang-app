/**
 * appStoreReducer.test.mjs
 * appStore.jsx reducer 行为测试（通过 storeHarness 对真实源码逻辑求值）
 * 覆盖：导航(GO/BACK/TAB)、分析流程(START/COMPLETE/LOAD_HISTORY)、
 *       设置(SET_THRESHOLD/SET_HIGHPASS/SET_REALTIME)、Toast、默认分支、不可变性。
 * 运行：node --test tests/appStoreReducer.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reducer, initialState } from './storeHarness.mjs';

/**
 * reducer 在 vm 沙箱中求值，其数组来自另一 V8 context（原型不同）。
 * node:assert/strict 的 deepEqual 会因原型不同而报"结构相同但引用不同"。
 * 这里统一用 Array.from 归一化为当前 context 的数组后再比较。
 */
const arr = (v) => Array.from(v);

test('initialState: 关键初始值正确', () => {
  assert.equal(initialState.screen, 'home');
  assert.equal(initialState.tab, 'home');
  assert.deepEqual(arr(initialState.screenStack), []);
  assert.equal(initialState.recording, '中山公园_晨.wav');
  assert.equal(initialState.threshold, 0.5);
  assert.equal(initialState.highpass, true);
  assert.equal(initialState.realtime, false);
  assert.equal(initialState.toast, null);
  assert.equal(initialState.analysisOverrides, null);
  assert.equal(initialState.history.length, 3);
  assert.equal(initialState.analysis, null); // 安装后无默认结果
});

test('SET_THRESHOLD: 更新阈值且不改变其他字段（不可变性）', () => {
  const before = initialState;
  const next = reducer(before, { type: 'SET_THRESHOLD', value: 0.8 });
  assert.equal(next.threshold, 0.8);
  assert.notEqual(next, before, '应返回新对象');
  assert.equal(before.threshold, 0.5, '原 state 不应被修改');
  assert.equal(next.screen, before.screen);
  assert.equal(next.tab, before.tab);
  assert.deepEqual(next.screenStack, before.screenStack);
  assert.equal(next.highpass, before.highpass);
  assert.equal(next.realtime, before.realtime);
  assert.equal(next.toast, before.toast);
  assert.equal(next.analysis, before.analysis);
});

test('SET_THRESHOLD: 滑杆边界 0.30 / 0.90 可正常存储', () => {
  assert.equal(reducer(initialState, { type: 'SET_THRESHOLD', value: 0.3 }).threshold, 0.3);
  assert.equal(reducer(initialState, { type: 'SET_THRESHOLD', value: 0.9 }).threshold, 0.9);
});

test('SET_THRESHOLD: 越界值被钳制到 [0.30, 0.90]（A4）', () => {
  assert.equal(reducer(initialState, { type: 'SET_THRESHOLD', value: 0.1 }).threshold, 0.3, '低于下限钳制到 0.30');
  assert.equal(reducer(initialState, { type: 'SET_THRESHOLD', value: 0.94 }).threshold, 0.9, '高于上限钳制到 0.90');
  assert.equal(reducer(initialState, { type: 'SET_THRESHOLD', value: -1 }).threshold, 0.3);
  assert.equal(reducer(initialState, { type: 'SET_THRESHOLD', value: 2 }).threshold, 0.9);
  assert.equal(reducer(initialState, { type: 'SET_THRESHOLD', value: 0.66 }).threshold, 0.66, '范围内原样存储');
});

test('SET_HIGHPASS / SET_REALTIME: 开关切换', () => {
  assert.equal(reducer(initialState, { type: 'SET_HIGHPASS', value: false }).highpass, false);
  assert.equal(reducer(initialState, { type: 'SET_HIGHPASS', value: true }).highpass, true);
  assert.equal(reducer(initialState, { type: 'SET_REALTIME', value: true }).realtime, true);
  assert.equal(reducer(initialState, { type: 'SET_REALTIME', value: false }).realtime, false);
});

test('GO: 记录返回栈并进入子页面', () => {
  const next = reducer(initialState, { type: 'GO', screen: 'species' });
  assert.equal(next.screen, 'species');
  assert.deepEqual(arr(next.screenStack), ['home']);
});

test('GO 连续两次: 栈深度为 2，可逐级返回', () => {
  const s1 = reducer(initialState, { type: 'GO', screen: 'species' });
  const s2 = reducer(s1, { type: 'GO', screen: 'indices' });
  assert.deepEqual(arr(s2.screenStack), ['home', 'species']);
  const back1 = reducer(s2, { type: 'BACK' });
  assert.equal(back1.screen, 'species');
  assert.deepEqual(arr(back1.screenStack), ['home']);
  const back2 = reducer(back1, { type: 'BACK' });
  assert.equal(back2.screen, 'home');
  assert.deepEqual(arr(back2.screenStack), []);
});

test('BACK: 栈为空时回退到 home', () => {
  const next = reducer(initialState, { type: 'BACK' });
  assert.equal(next.screen, 'home');
  assert.deepEqual(arr(next.screenStack), []);
});

test('TAB: 切换底部导航并清空返回栈', () => {
  const s1 = reducer(initialState, { type: 'GO', screen: 'species' });
  const next = reducer(s1, { type: 'TAB', tab: 'me', screen: 'settings' });
  assert.equal(next.tab, 'me');
  assert.equal(next.screen, 'settings');
  assert.deepEqual(arr(next.screenStack), []);
});

test('START_ANALYSIS: 记录录音名，进入 analyzing，清空返回栈', () => {
  const next = reducer(initialState, { type: 'START_ANALYSIS', recording: '滨江绿地_午后.mp3' });
  assert.equal(next.recording, '滨江绿地_午后.mp3');
  assert.equal(next.screen, 'analyzing');
  assert.deepEqual(arr(next.screenStack), []);
  assert.equal(next.analysisOverrides, null, '未携带 overrides 时保持 null');
});

test('START_ANALYSIS: 携带 overrides（样例/实时录音）时存入 analysisOverrides', () => {
  const overrides = { speciesCount: 12, livability: { score: 82, noise: 22, bio: 88, sound: 74 } };
  const next = reducer(initialState, { type: 'START_ANALYSIS', recording: '西郊森林公园_黄昏.wav', overrides });
  assert.equal(next.recording, '西郊森林公园_黄昏.wav');
  assert.equal(next.analysisOverrides, overrides, 'overrides 应原样保存供 AnalyzingScreen 使用');
  assert.equal(next.screen, 'analyzing');
});

test('COMPLETE_ANALYSIS: 写入分析结果并跳转结果页（返回栈指向历史）', () => {
  const analysis = { recording: 'x.wav', speciesCount: 3, species: [], livability: { score: 60 } };
  const next = reducer(initialState, { type: 'COMPLETE_ANALYSIS', analysis });
  assert.equal(next.analysis, analysis);
  assert.equal(next.recording, 'x.wav');
  assert.equal(next.screen, 'results');
  assert.equal(next.tab, 'results');
  assert.deepEqual(arr(next.screenStack), ['history'], '返回应回历史记录');
  assert.equal(next.history.length, initialState.history.length + 1, '本次分析应写入历史');
});

test('LOAD_HISTORY: 加载历史分析并跳转结果页（返回仍回历史）', () => {
  const analysis = { recording: '西郊森林公园_黄昏.wav', speciesCount: 12 };
  const next = reducer(initialState, { type: 'LOAD_HISTORY', analysis });
  assert.equal(next.analysis, analysis);
  assert.equal(next.recording, '西郊森林公园_黄昏.wav');
  assert.equal(next.screen, 'results');
  assert.equal(next.tab, 'results');
  assert.deepEqual(arr(next.screenStack), ['history']);
});

test('TOAST / TOAST_CLEAR: 提示消息设置与清除', () => {
  const s1 = reducer(initialState, { type: 'TOAST', message: '导出为 P1 功能，开发中' });
  assert.equal(s1.toast, '导出为 P1 功能，开发中');
  const s2 = reducer(s1, { type: 'TOAST_CLEAR' });
  assert.equal(s2.toast, null);
});

test('未知 action: 返回原 state（引用不变）', () => {
  const next = reducer(initialState, { type: 'NOT_A_REAL_ACTION' });
  assert.equal(next, initialState);
});
