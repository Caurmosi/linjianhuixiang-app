/**
 * mockData.test.js —— 《林间回响》演示数据完整性 + 工具函数单元测试
 * 运行方式：npm test（node --test tests/），零外部依赖（node:test + node:assert）
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIES,
  INDICES,
  LIVABILITY,
  HEATMAP,
  MAP_POINTS,
  GREEN_SPACES,
  SUGGESTIONS,
  HISTORY,
  buildAnalysis,
  analysisForHistory,
  gradeOf,
  livabilityDesc,
} from '../src/data/mockData.js';

const PERIODS = ['清晨', '上午', '黄昏', '全天'];

describe('SPECIES 物种清单数据结构', () => {
  test('共 9 个物种，id 唯一', () => {
    assert.equal(SPECIES.length, 9);
    const ids = SPECIES.map((s) => s.id);
    assert.equal(new Set(ids).size, 9, 'id 必须唯一');
  });

  test('每个物种包含 id/name/latin/conf/freq/period 全部字段', () => {
    for (const s of SPECIES) {
      assert.equal(typeof s.id, 'number', `${s.name} 缺少数字 id`);
      assert.ok(typeof s.name === 'string' && s.name.length > 0, `${s.id} 缺少 name`);
      assert.ok(typeof s.latin === 'string' && s.latin.length > 0, `${s.id} 缺少 latin`);
      assert.equal(typeof s.conf, 'number', `${s.id} conf 必须为数字`);
      assert.ok(s.conf > 0 && s.conf <= 1, `${s.id} conf 必须在 (0,1] 区间，实际 ${s.conf}`);
      assert.equal(typeof s.freq, 'number', `${s.id} freq 必须为数字`);
      assert.ok(s.freq >= 0, `${s.id} freq 不能为负`);
      assert.ok(PERIODS.includes(s.period), `${s.id} period 非法: ${s.period}`);
    }
  });

  test('恰好 2 个物种低于 0.50 阈值（演示阈值联动）', () => {
    const below = SPECIES.filter((s) => s.conf < 0.50);
    assert.equal(below.length, 2, `应恰好 2 个低于 0.50，实际 ${below.length}`);
  });

  test('至少 1 个物种置信度 ≥ 0.90（滑杆拉到 0.90 仍有结果）', () => {
    const high = SPECIES.filter((s) => s.conf >= 0.90);
    assert.ok(high.length >= 1, '应存在置信度 ≥ 0.90 的物种');
  });

  test('所有物种置信度 ≥ 0.30（滑杆最小 0.30 时全部显示）', () => {
    const belowMin = SPECIES.filter((s) => s.conf < 0.30);
    assert.equal(belowMin.length, 0, '不应有低于 0.30 的物种');
  });
});

describe('INDICES 声学指数数据结构', () => {
  test('共 4 个指数（ACI/NDSI/ADI/H），key 唯一', () => {
    assert.equal(INDICES.length, 4);
    const keys = INDICES.map((i) => i.key);
    assert.equal(new Set(keys).size, 4);
    assert.deepEqual(keys.sort(), ['ACI', 'ADI', 'H', 'NDSI']);
  });

  test('每个指数包含 key/name/display/pct/desc', () => {
    for (const idx of INDICES) {
      assert.ok(idx.key, '缺少 key');
      assert.ok(idx.name, '缺少 name');
      assert.ok(typeof idx.display === 'string' && idx.display.length > 0, `${idx.key} 缺少 display`);
      assert.equal(typeof idx.pct, 'number', `${idx.key} pct 必须为数字`);
      assert.ok(idx.pct >= 0 && idx.pct <= 100, `${idx.key} pct 应在 [0,100]，实际 ${idx.pct}`);
      assert.ok(idx.desc, '缺少 desc');
    }
  });
});

describe('LIVABILITY 宜居度数据结构', () => {
  test('包含 score/grade/gradeEn/bio/sound/noise', () => {
    for (const k of ['score', 'grade', 'gradeEn', 'bio', 'sound', 'noise']) {
      assert.ok(k in LIVABILITY, `缺少字段 ${k}`);
    }
    assert.equal(typeof LIVABILITY.score, 'number');
    assert.ok(LIVABILITY.score >= 0 && LIVABILITY.score <= 100, 'score 应在 [0,100]');
  });

  test('score=68 与 gradeOf 一致（一般/Moderate）', () => {
    const g = gradeOf(LIVABILITY.score);
    assert.equal(g.zh, '一般');
    assert.equal(g.en, 'Moderate');
    assert.equal(g.tone, 'mid');
  });
});

describe('HEATMAP / MAP_POINTS / SUGGESTIONS 结构', () => {
  test('HEATMAP 为 4 行 × 12 列，值均在 [0,1]', () => {
    assert.equal(HEATMAP.length, 4);
    for (const row of HEATMAP) {
      assert.equal(row.length, 12, '每行必须 12 个频段');
      for (const v of row) {
        assert.equal(typeof v, 'number');
        assert.ok(v >= 0 && v <= 1, `热力值越界: ${v}`);
      }
    }
  });

  test('MAP_POINTS 每个样点包含 x/y/c/t，c 为合法十六进制颜色', () => {
    assert.ok(MAP_POINTS.length > 0);
    for (const p of MAP_POINTS) {
      assert.equal(typeof p.x, 'number', '缺少数字 x');
      assert.equal(typeof p.y, 'number', '缺少数字 y');
      assert.match(p.c, /^#[0-9a-fA-F]{6}$/, `颜色非法: ${p.c}`);
      assert.ok('t' in p, '缺少 t 字段');
    }
  });

  test('GREEN_SPACES 至少 2 个绿地，样点与 MAP_POINTS 结构一致', () => {
    assert.ok(GREEN_SPACES.length >= 2, `应至少 2 个绿地，实际 ${GREEN_SPACES.length}`);
    for (const g of GREEN_SPACES) {
      assert.ok(g.id && typeof g.name === 'string' && g.name.length > 0, `${g.id} 缺少名称`);
      assert.ok(Array.isArray(g.points) && g.points.length > 0, `${g.name} 缺少样点`);
      for (const p of g.points) {
        assert.equal(typeof p.x, 'number');
        assert.equal(typeof p.y, 'number');
        assert.match(p.c, /^#[0-9a-fA-F]{6}$/);
        assert.ok('t' in p);
      }
    }
  });

  test('SUGGESTIONS 为非空字符串数组', () => {
    assert.ok(SUGGESTIONS.length > 0);
    for (const s of SUGGESTIONS) {
      assert.equal(typeof s, 'string');
      assert.ok(s.length > 0);
    }
  });
});

describe('HISTORY 历史记录结构', () => {
  test('3 条记录，字段完整且 id 唯一', () => {
    assert.equal(HISTORY.length, 3);
    const ids = HISTORY.map((h) => h.id);
    assert.equal(new Set(ids).size, 3);
    for (const h of HISTORY) {
      for (const k of ['id', 'name', 'species', 'score', 'duration', 'noise', 'bio', 'sound']) {
        assert.ok(k in h, `缺少字段 ${k}`);
      }
      assert.equal(typeof h.species, 'number');
      assert.equal(typeof h.score, 'number');
      assert.equal(typeof h.duration, 'string');
    }
  });
});

describe('buildAnalysis 分析结果构建', () => {
  test('默认输出包含全部 8 个顶层字段', () => {
    const a = buildAnalysis('测试.wav');
    for (const k of ['recording', 'species', 'indices', 'livability', 'heatmap', 'mapPoints', 'suggestions', 'speciesCount']) {
      assert.ok(k in a, `缺少字段 ${k}`);
    }
    assert.equal(a.recording, '测试.wav');
    assert.equal(a.speciesCount, SPECIES.length);
    assert.equal(a.species, SPECIES);
    assert.equal(a.livability.score, 68);
  });

  test('overrides.livability 与默认 LIVABILITY 合并', () => {
    const a = buildAnalysis('x.wav', { livability: { score: 82, noise: 22 } });
    assert.equal(a.livability.score, 82);
    assert.equal(a.livability.noise, 22);
    assert.equal(a.livability.bio, LIVABILITY.bio, '未覆盖字段应保留默认值');
    assert.equal(a.livability.sound, LIVABILITY.sound);
  });

  test('顶层 overrides 可覆盖 speciesCount 与 recording', () => {
    const a = buildAnalysis('默认.wav', { speciesCount: 12, recording: '覆盖.wav' });
    assert.equal(a.speciesCount, 12);
    assert.equal(a.recording, '覆盖.wav');
  });
});

describe('analysisForHistory 历史回放构建', () => {
  test('使用记录名称作为 recording，species 作为 speciesCount', () => {
    const item = HISTORY[1]; // 滨江绿地_午后.mp3, species 6
    const a = analysisForHistory(item);
    assert.equal(a.recording, item.name);
    assert.equal(a.speciesCount, item.species);
    assert.equal(a.livability.score, item.score);
    assert.equal(a.livability.noise, item.noise);
    assert.equal(a.livability.bio, item.bio);
    assert.equal(a.livability.sound, item.sound);
  });
});

describe('gradeOf 等级边界', () => {
  test('score≥70 为 Good（宜居）', () => {
    assert.equal(gradeOf(100).zh, '宜居');
    assert.equal(gradeOf(70).en, 'Good');
    assert.equal(gradeOf(70).tone, 'good');
  });
  test('70>score≥50 为 Moderate（一般）', () => {
    assert.equal(gradeOf(69).zh, '一般');
    assert.equal(gradeOf(50).en, 'Moderate');
  });
  test('score<50 为 Stressed（受压）', () => {
    assert.equal(gradeOf(49).zh, '受压');
    assert.equal(gradeOf(0).tone, 'bad');
  });
});

describe('livabilityDesc 文案分级', () => {
  test('score≥70 提示"适合鸟类安居"，并含噪声占比', () => {
    const d = livabilityDesc({ livability: { score: 82, noise: 22 } });
    assert.ok(d.includes('适合鸟类安居'), d);
    assert.ok(d.includes('22%'), d);
  });
  test('50≤score<70 提示"提升空间"，并含噪声占比', () => {
    const d = livabilityDesc({ livability: { score: 68, noise: 34 } });
    assert.ok(d.includes('提升空间'), d);
    assert.ok(d.includes('34%'), d);
  });
  test('score<50 提示"优先降噪"', () => {
    const d = livabilityDesc({ livability: { score: 40, noise: 60 } });
    assert.ok(d.includes('建议优先降噪'), d);
    assert.ok(d.includes('60%'), d);
  });
});
