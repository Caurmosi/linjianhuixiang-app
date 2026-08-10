/**
 * regionFeatures.test.mjs —— 地区记录增量功能测试
 * 覆盖：
 *  - mockData.REGIONS 结构（id/name/created_at/detail/score，同名归组演示）；
 *  - repository 地区记录接口（mock 内存态）：getRegions / saveRegion / deleteRegion / renameRegion；
 *  - repository.deleteHistory（mock 占位成功返回）；
 *  - utils/dates 日期格式化（YYYY-MM-DD 与 MM-DD）。
 * 运行：node --test tests/regionFeatures.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS } from '../src/data/mockData.js';
import * as repository from '../src/data/repository.js';
import { formatISODate, formatShortISODate } from '../src/utils/dates.js';

test('REGIONS: 结构完整 —— id 唯一、含 name/created_at/detail/score，score 与快照一致', () => {
  const ids = new Set();
  for (const r of REGIONS) {
    assert.ok(Number.isInteger(r.id) && r.id > 0, `id 应为正整数: ${r.id}`);
    assert.ok(!ids.has(r.id), `id 应唯一: ${r.id}`);
    ids.add(r.id);
    assert.ok(r.name && typeof r.name === 'string' && r.name.length > 0, `name 非空: ${r.name}`);
    assert.ok(r.created_at && typeof r.created_at === 'string', `created_at 应为字符串: ${r.created_at}`);
    assert.match(r.created_at, /^\d{4}-\d{2}-\d{2}/, `created_at 应为 ISO 日期: ${r.created_at}`);
    assert.ok(r.detail && typeof r.detail === 'object', `${r.name} detail 应为对象`);
    assert.equal(typeof r.detail.livability.score, 'number', `${r.name} detail.livability.score 应为数值`);
    assert.equal(r.score, r.detail.livability.score, `${r.name} score 应等于 detail.livability.score`);
    assert.equal(typeof r.detail.livability.noise, 'number', `${r.name} detail.livability.noise 应为数值`);
  }
});

test('REGIONS: 演示归组 —— 中山公园 2 条（趋势可对比）、滨江绿地 1 条（单点提示）', () => {
  const byName = REGIONS.reduce((acc, r) => {
    acc[r.name] = (acc[r.name] || 0) + 1;
    return acc;
  }, {});
  assert.equal(byName['中山公园'], 2, '中山公园应有 2 条记录');
  assert.equal(byName['滨江绿地'], 1, '滨江绿地应有 1 条记录');
  // 中山公园两条日期不同且升序（2026-07-20 → 2026-08-01）
  const zs = REGIONS.filter((r) => r.name === '中山公园').sort((a, b) => a.created_at.localeCompare(b.created_at));
  assert.equal(formatISODate(zs[0].created_at), '2026-07-20');
  assert.equal(formatISODate(zs[1].created_at), '2026-08-01');
});

test('repository.getRegions: mock 返回 REGIONS 的深拷贝（非同一引用）且结构一致', () => {
  const list = repository.getRegions();
  assert.ok(Array.isArray(list));
  assert.notEqual(list, REGIONS, 'getRegions 不应返回同一数组引用（防外改污染演示数据）');
  assert.deepEqual(list.map(({ id, name, score }) => ({ id, name, score })), REGIONS.map(({ id, name, score }) => ({ id, name, score })));
});

test('repository.saveRegion: 推入新记录（含 name/created_at/detail/score），随后可被 getRegions 读到', () => {
  const before = repository.getRegions().length;
  const summary = {
    recording: '本区域 2 段录音综合',
    speciesCount: 4,
    livability: { score: 71, noise: 26, bio: 80, sound: 64 },
    species: [{ name: '白头鹎' }],
  };
  const saved = repository.saveRegion('中山公园', summary);
  assert.ok(saved.id > 0, '应生成自增 id');
  assert.equal(saved.name, '中山公园');
  assert.equal(saved.score, 71, 'score 应从 summary.livability.score 提取');
  assert.ok(saved.created_at && typeof saved.created_at === 'string');
  assert.equal(saved.detail, summary, 'detail 应为传入 summary 完整快照');

  const list = repository.getRegions();
  assert.equal(list.length, before + 1, '保存后列表应多 1 条');
  const found = list.find((r) => r.id === saved.id);
  assert.ok(found, '保存的记录应出现在列表中');
  assert.equal(found.detail.livability.score, 71);
});

test('repository.renameRegion: 重命名记录（返回更新后副本），不存在返回 false', () => {
  const list = repository.getRegions();
  const target = list[0];
  const renamed = repository.renameRegion(target.id, '森林公园');
  assert.notEqual(renamed, false, '存在的 id 应重命名成功');
  assert.equal(renamed.name, '森林公园');
  assert.equal(renamed.id, target.id);
  assert.equal(repository.getRegions().find((r) => r.id === target.id).name, '森林公园', '列表应反映新名称');
  assert.equal(repository.renameRegion(99999, 'x'), false, '不存在的 id 应返回 false');
});

test('repository.deleteRegion: 删除记录，不存在返回 false', () => {
  const before = repository.getRegions();
  const target = before[before.length - 1];
  const res = repository.deleteRegion(target.id);
  assert.notEqual(res, false, '存在的 id 应删除成功');
  assert.ok(res.ok, '删除应返回 { ok: true }');
  assert.ok(!repository.getRegions().some((r) => r.id === target.id), '删除后列表不应再包含该 id');
  assert.equal(repository.deleteRegion(target.id), false, '已删除的 id 再次删除应返回 false');
  assert.equal(repository.deleteRegion(99999), false);
});

test('repository.deleteHistory: mock 占位成功（实际删除由 UI 本地过滤列表完成）', () => {
  const res = repository.deleteHistory(1);
  assert.notEqual(res, undefined, 'deleteHistory 应有返回');
  assert.equal(typeof res.then === 'function' || res.ok === true, true, 'mock 同步返回成功形态');
});

test('日期格式化: formatISODate 取前 10 位 YYYY-MM-DD，formatShortISODate 取 MM-DD', () => {
  assert.equal(formatISODate('2026-08-01T08:00:00+00:00'), '2026-08-01');
  assert.equal(formatISODate('2026-07-20T07:30:00Z'), '2026-07-20');
  assert.equal(formatShortISODate('2026-08-01T08:00:00+00:00'), '08-01');
  assert.equal(formatShortISODate('2026-07-20T07:30:00Z'), '07-20');
  // 无效输入守卫
  assert.equal(formatISODate(null), '');
  assert.equal(formatISODate(''), '');
  assert.equal(formatISODate(123), '');
  assert.equal(formatShortISODate(undefined), '');
});
