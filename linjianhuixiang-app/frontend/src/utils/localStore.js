/**
 * localStore.js
 * 《林间回响》v2 数据本地化 —— localStorage 封装（分析结果/地区记录/历史全部落本地）。
 *
 * 设计：
 *  - 所有读写 try/catch 包裹：隐私模式 / WebView 存储受限 / 配额写满时自动降级为
 *    模块内内存 map（数据仅本次会话有效，App 不崩溃）；
 *  - 键统一 `ljx_` 前缀，与既有键（ljx_api_base / ljx_token / ljx_username）互不冲突；
 *  - 数据形状保持既有契约字段不变（history 条目 / region 条目由 dataContract.test.js 守护，
 *    本模块只做存取不做字段增删）。
 *
 * 数据键：
 *  - ljx_history  ：历史分析列表（最多保留最近 100 条，新在前）
 *  - ljx_regions  ：地区记录列表（本地化后不再依赖云端 /api/regions 存储）
 *  - ljx_analysis ：最近一次分析结果（完整快照）
 *  - ljx_batches  ：批量分析结果数组（v2 预留，随 store 变更写入）
 */

export const KEY_HISTORY = 'ljx_history';
export const KEY_REGIONS = 'ljx_regions';
export const KEY_ANALYSIS = 'ljx_analysis';
export const KEY_BATCHES = 'ljx_batches';

/** 历史列表保留上限：最多 100 条（新在前） */
export const HISTORY_LIMIT = 100;

/** 隐私模式降级内存仓库（无 localStorage / 写入被拒时使用） */
const memory = new Map();

/**
 * 获取可用的 localStorage；不可用返回 null（调用方走内存降级）。
 * 访问 localStorage 本身（typeof / getter）在隐私模式下可能抛 SecurityError → try/catch。
 */
function storage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch (e) {
    /* 隐私模式 / 存储受限 → 返回 null 走内存 */
  }
  return null;
}

/** 读取并解析 JSON；无值 / 解析失败返回 null（绝不抛错） */
function read(key) {
  const s = storage();
  if (s) {
    try {
      const raw = s.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  return memory.has(key) ? memory.get(key) : null;
}

/** 写入（JSON 序列化）；localStorage 失败自动降级内存；绝不抛错 */
function write(key, value) {
  const s = storage();
  if (s) {
    try {
      s.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      /* 配额写满 / 隐私模式写入被拒 → 降级内存 */
    }
  }
  memory.set(key, value);
  return true;
}

/** 删除键；localStorage 失败忽略（内存同步删除） */
function remove(key) {
  const s = storage();
  if (s) {
    try {
      s.removeItem(key);
    } catch (e) {
      /* 忽略 */
    }
  }
  memory.delete(key);
}

/** 归一化为数组（非法值返回空数组） */
function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * 读取历史分析列表（默认空数组）。
 * @returns {Array<object>} history 条目（id/name/species/score/duration/noise/bio/sound/created_at/analysis）
 */
export function loadHistory() {
  return asArray(read(KEY_HISTORY));
}

/**
 * 保存历史分析列表：强制数组、最多保留最近 HISTORY_LIMIT 条（新在前，由调用方保证顺序）。
 * @param {Array<object>} list
 * @returns {Array<object>} 实际落库的数组
 */
export function saveHistory(list) {
  const arr = asArray(list).slice(0, HISTORY_LIMIT);
  write(KEY_HISTORY, arr);
  return arr;
}

/**
 * 读取地区记录列表（默认空数组）。
 * @returns {Array<object>} region 条目（id/name/created_at/detail/score + 可选 lat/lng）
 */
export function loadRegions() {
  return asArray(read(KEY_REGIONS));
}

/**
 * 保存地区记录列表（强制数组）。
 * @param {Array<object>} list
 * @returns {Array<object>} 实际落库的数组
 */
export function saveRegions(list) {
  const arr = asArray(list);
  write(KEY_REGIONS, arr);
  return arr;
}

/**
 * 读取最近一次分析结果（完整快照）；无则返回 null。
 * @returns {object|null}
 */
export function loadAnalysis() {
  const v = read(KEY_ANALYSIS);
  return v && typeof v === 'object' ? v : null;
}

/**
 * 保存最近一次分析结果（仅对象可存，非对象忽略）。
 * @param {object} detail 分析结果快照
 * @returns {object|null}
 */
export function saveAnalysis(detail) {
  if (detail && typeof detail === 'object') write(KEY_ANALYSIS, detail);
  return detail || null;
}

/**
 * 读取批量分析结果数组（默认空数组）。
 * @returns {Array<object>}
 */
export function loadBatches() {
  return asArray(read(KEY_BATCHES));
}

/**
 * 保存批量分析结果数组（强制数组）。
 * @param {Array<object>} list
 * @returns {Array<object>}
 */
export function saveBatches(list) {
  const arr = asArray(list);
  write(KEY_BATCHES, arr);
  return arr;
}

/**
 * 清空全部本地业务数据（设置页「清空本地数据」预留 / 测试辅助）。
 * @returns {boolean} 恒 true
 */
export function clearLocalStore() {
  remove(KEY_HISTORY);
  remove(KEY_REGIONS);
  remove(KEY_ANALYSIS);
  remove(KEY_BATCHES);
  return true;
}
