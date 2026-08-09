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
 * 运行时覆盖（免重打包）：
 *  - 设置页保存了后端地址（localStorage.ljx_api_base 非空）→ 自动切真实 API，
 *    isMockMode()/getDataSource() 在调用时动态判断（优先级高于构建期环境变量）。
 *
 * Node 测试环境兼容：
 *  - Vite 构建/开发时读取 import.meta.env；
 *  - 纯 Node（node --test）下 import.meta.env 不存在，回退读取 process.env，
 *    且无 localStorage，自动回退构建期逻辑，因此 tests/repository.test.mjs 可直接验证开关逻辑。
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

/** 当前数据源类型：'mock' | 'api'（模块加载时按构建期环境确定） */
export const dataSource = resolveDataSource(readRuntimeEnv());

/**
 * 读取 App 内运行时配置的后端地址（localStorage.ljx_api_base）。
 * 读取失败（无 localStorage / 隐私模式受限）按「未配置」处理，返回 null。
 * @returns {string|null}
 */
function readConfiguredApiBase() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const v = localStorage.getItem('ljx_api_base');
    return v && String(v).trim() ? String(v).trim() : null;
  } catch (e) {
    return null;
  }
}

/**
 * 返回已配置的后端地址（localStorage.ljx_api_base 规范化值），未配置返回 null。
 * 与 getDataSource/isMockMode 共享同一读取逻辑，供设置页等 UI 展示当前地址。
 * @returns {string|null}
 */
export function getApiBase() {
  return readConfiguredApiBase();
}

/**
 * 返回当前数据源类型（动态）：
 *  - 设置页配置了后端地址（localStorage.ljx_api_base 非空）→ 'api'（真实识别，免重打包）；
 *  - 否则回退构建期常量 dataSource。
 */
export function getDataSource() {
  return readConfiguredApiBase() ? DATA_SOURCE.API : dataSource;
}

/**
 * 当前是否为 mock 数据源（动态）：
 *  - 配置了后端地址 → false（走真实 API）；
 *  - 否则回退构建期判断（dataSource === MOCK）。
 * Node 测试环境无 localStorage，自动回退构建期逻辑。
 */
export function isMockMode() {
  if (readConfiguredApiBase()) return false;
  return dataSource === DATA_SOURCE.MOCK;
}

/** isMockMode 的别名（repository 调试辅助，语义一致） */
export function isMock() {
  return isMockMode();
}
