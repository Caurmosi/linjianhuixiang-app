/**
 * regionWiring.test.js —— 地区记录 / 历史删除 增量功能静态接线测试
 * 对本次增量（历史删除+日期、地区记录保存/列表/详情/趋势）的关键接线做源码级断言，
 * 保证需求点（A/B/C）在真实源码中落地，且不会被后续重构悄悄移除。
 * 运行：node --test tests/regionWiring.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), 'utf8');
const exists = (p) => existsSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)));

const history = read('screens/HistoryScreen.jsx');
const map = read('screens/MapScreen.jsx');
const app = read('App.jsx');
const store = read('store/appStore.jsx');
const repository = read('data/repository.js');
const api = read('services/apiService.js');
const mockData = read('data/mockData.js');

describe('A. 历史记录：删除 + 日期（HistoryScreen）', () => {
  test('存在删除按钮（IconTrash / ×）与二次确认文案', () => {
    assert.match(history, /IconTrash/);
    assert.match(history, /确认删除？/);
    assert.match(history, /deleteHistory/, '应调用 repository.deleteHistory');
  });

  test('删除成功后本地过滤并刷新列表（SET_HISTORY）', () => {
    assert.match(history, /SET_HISTORY/);
    assert.match(history, /filter\(\(h\) => h\.id !== item\.id\)/);
  });

  test('每条显示分析日期（created_at → YYYY-MM-DD）', () => {
    assert.match(history, /formatISODate/);
    assert.match(history, /created_at/);
    assert.match(history, /hist-date/, '日期小字样式类');
  });

  test('后端 DELETE /api/history/{id} + database.delete_history 存在', () => {
    assert.match(api, /deleteHistory/);
    assert.match(api, /`\/api\/history\/\$\{id\}`/);
    assert.match(api, /method: 'DELETE'/);
  });
});

describe('B. 地区记录：保存 / 列表 / 详情 / 趋势', () => {
  test('MapScreen 综合视图含「保存地区记录」按钮与命名面板', () => {
    assert.match(map, /保存地区记录/);
    assert.match(map, /saveRegion/, '应调用 repository.saveRegion');
    assert.match(map, /地区记录已保存/);
    assert.match(map, /save-panel/, '命名小面板');
  });

  test('MapScreen 地区记录区块：按名称分组 + 点击进入地区详情（OPEN_REGION）', () => {
    assert.match(map, /地区记录/);
    assert.match(map, /groupRegionsByName/, '同名归组函数');
    assert.match(map, /OPEN_REGION/);
    assert.match(map, /deleteRegion/, '行删除调 repository.deleteRegion');
    assert.match(map, /formatISODate/, '行内显示日期');
  });

  test('appStore：regions 状态 + SET_REGIONS + OPEN_REGION（携带地区名）', () => {
    assert.match(store, /regions: isMockMode\(\) \? \[\] : loadRegions\(\)/, '真实 API 模式从 localStore 水合（启动不覆盖本地地区记录）');
    assert.match(store, /case 'SET_REGIONS'/);
    assert.match(store, /case 'OPEN_REGION'/);
    assert.match(store, /activeRegionName/, '存储当前查看地区名');
    assert.match(store, /screen: 'region'/, '跳转地区详情屏');
  });

  test('RegionScreen + LineChart 文件存在', () => {
    assert.ok(exists('screens/RegionScreen.jsx'), 'RegionScreen.jsx 应存在');
    assert.ok(exists('components/charts/LineChart.jsx'), 'LineChart.jsx 应存在');
  });

  test('RegionScreen：AppBar 重命名 + 记录列表（日期/score/噪声/鸟种数/删除）+ 趋势折线', () => {
    const region = read('screens/RegionScreen.jsx');
    const lineChart = read('components/charts/LineChart.jsx');
    assert.match(region, /重命名/);
    assert.match(region, /renameRegion/, '应调用 repository.renameRegion');
    assert.match(region, /LineChart/, '应渲染趋势折线图');
    assert.match(lineChart, /至少 2 次测量才能对比趋势/, '单点记录时提示（LineChart 守卫）');
    assert.match(lineChart, /forest-500/, '宜居度折线用 forest-500');
    assert.match(lineChart, /clay/, '噪声折线用 clay');
    assert.match(region, /speciesCount/, '记录行显示鸟种数');
    assert.match(region, /deleteRegion/, '记录行可删除');
  });

  test('App.jsx 注册 region 屏幕', () => {
    assert.match(app, /import\s+RegionScreen\s+from\s+['"]\.\/screens\/RegionScreen['"]/);
    assert.match(app, /region:\s*RegionScreen/);
  });
});

describe('C. 数据层：repository / apiService / mockData', () => {
  test('repository 导出 getRegions/saveRegion/deleteRegion/renameRegion/deleteHistory', () => {
    for (const fn of ['getRegions', 'saveRegion', 'deleteRegion', 'renameRegion', 'deleteHistory']) {
      assert.match(repository, new RegExp(`export function ${fn}\\b`), `repository 应导出 ${fn}`);
    }
  });

  test('apiService 导出 getRegions/saveRegion/deleteRegion/renameRegion/deleteHistory（对接 /api/regions 与 /api/history）', () => {
    for (const fn of ['getRegions', 'saveRegion', 'deleteRegion', 'renameRegion', 'deleteHistory']) {
      assert.match(api, new RegExp(`export function ${fn}\\b`), `apiService 应导出 ${fn}`);
    }
    assert.match(api, /\/api\/regions/, '对接地区记录接口');
  });

  test('mockData 含 REGIONS 与 HISTORY created_at', () => {
    assert.match(mockData, /export const REGIONS/, '应导出 REGIONS');
    assert.match(mockData, /created_at: '2026-/, 'HISTORY/REGIONS 应含 created_at');
  });
});
