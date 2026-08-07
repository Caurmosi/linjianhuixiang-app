/**
 * dataConfig.js
 * 真假数据源开关 —— 一份 UI、真假数据一键切换。
 *
 * 数据源类型：
 *  - MOCK：演示数据（src/data 目录下 mockData.js），默认；
 *  - API ：真实后端 / BirdNET 接入口（src/services/apiService.js），需显式开启。
 *
 * 切换方式（Vite 环境变量）：
 *  - 默认（不设置，或 VITE_USE_MOCK=true / 其它值）→ mock
 *  - VITE_USE_MOCK=false → api
 *    示例：VITE_USE_MOCK=false npm run dev
 *
 * Node 测试环境兼容：
 *  - Vite 构建/开发时读取 import.meta.env；
 *  - 纯 Node（node --test）下 import.meta.env 不存在，回退读取 process.env，
 *    因此 tests/repository.test.mjs 可直接验证开关逻辑。
 */
export const DATA_SOURCE = Object.freeze({
  MOCK: 'mock',
  API: 'api',
});

/**
 * 根据环境对象解析数据源类型（纯函数，便于测试）。
 * 仅当 VITE_USE_MOCK 严格等于字符串 'false' 时切换为 API。
 * @param {object} env 环境对象（如 import.meta.env / process.env）
 * @returns {'mock'|'api'}
 */
export function resolveDataSource(env = {}) {
  return env.VITE_USE_MOCK !== 'false' ? DATA_SOURCE.MOCK : DATA_SOURCE.API;
}

/** 读取运行时环境：优先 Vite 的 import.meta.env，回退 Node 的 process.env */
function readRuntimeEnv() {
  const viteEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : null;
  if (viteEnv && typeof viteEnv.VITE_USE_MOCK !== 'undefined') {
    return { VITE_USE_MOCK: viteEnv.VITE_USE_MOCK };
  }
  const nodeEnv = typeof process !== 'undefined' && process.env ? process.env : {};
  return nodeEnv;
}

/** 当前数据源类型：'mock' | 'api'（模块加载时确定） */
export const dataSource = resolveDataSource(readRuntimeEnv());

/** 返回当前数据源类型（调试/测试辅助） */
export function getDataSource() {
  return dataSource;
}

/** 当前是否为 mock 数据源 */
export function isMockMode() {
  return dataSource === DATA_SOURCE.MOCK;
}

/** isMockMode 的别名（repository 调试辅助，语义一致） */
export function isMock() {
  return isMockMode();
}
