/**
 * apiService.js
 * 《林间回响》真实 API 数据源 —— 对接后端 REST 接口（字段契约与 mockData.js 完全一致）。
 *
 * 接入方式：
 *  - 前端通过 VITE_USE_MOCK=false 一键切换（见 config/dataConfig.js / repository.js）；
 *  - 后端地址默认同源 /api，可用环境变量 VITE_API_BASE 覆盖
 *    （如 VITE_API_BASE=http://localhost:8000 VITE_USE_MOCK=false npm run dev）。
 *
 * 实现说明（重要）：
 *  - 本模块全部导出函数均为 async（基于 fetch + AbortController 超时），
 *    后端不可达时在 ~8s 内快速失败并抛出带语义的错误「后端不可达：{原因}」，
 *    绝不阻塞主线程（修复同步 XHR 永久挂起导致的启动/分析卡死）。
 *  - 消费侧（appStore / AnalyzingScreen / HomeScreen / HistoryScreen / MapScreen）
 *    通过 Promise.resolve(...) 归一化「mock 同步 / api 异步」两种返回形态。
 *  - Node 测试环境（node --test）有全局 fetch，但 base 为空串 → URL 解析失败，
 *    会立即以「后端不可达」拒绝，不会真实联网挂起。
 *
 * v2 数据本地化（用户 2026-08-18 决策）：
 *  - 识别计算仍云端（BirdNET 在后端，音频照传），但分析结果/历史/地区记录**落本地**
 *    （localStore.js：ljx_history / ljx_regions / ljx_analysis / ljx_batches），App 升级不丢；
 *  - history/regions 读写全部本地化：saveRegion/deleteRegion/renameRegion 不再写云端
 *    /api/regions（避免多设备互相污染）；云端读取仅保留 getHistoryCloud/getRegionsCloud
 *    供旧数据一次性迁移（repository.migrateCloudData）；
 *  - deleteHistory 本地立即删除 + 尽力而为同步云端（保留既有云端删除兼容）；
 *  - 登录系统：request 自动附带 Authorization: Bearer <ljx_token>；
 *    公共地图：uploadPublicRecord / getMyPublicRecords / withdrawPublicRecord。
 */
import {
  loadHistory,
  loadRegions,
  saveAnalysis,
  saveHistory,
  saveRegions,
} from '../utils/localStore.js';

/** 本地会话键（authService 共用，避免循环依赖：authService → apiService，单向） */
export const TOKEN_KEY = 'ljx_token';
export const USERNAME_KEY = 'ljx_username';

/** 解析后端基地址：localStorage.ljx_api_base（App 内运行时配置）→ VITE_API_BASE（构建期）→ 空串（同源 /api 代理） */
function resolveApiBase() {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem('ljx_api_base');
      if (saved) return String(saved).replace(/\/$/, '');
    } catch (e) {
      /* 隐私模式/受限环境读取失败按未配置处理 */
    }
  }
  const viteEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : null;
  if (viteEnv && viteEnv.VITE_API_BASE) return String(viteEnv.VITE_API_BASE).replace(/\/$/, '');
  const nodeEnv = typeof process !== 'undefined' && process.env ? process.env : {};
  if (nodeEnv.VITE_API_BASE) return String(nodeEnv.VITE_API_BASE).replace(/\/$/, '');
  return '';
}

/** 读取登录 token（存储受限 / 未登录返回 null） */
function readToken() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem(TOKEN_KEY);
    return v && String(v).trim() ? String(v).trim() : null;
  } catch (e) {
    return null;
  }
}

/** 从错误对象提取人类可读的原因文本 */
function reasonOf(e) {
  if (!e) return '未知错误';
  if (e && e.name === 'AbortError') return '请求超时';
  const msg = e && e.message ? e.message : String(e);
  // 浏览器 "Failed to fetch" / Node "fetch failed"：统一为更友好的「无法连接」
  if (/Failed to fetch|fetch failed|NetworkError|network error/i.test(msg)) return '无法连接后端（网络不可达）';
  return msg;
}

/**
 * 异步请求（GET / POST multipart / JSON / DELETE / PATCH），fetch + AbortController 超时。
 * 基地址在每次请求时动态解析（resolveApiBase）：设置页保存的 localStorage.ljx_api_base
 * 即时生效，无需重启 App（不再于模块加载时缓存）。
 * 鉴权：options.token 显式传入，或自动读取 localStorage.ljx_token（已登录时所有请求携带 Bearer）。
 * @param {string} path 如 /api/species
 * @param {object} options { method, formData, json, fn, timeoutMs, token }
 * @returns {Promise<any>} 解析后的 JSON
 * @throws 后端不可达 / 超时 / 非 JSON / HTTP 错误（均带语义与函数名）
 */
export async function request(path, options = {}) {
  const fn = options.fn || path;
  const timeoutMs = options.timeoutMs != null ? options.timeoutMs : 8000;
  if (typeof fetch === 'undefined') {
    throw new Error(`后端不可达：当前环境不支持 fetch（${fn}）`);
  }
  const base = resolveApiBase(); // 每次请求读取最新配置（App 内设置页保存后即时生效）
  const url = base + path;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const hasJson = options.json !== undefined;
  const headers = {};
  if (hasJson) headers['Content-Type'] = 'application/json';
  const token = options.token || readToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let resp;
  try {
    resp = await fetch(url, {
      method: options.method || 'GET',
      body: hasJson ? JSON.stringify(options.json) : options.formData || undefined,
      headers,
      signal: controller.signal,
    });
  } catch (e) {
    throw new Error(`后端不可达：${reasonOf(e)}（${fn}）`);
  } finally {
    clearTimeout(timer);
  }
  if (resp.status >= 200 && resp.status < 300) {
    try {
      return await resp.json();
    } catch (e) {
      const text = await resp.text().catch(() => '');
      throw new Error(`后端返回非 JSON 数据：${text.slice(0, 120)}（${fn}）`);
    }
  }
  let msg = `后端请求失败（HTTP ${resp.status}）`;
  try {
    const body = await resp.json();
    if (body && (body.error || body.detail)) msg = body.error || body.detail;
  } catch (e) {
    /* 忽略解析失败 */
  }
  throw new Error(`${msg}（${fn}）`);
}

/** 从后端拉取静态数据端点（供 buildAnalysis / analysisForHistory 组合，并行请求） */
async function fetchBaselineParts() {
  const [species, indices, livability, heatmap, mapPoints, suggestions, waveform, segmentPoints] = await Promise.all([
    request('/api/species', { fn: 'getSpeciesList' }),
    request('/api/indices', { fn: 'getIndices' }),
    request('/api/livability', { fn: 'getLivability' }),
    request('/api/heatmap', { fn: 'getHeatmap' }),
    request('/api/map-points', { fn: 'getMapPoints' }),
    request('/api/suggestions', { fn: 'getSuggestions' }),
    request('/api/waveform', { fn: 'getWaveform' }),
    request('/api/segment-points', { fn: 'getSegmentPoints' }),
  ]);
  return { species, indices, livability, heatmap, mapPoints, suggestions, waveform, segmentPoints };
}

/** 与 mockData.buildAnalysis 一致的合并语义（overrides 后置、livability 深合并） */
function composeAnalysis(name, parts, overrides = {}) {
  // audioFile / threshold 是 buildAnalysis 的控制参数（真实上传用），不进合并结果
  const { audioFile, threshold, ...rest } = overrides;
  const count = rest.speciesCount ?? parts.species.length;
  const merged = {
    recording: name,
    species: count >= parts.species.length ? parts.species : parts.species.slice(0, count),
    indices: parts.indices,
    heatmap: parts.heatmap,
    mapPoints: parts.mapPoints,
    suggestions: parts.suggestions,
    speciesCount: count,
    ...rest,
    // 后端返回直接透传；缺失时补空数组（上传路径由 /api/analyze 返回真实字段）
    waveform: rest.waveform ?? parts.waveform ?? [],
    segmentPoints: rest.segmentPoints ?? parts.segmentPoints ?? [],
    livability: { ...parts.livability, ...(rest.livability || {}) },
  };
  return merged;
}

/** 物种清单 */
export function getSpeciesList() {
  return request('/api/species', { fn: 'getSpeciesList' });
}

/** 声学指数（ACI/NDSI/ADI/H） */
export function getIndices() {
  return request('/api/indices', { fn: 'getIndices' });
}

/** 宜居度耦合结果 */
export function getLivability() {
  return request('/api/livability', { fn: 'getLivability' });
}

/** 时段 × 频段热力图 */
export function getHeatmap() {
  return request('/api/heatmap', { fn: 'getHeatmap' });
}

/** 录音波形（[0,1] 峰值包络） */
export function getWaveform() {
  return request('/api/waveform', { fn: 'getWaveform' });
}

/** 空间分布样点 */
export function getMapPoints() {
  return request('/api/map-points', { fn: 'getMapPoints' });
}

/** 按时间切片的声景样点 */
export function getSegmentPoints() {
  return request('/api/segment-points', { fn: 'getSegmentPoints' });
}

/** 多绿地对比 */
export function getGreenSpaces() {
  return request('/api/green-spaces', { fn: 'getGreenSpaces' });
}

/** 提升建议 */
export function getSuggestions() {
  return request('/api/suggestions', { fn: 'getSuggestions' });
}

// ---------------------------------------------------------------------------
// v2 数据本地化：history / regions 读写本地化（真实 API 模式）
//  - getHistory/getRegions 读 localStore；
//  - saveRegion/deleteRegion/renameRegion 写 localStore（不再依赖云端 region_records 存储）；
//  - getHistoryCloud/getRegionsCloud 仅供旧数据一次性迁移（repository.migrateCloudData）；
//  - deleteHistory 本地删除 + 尽力而为同步云端（保留既有云端删除兼容）。
// ---------------------------------------------------------------------------

/** 历史记录列表（本地 localStore） */
export function getHistory() {
  return loadHistory();
}

/** 历史记录列表（云端，仅供旧数据迁移；旧版云端 history 拉取后落本地） */
export function getHistoryCloud() {
  return request('/api/history', { fn: 'getHistory' });
}

/** 删除历史记录：本地立即删除，云端尽力而为同步（离线/失败静默，本地删除已生效） */
export function deleteHistory(id) {
  const removed = removeHistoryLocal(id);
  try {
    request(`/api/history/${id}`, { method: 'DELETE', fn: 'deleteHistory' }).catch(() => {
      /* 云端同步失败静默（本地已删除） */
    });
  } catch (e) {
    /* 同步失败不影响本地 */
  }
  return removed;
}

/** 本地删除历史条目（按 id 过滤并落库） */
function removeHistoryLocal(id) {
  const list = loadHistory().filter((h) => !(h && h.id === id));
  saveHistory(list);
  return { ok: true, id };
}

/** 地区记录列表（本地 localStore） */
export function getRegions() {
  return loadRegions();
}

/** 地区记录列表（云端，仅供旧数据一次性迁移） */
export function getRegionsCloud() {
  return request('/api/regions', { fn: 'getRegions' });
}

/** 保存地区记录（本地；同名自动归组；可选 coords {lat,lng} 落库，供公共地图上传） */
export function saveRegion(name, summary, coords) {
  return saveRegionLocal(name, summary, coords);
}

/** 本地保存地区记录（真实 API 模式不再写云端 /api/regions，避免多设备污染） */
function saveRegionLocal(name, summary, coords) {
  const list = loadRegions();
  const nextId = list.reduce((m, r) => Math.max(m, Number(r && r.id) || 0), 0) + 1;
  const lv = summary && summary.livability ? summary.livability : {};
  const record = {
    id: nextId,
    name: String(name),
    created_at: new Date().toISOString(),
    detail: summary,
    score: typeof lv.score === 'number' ? lv.score : null,
  };
  const c = coords || {};
  if (Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng))) {
    record.lat = Number(c.lat);
    record.lng = Number(c.lng);
  }
  list.push(record);
  saveRegions(list);
  return { ...record };
}

/** 删除地区记录（本地）；不存在返回 false */
export function deleteRegion(id) {
  const before = loadRegions();
  const list = before.filter((r) => !(r && r.id === id));
  if (list.length === before.length) return false;
  saveRegions(list);
  return { ok: true, id };
}

/** 重命名地区记录（本地）；不存在返回 false */
export function renameRegion(id, name) {
  const list = loadRegions();
  const idx = list.findIndex((r) => r && r.id === id);
  if (idx === -1) return false;
  const updated = { ...list[idx], name: String(name) };
  list[idx] = updated;
  saveRegions(list);
  return { ...updated };
}

// ---------------------------------------------------------------------------
// v2 数据本地化：真实识别成功后结果落本地（saveAnalysis + 追加 saveHistory）
// ---------------------------------------------------------------------------

/** 秒数 → "M:SS" 时长文本（非法返回 '—'，与演示历史 duration 字段形态一致） */
function formatDuration(sec) {
  const s = Number(sec);
  if (!Number.isFinite(s) || s < 0) return '—';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** 由分析结果构建历史条目（保持既有 history 条目字段形状） */
function historyItemFromAnalysis(a, id) {
  const lv = a && a.livability && typeof a.livability === 'object' ? a.livability : {};
  const speciesList = a && Array.isArray(a.species) ? a.species : [];
  const name = (a && a.recording) || '录音.wav';
  return {
    id,
    name,
    species: speciesList.length > 0 ? speciesList.length : typeof a.speciesCount === 'number' ? a.speciesCount : 0,
    score: typeof lv.score === 'number' ? lv.score : 0,
    duration: formatDuration(a && a.durationSec),
    noise: typeof lv.noise === 'number' ? lv.noise : 0,
    bio: typeof lv.bio === 'number' ? lv.bio : 0,
    sound: typeof lv.sound === 'number' ? lv.sound : 0,
    created_at: new Date().toISOString(),
    analysis: a,
  };
}

/**
 * 真实 /api/analyze 成功后：结果落本地（saveAnalysis + 追加 saveHistory，新在前）。
 * 仅在真实识别成功时调用——演示兜底 / 无音频组合结果不落库。
 * @param {object} analysis /api/analyze 返回的分析结果
 * @param {string} name 录音名（快照缺 recording 时兜底）
 */
function persistAnalysis(analysis, name) {
  if (!analysis || typeof analysis !== 'object') return analysis;
  const normalized = analysis.recording ? analysis : { ...analysis, recording: name || '录音.wav' };
  saveAnalysis(normalized);
  const list = loadHistory();
  let id = Date.now();
  while (list.some((h) => h && h.id === id)) id += 1;
  const item = historyItemFromAnalysis(normalized, id);
  // 幂等：同一 id 已存在则不重复追加（本地历史由本地管理，避免重复分析同一文件时重复入史）
  if (!list.some((h) => h && h.id === id)) {
    saveHistory([item, ...list]);
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// 公共地图（v2）：上传 / 我的公开记录 / 撤回
// ---------------------------------------------------------------------------

/**
 * 上传地区记录到公共地图（POST /api/public/records，Bearer token）。
 * body: { regionName, lat?, lng?, score, confidence?, summary?, isAnonymous, overrideCoords? }
 * 坐标解析：overrideCoords > lat/lng > geocode 反查；全失败 400「无法定位该地区，请在地图上选点」。
 * @param {object} payload
 * @returns {Promise<{id:number, regionName:string, score:number, confidence:number, coordsSource:string, clusterKey:string, createdAt:string}>}
 */
export function uploadPublicRecord(payload) {
  return request('/api/public/records', { method: 'POST', json: payload, fn: 'uploadPublicRecord' });
}

/**
 * 我的公开记录（GET /api/public/me，Bearer token）。
 * @returns {Promise<{records:Array<{id:number, regionName:string, score:number, createdAt:string, isAnonymous:boolean, username:string}>}>}
 */
export function getMyPublicRecords() {
  return request('/api/public/me', { method: 'GET', fn: 'getMyPublicRecords' });
}

/**
 * 撤回一条公开记录（DELETE /api/public/records/{id}，Bearer token；物理删除，仅归属者可删）。
 * @param {number|string} id 公开记录 id
 * @returns {Promise<{ok:boolean, id:number}>}
 */
export function withdrawPublicRecord(id) {
  return request(`/api/public/records/${id}`, { method: 'DELETE', fn: 'withdrawPublicRecord' });
}

/**
 * 地名搜索（GET /api/geocode?q=…，后端代理高德 Web 服务）。
 * @param {string} q 地名关键词
 * @returns {Promise<{query:string, results:Array<{name:string,lng:number,lat:number}>}>}
 * @throws 后端不可达 / 400「地名搜索暂不可用」（调用方降级手动定位）
 */
export function getGeocode(q) {
  const query = q == null ? '' : String(q).trim();
  return request(`/api/geocode?q=${encodeURIComponent(query)}`, { fn: 'getGeocode' });
}

/**
 * 根据录音名 + 覆盖项构建分析结果（async）。
 * - 若 overrides.audioFile 为 File/Blob：上传到 POST /api/analyze，返回真实完整分析，
 *   成功后结果落本地（saveAnalysis + 追加 saveHistory）；
 * - 否则（演示/历史流程，只有录音名）：组合后端各数据端点，应用与 mock 一致的合并规则。
 */
export async function buildAnalysis(name, overrides = {}) {
  const audioFile = overrides && overrides.audioFile;
  if (audioFile) {
    const formData = new FormData();
    formData.append('file', audioFile, audioFile.name || name || 'recording.wav');
    if (overrides.threshold != null) formData.append('threshold', String(overrides.threshold));
    const result = await request('/api/analyze', { method: 'POST', formData, fn: 'buildAnalysis' });
    persistAnalysis(result, name);
    return result;
  }
  const parts = await fetchBaselineParts();
  return composeAnalysis(name, parts, overrides || {});
}

/** 由历史记录条目构建分析结果（async）：
 *  - 优先返回 item.analysis 完整快照（物种/波形/指数/热力图/分段样点随记录恢复，不再拉取"最近一次"端点）；
 *  - 旧记录无快照时降级组合端点 + 历史条目覆盖。 */
export async function analysisForHistory(item) {
  if (item && item.analysis && typeof item.analysis === 'object') {
    // 与 mockData.analysisForHistory 一致：浅拷贝 + 规范化 speciesCount，
    // 保证回放后结果页「识别鸟种」恒等于物种清单条数（真实后端快照本就自洽，此处为统一兜底）。
    const snap = { ...item.analysis };
    if (Array.isArray(snap.species)) snap.speciesCount = snap.species.length;
    return snap;
  }
  const parts = await fetchBaselineParts();
  const g = gradeOf(item.score);
  const lv = {
    score: item.score,
    noise: item.noise,
    bio: item.bio,
    sound: item.sound,
    grade: g.zh,
    gradeEn: g.en,
  };
  return composeAnalysis(item.name, parts, {
    speciesCount: item.species,
    livability: lv,
  });
}

/**
 * 连通性探测：GET {base}/health（5s 超时，不阻塞 UI）。
 * 供设置页「保存后端地址」后立即验证地址是否可达。
 * @param {string} [base] 待探测基地址；缺省取当前运行时配置
 * @returns {Promise<true>} 连通返回 true
 * @throws 不可达/超时（reason 为人类可读原因）
 */
export async function pingHealth(base) {
  if (typeof fetch === 'undefined') throw new Error('当前环境不支持 fetch');
  const url = String(base == null ? resolveApiBase() : base).replace(/\/$/, '') + '/health';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return true;
  } catch (e) {
    throw new Error(reasonOf(e));
  } finally {
    clearTimeout(timer);
  }
}

/** 宜居度 → 文案与等级（纯本地逻辑，与 mockData.gradeOf 一致） */
export function gradeOf(score) {
  if (score >= 70) return { zh: '宜居', en: 'Good', tone: 'good' };
  if (score >= 50) return { zh: '一般', en: 'Moderate', tone: 'mid' };
  return { zh: '受压', en: 'Stressed', tone: 'bad' };
}

/** 宜居度描述文案（与 mockData.livabilityDesc 一致） */
export function livabilityDesc(analysis) {
  const s = analysis.livability.score;
  const n = analysis.livability.noise;
  if (s >= 70) return `生物声丰富、噪声干扰低（占比 ${n}%），绿地适合鸟类安居。`;
  if (s >= 50) return `物种较丰富，但人为噪声（占比 ${n}%）拉低声环境质量，仍有提升空间。`;
  return `人为噪声占比高达 ${n}%，鸟类活动明显受限，建议优先降噪。`;
}
