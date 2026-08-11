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
  fixedPoint,
  wgs84ToGcj02,
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

describe('高德瓦片 URL（无 key，编辑态底图）', () => {
  test('pickAmapTileUrl：webrd0{1..4} 随机子域 + style=7 + x/y/z 模板（编辑态默认底图；注记关闭见 simplifiedStyle）', () => {
    for (let i = 0; i < 20; i++) {
      const url = pickAmapTileUrl();
      assert.match(url, /^https:\/\/webrd0[1-4]\.is\.autonavi\.com\/appmaptile\?lang=zh_cn/);
      assert.ok(url.includes('style=7'), '底图应为 style=7（路网；注记相对少，编辑态可用）');
      assert.ok(!url.includes('style=8'), '不应使用注记过多的 style=8');
      assert.ok(url.includes('{x}') && url.includes('{y}') && url.includes('{z}'), '应含瓦片坐标模板');
    }
  });
});

describe('fixedPoint（手动固定段坐标）', () => {
  test('将指定段坐标更新为手动点：from 置 manual，保留 name/score，返回新数组', () => {
    const pts = [
      { lng: 116.39, lat: 39.9, name: '第1段', score: 72, from: 'gps' },
      { lng: 116.4, lat: 39.8, name: '第2段', score: 55, from: 'manual' },
    ];
    const next = fixedPoint(pts, 1, { lng: 116.42, lat: 39.82 });
    assert.notEqual(next, pts, '应返回新数组（不可变）');
    assert.deepEqual(next[1], { lng: 116.42, lat: 39.82, name: '第2段', score: 55, from: 'manual' });
    assert.deepEqual(next[0], pts[0], '其它段不受影响');
    assert.equal(pts[1].lng, 116.4, '原数组不应被修改');
  });

  test('idx 越界 / 坐标非法 → 返回原数组不变', () => {
    const pts = [{ lng: 1, lat: 2, name: '第1段', score: 50, from: 'manual' }];
    assert.equal(fixedPoint(pts, 5, { lng: 1, lat: 1 }), pts, 'idx 越界');
    assert.equal(fixedPoint(pts, -1, { lng: 1, lat: 1 }), pts, 'idx 负数');
    assert.equal(fixedPoint(pts, 0, { lng: 'x', lat: 1 }), pts, 'lng 非法');
    assert.equal(fixedPoint(pts, 0, null), pts, '坐标缺失');
    assert.deepEqual(fixedPoint([], 0, { lng: 1, lat: 1 }), [], '空数组返回空');
  });
});

describe('wgs84ToGcj02（WGS84 → GCJ-02 火星坐标纠偏）', () => {
  test('北京坐标东北向偏移，量级约 +0.002~0.006 度，返回非空双数值数组', () => {
    const [lng, lat] = wgs84ToGcj02(116.391, 39.907);
    assert.ok(Number.isFinite(lng) && Number.isFinite(lat), '应返回 [lng, lat] 双数值数组');
    assert.ok(lng > 116.391 && lat > 39.907, '北京 GPS 点应向东北偏移');
    const dLng = lng - 116.391;
    const dLat = lat - 39.907;
    assert.ok(dLng > 0.002 && dLng < 0.01, `经度偏移应在约 +0.002~0.006 度，实际 ${dLng.toFixed(4)}`);
    assert.ok(dLat > 0.001 && dLat < 0.01, `纬度偏移应在约 +0.001~0.006 度，实际 ${dLat.toFixed(4)}`);
  });

  test('境外坐标不偏转（返回原值）；非法输入返回 [NaN, NaN]；幂等不受字符串输入影响', () => {
    assert.deepEqual(wgs84ToGcj02(0, 0), [0, 0], '境外（0,0）原样返回');
    assert.deepEqual(wgs84ToGcj02('116.391', '39.907'), wgs84ToGcj02(116.391, 39.907), '数字字符串输入结果一致');
    const bad = wgs84ToGcj02('x', 39.9);
    assert.ok(Number.isNaN(bad[0]) && Number.isNaN(bad[1]), '非法输入返回 NaN 数组');
  });
});

describe('MapCanvas 真机兼容（maplibre v3 + WebGL 双检测 + 去 glyphs/symbol）', () => {
  const src = read('components/map/MapCanvas.jsx');

  test('WebGL 检测同时覆盖 webgl2 / webgl / experimental-webgl（优先 webgl2）', () => {
    assert.match(src, /canvas\.getContext\('webgl2'\)/, '优先探测 WebGL2');
    assert.match(src, /canvas\.getContext\('webgl'\)/, '回退 WebGL1');
    assert.match(src, /experimental-webgl/, '回退 experimental-webgl');
  });

  test('不再依赖 glyphs / symbol 标点层（demotiles 字体国内不可达致真机白屏）', () => {
    assert.ok(!/glyphs:/.test(src), 'MapCanvas 不应再声明 glyphs 字段');
    assert.ok(!/type: 'symbol'/.test(src), '不应再有 symbol label 层');
    assert.ok(!/text-field/.test(src), '不应再有 text-field 布局');
  });

  test('标点名称改用 maplibregl.Marker（DOM 标签，不依赖 glyphs）', () => {
    assert.match(src, /new Marker\(\{ element: el, anchor: 'bottom' \}\)/, '名称标签用 DOM Marker 元素');
    assert.match(src, /syncLabelMarkers/, 'load 后同步名称标签');
  });

  test('map error 展示具体错误消息（err.error?.message 或 err.message 截断）', () => {
    assert.match(src, /err\.error/, '读取 err.error 具体错误');
    assert.match(src, /err\.message/, '回退 err.message');
    assert.match(src, /setTileError\(errorTextOf\(err\)\)/, '浮层写入具体错误文本');
  });

  test('固定态应用 .ljx-map-fixed 美化类（森林主题），WebGL 失败占位文案明确', () => {
    assert.match(src, /ljx-map-fixed/, '固定态应用美化类');
    assert.match(src, /当前设备不支持 WebGL 渲染/, 'WebGL 检测失败占位文案明确');
  });
});

describe('MapPicker 交互顺序重构（先简化固定 → 再标点）', () => {
  const src = read('components/map/MapPicker.jsx');

  test('「简化固定」仅需地图就绪（disabled={!mapReady}），不再要求已定位段数', () => {
    assert.match(src, /disabled=\{!mapReady\}/, '简化固定 disabled 只绑地图就绪');
    assert.ok(!/locatedCount === 0/.test(src), '不应再要求 locatedCount>0 才能固定');
  });

  test('交互顺序：点击「简化固定」进入固定态，固定态提供「完成并保存」+「重新调整」', () => {
    assert.match(src, /setFixed\(true\)/, '点击「简化固定」进入固定态');
    assert.match(src, /完成并保存/, '固定态底部提供「完成并保存」一次性回传');
    assert.match(src, /重新调整/, '固定态提供「重新调整」回编辑态');
    assert.match(src, /onFixed\(\{/, '完成并保存时一次性回调 onFixed');
    assert.match(src, /locatedPoints\.slice\(\)/, '保存回调只含已定位段');
  });

  test('固定态仍可标记段：段列表 + 可拖动浮标 + 确认固定', () => {
    assert.match(src, /ljx-seg-list/, '固定态保留底部「导入录音」横向段列表');
    assert.match(src, /new Marker\(\{ draggable: true/, '固定态手动模式仍生成可拖动浮标');
    assert.match(src, /marker\.on\('dragend'/, 'dragend 记录拖动坐标');
    assert.match(src, /确认固定此点/, '固定态确认固定按钮');
    assert.match(src, /from: 'manual'/, '手动固定标记 from:manual');
  });

  test('搜索框仅编辑态展示，模式切换两态均保留', () => {
    assert.match(src, /!fixed && \(\s*<div className="map-picker-search">/, '搜索框受 !fixed 守卫（仅编辑态）');
    assert.match(src, /switchMode\('gps'\)/, 'GPS 切换保留');
    assert.match(src, /switchMode\('manual'\)/, '手动切换保留');
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
    assert.match(map, /segments=\{summary\.segments \|\| \[\]\}/, 'MapPicker 注入各段录音信息');
  });

  test('MapScreen 单点分析视图：仅时间热力图，无「空间分布」tab/空态/静态 MapChart', () => {
    const map = read('screens/MapScreen.jsx');
    assert.ok(!/MapChart/.test(map), 'MapScreen 不应再引用静态 MapChart');
    assert.ok(!/空间分布/.test(map), '不应再有「空间分布」tab');
    assert.ok(!/先完成多段分析，再在地图上标记位置/.test(map), '不应再有空间分布空态引导');
    assert.match(map, /时间热力图/, '时间热力图保留');
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

describe('MapPicker 交互重构（搜索非受控 / GPS·手动 / 可拖动浮标）', () => {
  const src = read('components/map/MapPicker.jsx');

  test('搜索框非受控：defaultValue + onFocus select + onInput，无受控 value', () => {
    assert.match(src, /defaultValue=""/, '搜索框用 defaultValue（非受控）');
    assert.match(src, /onFocus=\{\(e\) => e\.target\.select\(\)\}/, '聚焦全选，便于整体替换');
    assert.match(src, /onInput=\{\(e\) => setQuery\(e\.target\.value\)\}/, 'onInput 实时读取当前值');
    assert.match(src, /searchRef/, '搜索逻辑用 ref 值');
    assert.ok(!/value=\{query\}/.test(src), '不应有受控 value={query}');
    assert.ok(!/onChange=\{\(e\) => setQuery\(e\.target\.value\)\}/.test(src), '不应有受控 onChange 同步');
  });

  test('GPS / 手动模式切换：默认 GPS，含两个模式 tab', () => {
    assert.match(src, /useState\('gps'\)/, '默认 GPS 模式');
    assert.match(src, /GPS 定位/, 'GPS 模式 tab');
    assert.match(src, /手动选点/, '手动选点 tab');
    assert.match(src, /switchMode\('gps'\)/, 'GPS 切换');
    assert.match(src, /switchMode\('manual'\)/, '手动切换');
  });

  test('手动模式：底部录音列表 + 可拖动浮标 + 确认固定', () => {
    assert.match(src, /ljx-seg-list/, '底部「导入录音」列表容器');
    assert.match(src, /ljx-seg-chip/, '录音段小卡片');
    assert.match(src, /new Marker\(\{ draggable: true/, '可拖动浮标（maplibregl.Marker draggable）');
    assert.match(src, /marker\.on\('dragend'/, 'dragend 记录拖动坐标');
    assert.match(src, /确认固定此点/, '确认固定按钮');
    assert.match(src, /from: 'manual'/, '手动固定标记 from:manual');
  });

  test('简化固定：仅需地图就绪即可固定（disabled={!mapReady}），回调仅含已定位段', () => {
    assert.match(src, /disabled=\{!mapReady\}/, '无已定位段也可简化固定（先固定再标点）');
    assert.match(src, /locatedPoints\.slice\(\)/, '固定回调只含已定位段');
  });
});
