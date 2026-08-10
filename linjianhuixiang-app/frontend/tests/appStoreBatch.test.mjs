/**
 * appStoreBatch.test.mjs
 * appStore 批量分析 action（B）行为测试：
 *  - START_BATCH：初始化队列 / batchMode / 进入 analyzing；
 *  - BATCH_PROGRESS：按 index 存结果、batchIndex 递增，保持批量态（不自动跳转）；
 *  - 聚合已移出 reducer：全部完成后由 AnalyzingScreen 先 aggregateAnalyses 再 dispatch
 *    COMPLETE_BATCH 跳地图综合页（reducer 内任何聚合调用都被移除——防 dispatch 崩溃白屏）；
 *  - COMPLETE_BATCH：直接携带摘要跳地图（录音多段/批量聚合完成后的统一落点）；
 *  - CLEAR_BATCH：清除综合摘要与队列。
 * 运行：node --test tests/appStoreBatch.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reducer, initialState } from './storeHarness.mjs';
import { buildAnalysis } from '../src/data/repository.js';

const arr = (v) => Array.from(v);

test('initialState: 批量字段初始值', () => {
  assert.deepEqual(arr(initialState.batchQueue), []);
  assert.equal(initialState.batchIndex, 0);
  assert.deepEqual(arr(initialState.batchResults), []);
  assert.equal(initialState.batchMode, false);
  assert.equal(initialState.batchSummary, null);
});

test('START_BATCH: 初始化队列与批量态，进入 analyzing，清空旧摘要', () => {
  const items = [
    { name: 'a.wav', file: {} },
    { name: 'b.wav', file: {} },
  ];
  const s1 = reducer(initialState, { type: 'COMPLETE_BATCH', summary: { recording: '旧摘要' } });
  assert.equal(s1.batchSummary.recording, '旧摘要');
  const next = reducer(s1, { type: 'START_BATCH', items });
  assert.deepEqual(arr(next.batchQueue).map((i) => i.name), ['a.wav', 'b.wav']);
  assert.equal(next.batchIndex, 0);
  assert.deepEqual(arr(next.batchResults), []);
  assert.equal(next.batchMode, true);
  assert.equal(next.batchSummary, null, 'START_BATCH 应清空旧综合摘要');
  assert.equal(next.screen, 'analyzing');
  assert.deepEqual(arr(next.screenStack), []);
  assert.equal(next.audioFile, null);
});

test('START_BATCH: 非数组 items 降级为空队列且不抛错', () => {
  const next = reducer(initialState, { type: 'START_BATCH' });
  assert.equal(next.batchMode, true);
  assert.deepEqual(arr(next.batchQueue), []);
  assert.equal(next.screen, 'analyzing');
});

test('BATCH_PROGRESS: 按 index 存结果、batchIndex 递增，未完成保持批量态', () => {
  const items = [{ name: 'a.wav' }, { name: 'b.wav' }];
  const s1 = reducer(initialState, { type: 'START_BATCH', items });
  const r0 = buildAnalysis('a.wav', { speciesCount: 3 });
  const next = reducer(s1, { type: 'BATCH_PROGRESS', index: 0, result: r0 });
  assert.equal(next.batchIndex, 1);
  assert.equal(next.batchResults[0], r0);
  assert.equal(next.batchMode, true, '未全部完成时保持批量态');
  assert.equal(next.screen, 'analyzing');
  assert.equal(next.batchSummary, null);
});

test('BATCH_PROGRESS: 全部完成后不自动聚合跳转（聚合在 AnalyzingScreen 侧），保持批量态', () => {
  const items = [{ name: 'a.wav' }, { name: 'b.wav' }];
  const s1 = reducer(initialState, { type: 'START_BATCH', items });
  const r0 = buildAnalysis('a.wav', { speciesCount: 3, livability: { score: 72, noise: 25, bio: 80, sound: 68 } });
  const r1 = buildAnalysis('b.wav', { speciesCount: 4, livability: { score: 55, noise: 45, bio: 60, sound: 50 } });
  const s2 = reducer(s1, { type: 'BATCH_PROGRESS', index: 0, result: r0 });
  const done = reducer(s2, { type: 'BATCH_PROGRESS', index: 1, result: r1 });

  // 全部结果已入槽、batchIndex 推到队列末尾——但不再自动聚合/跳转
  assert.equal(done.batchResults.length, 2);
  assert.equal(done.batchIndex, 2);
  assert.equal(done.batchMode, true, '聚合已移出 reducer：全部完成后保持批量态，等待 AnalyzingScreen dispatch COMPLETE_BATCH');
  assert.equal(done.screen, 'analyzing', '不自动跳地图');
  assert.equal(done.batchSummary, null);

  // 聚合后的摘要由 AnalyzingScreen 计算并随 COMPLETE_BATCH 落库 → 跳地图综合页
  const summary = { recording: '本区域 2 段录音综合', speciesCount: 4, livability: { score: 64 }, mapPoints: [{}, {}] };
  const landed = reducer(done, { type: 'COMPLETE_BATCH', summary });
  assert.equal(landed.screen, 'map');
  assert.equal(landed.tab, 'map');
  assert.equal(landed.batchMode, false);
  assert.deepEqual(arr(landed.batchQueue), []);
  assert.equal(landed.batchIndex, 0);
  assert.deepEqual(arr(landed.batchResults), []);
  assert.deepEqual(arr(landed.screenStack), []);
  assert.equal(landed.batchSummary, summary);
});

test('BATCH_PROGRESS: 乱序/跳跃 index 存入对应槽位（按 index 落位）', () => {
  const items = [{ name: 'a.wav' }, { name: 'b.wav' }];
  const s1 = reducer(initialState, { type: 'START_BATCH', items });
  const r1 = buildAnalysis('b.wav');
  const s2 = reducer(s1, { type: 'BATCH_PROGRESS', index: 1, result: r1 });
  assert.equal(s2.batchResults[1], r1);
  assert.equal(s2.batchResults[0], undefined, '空槽保持 undefined');
  assert.equal(s2.batchIndex, 1);
  assert.equal(s2.batchMode, true, '有结果数量未达到总长，不提前完成');
});

test('COMPLETE_BATCH: 直接携带摘要跳地图（录音多段复用路径）', () => {
  const summary = { recording: '本区域 3 段录音综合', speciesCount: 6 };
  const next = reducer(initialState, { type: 'COMPLETE_BATCH', summary });
  assert.equal(next.batchSummary, summary);
  assert.equal(next.screen, 'map');
  assert.equal(next.tab, 'map');
  assert.equal(next.batchMode, false);
  assert.deepEqual(arr(next.batchQueue), []);
  assert.equal(next.batchIndex, 0);
});

test('CLEAR_BATCH: 清除综合摘要与队列状态，不跳转', () => {
  const s1 = reducer(initialState, { type: 'COMPLETE_BATCH', summary: { recording: 'x' } });
  const next = reducer(s1, { type: 'CLEAR_BATCH' });
  assert.equal(next.batchSummary, null);
  assert.equal(next.batchMode, false);
  assert.deepEqual(arr(next.batchQueue), []);
  assert.equal(next.batchIndex, 0);
  assert.deepEqual(arr(next.batchResults), []);
  assert.equal(next.screen, 'map', 'CLEAR_BATCH 本身不改变屏幕');
});

test('SET_BATCH_MAP: 写入 batchSummary.map（简化固定地图），其余字段不变', () => {
  const s1 = reducer(initialState, { type: 'COMPLETE_BATCH', summary: { recording: 'x', mapPoints: [] } });
  const mapData = {
    center: [116.39, 39.9],
    zoom: 13,
    bounds: null,
    points: [{ lng: 116.39, lat: 39.9, name: '第1段', score: 72, from: 'gps' }],
  };
  const next = reducer(s1, { type: 'SET_BATCH_MAP', map: mapData });
  assert.deepEqual(next.batchSummary.map, mapData, '简化固定地图写入 batchSummary.map');
  assert.equal(next.batchSummary.recording, 'x', '摘要其他字段保持不变');
  assert.deepEqual(arr(next.batchSummary.mapPoints), [], '不影响 mapPoints');
  assert.equal(next.screen, 'map', '不改变屏幕');
});

test('SET_BATCH_MAP: 无 batchSummary 时安全跳过（不崩）；map 为 null 清除', () => {
  assert.equal(reducer(initialState, { type: 'SET_BATCH_MAP', map: { center: [1, 2] } }).batchSummary, null);
  const s1 = reducer(initialState, { type: 'COMPLETE_BATCH', summary: { recording: 'x' } });
  assert.equal(reducer(s1, { type: 'SET_BATCH_MAP', map: null }).batchSummary.map, null);
});

test('START_ANALYSIS / COMPLETE_ANALYSIS: 新单次分析会清空旧综合摘要', () => {
  const s1 = reducer(initialState, { type: 'COMPLETE_BATCH', summary: { recording: '旧' } });
  const s2 = reducer(s1, { type: 'START_ANALYSIS', recording: '新.wav' });
  assert.equal(s2.batchSummary, null);
  const s3 = reducer(s1, { type: 'COMPLETE_ANALYSIS', analysis: buildAnalysis('新.wav') });
  assert.equal(s3.batchSummary, null);
  assert.equal(s3.screen, 'results');
});
