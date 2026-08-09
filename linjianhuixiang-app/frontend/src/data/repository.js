/**
 * repository.js
 * 统一数据访问层（Repository）—— 全应用唯一数据出口。
 *
 * 职责：
 *  - 默认转发 mockData（演示数据源），保持现有 UI 行为零变化；
 *  - 通过 config/dataConfig 的数据源开关，可一键切换到 services/apiService（真实后端/BirdNET）；
 *  - UI / store / utils 一律从本模块导入，禁止直接 import mockData 数据源模块。
 *
 * 数据源切换：
 *  - 默认 mock：npm run dev（未设置 VITE_USE_MOCK）
 *  - 真实 API：VITE_USE_MOCK=false npm run dev
 *    （apiService 尚未实现时会抛错提示，属预期行为；接入方法见 README「数据源切换」）
 */
import * as mockData from './mockData.js';
import * as apiService from '../services/apiService.js';
import { isMockMode } from '../config/dataConfig.js';

/** 当前是否走真实 API 数据源 */
const useApi = () => !isMockMode();

/** 物种清单 */
export function getSpeciesList() {
  return useApi() ? apiService.getSpeciesList() : mockData.SPECIES;
}

/** 声学指数（ACI/NDSI/ADI/H） */
export function getIndices() {
  return useApi() ? apiService.getIndices() : mockData.INDICES;
}

/** 宜居度耦合结果 */
export function getLivability() {
  return useApi() ? apiService.getLivability() : mockData.LIVABILITY;
}

/** 时段 × 频段热力图 */
export function getHeatmap() {
  return useApi() ? apiService.getHeatmap() : mockData.HEATMAP;
}

/** 空间分布样点 */
export function getMapPoints() {
  return useApi() ? apiService.getMapPoints() : mockData.MAP_POINTS;
}

/** 多绿地对比 */
export function getGreenSpaces() {
  return useApi() ? apiService.getGreenSpaces() : mockData.GREEN_SPACES;
}

/** 提升建议 */
export function getSuggestions() {
  return useApi() ? apiService.getSuggestions() : mockData.SUGGESTIONS;
}

/** 历史记录 */
export function getHistory() {
  return useApi() ? apiService.getHistory() : mockData.HISTORY;
}

/** 根据录音名 + 覆盖项构建分析结果（转发 mockData 实现） */
export function buildAnalysis(name, overrides = {}) {
  return useApi() ? apiService.buildAnalysis(name, overrides) : mockData.buildAnalysis(name, overrides);
}

/** 由历史记录条目构建分析结果（转发 mockData 实现） */
export function analysisForHistory(item) {
  return useApi() ? apiService.analysisForHistory(item) : mockData.analysisForHistory(item);
}

/**
 * 纯本地演示分析（不经过网络）。
 * 用途：appStore 初始化、AnalyzingScreen 后端不可达时的兜底演示结果。
 * mock 同步返回；api 模式也返回 mock 结果，与数据源开关无关。
 */
export function buildMockAnalysis(name, overrides = {}) {
  return mockData.buildAnalysis(name, overrides);
}

/**
 * 后端连通性探测（GET {base}/health，5s 超时，不阻塞 UI）。
 * 供设置页保存后端地址后立即验证连通性。
 */
export function pingHealth(base) {
  return apiService.pingHealth(base);
}

/** 宜居度 → 文案与等级（转发 mockData 实现） */
export function gradeOf(score) {
  return useApi() ? apiService.gradeOf(score) : mockData.gradeOf(score);
}

/** 宜居度描述文案（转发 mockData 实现） */
export function livabilityDesc(analysis) {
  return useApi() ? apiService.livabilityDesc(analysis) : mockData.livabilityDesc(analysis);
}

// 数据源调试辅助（转发自 dataConfig），供调试与测试使用
export { DATA_SOURCE, dataSource, getDataSource, isMock, isMockMode } from '../config/dataConfig.js';
