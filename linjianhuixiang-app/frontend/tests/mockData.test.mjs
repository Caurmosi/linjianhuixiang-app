/**
 * mockData.test.mjs
 * 《林间回响》mockData.js 数据结构完整性 + 纯函数单元测试
 * 运行：node --test tests/mockData.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIES,
  INDICES,
  LIVABILITY,
  HEATMAP,
  WAVEFORM,
  MAP_POINTS,
  SEGMENT_POINTS,
  GREEN_SPACES,
  SUGGESTIONS,
  HISTORY,
  REGIONS,
  buildAnalysis,
  analysisForHistory,
  gradeOf,
  livabilityDesc,
} from '../src/data/mockData.js';

const PERIODS = ['清晨', '上午', '黄昏', '全天'];

test('SPECIES: 9 个物种，字段完整且类型正确', () => {
  assert.equal(SPECIES.length, 9, '物种数量应为 9');
  const ids = new Set();
  for (const s of SPECIES) {
    assert.ok(Number.isInteger(s.id) && s.id > 0, `id 应为正整数: ${s.id}`);
    assert.ok(!ids.has(s.id), `id 应唯一: ${s.id}`);
    ids.add(s.id);
    assert.equal(typeof s.name, 'string');
    assert.ok(s.name.length > 0, `name 非空: ${s.name}`);
    assert.equal(typeof s.latin, 'string');
    assert.ok(s.latin.length > 0, `latin 非空: ${s.latin}`);
    assert.ok(typeof s.conf === 'number' && s.conf >= 0 && s.conf <= 1, `conf 应在 [0,1]: ${s.conf}`);
    assert.ok(Number.isInteger(s.freq) && s.freq >= 0, `freq 应为非负整数: ${s.freq}`);
    assert.ok(PERIODS.includes(s.period), `period 非法: ${s.period}`);
  }
});

test('SPECIES: 阈值分布 —— 低于 0.50 恰好 2 个（用于联动演示），置信度范围 [0.42, 0.93]', () => {
  const confs = SPECIES.map((s) => s.conf);
  assert.equal(confs.filter((c) => c < 0.5).length, 2, '低于 0.50 的物种应恰好 2 个');
  assert.equal(confs.filter((c) => c >= 0.5).length, 7, '不低于 0.50 的物种应恰好 7 个');
  assert.equal(Math.min(...confs), 0.42);
  assert.equal(Math.max(...confs), 0.93);
});

test('SPECIES: 低于 0.50 的两个物种为 灰喜鹊(0.48) 与 戴胜(0.42)', () => {
  const hidden = SPECIES.filter((s) => s.conf < 0.5).map((s) => s.name).sort();
  assert.deepEqual(hidden, ['戴胜', '灰喜鹊']);
});

test('INDICES: 4 个声学指数（ACI/NDSI/ADI/H），字段完整', () => {
  assert.equal(INDICES.length, 4);
  const keys = new Set(INDICES.map((i) => i.key));
  assert.deepEqual([...keys].sort(), ['ACI', 'ADI', 'H', 'NDSI']);
  for (const i of INDICES) {
    assert.equal(typeof i.name, 'string');
    assert.ok(i.name.length > 0);
    assert.equal(typeof i.display, 'string');
    assert.ok(i.display.length > 0);
    assert.equal(typeof i.desc, 'string');
    assert.ok(i.desc.length > 0);
    assert.ok(typeof i.pct === 'number' && i.pct >= 0 && i.pct <= 100, `pct 应在 [0,100]: ${i.pct}`);
  }
});

test('LIVABILITY: 字段完整，数值在合理区间', () => {
  assert.ok(typeof LIVABILITY.score === 'number' && LIVABILITY.score >= 0 && LIVABILITY.score <= 100);
  assert.equal(typeof LIVABILITY.grade, 'string');
  assert.ok(LIVABILITY.grade.length > 0);
  assert.equal(typeof LIVABILITY.gradeEn, 'string');
  assert.ok(LIVABILITY.gradeEn.length > 0);
  for (const k of ['bio', 'sound', 'noise']) {
    assert.ok(typeof LIVABILITY[k] === 'number' && LIVABILITY[k] >= 0 && LIVABILITY[k] <= 100, `${k} 应在 [0,100]`);
  }
  assert.ok(LIVABILITY.noise < LIVABILITY.bio, '演示数据中噪声占比应低于生物多样性（声景偏向健康）');
});

test('HEATMAP: 4 行 × 12 列，单元格均为 [0,1] 数值', () => {
  assert.equal(HEATMAP.length, 4);
  for (const row of HEATMAP) {
    assert.equal(row.length, 12, '每行应为 12 个频段');
    for (const v of row) {
      assert.ok(typeof v === 'number' && v >= 0 && v <= 1, `热力值应在 [0,1]: ${v}`);
    }
  }
});

test('MAP_POINTS: 6 个样点，字段完整（x/y/颜色/标签）', () => {
  assert.equal(MAP_POINTS.length, 6);
  for (const p of MAP_POINTS) {
    assert.ok(typeof p.x === 'number' && p.x >= 0, `x 应为非负数值: ${p.x}`);
    assert.ok(typeof p.y === 'number' && p.y >= 0, `y 应为非负数值: ${p.y}`);
    assert.match(p.c, /^#[0-9a-fA-F]{6}$/, `c 应为 6 位十六进制颜色: ${p.c}`);
    assert.equal(typeof p.t, 'string', `t 应为字符串（可为空）: ${p.t}`);
  }
});

test('WAVEFORM: 160 个 [0,1] 数值，保留 3 位小数', () => {
  assert.equal(WAVEFORM.length, 160);
  for (const v of WAVEFORM) {
    assert.ok(typeof v === 'number' && v >= 0 && v <= 1, `波形值应在 [0,1]: ${v}`);
    assert.equal(Number(v.toFixed(3)), v, `波形值应保留 3 位小数: ${v}`);
  }
  // 中段应比首尾活跃（演示包络）
  const mid = WAVEFORM.slice(60, 100).reduce((a, b) => a + b, 0) / 40;
  const edge = (WAVEFORM.slice(0, 20).concat(WAVEFORM.slice(140)).reduce((a, b) => a + b, 0)) / 40;
  assert.ok(mid > edge, '波形中段应比首尾更活跃');
});

test('SEGMENT_POINTS: 6 个切片样点，字段完整（x/y/c/t），首末为开始/结束', () => {
  assert.equal(SEGMENT_POINTS.length, 6);
  for (const p of SEGMENT_POINTS) {
    assert.ok(typeof p.x === 'number' && p.x >= 0, `x 应为非负数值: ${p.x}`);
    assert.ok(typeof p.y === 'number' && p.y >= 0, `y 应为非负数值: ${p.y}`);
    assert.match(p.c, /^#[0-9a-fA-F]{6}$/, `c 应为 6 位十六进制颜色: ${p.c}`);
    assert.equal(typeof p.t, 'string', `t 应为字符串（可为空）: ${p.t}`);
  }
  assert.equal(SEGMENT_POINTS[0].t, '开始');
  assert.equal(SEGMENT_POINTS[SEGMENT_POINTS.length - 1].t, '结束');
});

test('GREEN_SPACES: 多绿地对比数据 —— 3 个绿地，样点结构完整且默认绿地与 MAP_POINTS 一致', () => {
  assert.equal(GREEN_SPACES.length, 3);
  const names = GREEN_SPACES.map((g) => g.name);
  assert.deepEqual(names, ['中山公园', '滨江绿地', '西郊森林公园']);
  for (const g of GREEN_SPACES) {
    assert.ok(g.id && typeof g.id === 'string', `id 应为字符串: ${g.id}`);
    assert.ok(g.name && typeof g.name === 'string', `name 应为字符串: ${g.name}`);
    assert.ok(Array.isArray(g.points) && g.points.length > 0, `${g.name} 应包含样点数组`);
    for (const p of g.points) {
      assert.ok(typeof p.x === 'number' && typeof p.y === 'number', `${g.name} 样点应含数字坐标`);
      assert.match(p.c, /^#[0-9a-fA-F]{6}$/, `${g.name} 样点颜色非法: ${p.c}`);
      assert.equal(typeof p.t, 'string');
    }
  }
  assert.equal(GREEN_SPACES[0].points, MAP_POINTS, '默认绿地（中山公园）样点应复用 MAP_POINTS');
});

test('SUGGESTIONS: 3 条非空建议', () => {
  assert.equal(SUGGESTIONS.length, 3);
  for (const s of SUGGESTIONS) {
    assert.equal(typeof s, 'string');
    assert.ok(s.length > 0);
  }
});

test('HISTORY: 3 条历史记录，字段完整', () => {
  assert.equal(HISTORY.length, 3);
  const ids = new Set();
  for (const h of HISTORY) {
    assert.ok(Number.isInteger(h.id) && h.id > 0);
    assert.ok(!ids.has(h.id), `id 应唯一: ${h.id}`);
    ids.add(h.id);
    assert.equal(typeof h.name, 'string');
    assert.ok(h.name.length > 0);
    assert.equal(typeof h.duration, 'string');
    assert.ok(h.duration.length > 0);
    for (const k of ['species', 'score', 'noise', 'bio', 'sound']) {
      assert.ok(typeof h[k] === 'number', `${k} 应为数值: ${h[k]}`);
    }
  }
});

test('HISTORY: 每条携带 analysis 完整快照，speciesCount 与条目自洽', () => {
  for (const h of HISTORY) {
    assert.ok(h.analysis && typeof h.analysis === 'object', `${h.name} 缺少 analysis 快照`);
    assert.equal(h.analysis.recording, h.name);
    assert.equal(h.analysis.speciesCount, h.species);
    assert.ok(Array.isArray(h.analysis.species) && h.analysis.species.length > 0, `${h.name} analysis.species 应为非空数组`);
    assert.equal(h.analysis.livability.score, h.score);
  }
});

test('HISTORY: 每条含 created_at（ISO 日期），且日期互不相同（最近/更早分组可见）', () => {
  const dates = new Set();
  for (const h of HISTORY) {
    assert.ok(typeof h.created_at === 'string' && h.created_at.length > 0, `${h.name} 缺少 created_at`);
    assert.match(h.created_at, /^\d{4}-\d{2}-\d{2}/, `${h.name} created_at 应为 ISO 日期`);
    dates.add(h.created_at.slice(0, 10));
  }
  assert.ok(dates.size > 1, '演示历史日期应不全部相同');
});

test('REGIONS: 3 条地区记录（2 个地区，同名归组），字段完整且 score 与快照一致', () => {
  assert.equal(REGIONS.length, 3);
  const ids = new Set();
  for (const r of REGIONS) {
    assert.ok(Number.isInteger(r.id) && r.id > 0, `id 应为正整数: ${r.id}`);
    assert.ok(!ids.has(r.id), `id 应唯一: ${r.id}`);
    ids.add(r.id);
    assert.ok(r.name && typeof r.name === 'string' && r.name.length > 0, `name 非空: ${r.name}`);
    assert.ok(typeof r.created_at === 'string' && r.created_at.length > 0, `created_at 非空: ${r.name}`);
    assert.match(r.created_at, /^\d{4}-\d{2}-\d{2}/, `created_at 应为 ISO 日期: ${r.created_at}`);
    assert.ok(r.detail && typeof r.detail === 'object', `${r.name} detail 应为对象`);
    assert.equal(typeof r.detail.livability.score, 'number', `${r.name} detail.livability.score 应为数值`);
    assert.equal(typeof r.detail.livability.noise, 'number', `${r.name} detail.livability.noise 应为数值`);
    assert.equal(r.score, r.detail.livability.score, `${r.name} score 应等于 detail.livability.score`);
    assert.ok(Array.isArray(r.detail.species) || r.detail.speciesCount >= 0, `${r.name} detail 应含物种信息`);
  }
  // 归组演示：中山公园 2 条（趋势可比对）、滨江绿地 1 条（单点提示）
  const names = REGIONS.map((r) => r.name);
  assert.equal(names.filter((n) => n === '中山公园').length, 2, '中山公园应有 2 条');
  assert.equal(names.filter((n) => n === '滨江绿地').length, 1, '滨江绿地应有 1 条');
});

test('buildAnalysis: 默认构建完整分析结果，覆盖所有屏幕引用字段', () => {
  const a = buildAnalysis('中山公园_晨.wav', {
    speciesCount: 9,
    livability: { score: 68, noise: 34, bio: 76, sound: 60 },
  });
  assert.equal(a.recording, '中山公园_晨.wav');
  assert.equal(a.speciesCount, 9);
  assert.equal(a.species.length, 9);
  assert.equal(a.indices.length, 4);
  assert.equal(a.heatmap.length, 4);
  assert.equal(a.mapPoints.length, 6);
  assert.equal(a.suggestions.length, 3);
  assert.equal(a.livability.score, 68);
  assert.equal(a.livability.noise, 34);
  assert.equal(a.livability.bio, 76);
  assert.equal(a.livability.sound, 60);
  // 屏幕引用的关键字段（Results/Livability/Indices/Map/Species 均依赖）
  for (const key of ['recording', 'species', 'indices', 'livability', 'heatmap', 'mapPoints', 'suggestions', 'speciesCount', 'waveform', 'segmentPoints']) {
    assert.ok(key in a, `analysis 缺少屏幕引用字段: ${key}`);
  }
  assert.equal(a.waveform, WAVEFORM, '默认 waveform 应为演示波形');
  assert.equal(a.segmentPoints, SEGMENT_POINTS, '默认 segmentPoints 应为演示切片样点');
  for (const key of ['score', 'noise', 'bio', 'sound']) {
    assert.ok(key in a.livability, `analysis.livability 缺少字段: ${key}`);
  }
});

test('buildAnalysis: overrides 生效（数量/宜居度/录音名覆盖），且 livability 合并保留默认字段（A1）', () => {
  const a = buildAnalysis('滨江绿地_午后.mp3', {
    speciesCount: 6,
    livability: { score: 54, noise: 51, bio: 62, sound: 45 },
  });
  assert.equal(a.recording, '滨江绿地_午后.mp3');
  assert.equal(a.speciesCount, 6);
  assert.equal(a.species.length, 6, 'species 应与 speciesCount 自洽（截断到 6）');
  assert.deepEqual(a.livability, { score: 54, grade: '一般', gradeEn: 'Moderate', bio: 62, sound: 45, noise: 51 });
});

test('buildAnalysis: A1 回归 —— 局部 livability 覆盖不丢失默认字段 bio/sound/grade/gradeEn', () => {
  const a = buildAnalysis('x.wav', { livability: { score: 82, noise: 22 } });
  assert.equal(a.livability.score, 82);
  assert.equal(a.livability.noise, 22);
  assert.equal(a.livability.bio, LIVABILITY.bio);
  assert.equal(a.livability.sound, LIVABILITY.sound);
  assert.equal(a.livability.grade, LIVABILITY.grade);
  assert.equal(a.livability.gradeEn, LIVABILITY.gradeEn);
});

test('buildAnalysis: A3 自洽 —— speciesCount 截断 species，超过 SPECIES 长度时取全部且保留计数', () => {
  const six = buildAnalysis('a.wav', { speciesCount: 6 });
  assert.equal(six.speciesCount, 6);
  assert.equal(six.species.length, 6);
  assert.deepEqual(six.species.map((s) => s.id), SPECIES.slice(0, 6).map((s) => s.id));

  const twelve = buildAnalysis('b.wav', { speciesCount: 12 });
  assert.equal(twelve.speciesCount, 12);
  assert.equal(twelve.species.length, SPECIES.length, '超过样例上限时列出全部 9 种');

  const none = buildAnalysis('c.wav', { speciesCount: 0 });
  assert.equal(none.speciesCount, 0);
  assert.deepEqual(none.species, []);
});

test('buildAnalysis: 空数据容错 —— species 可覆盖为空数组且不抛错', () => {
  const a = buildAnalysis('x.wav', { species: [] });
  assert.deepEqual(a.species, []);
});

test('buildAnalysis: overrides 可覆盖 waveform/segmentPoints，未覆盖时用默认演示值', () => {
  const custom = buildAnalysis('x.wav', {
    waveform: [1, 0, 1],
    segmentPoints: [{ x: 60, y: 80, c: '#2e7d52', t: '' }],
  });
  assert.deepEqual(custom.waveform, [1, 0, 1]);
  assert.equal(custom.segmentPoints.length, 1);
  const plain = buildAnalysis('x.wav');
  assert.equal(plain.waveform, WAVEFORM);
  assert.equal(plain.segmentPoints, SEGMENT_POINTS);
});

test('analysisForHistory: 每条历史记录都能正确还原为分析结果（speciesCount 规范化为清单条数）', () => {
  for (const item of HISTORY) {
    const a = analysisForHistory(item);
    assert.equal(a.recording, item.name);
    // 回放 speciesCount 恒等于快照物种清单条数（西郊森林公园快照 12 但清单 9 → 规范化为 9）
    assert.equal(a.speciesCount, item.analysis.species.length, `${item.name} speciesCount 应等于快照清单条数`);
    assert.equal(a.livability.score, item.score);
    assert.equal(a.livability.noise, item.noise);
    assert.equal(a.livability.bio, item.bio);
    assert.equal(a.livability.sound, item.sound);
  }
});

test('analysisForHistory: 优先返回 item.analysis 完整快照（浅拷贝返回，speciesCount 规范化）', () => {
  for (const item of HISTORY) {
    const snap = analysisForHistory(item);
    assert.deepEqual(snap, { ...item.analysis, speciesCount: item.analysis.species.length }, `${item.name} 应返回规范化浅拷贝快照`);
    assert.notEqual(snap, item.analysis, `${item.name} 不应返回同一引用（防外改污染原始快照）`);
  }
});

test('analysisForHistory: 脏快照规范化 —— speciesCount 恒等于 species.length（12 vs 9 → 9）', () => {
  const item = HISTORY[2]; // 西郊森林公园：快照 speciesCount 12、清单 9 条
  const snap = analysisForHistory(item);
  assert.equal(snap.speciesCount, 9, 'speciesCount 应按 species 数组长度规范化为 9');
  assert.equal(snap.species.length, 9);
  assert.equal(HISTORY[2].analysis.speciesCount, 12, '原始快照保留 speciesCount 12，规范化在返回时浅拷贝完成');
  // 自定义脏快照：species 长度 ≠ speciesCount
  const dirty = { recording: 'dirty.wav', speciesCount: 7, species: [{ id: 1 }, { id: 2 }, { id: 3 }] };
  const d = analysisForHistory({ analysis: dirty });
  assert.equal(d.speciesCount, 3);
  assert.notEqual(dirty.speciesCount, d.speciesCount, '原始脏快照不被修改');
});

test('analysisForHistory: 不同历史条目的物种清单各不相同（回放不再都是"最后一次"）', () => {
  const names = HISTORY.map((h) => analysisForHistory(h).species.map((s) => s.name).join('|'));
  assert.equal(new Set(names).size, HISTORY.length, `各条 species 应不同，实际: ${names.join(' ; ')}`);
});

test('gradeOf: 分级边界正确（70 宜居 / 50 一般 / <50 受压）', () => {
  assert.deepEqual(gradeOf(82), { zh: '宜居', en: 'Good', tone: 'good' });
  assert.deepEqual(gradeOf(70), { zh: '宜居', en: 'Good', tone: 'good' });
  assert.deepEqual(gradeOf(68), { zh: '一般', en: 'Moderate', tone: 'mid' });
  assert.deepEqual(gradeOf(50), { zh: '一般', en: 'Moderate', tone: 'mid' });
  assert.deepEqual(gradeOf(49), { zh: '受压', en: 'Stressed', tone: 'bad' });
  assert.deepEqual(gradeOf(0), { zh: '受压', en: 'Stressed', tone: 'bad' });
});

test('livabilityDesc: 三个档位文案与噪声占比正确', () => {
  const good = livabilityDesc({ livability: { score: 82, noise: 22 } });
  assert.match(good, /生物声丰富/);
  assert.match(good, /22%/);
  const mid = livabilityDesc({ livability: { score: 68, noise: 34 } });
  assert.match(mid, /提升空间/);
  assert.match(mid, /34%/);
  const bad = livabilityDesc({ livability: { score: 40, noise: 60 } });
  assert.match(bad, /受限/);
  assert.match(bad, /60%/);
});
