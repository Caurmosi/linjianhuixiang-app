/**
 * newFeatures.test.js —— 新增功能静态接线测试
 * 对本次增量（首页重构 + 长按录音 + 批量分析 + 多录音综合地图）的关键接线做源码级断言，
 * 保证需求点（A~E）在真实源码中落地，且不会被后续重构悄悄移除。
 * 运行：node --test tests/newFeatures.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), 'utf8');

const home = read('screens/HomeScreen.jsx');
const record = read('screens/RecordScreen.jsx');
const analyzing = read('screens/AnalyzingScreen.jsx');
const map = read('screens/MapScreen.jsx');
const app = read('App.jsx');
const store = read('store/appStore.jsx');

describe('App.jsx：record 屏幕注册（需求 C）', () => {
  test('imports RecordScreen 并在 SCREENS 注册 record', () => {
    assert.match(app, /import\s+RecordScreen\s+from\s+['"]\.\/screens\/RecordScreen['"]/);
    assert.match(app, /record:\s*RecordScreen/);
  });
});

describe('HomeScreen.jsx：首页重构（需求 A）', () => {
  test('真实识别模式（isMockMode() 为 false）隐藏「一键演示」按钮', () => {
    // 演示按钮必须包在 mockMode 条件内（mockMode 为 false 时不渲染）
    assert.match(home, /\{mockMode\s*\?[\s\S]*一键演示（内置样例）[\s\S]*:\s*null\s*\}/, '演示按钮应仅 mockMode 时渲染');
  });

  test('「演示模式/真实识别」徽标保留', () => {
    assert.match(home, /演示模式/);
    assert.match(home, /真实识别/);
    assert.match(home, /Chip tone=\{mockMode \? 'mid' : 'good'\}/);
  });

  test('实时录音为主卡：点击进入 record 屏幕（GO）', () => {
    assert.match(home, /record-card/);
    assert.match(home, /type: 'GO', screen: 'record'/);
    assert.match(home, /长按录制/);
  });

  test('导入环境录音 input 支持多选（multiple）', () => {
    assert.match(home, /type="file"\s+accept="audio\/\*"\s+multiple\s+className="hidden"/, 'input 应带 multiple');
  });

  test('文件多选：1 个走单文件 START_ANALYSIS；≥2 个走 START_BATCH', () => {
    assert.match(home, /Array\.from\(e\.target\.files\)/, '应读取 e.target.files 全部文件');
    assert.match(home, /files\.length === 1/);
    assert.match(home, /importSingleFile\(files\[0\]\)/);
    assert.match(home, /START_BATCH/, '≥2 文件走批量流程');
    assert.match(home, /type: 'START_BATCH', items: files\.map\(\(f\) => \(\{ name: f\.name, file: f \}\)/);
  });
});

describe('RecordScreen.jsx：长按录音（需求 C）', () => {
  test('注册 record 布局元素：AppBar「实时录音」+ 大圆钮 + 状态文案 + 段落列表 + 完成按钮', () => {
    assert.match(record, /<AppBar title="实时录音"/);
    assert.match(record, /record-btn/);
    assert.match(record, /按住录音，松手结束/);
    assert.match(record, /录音中… 松手结束/);
    assert.match(record, /本次已录/);
    assert.match(record, /完成（/);
  });

  test('长按交互：Pointer/Touch 按下开始、松开结束', () => {
    assert.match(record, /onPointerDown=\{startRecording\}/);
    assert.match(record, /onPointerUp=\{stopRecording\}/);
    assert.match(record, /onTouchStart=\{\(e\) =>/);
    assert.match(record, /startRecording\(\);/);
    assert.match(record, /onTouchEnd=\{\(e\) =>/);
    assert.match(record, /stopRecording\(\);/);
  });

  test('真机原生桥：startNativeRecord / stopNativeRecord', () => {
    assert.match(record, /startNativeRecord/);
    assert.match(record, /stopNativeRecord/);
    assert.match(record, /'录音启动失败，请检查麦克风权限'/);
  });

  test('浏览器降级：getUserMedia + MediaRecorder（复用 utils/recorder）', () => {
    assert.match(record, /startWebMediaRecorder/);
    assert.match(record, /getUserMediaErrorText/);
    assert.match(record, /dataUrlToBlob/);
  });

  test('每段停止后立即自动分析，失败 buildMockAnalysis 兜底', () => {
    assert.match(record, /buildAnalysis\(name, \{ audioFile: file/);
    assert.match(record, /buildMockAnalysis\(name, \{ durationSec \}\)/);
    assert.match(record, /已分析 ✓/);
  });

  test('完成语义：0 段 Toast 提示；单段 → 结果页；≥2 段 → 聚合 → 地图综合页', () => {
    assert.match(record, /请先录制至少一段/);
    assert.match(record, /COMPLETE_ANALYSIS/, '单段复用 COMPLETE_ANALYSIS');
    assert.match(record, /COMPLETE_BATCH/, '≥2 段复用 COMPLETE_BATCH');
    assert.match(record, /aggregateAnalyses\(done\.map\(\(s\) => s\.result\)\)/);
  });
});

describe('AnalyzingScreen.jsx：批量模式（需求 B）', () => {
  test('批量模式：逐项 buildAnalysis + BATCH_PROGRESS 推进，失败 mock 兜底继续', () => {
    assert.match(analyzing, /batchMode/);
    assert.match(analyzing, /BATCH_PROGRESS/);
    assert.match(analyzing, /buildMockAnalysis\(recording, overrides\)/);
    assert.match(analyzing, /分析 \{current\}\/\{batchTotal\}/);
    assert.match(analyzing, /当前录音名/);
  });
});

describe('appStore.jsx：批量状态与 action（需求 B）', () => {
  test('存在 batch 状态字段', () => {
    for (const f of ['batchQueue', 'batchIndex', 'batchResults', 'batchMode', 'batchSummary']) {
      assert.ok(store.includes(`${f}:`), `appStore 应含 batch 字段 ${f}`);
    }
  });

  test('存在 START_BATCH / BATCH_PROGRESS / COMPLETE_BATCH / CLEAR_BATCH action', () => {
    for (const a of ["case 'START_BATCH'", "case 'BATCH_PROGRESS'", "case 'COMPLETE_BATCH'", "case 'CLEAR_BATCH'"]) {
      assert.ok(store.includes(a), `appStore 应含 action ${a}`);
    }
  });

  test('BATCH_PROGRESS 全部完成时调用聚合函数（aggregateAnalyses）', () => {
    assert.match(store, /aggregateAnalyses\(results\.filter\(Boolean\)\)/);
  });
});

describe('MapScreen.jsx：多录音综合视图（需求 D）', () => {
  test('消费 state.batchSummary，存在时渲染综合视图', () => {
    assert.match(map, /state\.batchSummary/);
    assert.match(map, /if \(summary\)/);
    assert.match(map, /本区域 .* 段录音综合/);
  });

  test('综合视图复用 RegionSummary（完整综合数据渲染已抽至公共组件）+ 保留保存/清除', () => {
    assert.match(map, /RegionSummary/, '综合视图引用公共组件');
    assert.match(map, /<RegionSummary summary=\{summary\}\s*\/>/, 'batchSummary 分支渲染 RegionSummary');
    assert.match(map, /保存地区记录/, '保存按钮保留在综合视图');
    assert.match(map, /CLEAR_BATCH/);
    assert.match(map, /清除综合，返回首页/);
    // 渲染区块（宜居度大卡/物种清单/热力图/声景分布）断言见 regionDetail.test.js
  });

  test('保留原单点分析视图（无 batchSummary 时照旧）', () => {
    assert.match(map, /声景地图/);
    assert.match(map, /a\.segmentPoints/);
    assert.match(map, /多绿地切换器/);
  });
});
