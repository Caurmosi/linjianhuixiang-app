/**
 * repository.test.mjs
 * 数据访问层（repository）单元测试：
 *  - repository 各接口与 mockData 转发一致（默认 mock 数据源）；
 *  - dataConfig 数据源开关默认 mock、resolveDataSource 逻辑正确；
 *  - VITE_USE_MOCK=false 时切换到 api（子进程端到端验证）：
 *      dataSource === 'api'，且调用 repository 会得到「真实 API 未接入」报错（预期行为）。
 * 运行：node --test tests/repository.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as mockData from '../src/data/mockData.js';
import * as repository from '../src/data/repository.js';
import { DATA_SOURCE, dataSource, getDataSource, isMock, isMockMode, resolveDataSource } from '../src/config/dataConfig.js';

const FRONTEND_ROOT = path.join(fileURLToPath(new URL('..', import.meta.url)));

/** 运行子进程脚本（带指定环境变量），返回 stdout 文本 */
function runNode(script, env = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ['-e', script],
      { cwd: FRONTEND_ROOT, env: { ...process.env, ...env } },
      (err, stdout, stderr) => {
        if (err) reject(new Error(`子进程失败: ${err.message}\nstderr: ${stderr}`));
        else resolve(stdout.trim());
      }
    );
  });
}

test('repository: 各数据接口与 mockData 返回同一引用（纯转发）', () => {
  assert.equal(repository.getSpeciesList(), mockData.SPECIES);
  assert.equal(repository.getIndices(), mockData.INDICES);
  assert.equal(repository.getLivability(), mockData.LIVABILITY);
  assert.equal(repository.getHeatmap(), mockData.HEATMAP);
  assert.equal(repository.getMapPoints(), mockData.MAP_POINTS);
  assert.equal(repository.getGreenSpaces(), mockData.GREEN_SPACES);
  assert.equal(repository.getSuggestions(), mockData.SUGGESTIONS);
  assert.equal(repository.getHistory(), mockData.HISTORY);
});

test('repository: 函数接口与 mockData 语义一致（深比较）', () => {
  assert.deepEqual(repository.buildAnalysis('中山公园_晨.wav', { speciesCount: 9 }), mockData.buildAnalysis('中山公园_晨.wav', { speciesCount: 9 }));
  assert.deepEqual(
    repository.buildAnalysis('x.wav', { speciesCount: 6, livability: { score: 54, noise: 51, bio: 62, sound: 45 } }),
    mockData.buildAnalysis('x.wav', { speciesCount: 6, livability: { score: 54, noise: 51, bio: 62, sound: 45 } })
  );
  assert.deepEqual(repository.analysisForHistory(mockData.HISTORY[0]), mockData.analysisForHistory(mockData.HISTORY[0]));
  assert.deepEqual(repository.gradeOf(82), mockData.gradeOf(82));
  assert.deepEqual(repository.gradeOf(50), mockData.gradeOf(50));
  assert.deepEqual(repository.gradeOf(49), mockData.gradeOf(49));
  assert.equal(repository.livabilityDesc({ livability: { score: 82, noise: 22 } }), mockData.livabilityDesc({ livability: { score: 82, noise: 22 } }));
});

test('dataConfig: 默认数据源为 mock（Node 环境未设置 VITE_USE_MOCK）', () => {
  assert.equal(dataSource, DATA_SOURCE.MOCK);
  assert.equal(dataSource, 'mock');
  assert.equal(getDataSource(), 'mock');
  assert.equal(isMockMode(), true);
  assert.equal(isMock(), true);
});

test('dataConfig: repository 转发数据源辅助（调试/测试）', () => {
  assert.equal(repository.getDataSource(), dataSource);
  assert.equal(repository.isMockMode(), isMockMode());
  assert.equal(repository.isMock(), isMock());
  assert.equal(repository.dataSource, dataSource);
  assert.equal(repository.DATA_SOURCE.MOCK, DATA_SOURCE.MOCK);
  assert.equal(repository.DATA_SOURCE.API, DATA_SOURCE.API);
});

test('resolveDataSource: 仅 VITE_USE_MOCK=false 切 api，其余默认 mock', () => {
  assert.equal(resolveDataSource({}), DATA_SOURCE.MOCK);
  assert.equal(resolveDataSource({ VITE_USE_MOCK: 'false' }), DATA_SOURCE.API);
  assert.equal(resolveDataSource({ VITE_USE_MOCK: 'true' }), DATA_SOURCE.MOCK);
  assert.equal(resolveDataSource({ VITE_USE_MOCK: '0' }), DATA_SOURCE.MOCK);
  assert.equal(resolveDataSource({ VITE_USE_MOCK: 'FALSE' }), DATA_SOURCE.MOCK, '大小写敏感，仅小写 false 生效');
  assert.equal(resolveDataSource({ VITE_USE_MOCK: undefined }), DATA_SOURCE.MOCK);
});

test('VITE_USE_MOCK=false: 子进程加载 dataConfig → dataSource=api（端到端开关）', async () => {
  const out = await runNode(
    "import('./src/config/dataConfig.js').then((m) => console.log(m.dataSource + '|' + m.getDataSource() + '|' + m.isMockMode()))",
    { VITE_USE_MOCK: 'false' }
  );
  assert.equal(out, 'api|api|false');
});

test('VITE_USE_MOCK=false: repository 路由到 apiService → 抛「真实 API 未接入」错误（预期行为）', async () => {
  const out = await runNode(
    `import('./src/data/repository.js').then((m) => {
      const results = [];
      for (const fn of ['getSpeciesList', 'getGreenSpaces', 'buildAnalysis']) {
        try {
          m[fn]('x.wav', {});
          results.push(fn + ':NO_THROW');
        } catch (e) {
          results.push(fn + ':' + e.message);
        }
      }
      console.log(results.join('\\n'));
    })`,
    { VITE_USE_MOCK: 'false' }
  );
  const lines = out.split('\n');
  assert.equal(lines.length, 3);
  for (const line of lines) {
    const [fn, msg] = line.split(':');
    assert.ok(msg.includes('真实 API 未接入'), `${fn} 应提示真实 API 未接入，实际: ${msg}`);
    assert.ok(msg.includes(fn), `${fn} 报错信息应包含函数名`);
  }
});

test('VITE_USE_MOCK=true: 子进程仍为 mock 数据源（开关不误伤）', async () => {
  const out = await runNode(
    "import('./src/config/dataConfig.js').then((m) => console.log(m.dataSource))",
    { VITE_USE_MOCK: 'true' }
  );
  assert.equal(out, 'mock');
});
