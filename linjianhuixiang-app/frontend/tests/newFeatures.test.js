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

  test('数据源模式徽标已移除（用户要求首页更简洁，不再显示「真实识别/演示模式」提示）', () => {
    assert.ok(!home.includes("Chip tone={mockMode"), '首页不应再有模式徽标结构');
    assert.ok(!home.includes("'真实识别'"), '首页不应再渲染「真实识别」徽标文本');
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

  test('聚合已移出 reducer（防 dispatch 抛错白屏）：appStore 不再调用 aggregateAnalyses，AnalyzingScreen 完成聚合后 dispatch COMPLETE_BATCH', () => {
    assert.ok(!store.includes('aggregateAnalyses('), 'reducer 内不得再调用聚合（dispatch 抛错 → React 卸载 → 白屏）');
    assert.match(analyzing, /aggregateAnalyses\(results\)/, 'AnalyzingScreen 批量完成时聚合全部结果');
    assert.match(analyzing, /COMPLETE_BATCH/, '聚合后 dispatch COMPLETE_BATCH 跳地图综合页');
    assert.match(store, /case 'COMPLETE_BATCH'/, 'COMPLETE_BATCH 仍为 reducer 标准 action');
    assert.match(store, /try\s*\{/, 'reducer 整体 try/catch 保护');
    assert.match(store, /页面状态异常，请重试/, 'reducer 出错返回原 state + Toast，不上抛');
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

  test('单点分析视图（无 batchSummary）：仅时间热力图，已移除「空间分布」tab/空态', () => {
    assert.match(map, /声景地图/);
    assert.match(map, /时间热力图/);
    // 旧「空间分布」tab（空态引导）已移除：与「录音分布」真实地图重复，用户认为多余
    assert.ok(!/空间分布/.test(map), '已移除「空间分布」tab');
    assert.ok(!/先完成多段分析，再在地图上标记位置/.test(map), '已移除空间分布空态引导');
    // 综合视图才有 MapPicker/MapCanvas 渲染（真实地图入口）
    assert.match(map, /MapPicker/, '综合视图引用 MapPicker 引导');
    assert.match(map, /MapCanvas/, '综合视图引用 MapCanvas 真实地图');
  });
});

/* ================= 历史记录改版：首页瘦身 + 导航改名 ================= */
describe('首页瘦身（历史记录移入底部 Tab）', () => {
  test('首页已移除「历史记录」按钮行与「最近分析」区块', () => {
    assert.ok(!home.includes('历史记录'), '首页不应再有历史记录按钮行');
    assert.ok(!home.includes('最近分析'), '首页不应再有最近分析区块');
  });

  test('底部导航「结果」Tab 已改名「历史记录」', () => {
    const nav = read('components/BottomNav.jsx');
    assert.match(nav, /label: '历史记录'/);
    assert.ok(!nav.includes("label: '结果'"), '不应再显示「结果」Tab');
  });

  test('HistoryScreen 支持星标（TOGGLE_STARRED + IconStar + 星标分组）', () => {
    const history = read('screens/HistoryScreen.jsx');
    assert.match(store, /case 'TOGGLE_STARRED'/);
    assert.match(history, /IconStar/);
    assert.match(history, /starred/);
    assert.match(history, /⭐ 星标/);
  });

  test('HistoryScreen 支持多选（选择/全选/批量分享/批量删除）', () => {
    const history = read('screens/HistoryScreen.jsx');
    assert.match(history, /选择/);
    assert.match(history, /全选/);
    assert.match(history, /bulkShare/);
    assert.match(history, /startBulkDelete/);
  });

  test('结果页右上角分享 → 分享卡片（drawShareCard + SharePreview）', () => {
    const results = read('screens/ResultsScreen.jsx');
    assert.match(results, /SharePreview/);
    assert.match(results, /drawShareCard/);
  });

  test('分享卡片绘制：buildShareCardData / 卡通鸟 / 预览保存 均已接线', () => {
    const card = read('utils/shareCard.js');
    assert.match(card, /buildShareCardData/);
    assert.match(card, /drawBirdBadge/);
    const preview = read('components/SharePreview.jsx');
    assert.match(preview, /saveCardImage/);
    assert.match(preview, /全部保存/);
  });
});

/* ================= Bug 修复：结果页返回历史 + 历史本地持久化 ================= */
describe('结果页返回与历史本地化（bugfix）', () => {
  test('底部「历史记录」Tab 映射 HistoryScreen（results → history）', () => {
    assert.match(app, /results: 'history'/, 'TAB 映射 results → HistoryScreen');
  });

  test('COMPLETE_ANALYSIS 自动写入本地历史（history 前置插入 + 快照）', () => {
    assert.match(store, /history: \[item, \.\.\.state\.history\]/, '分析结果应插入历史列表');
    assert.match(store, /analysis: a,/, '历史条目应含 analysis 快照');
    assert.match(store, /screenStack: \['history'\]/, '返回栈指向历史记录');
  });

  test('历史页拉取失败不清空本地历史', () => {
    const history = read('screens/HistoryScreen.jsx');
    assert.ok(!history.includes("SET_HISTORY', items: []"), '不应在失败时清空历史');
    assert.match(history, /保留本地已有历史/);
  });
});
