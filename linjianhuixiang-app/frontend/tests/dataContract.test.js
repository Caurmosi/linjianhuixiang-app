/**
 * dataContract.test.js —— 数据契约测试：屏幕/组件引用的数据字段必须存在于 mockData 输出中
 * 采用静态扫描 src/**​/*.jsx 源码 + 白名单字段断言，防止"屏幕引用了不存在的字段"这类隐性崩溃。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  SPECIES,
  INDICES,
  LIVABILITY,
  HISTORY,
  buildAnalysis,
} from '../src/data/mockData.js';

const srcDir = fileURLToPath(new URL('../src', import.meta.url));

/** 递归收集 src 下所有 .jsx 文件文本 */
function collectSrcText(dir) {
  let text = '';
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) text += collectSrcText(p);
    else if (name.endsWith('.jsx')) text += readFileSync(p, 'utf8') + '\n';
  }
  return text;
}
const srcText = collectSrcText(srcDir);

/** repository.js 导出的符号集合（数据契约：UI 只允许从 repository 导入数据） */
const repositoryPath = fileURLToPath(new URL('../src/data/repository.js', import.meta.url));
const repositorySrc = readFileSync(repositoryPath, 'utf8');
const exportedNames = new Set([
  ...[...repositorySrc.matchAll(/export\s+(?:const|function|let|var)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
  ...[...repositorySrc.matchAll(/export\s*\{([^}]+)\}/g)]
    .flatMap((m) => m[1].split(','))
    .map((s) => s.trim().split(/\s+as\s+/)[0])
    .filter(Boolean),
]);

describe('数据契约：analysis 顶层字段', () => {
  test('src 中直接引用的 analysis.* 字段均存在于 buildAnalysis 输出', () => {
    const analysisKeys = Object.keys(buildAnalysis('契约测试.wav'));
    const refs = [...new Set([...srcText.matchAll(/analysis\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))];
    assert.ok(refs.length > 0, '应扫描到至少一个 analysis.* 引用');
    for (const f of refs) {
      assert.ok(analysisKeys.includes(f), `屏幕引用了不存在的 analysis 字段: analysis.${f}`);
    }
  });

  test('别名引用字段（a.recording / a.heatmap / a.mapPoints / a.suggestions / a.speciesCount / a.livability / a.waveform / a.segmentPoints）均存在', () => {
    const analysisKeys = Object.keys(buildAnalysis('x.wav'));
    for (const f of ['recording', 'heatmap', 'mapPoints', 'suggestions', 'speciesCount', 'livability', 'waveform', 'segmentPoints']) {
      assert.ok(analysisKeys.includes(f), `缺少 analysis.${f}`);
    }
  });

  test('analysis.livability 子字段（score/bio/sound/noise）均存在', () => {
    const lv = buildAnalysis('x.wav').livability;
    for (const f of ['score', 'bio', 'sound', 'noise']) {
      assert.ok(f in lv, `缺少 livability.${f}`);
    }
  });

  test('analysis.waveform 为数组，analysis.segmentPoints 为含 x/y/c/t 的样点数组', () => {
    const a = buildAnalysis('x.wav');
    assert.ok(Array.isArray(a.waveform), 'waveform 应为数组');
    assert.ok(a.waveform.length > 0, 'waveform 不应为空');
    for (const v of a.waveform) {
      assert.equal(typeof v, 'number');
      assert.ok(v >= 0 && v <= 1, `waveform 值应在 [0,1]: ${v}`);
    }
    assert.ok(Array.isArray(a.segmentPoints), 'segmentPoints 应为数组');
    assert.ok(a.segmentPoints.length > 0, 'segmentPoints 不应为空');
    for (const p of a.segmentPoints) {
      for (const f of ['x', 'y', 'c', 't']) {
        assert.ok(f in p, `segmentPoints 样点缺少字段 ${f}`);
      }
    }
  });
});

describe('数据契约：物种行字段', () => {
  test('SpeciesScreen 使用的 s.id/name/latin/conf/freq/period 均存在', () => {
    const first = SPECIES[0];
    for (const f of ['id', 'name', 'latin', 'conf', 'freq', 'period']) {
      assert.ok(f in first, `SPECIES 缺少字段 ${f}`);
    }
  });
});

describe('数据契约：指数/地图/历史字段', () => {
  test('IndicesScreen 使用的 key/name/display/pct/desc 均存在', () => {
    const first = INDICES[0];
    for (const f of ['key', 'name', 'display', 'pct', 'desc']) {
      assert.ok(f in first, `INDICES 缺少字段 ${f}`);
    }
  });

  test('HomeScreen 历史记录使用的 id/name/species/score/duration 均存在', () => {
    const first = HISTORY[0];
    for (const f of ['id', 'name', 'species', 'score', 'duration']) {
      assert.ok(f in first, `HISTORY 缺少字段 ${f}`);
    }
  });

  test('LIVABILITY 含 grade/gradeEn 展示字段', () => {
    for (const f of ['grade', 'gradeEn']) {
      assert.ok(f in LIVABILITY, `LIVABILITY 缺少字段 ${f}`);
    }
  });
});

describe('数据契约：repository 具名导入均真实存在', () => {
  test('各屏幕 from repository 的具名导入都在 repository.js 中导出', () => {
    const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]\.\.?\/data\/repository['"]/g;
    let m;
    let found = false;
    while ((m = importRe.exec(srcText)) !== null) {
      found = true;
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0];
        if (!name) continue;
        assert.ok(exportedNames.has(name), `屏幕导入了 repository 中不存在的符号: ${name}`);
      }
    }
    assert.ok(found, '应扫描到对 repository 的具名导入');
  });

  test('src 下不再存在对 mockData 的直接 import（数据出口唯一化）', () => {
    const mockImportRe = /from\s*['"]\.\.?\/data\/mockData['"]/g;
    assert.equal(srcText.match(mockImportRe), null, 'UI/store/utils 不得直接 import ../data/mockData');
  });
});

describe('阈值联动端到端一致性（设置滑杆 ↔ 物种清单）', () => {
  test('SettingsScreen 滑杆范围为 0.30–0.90、步进 0.01，与默认阈值 0.5 一致', () => {
    const settingsPath = fileURLToPath(new URL('../src/screens/SettingsScreen.jsx', import.meta.url));
    const s = readFileSync(settingsPath, 'utf8');
    assert.match(s, /min="0\.30"/, '滑杆 min 应为 0.30');
    assert.match(s, /max="0\.90"/, '滑杆 max 应为 0.90');
    assert.match(s, /step="0\.01"/, '滑杆 step 应为 0.01');
  });

  test('物种清单在 0.30/0.50/0.90 阈值下的可见数符合 PRD（9/7/1）', () => {
    const shown = (t) => SPECIES.filter((sp) => sp.conf >= t).length;
    assert.equal(shown(0.3), 9, '阈值 0.30 应全部显示');
    assert.equal(shown(0.5), 7, '阈值 0.50 应显示 7 种');
    assert.equal(shown(0.9), 1, '阈值 0.90 应显示 1 种');
    assert.equal(shown(0.94), 0, '阈值 0.94 应显示 0 种（空态）');
  });

  test('物种清单各时段计数与总数自洽（阈值 0.50）', () => {
    const periods = ['清晨', '上午', '黄昏', '全天'];
    const total = SPECIES.filter((sp) => sp.conf >= 0.5).length;
    const perPeriod = periods.map(
      (p) => SPECIES.filter((sp) => sp.conf >= 0.5 && sp.period === p).length
    );
    assert.equal(perPeriod.reduce((a, b) => a + b, 0), total, '各时段计数之和应等于总数');
    assert.ok(perPeriod.every((n) => n > 0), '阈值 0.50 时每个时段都应仍有物种');
  });
});
