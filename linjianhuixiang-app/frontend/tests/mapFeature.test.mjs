/**
 * mapFeature.test.mjs
 * 真实地图功能（MapLibre + 高德瓦片）纯逻辑测试：
 *  - mapUtils：scoreToColor 渐变配色 / pointsToGeoJSON 转换 / normalizeMapData 与 mapFromSummary /
 *    circleColorExpression 停靠点 / 高德瓦片 URL 模板；
 *  - repository.getGeocode（mock 模式）演示结果行为；
 *  - 屏幕接线（源码断言）：MapScreen 用 MapCanvas/MapPicker、RegionScreen 渲染 detail.map、
 *    RecordScreen 录音后读 GPS、apiService/repository 导出 getGeocode。
 * 说明：node 环境无 WebGL，仅测纯函数与源码接线，不实例化 MapCanvas。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  scoreToColor,
  pointsToGeoJSON,
  normalizeMapData,
  mapFromSummary,
  circleColorExpression,
  pickAmapTileUrl,
  DEFAULT_CENTER,
} from '../src/components/map/mapUtils.js';
import * as repository from '../src/data/repository.js';
import * as apiService from '../src/services/apiService.js';

const read = (p) => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), 'utf8');
const exists = (p) => existsSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)));

describe('地图组件与工具文件存在', () => {
  test('MapCanvas.jsx / MapPicker.jsx / mapUtils.js 均已创建', () => {
    assert.ok(exists('components/map/MapCanvas.jsx'), 'MapCanvas.jsx 应存在');
    assert.ok(exists('components/map/MapPicker.jsx'), 'MapPicker.jsx 应存在');
    assert.ok(exists('components/map/mapUtils.js'), 'mapUtils.js 应存在');
  });
});

describe('scoreToColor 渐变配色（score → 颜色）', () => {
  test('停靠点边界：≥70 绿 #2e7d52 / 50 琥珀 #d49a26 / 0 红 #c25a39', () => {
    assert.equal(scoreToColor(100), '#2e7d52');
    assert.equal(scoreToColor(70), '#2e7d52');
    assert.equal(scoreToColor(50), '#d49a26');
    assert.equal(scoreToColor(0), '#c25a39');
  });

  test('中间过渡：非停靠点落在两色之间（满足「渐变色」）', () => {
    // 25 → (红→琥珀) 中点；60 → (琥珀→绿) 中点
    assert.equal(scoreToColor(25), '#cb7a30');
    assert.equal(scoreToColor(60), '#818c3c');
    // 90 → 已进入绿色区间，稳定绿
    assert.equal(scoreToColor(90), '#2e7d52');
  });

  test('非法 / 缺失 score → 50（琥珀）兜底', () => {
    assert.equal(scoreToColor(), '#d49a26');
    assert.equal(scoreToColor(NaN), '#d49a26');
    assert.equal(scoreToColor('abc'), '#d49a26');
    assert.equal(scoreToColor(Infinity), '#d49a26', '非有限值按缺失处理 → 琥珀');
    assert.equal(scoreToColor(-5), '#c25a39', '越界钳制到 0 → 红');
  });

  test('circleColorExpression 使用相同三色停靠点', () => {
    const expr = circleColorExpression();
    assert.equal(expr[0], 'interpolate', '数据驱动 interpolate 渐变');
    const flat = JSON.stringify(expr);
    for (const c of ['#c25a39', '#d49a26', '#2e7d52']) {
      assert.ok(flat.includes(c), `expression 应包含颜色 ${c}`);
    }
  });
});

describe('pointsToGeoJSON（标点 → GeoJSON）', () => {
  test('合法坐标转 FeatureCollection，保留 name/score/from', () => {
    const gj = pointsToGeoJSON([
      { lng: 116.39, lat: 39.9, name: '中山公园', score: 72, from: 'gps' },
      { lng: 'bad', lat: 39.9 },
      null,
      { lng: 116.4, lat: 39.8 },
    ]);
    assert.equal(gj.type, 'FeatureCollection');
    assert.equal(gj.features.length, 2, '非法/缺失坐标应跳过');
    const f = gj.features[0];
    assert.deepEqual(f.geometry.coordinates, [116.39, 39.9]);
    assert.equal(f.properties.name, '中山公园');
    assert.equal(f.properties.score, 72);
    assert.equal(f.properties.from, 'gps');
  });

  test('缺省字段：label 用「段N」，score 50，from manual', () => {
    const gj = pointsToGeoJSON([{ lng: 116.4, lat: 39.8 }]);
    assert.equal(gj.features[0].properties.name, '段1');
    assert.equal(gj.features[0].properties.score, 50);
    assert.equal(gj.features[0].properties.from, 'manual');
  });

  test('空 / 非数组 → 空 FeatureCollection', () => {
    assert.deepEqual(pointsToGeoJSON([]), { type: 'FeatureCollection', features: [] });
    assert.deepEqual(pointsToGeoJSON(null), { type: 'FeatureCollection', features: [] });
  });
});

describe('normalizeMapData / mapFromSummary（mapData 构建与读取）', () => {
  test('合法 mapData：center/zoom/bounds/points 规范化', () => {
    const m = normalizeMapData({
      center: [116.39, 39.9],
      zoom: 14,
      bounds: [
        [116.3, 39.8],
        [116.5, 40.0],
      ],
      points: [{ lng: 1, lat: 2 }],
    });
    assert.deepEqual(m.center, [116.39, 39.9]);
    assert.equal(m.zoom, 14);
    assert.deepEqual(m.bounds, [[116.3, 39.8], [116.5, 40.0]]);
    assert.equal(m.points.length, 1);
  });

  test('center 缺失 / 非法 → null（调用方走「无地图」分支）', () => {
    assert.equal(normalizeMapData(null), null);
    assert.equal(normalizeMapData({}), null);
    assert.equal(normalizeMapData({ center: 'x' }), null);
    assert.equal(normalizeMapData({ center: [NaN, 1] }), null);
  });

  test('mapFromSummary：从 summary.map 读取；无 map → null', () => {
    const m = mapFromSummary({ map: { center: [1, 2], zoom: 13, bounds: null, points: [] } });
    assert.ok(m && m.center[0] === 1);
    assert.equal(mapFromSummary({}), null);
    assert.equal(mapFromSummary(null), null);
    assert.equal(mapFromSummary('x'), null);
  });

  test('DEFAULT_CENTER 为 [lng, lat] 双数值', () => {
    assert.equal(DEFAULT_CENTER.length, 2);
    assert.ok(DEFAULT_CENTER.every((v) => typeof v === 'number'));
  });
});

describe('高德瓦片 URL（无 key）', () => {
  test('pickAmapTileUrl：webrd0{1..4} 随机子域 + x/y/z 模板', () => {
    for (let i = 0; i < 20; i++) {
      const url = pickAmapTileUrl();
      assert.match(url, /^https:\/\/webrd0[1-4]\.is\.autonavi\.com\/appmaptile\?lang=zh_cn/);
      assert.ok(url.includes('{x}') && url.includes('{y}') && url.includes('{z}'), '应含瓦片坐标模板');
    }
  });
});

describe('repository.getGeocode（mock 模式演示结果）', () => {
  test('关键词命中演示数据，字段 shape {name, lng, lat} 完整', () => {
    const res = repository.getGeocode('中山公园');
    assert.equal(res.query, '中山公园');
    assert.ok(Array.isArray(res.results) && res.results.length >= 1, 'mock 应返回演示结果');
    for (const r of res.results) {
      for (const f of ['name', 'lng', 'lat']) {
        assert.ok(f in r, `结果缺少字段 ${f}`);
      }
      assert.equal(typeof r.lng, 'number');
      assert.equal(typeof r.lat, 'number');
    }
  });

  test('空关键词 → 空 results（不抛错）', () => {
    const res = repository.getGeocode('');
    assert.deepEqual(res.results, []);
    assert.deepEqual(repository.getGeocode(null).results, []);
  });
});

describe('apiService / repository 导出 getGeocode', () => {
  test('apiService.getGeocode 为 async 函数（GET /api/geocode）', () => {
    assert.equal(typeof apiService.getGeocode, 'function');
    const src = readFileSync(fileURLToPath(new URL('../src/services/apiService.js', import.meta.url)), 'utf8');
    assert.match(src, /\/api\/geocode/, '请求路径为 /api/geocode');
  });
});

describe('屏幕接线（源码断言：MapScreen / RegionScreen / RecordScreen）', () => {
  test('MapScreen 综合视图：MapCanvas 锁定视图 + MapPicker 引导 + SET_BATCH_MAP + 录音分布标题', () => {
    const map = read('screens/MapScreen.jsx');
    assert.match(map, /MapCanvas/, '综合视图引用 MapCanvas');
    assert.match(map, /MapPicker/, '综合视图引用 MapPicker 引导');
    assert.match(map, /SET_BATCH_MAP/, '简化固定写入 batchSummary.map');
    assert.match(map, /录音分布/, '地图区块标题');
    assert.match(map, /重新调整/, '锁定视图可重新调整');
  });

  test('MapScreen 单点分析视图：空间分布空态引导（不再引用静态 MapChart）', () => {
    const map = read('screens/MapScreen.jsx');
    assert.ok(!/MapChart/.test(map), 'MapScreen 不应再引用静态 MapChart');
    assert.match(map, /先完成多段分析，再在地图上标记位置/, '空态引导文案');
  });

  test('RegionScreen 渲染 detail.map（mapFromSummary + MapCanvas 锁定视图）', () => {
    const s = read('screens/RegionScreen.jsx');
    assert.match(s, /mapFromSummary/, '读取 detail.map');
    assert.match(s, /MapCanvas/, '渲染真实地图');
    assert.match(s, /interactive=\{false\}/, '简化固定视图');
  });

  test('RecordScreen 录音后读取 GPS 定位（getLocation / from 标记）', () => {
    const s = read('screens/RecordScreen.jsx');
    assert.match(s, /getLocation/, '调用原生定位桥');
    assert.match(s, /from: 'gps'/, 'GPS 坐标标记');
    assert.match(s, /from: 'manual'/, '无位置手动补');
    assert.match(s, /lng: null, lat: null/, '无位置 lng/lat 空');
  });
});
