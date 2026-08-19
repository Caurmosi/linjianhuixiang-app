/**
 * syncService.js —— 账号云同步（本地数据备份到账号，换机登录可恢复）
 *
 * 后端契约：
 *   POST /api/sync/backup  {payload}   → {ok, updatedAt}（整体覆盖备份，≤2MB）
 *   GET  /api/sync/backup             → {payload, updatedAt}；无备份 404 {error}
 *
 * 数据范围：history / regions / analysis / batches（与 localStore 键一致）。
 * 策略：
 *   - 上传：登录成功 / 设置页「立即备份」→ 整体覆盖（本地为准）；
 *   - 恢复：换机 / 卸载后本地为空时自动拉取恢复；设置页「从云端恢复」手动触发。
 */
import { request } from './apiService.js';
import { getToken } from './authService.js';
import {
  loadHistory,
  saveHistory,
  loadRegions,
  saveRegions,
  loadAnalysis,
  saveAnalysis,
  loadBatches,
  saveBatches,
} from '../utils/localStore.js';

const BACKUP_VERSION = 1;

/** 把本地数据打包成备份 payload（JSON 字符串） */
export function buildBackupPayload() {
  const payload = {
    v: BACKUP_VERSION,
    ts: new Date().toISOString(),
    history: loadHistory() || [],
    regions: loadRegions() || [],
    analysis: loadAnalysis() || null,
    batches: loadBatches() || [],
  };
  return JSON.stringify(payload);
}

/** 解析备份 payload 并整体写入本地；格式非法返回 false，成功返回 true */
export function applyBackupPayload(raw) {
  try {
    const data = JSON.parse(String(raw || ''));
    if (!data || typeof data !== 'object') return false;
    saveHistory(Array.isArray(data.history) ? data.history : []);
    saveRegions(Array.isArray(data.regions) ? data.regions : []);
    if (data.analysis) saveAnalysis(data.analysis);
    if (Array.isArray(data.batches)) saveBatches(data.batches);
    return true;
  } catch (e) {
    return false;
  }
}

/** 本地是否有数据（用于判断是否需要自动恢复） */
export function hasLocalData() {
  try {
    return (loadHistory() || []).length > 0 || (loadRegions() || []).length > 0 || !!loadAnalysis();
  } catch (e) {
    return true; // 读取异常时保守视为有数据，避免误覆盖
  }
}

/**
 * 上传本地备份到账号（需登录）。失败抛错（err.message / err.status）。
 * @returns {Promise<{ok:boolean, updatedAt:string}>}
 */
export async function uploadBackup() {
  const token = getToken();
  if (!token) throw new Error('未登录，无法备份');
  return request('/api/sync/backup', {
    method: 'POST',
    token,
    json: { payload: buildBackupPayload() },
    fn: 'uploadBackup',
  });
}

/**
 * 拉取账号备份的 payload 字符串；无备份返回 null；失败抛错。
 * @returns {Promise<string|null>}
 */
export async function fetchBackup() {
  const token = getToken();
  if (!token) throw new Error('未登录，无法恢复');
  try {
    const data = await request('/api/sync/backup', { method: 'GET', token, fn: 'fetchBackup' });
    return data && typeof data.payload === 'string' ? data.payload : null;
  } catch (err) {
    if (err && err.status === 404) return null; // 该账号还没有备份
    throw err;
  }
}

/**
 * 换机/清数据后的自动恢复：有 token 且本地为空 → 拉取云端备份并应用。
 * 返回 true=已恢复，false=无需恢复或恢复失败（失败静默，不打断启动）。
 */
export async function autoRestoreIfEmpty() {
  try {
    if (!getToken()) return false;
    if (hasLocalData()) return false; // 本地有数据不动
    const payload = await fetchBackup();
    if (!payload) return false;
    return applyBackupPayload(payload);
  } catch (e) {
    return false; // 后端不可达等：静默跳过，不阻塞启动
  }
}
