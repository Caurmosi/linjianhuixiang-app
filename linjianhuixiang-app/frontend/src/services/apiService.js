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
 *  - 本模块使用「同步 XHR」实现，以保持 UI 零改动（repository 目前为同步消费，
 *    appStore 在模块初始化时同步调用 buildAnalysis/getHistory）。
 *    这是原型阶段的务实取舍：真实后端接入后，可平滑改为 fetch + async，
 *    消费侧按仓库 README「数据源切换」小节改造（约 8 处 await）。
 *  - Node 测试环境（node --test）没有 XMLHttpRequest，会抛出带函数名的明确错误。
 */

/** 解析后端基地址：localStorage.ljx_api_base（App 内运行时配置）→ VITE_API_BASE（构建期）→ 空串（同源 /api 代理） */
function resolveApiBase() {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('ljx_api_base');
    if (saved) return String(saved).replace(/\/$/, '');
  }
  const viteEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : null;
  if (viteEnv && viteEnv.VITE_API_BASE) return String(viteEnv.VITE_API_BASE).replace(/\/$/, '');
  const nodeEnv = typeof process !== 'undefined' && process.env ? process.env : {};
  if (nodeEnv.VITE_API_BASE) return String(nodeEnv.VITE_API_BASE).replace(/\/$/, '');
  return '';
}

const API_BASE = resolveApiBase();

/**
 * 同步请求（GET / POST multipart）。
 * @param {string} path 如 /api/species
 * @param {object} options { method, formData }
 */
function request(path, options = {}) {
  const fn = options.fn || path;
  if (typeof XMLHttpRequest === 'undefined') {
    // Node 测试环境：无同步 XHR，给出明确提示
    throw new Error(`真实 API 未接入：请先启动后端服务并在浏览器 / Vite 环境运行（${fn}）`);
  }
  const xhr = new XMLHttpRequest();
  xhr.open(options.method || 'GET', API_BASE + path, false); // 同步：保持 UI 零改动
  try {
    xhr.send(options.formData || null);
  } catch (e) {
    throw new Error(`后端服务不可达：${e && e.message ? e.message : e}（${fn}）`);
  }
  if (xhr.status >= 200 && xhr.status < 300) {
    try {
      return JSON.parse(xhr.responseText);
    } catch (e) {
      throw new Error(`后端返回非 JSON 数据：${xhr.responseText.slice(0, 120)}（${fn}）`);
    }
  }
  let msg = `后端请求失败（HTTP ${xhr.status}）`;
  try {
    const body = JSON.parse(xhr.responseText);
    if (body && (body.error || body.detail)) msg = body.error || body.detail;
  } catch (e) {
    /* 忽略解析失败 */
  }
  throw new Error(`${msg}（${fn}）`);
}

/** 从后端拉取静态数据端点（供 buildAnalysis / analysisForHistory 组合） */
function fetchBaselineParts() {
  return {
    species: request('/api/species', { fn: 'getSpeciesList' }),
    indices: request('/api/indices', { fn: 'getIndices' }),
    livability: request('/api/livability', { fn: 'getLivability' }),
    heatmap: request('/api/heatmap', { fn: 'getHeatmap' }),
    mapPoints: request('/api/map-points', { fn: 'getMapPoints' }),
    suggestions: request('/api/suggestions', { fn: 'getSuggestions' }),
  };
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

/** 空间分布样点 */
export function getMapPoints() {
  return request('/api/map-points', { fn: 'getMapPoints' });
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

/**
 * 根据录音名 + 覆盖项构建分析结果。
 * - 若 overrides.audioFile 为 File/Blob：上传到 POST /api/analyze，返回真实完整分析；
 * - 否则（演示/历史流程，只有录音名）：组合后端各数据端点，应用与 mock 一致的合并规则。
 */
export function buildAnalysis(name, overrides = {}) {
  const audioFile = overrides && overrides.audioFile;
  if (audioFile) {
    const formData = new FormData();
    formData.append('file', audioFile, audioFile.name || name || 'recording.wav');
    if (overrides.threshold != null) formData.append('threshold', String(overrides.threshold));
    return request('/api/analyze', { method: 'POST', formData, fn: 'buildAnalysis' });
  }
  const parts = fetchBaselineParts();
  return composeAnalysis(name, parts, overrides || {});
}

/** 由历史记录条目构建分析结果（组合端点 + 历史条目覆盖） */
export function analysisForHistory(item) {
  const parts = fetchBaselineParts();
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
