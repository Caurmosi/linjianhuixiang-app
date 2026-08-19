/**
 * thresholdLinkage.test.mjs
 * 核心业务联动：设置中调整置信度阈值 → 物种清单中低于阈值的物种被隐藏
 *
 * SpeciesScreen 的实际过滤表达式（源码第 20 行）：
 *   const shown = species.filter((s) => s.conf >= threshold);
 * 本测试使用与源码完全相同的谓词，对真实 SPECIES 数据与真实 store reducer 验证联动契约。
 * 运行：node --test tests/thresholdLinkage.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES } from '../src/data/mockData.js';
import { reducer, initialState } from './storeHarness.mjs';

/** 与 SpeciesScreen 源码一致的过滤谓词 */
const shownAt = (species, threshold) => species.filter((s) => s.conf >= threshold);
const hiddenAt = (species, threshold) => species.filter((s) => s.conf < threshold);

test('阈值 0.30：全部 9 个物种显示（最低置信度 0.42 >= 0.30）', () => {
  const shown = shownAt(SPECIES, 0.3);
  assert.equal(shown.length, 9);
  assert.equal(hiddenAt(SPECIES, 0.3).length, 0);
});

test('阈值 0.50（默认）：显示 7 个，隐藏 灰喜鹊(0.48) 与 戴胜(0.42)', () => {
  const shown = shownAt(SPECIES, 0.5);
  assert.equal(shown.length, 7);
  const shownNames = shown.map((s) => s.name);
  assert.ok(shownNames.includes('白头鹎'));
  assert.ok(!shownNames.includes('灰喜鹊'));
  assert.ok(!shownNames.includes('戴胜'));
  assert.deepEqual(hiddenAt(SPECIES, 0.5).map((s) => s.name).sort(), ['戴胜', '灰喜鹊']);
});

test('阈值 0.90：仅显示 白头鹎(0.93) 1 个，麻雀(0.88) 被隐藏', () => {
  const shown = shownAt(SPECIES, 0.9);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].name, '白头鹎');
  // 其余 8 个物种按 SPECIES 原始顺序全部隐藏
  assert.deepEqual(
    hiddenAt(SPECIES, 0.9).map((s) => s.name),
    ['麻雀', '珠颈斑鸠', '乌鸫', '大山雀', '喜鹊', '八哥', '灰喜鹊', '戴胜']
  );
});

test('边界：阈值 = 0.42（等于最低置信度）→ 全部 9 个显示（>= 包含）；0.43 → 戴胜被隐藏，显示 8 个', () => {
  const atMin = shownAt(SPECIES, 0.42);
  assert.equal(atMin.length, 9, '0.42 等于最低置信度，包含边界应全部显示');
  assert.ok(atMin.some((s) => s.name === '戴胜'));

  const aboveMin = shownAt(SPECIES, 0.43);
  assert.equal(aboveMin.length, 8, '0.43 高于戴胜置信度 0.42，应隐藏戴胜');
  assert.ok(!aboveMin.some((s) => s.name === '戴胜'));
});

test('边界：阈值 = 0.93 时白头鹎（conf 恰为 0.93）应显示', () => {
  const shown = shownAt(SPECIES, 0.93);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].name, '白头鹎');
});

test('边界：阈值 0.94 > 最大置信度 → 显示 0 个（触发“无符合阈值的物种”空态）', () => {
  assert.equal(shownAt(SPECIES, 0.94).length, 0);
});

test('单调性：阈值从 0.30 升到 0.90，显示数量不增（step 0.01）', () => {
  let prev = SPECIES.length;
  for (let t = 0.3; t <= 0.9001; t += 0.01) {
    const n = shownAt(SPECIES, t).length;
    assert.ok(n <= prev, `阈值 ${t.toFixed(2)} 显示数量 ${n} 不应大于前值 ${prev}`);
    prev = n;
  }
  assert.equal(prev, 1, '0.90 处应只剩 1 个');
});

test('与时段筛选组合：阈值 0.50 + 时段“清晨”只统计已显示物种中的清晨物种', () => {
  const threshold = 0.5;
  const period = '清晨';
  const shown = shownAt(SPECIES, threshold);
  const list = shown.filter((s) => s.period === period);
  const count = shown.filter((s) => s.period === period).length;
  assert.equal(list.length, count);
  assert.ok(list.length > 0, '清晨时段应有物种');
  for (const s of list) {
    assert.equal(s.period, '清晨');
    assert.ok(s.conf >= threshold);
  }
});

test('store 联动：SET_THRESHOLD 0.90 后，应用 SpeciesScreen 谓词于 analysis.species → 显示 1 个', () => {
  // 初始 analysis 为 null（安装后无默认结果），用带物种的数据模拟分析完成后的状态
  const withAnalysis = reducer(initialState, {
    type: 'COMPLETE_ANALYSIS',
    analysis: {
      recording: '测试录音.wav',
      species: [
        { id: 1, name: '麻雀', latin: 'Passer montanus', conf: 0.95, freq: 3, period: '清晨' },
        { id: 2, name: '白头鹎', latin: 'Pycnonotus sinensis', conf: 0.55, freq: 2, period: '上午' },
        { id: 3, name: '乌鸫', latin: 'Turdus merula', conf: 0.3, freq: 1, period: '黄昏' },
      ],
    },
  });
  assert.ok(withAnalysis.analysis && withAnalysis.analysis.species, 'COMPLETE_ANALYSIS 后应有 species');

  const s1 = reducer(withAnalysis, { type: 'SET_THRESHOLD', value: 0.9 });
  assert.equal(s1.threshold, 0.9);
  assert.equal(shownAt(s1.analysis.species, s1.threshold).length, 1);

  const s2 = reducer(s1, { type: 'SET_THRESHOLD', value: 0.3 });
  assert.equal(s2.threshold, 0.3);
  assert.equal(shownAt(s2.analysis.species, s2.threshold).length, 3);
});

test('store 联动：SET_THRESHOLD 不影响 analysis 数据本身（仅阈值变化）', () => {
  const next = reducer(initialState, { type: 'SET_THRESHOLD', value: 0.8 });
  assert.equal(next.analysis, initialState.analysis, 'analysis 引用不应改变');
  assert.equal(next.threshold, 0.8);
});

test('未知物种容错：species 中含缺失字段的条目不抛错（缺失 conf 被隐藏、缺失 period 不参与时段统计）', () => {
  const weird = [
    ...SPECIES,
    { id: 999, name: '未知鸟', latin: 'Unknown', conf: undefined, freq: 0, period: undefined },
  ];
  let shown;
  assert.doesNotThrow(() => {
    shown = shownAt(weird, 0.5);
  });
  assert.equal(shown.length, 7, '缺失 conf 的条目应被隐藏（undefined >= 0.5 为 false）');
});

test('空数据容错：空 species 数组下过滤不抛错且显示 0 个', () => {
  assert.equal(shownAt([], 0.5).length, 0);
});

test('store 联动完整性：分析完成后 species 可被阈值联动过滤', () => {
  // 初始 analysis 为 null；用 COMPLETE_ANALYSIS 注入一次分析结果
  const withAnalysis = reducer(initialState, {
    type: 'COMPLETE_ANALYSIS',
    analysis: {
      recording: '联动测试.wav',
      species: [
        { id: 1, name: '麻雀', latin: 'Passer montanus', conf: 0.95, freq: 3, period: '清晨' },
        { id: 2, name: '白头鹎', latin: 'Pycnonotus sinensis', conf: 0.55, freq: 2, period: '上午' },
        { id: 3, name: '乌鸫', latin: 'Turdus merula', conf: 0.3, freq: 1, period: '黄昏' },
      ],
    },
  });
  const a = withAnalysis.analysis;
  assert.equal(a.species.length, 3);
  // 模拟完整用户路径：设置 → 物种清单
  const withThreshold = reducer(withAnalysis, { type: 'SET_THRESHOLD', value: 0.5 });
  assert.equal(shownAt(withThreshold.analysis.species, withThreshold.threshold).length, 2);
  const strict = reducer(withThreshold, { type: 'SET_THRESHOLD', value: 0.9 });
  assert.equal(shownAt(strict.analysis.species, strict.threshold).length, 1);
  const loose = reducer(strict, { type: 'SET_THRESHOLD', value: 0.3 });
  assert.equal(shownAt(loose.analysis.species, loose.threshold).length, 3);
});
