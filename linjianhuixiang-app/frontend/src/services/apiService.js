/**
 * apiService.js
 * 真实 API 数据源骨架 —— 与 repository 暴露的接口一一对应。
 *
 * 当前状态：BirdNET / 后端服务尚未接入，所有函数均为占位实现，
 * 调用即抛出明确错误「真实 API 未接入」。
 * 在 VITE_USE_MOCK=false（api 模式）下，这是预期行为：用于提示开发者完成接入，
 * 而不是让 UI 静默拿到错误数据。
 *
 * 接入指南（详见仓库根 README「数据源切换」小节）：
 *  1. 在本文件逐个实现接口（getSpeciesList / getIndices / buildAnalysis 等），
 *     用 fetch/axios 请求真实后端，替换下方 throw 占位；
 *  2. 返回数据结构必须与 mockData.js 保持一致（字段契约见 tests/dataContract.test.js）；
 *  3. 真实接口为异步时，将函数改为 async（返回 Promise），
 *     并在 UI 消费侧按需 await（当前 UI 为同步消费，真实接入阶段再统一改造）；
 *  4. 接入完成后，repository 已自动路由到本模块，UI/store/utils 无需任何改动。
 */

/** 未接入统一报错（保证提示信息一致、可被测试断言） */
function notImplemented(name) {
  throw new Error(`真实 API 未接入：请实现 BirdNET/后端接口（${name}）`);
}

/** 物种清单 */
export function getSpeciesList() {
  return notImplemented('getSpeciesList');
}

/** 声学指数（ACI/NDSI/ADI/H） */
export function getIndices() {
  return notImplemented('getIndices');
}

/** 宜居度耦合结果 */
export function getLivability() {
  return notImplemented('getLivability');
}

/** 时段 × 频段热力图 */
export function getHeatmap() {
  return notImplemented('getHeatmap');
}

/** 空间分布样点 */
export function getMapPoints() {
  return notImplemented('getMapPoints');
}

/** 多绿地对比 */
export function getGreenSpaces() {
  return notImplemented('getGreenSpaces');
}

/** 提升建议 */
export function getSuggestions() {
  return notImplemented('getSuggestions');
}

/** 历史记录 */
export function getHistory() {
  return notImplemented('getHistory');
}

/** 根据录音名 + 覆盖项构建分析结果 */
export function buildAnalysis(name, overrides = {}) {
  return notImplemented('buildAnalysis');
}

/** 由历史记录条目构建分析结果 */
export function analysisForHistory(item) {
  return notImplemented('analysisForHistory');
}

/** 宜居度 → 文案与等级 */
export function gradeOf(score) {
  return notImplemented('gradeOf');
}

/** 宜居度描述文案 */
export function livabilityDesc(analysis) {
  return notImplemented('livabilityDesc');
}
