/**
 * regionDetail.test.js —— 地区记录单条完整综合数据（增量）测试
 * 覆盖：
 *  - RegionSummary.jsx 公共组件存在，且 MapScreen（综合视图）与 RegionScreen（单条详情）均引用；
 *  - RegionSummary 渲染关键区块（宜居度大卡 / 统计行 / 物种清单 / 声学指数 / 热力图 / 声景分布 / 波形）；
 *  - RegionSummary 空数据守卫：summary 缺失 / 字段缺失 / 空数组均优雅降级不崩溃；
 *  - RegionScreen 单条详情选中逻辑：查看详情 / 返回列表切换 / 行标题显示 detail.recording；
 *  - summary 数据形状：聚合摘要字段齐全（RegionSummary 输入前提），残缺数据字段读取安全。
 * 运行：node --test tests/regionDetail.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aggregateAnalyses } from '../src/utils/aggregate.js';
import { buildAnalysis } from '../src/data/mockData.js';

const read = (p) => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), 'utf8');
const exists = (p) => existsSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)));

describe('A. RegionSummary 公共组件', () => {
  test('RegionSummary.jsx 文件存在', () => {
    assert.ok(exists('components/RegionSummary.jsx'), 'RegionSummary.jsx 应存在');
  });

  test('MapScreen 综合视图与 RegionScreen 单条详情均引用 RegionSummary', () => {
    const map = read('screens/MapScreen.jsx');
    const region = read('screens/RegionScreen.jsx');
    assert.match(map, /import\s+RegionSummary\s+from\s+['"]\.\.\/components\/RegionSummary['"]/);
    assert.match(region, /import\s+RegionSummary\s+from\s+['"]\.\.\/components\/RegionSummary['"]/);
    assert.match(map, /<RegionSummary summary=\{summary\}\s*\/>/, 'MapScreen 综合视图复用 RegionSummary');
    assert.match(region, /<RegionSummary summary=\{selected\.detail\}\s*\/>/, 'RegionScreen 单条详情复用 RegionSummary');
  });

  test('渲染关键区块：宜居度大卡 + 统计行 + 物种清单 + 声学指数 + 热力图 + 声景分布 + 波形', () => {
    const s = read('components/RegionSummary.jsx');
    // 宜居度大卡（Ring + 等级）
    assert.match(s, /liv-hero/, '宜居度大卡容器');
    assert.match(s, /<Ring value=\{score \|\| 0\}/, 'Ring 大卡');
    assert.match(s, /综合鸟类宜居度/);
    assert.match(s, /gradeOf/, '等级由 score 推导');
    // 统计行
    assert.match(s, /stat-row/, '统计行');
    assert.match(s, /识别鸟种/);
    assert.match(s, /人为噪声占比/);
    // 物种清单
    assert.match(s, /物种清单 · 按出现次数/);
    assert.match(s, /未识别到物种/, '空清单占位');
    // 声学指数
    assert.match(s, /声学指数/);
    assert.match(s, /idx-card/, '复用指数卡片样式');
    // 时间热力图
    assert.match(s, /时间热力图/);
    assert.match(s, /<HeatmapChart data=\{heat\}\s*\/>/, 'HeatmapChart 渲染');
    // 声景分布
    assert.match(s, /空间分布/);
    assert.match(s, /声景分布/, '地图区块标题');
    assert.match(s, /<MapChart points=\{points\}\s*\/>/, 'MapChart 渲染');
    // 录音波形 + 时长
    assert.match(s, /录音波形/);
    assert.match(s, /<WaveformChart data=\{waveform\}\s*\/>/, 'WaveformChart 渲染');
    assert.match(s, /durationSec/, '时长展示');
  });

  test('空数据守卫：summary 缺失 / 字段缺失 / 空数组优雅降级不崩溃', () => {
    const s = read('components/RegionSummary.jsx');
    // summary 整体缺失
    assert.match(s, /!summary \|\| typeof summary !== 'object'/, 'summary 缺失 → 占位');
    assert.match(s, /暂无综合数据/, '缺失占位文案');
    // 数组字段全部走 Array.isArray 守卫
    for (const f of ['indices', 'heatmap', 'mapPoints', 'waveform']) {
      assert.match(s, new RegExp(`Array\\.isArray\\(summary\\.${f}\\)`), `字段 ${f} 应有数组守卫`);
    }
    // species 在 sortedSpecies 辅助函数内做数组守卫（非数组返回空数组）
    assert.match(s, /function sortedSpecies\(list\)[\s\S]*Array\.isArray\(list\)/, 'species 应经 sortedSpecies 数组守卫');
    assert.match(s, /sortedSpecies\(summary\.species\)/, 'species 走守卫排序');
    // segmentPoints 回退
    assert.match(s, /Array\.isArray\(summary\.segmentPoints\)/, 'segmentPoints 回退守卫');
    assert.match(s, /mapPoints\.length > 0 \? mapPoints : segmentPoints/, 'mapPoints 优先，segmentPoints 回退');
    // 空数组占位文案
    assert.match(s, /暂无热力图数据/, '热力图空数据占位');
    assert.match(s, /暂无样点数据/, '样点空数据占位');
    // 波形空数组 → 整块不渲染（守卫在 length > 0 条件内）
    assert.match(s, /waveform\.length > 0 &&/, '波形空数组不渲染该区块');
    // 宜居度缺失 → 用 0 兜底，不抛错
    assert.match(s, /score == null \? 0 : score/, 'score 缺失回退 0');
  });
});

describe('B. RegionScreen 单条详情', () => {
  test('记录行含「查看详情」操作：整行可点击 + 右侧详情图标按钮', () => {
    const s = read('screens/RegionScreen.jsx');
    assert.match(s, /onClick=\{\(\) => setSelectedId\(r\.id\)\}/, '点击整行选中该记录');
    assert.match(s, /detail-chevron/, '右侧详情按钮');
    assert.match(s, /IconChevronRight/, '详情箭头图标');
    assert.match(s, /aria-label="查看完整综合数据"/);
  });

  test('选中态：显示完整综合数据 + 「返回列表」切换，未选中保持列表与趋势', () => {
    const s = read('screens/RegionScreen.jsx');
    assert.match(s, /selectedId/, '记录选中态');
    assert.match(s, /\{selected && \(/, '选中后渲染详情区块');
    assert.match(s, /返回列表/, '收起详情切换按钮');
    assert.match(s, /setSelectedId\(null\)/, '返回列表清空选中态');
    assert.match(s, /region-row-det-active/, '选中行高亮');
    assert.match(s, /<LineChart records=\{records\}\s*\/>/, '未选中时趋势折线图保留');
    assert.match(s, /<RegionSummary summary=\{selected\.detail\}\s*\/>/, '详情复用 RegionSummary');
  });

  test('行标题显示 recording 名（detail.recording 便于识别）', () => {
    const s = read('screens/RegionScreen.jsx');
    assert.match(s, /detail\.recording/, '读取 detail.recording');
    assert.match(s, /recordingName \|\| formatISODate\(r\.created_at\)/, '无录音名时回退日期');
  });

  test('删除交互不误触选中：删除按钮 stopPropagation', () => {
    const s = read('screens/RegionScreen.jsx');
    assert.match(s, /e\.stopPropagation\(\);\s*setConfirmId\(r\.id\)/, '删除按钮点击不触发行选中');
    assert.match(s, /confirmDelete\(r\)/, '二次确认删除');
  });
});

describe('C. summary 数据形状（RegionSummary 输入前提）', () => {
  test('聚合摘要字段齐全：livability/species/indices/heatmap/mapPoints/waveform/durationSec', () => {
    const summary = aggregateAnalyses([buildAnalysis('第1段.wav'), buildAnalysis('第2段.wav')]);
    for (const key of ['recording', 'speciesCount', 'species', 'indices', 'livability', 'heatmap', 'mapPoints', 'waveform', 'durationSec']) {
      assert.ok(key in summary, `综合摘要缺少字段 ${key}`);
    }
    assert.equal(typeof summary.livability.score, 'number');
    assert.ok(Array.isArray(summary.species));
    assert.ok(Array.isArray(summary.indices));
    assert.ok(Array.isArray(summary.heatmap));
    assert.ok(Array.isArray(summary.mapPoints));
    assert.ok(Array.isArray(summary.waveform));
  });

  test('残缺摘要（仅 livability.score 的旧数据）：RegionSummary 的守卫读取不抛错', () => {
    const ragged = { recording: '旧数据.wav', livability: { score: 60 } };
    // 复刻 RegionSummary 内所有字段读取路径，缺字段一律用 Array.isArray / 可选链守卫兜底
    const lv = ragged.livability && typeof ragged.livability === 'object' ? ragged.livability : {};
    const score = typeof lv.score === 'number' ? lv.score : null;
    const species = (Array.isArray(ragged.species) ? ragged.species : []).slice();
    const indices = Array.isArray(ragged.indices) ? ragged.indices : [];
    const heat = Array.isArray(ragged.heatmap) && ragged.heatmap.length > 0 ? ragged.heatmap : null;
    const mapPoints = Array.isArray(ragged.mapPoints) ? ragged.mapPoints : [];
    const segmentPoints = Array.isArray(ragged.segmentPoints) ? ragged.segmentPoints : [];
    const points = mapPoints.length > 0 ? mapPoints : segmentPoints;
    const waveform = Array.isArray(ragged.waveform) ? ragged.waveform : [];
    const speciesCount =
      typeof ragged.speciesCount === 'number'
        ? ragged.speciesCount
        : species.length > 0
          ? species.length
          : '—';
    assert.equal(score, 60);
    assert.deepEqual(species, []);
    assert.deepEqual(indices, []);
    assert.equal(heat, null);
    assert.deepEqual(points, []);
    assert.deepEqual(waveform, []);
    assert.equal(speciesCount, '—');
  });

  test('空摘要（aggregateAnalyses([])）：字段均为安全默认，组件可渲染占位', () => {
    const summary = aggregateAnalyses([]);
    assert.deepEqual(summary.species, []);
    assert.deepEqual(summary.indices, []);
    assert.deepEqual(summary.mapPoints, []);
    assert.deepEqual(summary.waveform, []);
    assert.equal(summary.livability.score, 0);
    assert.equal(summary.speciesCount, 0);
    // 波形/指数区块按 length > 0 守卫跳过，热力图/样点显示占位
    assert.equal(Array.isArray(summary.heatmap) && summary.heatmap.length > 0, true);
    assert.ok(Array.isArray(summary.heatmap));
  });
});
