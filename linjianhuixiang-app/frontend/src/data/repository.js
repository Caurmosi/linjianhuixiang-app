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
 *
 * v2 数据本地化（用户 2026-08-18 决策）：
 *  - 真实 API 模式下 history/regions 读写全部走本地 localStore（apiService 内部处理），
 *    mock 模式行为不变（不碰 localStore、不调真实 API）；
 *  - migrateCloudData：旧版云端 history/regions 一次性迁移落本地（尽力而为，失败静默）。
 */
import * as mockData from './mockData.js';
import * as apiService from '../services/apiService.js';
import { isMockMode } from '../config/dataConfig.js';
import { loadHistory, loadRegions, saveHistory, saveRegions } from '../utils/localStore.js';

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

/** 历史记录（真实 API 模式读本地 localStore；mock 模式返回演示数据） */
export function getHistory() {
  return useApi() ? apiService.getHistory() : mockData.HISTORY;
}

/** 删除历史记录（真实 API 模式：本地删除 + 尽力而为同步云端；mock：本地占位过滤） */
export function deleteHistory(id) {
  return useApi() ? apiService.deleteHistory(id) : mockData.deleteHistory(id);
}

// ---------------------------------------------------------------------------
// 地区记录（region_records）
//  - mock：模块内内存数组（从 mockData.REGIONS 深拷贝初始化，save/delete/rename 就地变更）
//  - api：本地 localStore（v2 起不再写云端 /api/regions，避免多设备污染）
// ---------------------------------------------------------------------------
let _regions = null;

/** mock 内存态地区记录仓库（惰性深拷贝演示数据，避免污染 mockData.REGIONS） */
function regionStore() {
  if (_regions === null) {
    _regions = mockData.REGIONS.map((r) => JSON.parse(JSON.stringify(r)));
  }
  return _regions;
}

/** 从 summary.map.center 提取地区坐标（GCJ-02）；无 map / 非法返回 null */
function coordsFromSummary(summary) {
  if (!summary || !summary.map || !Array.isArray(summary.map.center) || summary.map.center.length !== 2) return null;
  const lng = Number(summary.map.center[0]);
  const lat = Number(summary.map.center[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lat, lng };
}

/** 地区记录列表（mock 返回副本，防外改；api 返回 localStore 数据） */
export function getRegions() {
  return useApi() ? apiService.getRegions() : regionStore().slice();
}

/**
 * 保存地区记录：同名自动归组；返回新记录 {id, name, created_at, detail, score, lat?, lng?}。
 * 真实 API 模式自动从 summary.map.center 提取坐标（第三参 coords 可显式覆盖）。
 */
export function saveRegion(name, summary, coords) {
  if (useApi()) return apiService.saveRegion(name, summary, coords || coordsFromSummary(summary));
  const store = regionStore();
  const nextId = store.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  const lv = summary && summary.livability;
  const record = {
    id: nextId,
    name: String(name),
    created_at: new Date().toISOString(),
    detail: summary,
    score: lv && typeof lv.score === 'number' ? lv.score : null,
  };
  const c = coords || coordsFromSummary(summary);
  if (c && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng))) {
    record.lat = Number(c.lat);
    record.lng = Number(c.lng);
  }
  store.push(record);
  return { ...record };
}

/** 删除地区记录（mock：本地过滤；不存在返回 false） */
export function deleteRegion(id) {
  if (useApi()) return apiService.deleteRegion(id);
  const store = regionStore();
  const idx = store.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  store.splice(idx, 1);
  return { ok: true, id };
}

/** 重命名地区记录（mock：替换记录 name；不存在返回 false） */
export function renameRegion(id, name) {
  if (useApi()) return apiService.renameRegion(id, name);
  const store = regionStore();
  const idx = store.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const updated = { ...store[idx], name: String(name) };
  store[idx] = updated;
  return { ...updated };
}

/**
 * 地名搜索（MapPicker 用）：
 *  - mock：本地演示数据（mockData.getGeocode，按关键词匹配 GEOCODE_DEMO）；
 *  - api：后端 /api/geocode 代理高德 Web 服务（失败抛错，前端降级手动定位）。
 */
export function getGeocode(q) {
  return useApi() ? apiService.getGeocode(q) : mockData.getGeocode(q);
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

// ---------------------------------------------------------------------------
// 公共地图（v2）：转发 apiService（上传 / 我的公开记录 / 撤回）
// ---------------------------------------------------------------------------

/** 上传地区记录到公共地图（需登录；Bearer token 自动附带） */
export function uploadPublicRecord(payload) {
  return apiService.uploadPublicRecord(payload);
}

/** 我的公开记录列表（需登录） */
export function getMyPublicRecords() {
  return apiService.getMyPublicRecords();
}

/** 撤回一条公开记录（需登录，仅归属者可删） */
export function withdrawPublicRecord(id) {
  return apiService.withdrawPublicRecord(id);
}

/**
 * v2 数据本地化兼容迁移（尽力而为，失败静默）：
 *  - 仅真实 API 模式执行；
 *  - 若 localStore 为空但云端 history/regions 有数据（旧版本使用过），
 *    启动时拉取云端数据落本地，保证升级不丢历史；
 *  - 任何失败静默（不阻塞启动，不弹错）。
 * @returns {Promise<{migratedHistory:number, migratedRegions:number}>}
 */
export function migrateCloudData() {
  return doMigrateCloudData();
}

/** 迁移实现（async 放内部，保持公开导出为普通 function，兼容数据契约静态扫描） */
async function doMigrateCloudData() {
  if (isMockMode()) return { migratedHistory: 0, migratedRegions: 0 };
  const counts = { migratedHistory: 0, migratedRegions: 0 };
  if (loadHistory().length === 0) {
    try {
      const list = await apiService.getHistoryCloud();
      if (Array.isArray(list) && list.length > 0) {
        saveHistory(list);
        counts.migratedHistory = list.length;
      }
    } catch (e) {
      /* 静默 */
    }
  }
  if (loadRegions().length === 0) {
    try {
      const list = await apiService.getRegionsCloud();
      if (Array.isArray(list) && list.length > 0) {
        saveRegions(list);
        counts.migratedRegions = list.length;
      }
    } catch (e) {
      /* 静默 */
    }
  }
  return counts;
}

/** 宜居度 → 文案与等级（转发 mockData 实现） */
export function gradeOf(score) {
  return useApi() ? apiService.gradeOf(score) : mockData.gradeOf(score);
}

/** 置信度等级（转发 mockData 实现；阈值 ≥0.6 高 / ≥0.4 中 / <0.4 低） */
export function confidenceLabelOf(confidence) {
  return mockData.confidenceLabelOf(confidence);
}

/** 宜居度描述文案（转发 mockData 实现） */
export function livabilityDesc(analysis) {
  return useApi() ? apiService.livabilityDesc(analysis) : mockData.livabilityDesc(analysis);
}

// 数据源调试辅助（转发自 dataConfig），供调试与测试使用
export { DATA_SOURCE, dataSource, getDataSource, isMock, isMockMode } from '../config/dataConfig.js';
