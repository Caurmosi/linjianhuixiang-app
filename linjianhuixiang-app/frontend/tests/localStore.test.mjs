/**
 * localStore.test.mjs
 * v2 数据本地化封装（src/utils/localStore.js）单元测试：
 *  - localStorage 读写 / 键名；
 *  - 历史列表上限 100 条（新在前）；
 *  - 隐私模式（localStorage 不可用）自动降级为模块内内存 map，不崩溃可读写；
 *  - 损坏 JSON 容错。
 * 运行：node --test tests/localStore.test.mjs
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_LIMIT,
  KEY_ANALYSIS,
  KEY_BATCHES,
  KEY_HISTORY,
  KEY_REGIONS,
  clearLocalStore,
  loadAnalysis,
  loadBatches,
  loadHistory,
  loadRegions,
  saveAnalysis,
  saveBatches,
  saveHistory,
  saveRegions,
} from '../src/utils/localStore.js';

/** 简易 localStorage 模拟（Node 环境无原生实现；测试通过 globalThis 注入） */
function createFakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
    _map: map,
  };
}

const fake = createFakeStorage();

beforeEach(() => {
  fake.clear();
  clearLocalStore(); // 清掉内存降级仓库残留
  globalThis.localStorage = fake;
});

describe('localStore：基础读写', () => {
  test('saveHistory/loadHistory 往返一致，且写入 ljx_history 键', () => {
    const list = [
      { id: 2, name: '滨江绿地_午后.mp3', species: 6, score: 54 },
      { id: 1, name: '中山公园_晨.wav', species: 9, score: 68 },
    ];
    saveHistory(list);
    assert.deepEqual(loadHistory(), list);
    assert.ok(fake._map.has(KEY_HISTORY), `应写入键 ${KEY_HISTORY}`);
    // 落库形态为 JSON 字符串（真实 localStorage 语义）
    assert.equal(typeof fake._map.get(KEY_HISTORY), 'string');
  });

  test('saveRegions/loadRegions 往返一致，且写入 ljx_regions 键', () => {
    const list = [
      { id: 1, name: '中山公园', score: 62, detail: { livability: { score: 62 } } },
      { id: 2, name: '中山公园', score: 74, lat: 39.907, lng: 116.391, detail: {} },
    ];
    saveRegions(list);
    assert.deepEqual(loadRegions(), list);
    assert.ok(fake._map.has(KEY_REGIONS), `应写入键 ${KEY_REGIONS}`);
  });

  test('saveAnalysis/loadAnalysis 往返一致，且写入 ljx_analysis 键', () => {
    const detail = { recording: '中山公园_晨.wav', speciesCount: 9, livability: { score: 68 } };
    saveAnalysis(detail);
    assert.deepEqual(loadAnalysis(), detail);
    assert.ok(fake._map.has(KEY_ANALYSIS), `应写入键 ${KEY_ANALYSIS}`);
  });

  test('saveBatches/loadBatches 往返一致，且写入 ljx_batches 键', () => {
    const list = [{ recording: '第1段.wav' }, { recording: '第2段.wav' }];
    saveBatches(list);
    assert.deepEqual(loadBatches(), list);
    assert.ok(fake._map.has(KEY_BATCHES), `应写入键 ${KEY_BATCHES}`);
  });

  test('未写入时各读取返回默认值（history/regions/batches 空数组，analysis null）', () => {
    assert.deepEqual(loadHistory(), []);
    assert.deepEqual(loadRegions(), []);
    assert.deepEqual(loadBatches(), []);
    assert.equal(loadAnalysis(), null);
  });

  test('clearLocalStore 清空全部本地业务键', () => {
    saveHistory([{ id: 1 }]);
    saveRegions([{ id: 1 }]);
    saveAnalysis({ recording: 'x.wav' });
    saveBatches([{ recording: 'x.wav' }]);
    assert.equal(clearLocalStore(), true);
    assert.deepEqual(loadHistory(), []);
    assert.deepEqual(loadRegions(), []);
    assert.deepEqual(loadBatches(), []);
    assert.equal(loadAnalysis(), null);
  });
});

describe('localStore：历史上限 100 条（新在前）', () => {
  test('写入超过 100 条时只保留最近 100 条', () => {
    const total = HISTORY_LIMIT + 50; // 150
    const list = Array.from({ length: total }, (_, i) => ({ id: total - i, name: `录音${total - i}.wav` }));
    // 调用方约定新在前：index 0 = 最新（id 最大）
    saveHistory(list);
    const loaded = loadHistory();
    assert.equal(loaded.length, HISTORY_LIMIT, `应截断到 ${HISTORY_LIMIT} 条`);
    assert.equal(loaded[0].id, total, '第一条应为最新（新在前）');
    assert.equal(loaded[loaded.length - 1].id, total - HISTORY_LIMIT + 1, '最后一条应为第 100 旧');
  });

  test('不足 100 条时不截断', () => {
    const list = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
    saveHistory(list);
    assert.equal(loadHistory().length, 5);
  });
});

describe('localStore：容错', () => {
  test('损坏 JSON 返回空数组（不抛错）', () => {
    fake._map.set(KEY_HISTORY, '{broken json');
    fake._map.set(KEY_REGIONS, 'not-json');
    assert.deepEqual(loadHistory(), []);
    assert.deepEqual(loadRegions(), []);
  });

  test('saveAnalysis 非对象时忽略（保持 null）', () => {
    saveAnalysis(null);
    saveAnalysis('string');
    saveAnalysis(42);
    assert.equal(loadAnalysis(), null);
  });
});

describe('localStore：隐私模式降级为内存 map', () => {
  test('localStorage 不可用时读写走内存，不崩溃且数据可往返', () => {
    const saved = globalThis.localStorage;
    try {
      Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true, writable: true });
      clearLocalStore();
      saveHistory([{ id: 1, name: 'a.wav' }]);
      assert.deepEqual(loadHistory(), [{ id: 1, name: 'a.wav' }]);
      saveRegions([{ id: 7, name: '中山公园' }]);
      assert.deepEqual(loadRegions(), [{ id: 7, name: '中山公园' }]);
      saveAnalysis({ recording: 'x.wav' });
      assert.deepEqual(loadAnalysis(), { recording: 'x.wav' });
      saveBatches([{ recording: 'b.wav' }]);
      assert.deepEqual(loadBatches(), [{ recording: 'b.wav' }]);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { value: saved, configurable: true, writable: true });
    }
  });

  test('内存降级同样受 100 条上限约束', () => {
    const saved = globalThis.localStorage;
    try {
      Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true, writable: true });
      clearLocalStore();
      const list = Array.from({ length: HISTORY_LIMIT + 20 }, (_, i) => ({ id: i + 1 }));
      saveHistory(list);
      assert.equal(loadHistory().length, HISTORY_LIMIT);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { value: saved, configurable: true, writable: true });
    }
  });
});
