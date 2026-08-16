/**
 * aggregate.test.mjs
 * 多录音聚合（src/utils/aggregate.js）单元测试（D）：
 * 物种合并去重计数 / livability 平均与等级推导 / indices 平均 / heatmap 逐格平均 /
 * mapPoints 均匀分布与等级色 / waveform 取最长 / durationSec 求和 / 边界空数组 / 字段对齐。
 * 运行：node --test tests/aggregate.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateAnalyses } from '../src/utils/aggregate.js';
import { wgs84ToGcj02 } from '../src/components/map/mapUtils.js';
import { buildAnalysis, SPECIES, INDICES, HEATMAP, WAVEFORM } from '../src/data/mockData.js';

/** 构造一份带指定物种数与宜居度的完整 analysis（含 durationSec，模拟录音界面注入） */
function makeAnalysis(name, opts = {}) {
  return buildAnalysis(name, {
    speciesCount: opts.speciesCount ?? 5,
    livability: opts.livability || { score: 72, noise: 25, bio: 80, sound: 68 },
    durationSec: opts.durationSec ?? 30,
  });
}

const a1 = makeAnalysis('第1段.wav', {
  speciesCount: 5,
  livability: { score: 72, noise: 25, bio: 80, sound: 68 },
  durationSec: 30,
});
const a2 = makeAnalysis('第2段.wav', {
  speciesCount: 4,
  livability: { score: 55, noise: 45, bio: 60, sound: 50 },
  durationSec: 45,
});

test('species: 合并去重（按 name），count 为出现次数，freq 求和，maxConf 取最大', () => {
  const summary = aggregateAnalyses([a1, a2]);
  // a1: SPECIES[0..4]，a2: SPECIES[0..3] → 白头鹎~乌鸫 出现 2 次，大山雀 1 次
  const map = new Map(summary.species.map((s) => [s.name, s]));
  assert.equal(map.get('白头鹎').count, 2);
  assert.equal(map.get('乌鸫').count, 2);
  assert.equal(map.get('大山雀').count, 1);
  assert.equal(map.get('白头鹎').maxConf, SPECIES[0].conf);
  assert.equal(map.get('白头鹎').freq, SPECIES[0].freq * 2, 'freq 应为两段之和');
  assert.equal(map.get('白头鹎').latin, SPECIES[0].latin);
  assert.equal(map.get('白头鹎').period, SPECIES[0].period);
  assert.equal(summary.speciesCount, 5, '去重后共 5 种');
});

test('species: 按 count 降序，count 相同按 maxConf 降序', () => {
  const summary = aggregateAnalyses([a1, a2]);
  const names = summary.species.map((s) => s.name);
  assert.deepEqual(names.slice(0, 4), ['白头鹎', '麻雀', '珠颈斑鸠', '乌鸫'], '出现 2 次的按 maxConf 降序');
  assert.equal(names[4], '大山雀', '出现 1 次的排最后');
});

test('species: 物种字段结构 {name,latin,count,maxConf,freq,period}', () => {
  const summary = aggregateAnalyses([a1, a2]);
  for (const s of summary.species) {
    assert.equal(typeof s.name, 'string');
    assert.equal(typeof s.latin, 'string');
    assert.ok(Number.isInteger(s.count) && s.count >= 1, `count 应为正整数: ${s.count}`);
    assert.equal(typeof s.maxConf, 'number');
    assert.ok(Number.isInteger(s.freq) && s.freq >= 0);
    assert.equal(typeof s.period, 'string');
  }
});

test('livability: 各段平均（score 四舍五入），grade/gradeEn 由平均 score 推导', () => {
  const summary = aggregateAnalyses([a1, a2]);
  assert.equal(summary.livability.score, Math.round((72 + 55) / 2), 'score 取平均四舍五入');
  assert.equal(summary.livability.noise, Math.round((25 + 45) / 2));
  assert.equal(summary.livability.bio, Math.round((80 + 60) / 2));
  assert.equal(summary.livability.sound, Math.round((68 + 50) / 2));
  assert.equal(summary.livability.grade, '一般');
  assert.equal(summary.livability.gradeEn, 'Moderate');
});

test('livability: 等级边界与平均分一致（≥70 宜居 / ≥50 一般 / <50 受压）', () => {
  const good = aggregateAnalyses([
    makeAnalysis('g1.wav', { livability: { score: 82, noise: 20, bio: 90, sound: 80 } }),
    makeAnalysis('g2.wav', { livability: { score: 76, noise: 18, bio: 85, sound: 74 } }),
  ]);
  assert.equal(good.livability.score, 79);
  assert.equal(good.livability.grade, '宜居');
  assert.equal(good.livability.gradeEn, 'Good');

  const bad = aggregateAnalyses([
    makeAnalysis('b1.wav', { livability: { score: 40, noise: 60, bio: 45, sound: 30 } }),
    makeAnalysis('b2.wav', { livability: { score: 46, noise: 55, bio: 50, sound: 36 } }),
  ]);
  assert.equal(bad.livability.score, 43);
  assert.equal(bad.livability.grade, '受压');
  assert.equal(bad.livability.gradeEn, 'Stressed');
});

// ============================================================
// 综合置信度：各段 confidence 按 durationSec 加权平均（阈值分档）
// ============================================================

/** 构造带指定 confidence 与 durationSec 的完整 analysis（label 由 buildAnalysis 从 confidence 推导） */
function makeConfAnalysis(name, confidence, durationSec, opts = {}) {
  return buildAnalysis(name, {
    speciesCount: opts.speciesCount ?? 5,
    livability: { score: opts.score ?? 70, noise: 30, bio: 75, sound: 62, confidence },
    durationSec,
  });
}

test('confidence: 各段按 durationSec 加权平均（round 2），档位正确', () => {
  // (0.8*30 + 0.4*60) / (30+60) = 48/90 ≈ 0.5333 → 0.53 → 中
  const s = aggregateAnalyses([
    makeConfAnalysis('段A.wav', 0.8, 30),
    makeConfAnalysis('段B.wav', 0.4, 60),
  ]);
  assert.equal(s.livability.confidence, 0.53);
  assert.equal(s.livability.confidenceLabel, '中');
});

test('confidence: 无 confidence 的旧数据段忽略，仅参与有 confidence 的段平均', () => {
  // 旧数据段：绕过 buildAnalysis（其会自动补默认 confidence），用原始快照对象模拟——有时长但无 confidence
  const old = { ...buildAnalysis('旧段.wav'), durationSec: 60, livability: { score: 55, noise: 45, bio: 60, sound: 50 } };
  const s = aggregateAnalyses([makeConfAnalysis('新段.wav', 0.9, 30), old]);
  assert.equal(s.livability.confidence, 0.9, '旧段无 confidence 应被忽略，不参与平均');
  assert.equal(s.livability.confidenceLabel, '高');
});

test('confidence: 全部段缺 confidence → 回退安全值 0.3/低', () => {
  // 全为旧数据（原始快照无 confidence 字段，未经过 buildAnalysis 补默认）
  const oldA = { recording: 'a.wav', durationSec: 30, livability: { score: 60, noise: 35, bio: 65, sound: 55 } };
  const oldB = { recording: 'b.wav', durationSec: 40, livability: { score: 55, noise: 40, bio: 60, sound: 50 } };
  const s = aggregateAnalyses([oldA, oldB]);
  assert.equal(s.livability.confidence, 0.3);
  assert.equal(s.livability.confidenceLabel, '低');
});

test('confidence: 有 confidence 但各段缺时长 → 退化为简单平均', () => {
  // (0.8 + 0.5) / 2 = 0.65 → 中
  const s = aggregateAnalyses([
    makeConfAnalysis('a.wav', 0.8, undefined),
    makeConfAnalysis('b.wav', 0.5, undefined),
  ]);
  assert.equal(s.livability.confidence, 0.65);
  assert.equal(s.livability.confidenceLabel, '中');
});

test('confidence: 阈值分档边界（加权结果 ≥0.7 高 / ≥0.4 中 / <0.4 低）', () => {
  // 0.9 与 0.8 等权 → 0.85 → 高
  const high = aggregateAnalyses([
    makeConfAnalysis('a.wav', 0.9, 30),
    makeConfAnalysis('b.wav', 0.8, 30),
  ]);
  assert.equal(high.livability.confidence, 0.85);
  assert.equal(high.livability.confidenceLabel, '高');
  // 0.2 与 0.1 等权 → 0.15 → 低
  const low = aggregateAnalyses([
    makeConfAnalysis('a.wav', 0.2, 30),
    makeConfAnalysis('b.wav', 0.1, 30),
  ]);
  assert.equal(low.livability.confidence, 0.15);
  assert.equal(low.livability.confidenceLabel, '低');
});

test('confidence: 空数组摘要携带回退安全值 0.3/低（与全缺一致）', () => {
  const empty = aggregateAnalyses([]);
  assert.equal(empty.livability.confidence, 0.3);
  assert.equal(empty.livability.confidenceLabel, '低');
});

test('indices: 四个指数取平均，结构对齐单 analysis.indices（key/name/display/pct/desc）', () => {
  const x1 = buildAnalysis('x1.wav');
  x1.indices = INDICES.map((i) => ({ ...i, pct: i.pct }));
  const x2 = buildAnalysis('x2.wav');
  x2.indices = INDICES.map((i) => ({ ...i, pct: Math.max(0, i.pct - 20) }));
  const summary = aggregateAnalyses([x1, x2]);
  assert.equal(summary.indices.length, 4);
  for (const idx of summary.indices) {
    for (const f of ['key', 'name', 'display', 'pct', 'desc']) {
      assert.ok(f in idx, `指数缺少字段 ${f}`);
    }
  }
  assert.equal(summary.indices[0].key, 'ACI');
  assert.equal(summary.indices[0].pct, INDICES[0].pct - 10, 'ACI pct 应为 (82+62)/2=72');
  assert.equal(summary.indices[0].display, '72', 'display 用平均值（保留 1 位小数）');
  assert.equal(summary.indices[0].name, INDICES[0].name);
  assert.equal(summary.indices[0].desc, INDICES[0].desc);
});

test('heatmap: 逐格平均（4×12），值保留 3 位小数且在 [0,1]', () => {
  const summary = aggregateAnalyses([a1, a2]);
  assert.equal(summary.heatmap.length, 4);
  for (const row of summary.heatmap) {
    assert.equal(row.length, 12);
    for (const v of row) {
      assert.ok(typeof v === 'number' && v >= 0 && v <= 1, `热力值越界: ${v}`);
    }
  }
  // 两份同源热力图平均 = 原值
  assert.deepEqual(summary.heatmap, HEATMAP.map((row) => row.map((v) => Number(v.toFixed(3)))));
});

test('heatmap: 不同热力图时取逐格均值', () => {
  const h1 = buildAnalysis('h1.wav');
  h1.heatmap = [[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
  const h2 = buildAnalysis('h2.wav');
  h2.heatmap = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
  const summary = aggregateAnalyses([h1, h2]);
  assert.equal(summary.heatmap[0][0], 0.5, '(1+0)/2 = 0.5');
  assert.equal(summary.heatmap[0][1], 0);
});

test('mapPoints: 每段一个样点，x/y 在 50~285 / 30~150 均匀分布', () => {
  const summary = aggregateAnalyses([a1, a2, a3()]);
  function a3() {
    return makeAnalysis('第3段.wav', { speciesCount: 3, livability: { score: 40, noise: 60, bio: 45, sound: 30 }, durationSec: 20 });
  }
  assert.equal(summary.mapPoints.length, 3);
  assert.deepEqual(summary.mapPoints.map((p) => p.x), [50, 168, 285], 'x 均匀分布 50→285');
  assert.deepEqual(summary.mapPoints.map((p) => p.y), [30, 90, 150], 'y 均匀分布 30→150');
  for (const p of summary.mapPoints) {
    for (const f of ['x', 'y', 'c', 't']) {
      assert.ok(f in p, `样点缺少字段 ${f}`);
    }
    assert.match(p.c, /^#[0-9a-fA-F]{6}$/);
  }
});

test('mapPoints: 颜色按该段宜居度等级（≥70 绿 / ≥50 黄 / <50 红），t 仅奇数段标「第N段」', () => {
  const summary = aggregateAnalyses([a1, a2, a3()]);
  function a3() {
    return makeAnalysis('第3段.wav', { speciesCount: 3, livability: { score: 40, noise: 60, bio: 45, sound: 30 }, durationSec: 20 });
  }
  assert.equal(summary.mapPoints[0].c, '#2e7d52', '第1段 score 72 → 绿');
  assert.equal(summary.mapPoints[1].c, '#d49a26', '第2段 score 55 → 黄');
  assert.equal(summary.mapPoints[2].c, '#c25a39', '第3段 score 40 → 红');
  assert.equal(summary.mapPoints[0].t, '第1段', '奇数段标注');
  assert.equal(summary.mapPoints[1].t, '', '偶数段不标');
  assert.equal(summary.mapPoints[2].t, '第3段');
});

test('mapPoints: 单段时样点居中（x=167, y=90）且不标「第N段」', () => {
  const summary = aggregateAnalyses([a1]);
  assert.equal(summary.mapPoints.length, 1);
  assert.equal(summary.mapPoints[0].x, 167);
  assert.equal(summary.mapPoints[0].y, 90);
});

test('map: 各段 GPS 坐标并入 summary.map.points（无坐标段留空），center 取首段', () => {
  const withGps = buildAnalysis('g1.wav', {
    lng: 116.391284,
    lat: 39.907139,
    from: 'gps',
    livability: { score: 72, noise: 25, bio: 80, sound: 68 },
  });
  const withoutGps = buildAnalysis('g2.wav', { from: 'manual' });
  const summary = aggregateAnalyses([withGps, withoutGps]);
  const [gcjLng, gcjLat] = wgs84ToGcj02(116.391284, 39.907139);
  assert.ok(summary.map, '有坐标段应生成 summary.map');
  assert.deepEqual(summary.map.center, [gcjLng, gcjLat], 'center 取首段坐标（GPS 已火星纠偏）');
  assert.equal(summary.map.zoom, 13);
  assert.equal(summary.map.bounds, null);
  assert.equal(summary.map.points.length, 1, '无坐标段留空');
  assert.deepEqual(summary.map.points[0], {
    lng: gcjLng,
    lat: gcjLat,
    name: '第1段',
    score: 72,
    from: 'gps',
  });
});

test('map: GPS 点做 WGS84→GCJ-02 火星纠偏，手动点坐标保持原样（已 GCJ-02）', () => {
  const gps = buildAnalysis('gps.wav', {
    lng: 116.391284,
    lat: 39.907139,
    from: 'gps',
    livability: { score: 72, noise: 25, bio: 80, sound: 68 },
  });
  const manual = buildAnalysis('manual.wav', {
    lng: 116.42,
    lat: 39.93,
    from: 'manual',
    livability: { score: 55, noise: 45, bio: 60, sound: 50 },
  });
  const summary = aggregateAnalyses([gps, manual]);
  assert.equal(summary.map.points.length, 2);
  // GPS 点：偏移方向为向东北（lng/lat 各增约 0.003~0.006 度），且与 wgs84ToGcj02 一致
  const [expLng, expLat] = wgs84ToGcj02(116.391284, 39.907139);
  assert.deepEqual(summary.map.points[0], {
    lng: expLng,
    lat: expLat,
    name: '第1段',
    score: 72,
    from: 'gps',
  });
  assert.ok(expLng > 116.391284 && expLat > 39.907139, '北京 GPS 点应向东北偏移（约 +0.002~0.006 度）');
  assert.ok(expLng - 116.391284 < 0.01 && expLat - 39.907139 < 0.01, '偏移量级应约 +0.002~0.006 度，不超 0.01');
  // 手动点：原样保留（不转换），避免二次偏移
  assert.deepEqual(summary.map.points[1], {
    lng: 116.42,
    lat: 39.93,
    name: '第2段',
    score: 55,
    from: 'manual',
  });
});

test('map: 全部无坐标 → summary.map 为 null（地图页引导手动选点）', () => {
  const summary = aggregateAnalyses([buildAnalysis('a.wav'), buildAnalysis('b.wav')]);
  assert.equal(summary.map, null);
});

test('segments: 各段录音信息清单（name/score/from/hasGps），无坐标段 hasGps=false', () => {
  const withGps = buildAnalysis('g1.wav', {
    lng: 116.391284,
    lat: 39.907139,
    from: 'gps',
    livability: { score: 72, noise: 25, bio: 80, sound: 68 },
  });
  const withoutGps = buildAnalysis('g2.wav', {
    from: 'manual',
    livability: { score: 55, noise: 45, bio: 60, sound: 50 },
  });
  const summary = aggregateAnalyses([withGps, withoutGps]);
  assert.equal(summary.segments.length, 2, '全部段都应列出（含无定位段）');
  assert.deepEqual(summary.segments[0], { name: 'g1.wav', score: 72, from: 'gps', hasGps: true });
  assert.deepEqual(summary.segments[1], { name: 'g2.wav', score: 55, from: 'manual', hasGps: false });
});

test('segments: 空数组 → 空清单', () => {
  assert.deepEqual(aggregateAnalyses([]).segments, []);
});

test('waveform: 取最长录音的波形（多段同长取第一段）', () => {
  const long = buildAnalysis('长.wav');
  long.waveform = Array.from({ length: 200 }, () => 0.5);
  const short = buildAnalysis('短.wav');
  short.waveform = [0.1, 0.2, 0.3];
  const summary = aggregateAnalyses([short, long]);
  assert.equal(summary.waveform, long.waveform, '应取最长的一段');
  const same = aggregateAnalyses([a1, a2]);
  assert.equal(same.waveform, a1.waveform, '同长取第一段（默认 WAVEFORM 引用一致）');
});

test('durationSec: 各段时长之和', () => {
  const summary = aggregateAnalyses([a1, a2]);
  assert.equal(summary.durationSec, 75);
  // 缺 durationSec 的段落按 0 计（守卫）
  const noDur = aggregateAnalyses([buildAnalysis('无时长.wav'), a1]);
  assert.equal(noDur.durationSec, 30);
});

test('recording / speciesCount 与单 analysis 顶层字段对齐', () => {
  const summary = aggregateAnalyses([a1, a2]);
  assert.equal(summary.recording, '本区域 2 段录音综合');
  assert.equal(summary.speciesCount, 5);
  for (const key of ['recording', 'species', 'indices', 'livability', 'heatmap', 'mapPoints', 'waveform', 'speciesCount', 'durationSec']) {
    assert.ok(key in summary, `综合摘要缺少字段 ${key}`);
  }
  assert.equal(typeof summary.livability.score, 'number');
  assert.ok(Array.isArray(summary.mapPoints));
});

test('边界: 空数组返回零值摘要，不抛错', () => {
  const summary = aggregateAnalyses([]);
  assert.ok(summary, '不应抛错');
  assert.equal(summary.recording, '本区域 0 段录音综合');
  assert.equal(summary.speciesCount, 0);
  assert.deepEqual(summary.species, []);
  assert.deepEqual(summary.mapPoints, []);
  assert.deepEqual(summary.waveform, []);
  assert.equal(summary.durationSec, 0);
  assert.equal(summary.livability.score, 0);
  assert.equal(summary.heatmap.length, 4);
  assert.equal(summary.heatmap[0].length, 12);
});

test('边界: 非数组 / 含 null 项均不抛错', () => {
  assert.doesNotThrow(() => aggregateAnalyses(null));
  assert.doesNotThrow(() => aggregateAnalyses(undefined));
  const s = aggregateAnalyses([null, a1, undefined]);
  assert.equal(s.speciesCount, 5);
});

test('边界: 缺失字段的残缺 analysis 不崩（守卫）', () => {
  const ragged = { recording: '残.wav', livability: { score: 60 } };
  const s = aggregateAnalyses([ragged, a1]);
  assert.ok(s.speciesCount >= 5);
  assert.ok(Array.isArray(s.indices));
  assert.equal(s.heatmap.length, 4);
});

// ============================================================
// 批量导入白屏修复：聚合异常输入守卫（缺字段 / 非数组 / 空 → 安全 summary，绝不抛错）
// ============================================================

test('守卫: 非对象项（字符串/数字/数组/null）一律跳过，不影响其余项聚合', () => {
  const junk = [42, 'str', [1, 2], null, undefined, true];
  assert.doesNotThrow(() => aggregateAnalyses(junk));
  const s = aggregateAnalyses([42, null, a1, undefined, 'x', [1, 2]]);
  assert.equal(s.speciesCount, 5, '只有 a1 参与聚合');
  assert.equal(s.recording, '本区域 1 段录音综合');
  assert.equal(s.durationSec, 30);
});

test('守卫: species 字段非数组 / 项为 null / 项缺 name → 不崩（缺省按空清单）', () => {
  assert.doesNotThrow(() => aggregateAnalyses([{ ...a1, species: '不是数组' }]));
  assert.equal(aggregateAnalyses([{ ...a1, species: '不是数组' }]).species.length, 0);
  assert.equal(aggregateAnalyses([{ ...a1, species: [null, undefined, { latin: 'x' }, a1.species[0]] }]).speciesCount, 1, '缺 name 项跳过');
  assert.equal(aggregateAnalyses([{ ...a1, species: null }]).species.length, 0);
});

test('守卫: indices 非数组 / 项为 null / pct 缺失 → 不崩（pct 回退 0，杜绝 toFixed undefined）', () => {
  // 真实崩溃点回归：idx.pct 缺失时旧实现 avgPct 为 undefined → avgPct.toFixed(1) 抛错
  const badIdx = [{ key: 'ACI', name: '声学复杂度', display: undefined, desc: 'x' }];
  assert.doesNotThrow(() => aggregateAnalyses([{ ...a1, indices: badIdx }]));
  const s1 = aggregateAnalyses([{ ...a1, indices: badIdx }]);
  assert.equal(s1.indices.length, 1);
  assert.equal(typeof s1.indices[0].pct, 'number', 'pct 缺失时回退 0');
  assert.equal(s1.indices[0].display, '0');
  // indices 非数组 / 项为 null
  assert.doesNotThrow(() => aggregateAnalyses([{ ...a1, indices: 'x' }]));
  assert.equal(aggregateAnalyses([{ ...a1, indices: 'x' }]).indices.length, 0);
  assert.doesNotThrow(() => aggregateAnalyses([{ ...a1, indices: [null, { key: 'ADI' }] }]));
  assert.ok(Array.isArray(aggregateAnalyses([{ ...a1, indices: [null, { key: 'ADI' }] }]).indices));
});

test('守卫: livability 缺失 / null / 字符串 / 数组 → 按 0 值平均，不崩', () => {
  for (const lv of [undefined, null, 'stressed', [1, 2], 42, { score: 'abc' }]) {
    const s = aggregateAnalyses([{ ...a1, livability: lv }]);
    assert.equal(typeof s.livability.score, 'number', `score 应为 number: ${JSON.stringify(lv)}`);
    assert.equal(typeof s.livability.noise, 'number');
    assert.equal(typeof s.livability.bio, 'number');
    assert.equal(typeof s.livability.sound, 'number');
  }
  const s = aggregateAnalyses([{ ...a1, livability: null }]);
  assert.equal(s.livability.score, 0, 'livability 缺失按 0 值');
  assert.ok(s.livability.grade && s.livability.gradeEn, '等级文案仍存在');
});

test('守卫: heatmap 非数组 / 行非数组 / 格值异常 → 返回 4×12 安全矩阵，不崩', () => {
  const s1 = aggregateAnalyses([{ ...a1, heatmap: null }]);
  assert.equal(s1.heatmap.length, 4);
  assert.equal(s1.heatmap[0].length, 12);
  assert.equal(s1.heatmap[0][0], 0);
  const s2 = aggregateAnalyses([{ ...a1, heatmap: [[1, 'x', null, {}], null, 'bad', undefined] }]);
  assert.equal(s2.heatmap.length, 4);
  assert.equal(s2.heatmap[0].length, 12);
  for (const row of s2.heatmap) {
    for (const v of row) assert.ok(typeof v === 'number', `热力值应为 number: ${v}`);
  }
});

test('守卫: waveform 非数组 / null → 不崩，摘要 waveform 保持数组', () => {
  for (const wf of [null, undefined, 'wave', 42, {}]) {
    const s = aggregateAnalyses([{ ...a1, waveform: wf }]);
    assert.ok(Array.isArray(s.waveform), `waveform 应为数组: ${JSON.stringify(wf)}`);
  }
});

test('守卫: durationSec 非数字 / NaN / 对象 → 按 0 计，不崩', () => {
  const s = aggregateAnalyses([{ ...a1, durationSec: 'abc' }, { ...a2, durationSec: null }, { ...a1, durationSec: NaN }]);
  assert.equal(s.durationSec, 0, '全部非法时长按 0');
  assert.doesNotThrow(() => aggregateAnalyses([{ ...a1, durationSec: {} }, a1]));
  assert.equal(aggregateAnalyses([{ ...a1, durationSec: {} }, a1]).durationSec, 30, '对象时长按 0');
});

test('守卫: segmentPoints / mapPoints 字段异常不参与聚合，不崩', () => {
  const s = aggregateAnalyses([{ ...a1, segmentPoints: 'x', mapPoints: null }]);
  assert.ok(Array.isArray(s.mapPoints), '聚合输出 mapPoints 始终为数组');
  assert.ok(Array.isArray(s.segments));
  assert.doesNotThrow(() => aggregateAnalyses([{ ...a1, segmentPoints: [null], mapPoints: [{ bad: true }] }]));
});

test('守卫: 混合「异常项 + 正常项」时正常项仍被正确聚合', () => {
  const s = aggregateAnalyses([null, 'junk', { recording: '坏.wav', species: 'x', livability: null }, a1, a2]);
  assert.equal(s.speciesCount, 5, '非对象项跳过，a1+a2 正常聚合');
  assert.equal(s.durationSec, 75, '(30+45)，坏项无 durationSec 按 0');
  assert.equal(s.recording, '本区域 3 段录音综合', '对象项（即便字段残缺）参与计数，字符串/null 项被过滤');
  assert.equal(s.mapPoints.length, 3);
});

test('守卫: 空输入返回完整安全 summary（全字段存在，可被地图综合页直接渲染）', () => {
  for (const input of [[], null, undefined]) {
    const s = aggregateAnalyses(input);
    assert.ok(s, '不应抛错');
    assert.equal(s.speciesCount, 0);
    assert.deepEqual(s.species, []);
    assert.deepEqual(s.indices, []);
    assert.deepEqual(s.mapPoints, []);
    assert.deepEqual(s.segments, []);
    assert.deepEqual(s.waveform, []);
    assert.equal(s.map, null);
    assert.equal(s.durationSec, 0);
    assert.equal(typeof s.livability.score, 'number');
    assert.equal(s.heatmap.length, 4);
    assert.equal(s.heatmap[0].length, 12);
    // 地图综合页消费的关键字段齐全
    for (const key of ['recording', 'species', 'indices', 'livability', 'heatmap', 'mapPoints', 'segments', 'map', 'waveform', 'speciesCount', 'durationSec']) {
      assert.ok(key in s, `安全摘要缺少字段 ${key}`);
    }
  }
});
