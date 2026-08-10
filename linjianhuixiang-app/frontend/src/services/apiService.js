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
 */

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
 * @param {string} path 如 /api/species
 * @param {object} options { method, formData, json, fn, timeoutMs }
 * @returns {Promise<any>} 解析后的 JSON
 * @throws 后端不可达 / 超时 / 非 JSON / HTTP 错误（均带语义与函数名）
 */
async function request(path, options = {}) {
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
  let resp;
  try {
    resp = await fetch(url, {
      method: options.method || 'GET',
      body: hasJson ? JSON.stringify(options.json) : options.formData || undefined,
      headers: hasJson ? { 'Content-Type': 'application/json' } : undefined,
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

/** 历史记录 */
export function getHistory() {
  return request('/api/history', { fn: 'getHistory' });
}

/** 删除历史记录（DELETE /api/history/{id}） */
export function deleteHistory(id) {
  return request(`/api/history/${id}`, { method: 'DELETE', fn: 'deleteHistory' });
}

/** 地区记录列表（GET /api/regions） */
export function getRegions() {
  return request('/api/regions', { fn: 'getRegions' });
}

/** 保存地区记录（POST /api/regions，同名自动归组） */
export function saveRegion(name, summary) {
  return request('/api/regions', { method: 'POST', json: { name, summary }, fn: 'saveRegion' });
}

/** 删除地区记录（DELETE /api/regions/{id}） */
export function deleteRegion(id) {
  return request(`/api/regions/${id}`, { method: 'DELETE', fn: 'deleteRegion' });
}

/** 重命名地区记录（PATCH /api/regions/{id}） */
export function renameRegion(id, name) {
  return request(`/api/regions/${id}`, { method: 'PATCH', json: { name }, fn: 'renameRegion' });
}

/**
 * 根据录音名 + 覆盖项构建分析结果（async）。
 * - 若 overrides.audioFile 为 File/Blob：上传到 POST /api/analyze，返回真实完整分析；
 * - 否则（演示/历史流程，只有录音名）：组合后端各数据端点，应用与 mock 一致的合并规则。
 */
export async function buildAnalysis(name, overrides = {}) {
  const audioFile = overrides && overrides.audioFile;
  if (audioFile) {
    const formData = new FormData();
    formData.append('file', audioFile, audioFile.name || name || 'recording.wav');
    if (overrides.threshold != null) formData.append('threshold', String(overrides.threshold));
    return request('/api/analyze', { method: 'POST', formData, fn: 'buildAnalysis' });
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
