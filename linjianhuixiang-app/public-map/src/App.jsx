/**
 * App.jsx —— 《林间回响》城市鸟类宜居度公共地图（单页）
 *
 * 功能：
 *  - 高德栅格瓦片底图（webrd0{1-4}，无 key，GCJ-02 与聚合点同坐标系，无需转换）；
 *  - 聚合点 circle 层：circle-color 按 score 渐变（0 红 #c25a39 → 50 琥珀 #d49a26 → 70+ 绿 #2e7d52），
 *    circle-radius 按 Math.sqrt(n) 缩放（8~24px），白边；
 *  - 视口 moveend 节流（300ms）带 bbox 重新拉取聚合点；
 *  - 点击 circle → Popup：地区名 / 样本数 / 加权均分（大字）/ 评分区间 / 置信度均值 / 日期范围 /
 *    样本明细（最多 20 条，超出提示）；底部注明坐标已模糊；
 *  - 空态 / 加载失败态 / WebGL 不支持态兜底。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import QRCode from 'qrcode';
import 'maplibre-gl/dist/maplibre-gl.css';

import BirdBookPanel from './panels/BirdBookPanel.jsx';
import ComparePanel from './panels/ComparePanel.jsx';
import ReportPanel from './panels/ReportPanel.jsx';
import TrendPanel from './panels/TrendPanel.jsx';
import Top10Panel from './panels/Top10Panel.jsx';
import StatsPanel from './panels/StatsPanel.jsx';
import { downloadCsv, toCsv } from './utils/csv.js';

/* ===================== 常量 ===================== */

const API_BASE = (import.meta.env.VITE_API_BASE || 'https://uegbddmczvrm.cloud.sealos.io').replace(/\/+$/, '');

/** 初始中心：杭州附近（GCJ-02），zoom 11 */
const DEFAULT_CENTER = [120.15, 30.26];
const DEFAULT_ZOOM = 11;

/** moveend 请求节流间隔（ms） */
const MOVEEND_THROTTLE_MS = 300;

/** 单次拉取聚合点数量上限（与后端契约一致） */
const LIMIT = 200;

/** 弹窗中样本明细最多展示条数 */
const MAX_SAMPLES = 20;

/** 容器尺寸未就绪时的最大重试次数 */
const MAX_SIZE_RETRY = 4;

/** 高德栅格瓦片：经后端代理（/api/tiles），解决 CORS + 防盗链 404（必须 lang=zh_cn&size=1&scale=1） */
const AMAP_TILE_URLS = [
  `${API_BASE}/api/tiles/{z}/{x}/{y}?sub=1`,
  `${API_BASE}/api/tiles/{z}/{x}/{y}?sub=2`,
  `${API_BASE}/api/tiles/{z}/{x}/{y}?sub=3`,
  `${API_BASE}/api/tiles/{z}/{x}/{y}?sub=4`,
];

const CLUSTER_SOURCE_ID = 'ljx-clusters-source';
const CLUSTER_LAYER_ID = 'ljx-clusters-layer';

/** WebGL 探测（maplibre 3.6.2 兼容 WebGL1/2） */
function isWebGLSupported() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    );
  } catch (e) {
    return false;
  }
}

/** circle-color 数据驱动表达式：score 线性渐变 0 红 → 50 琥珀 → 70+ 绿（与参考配色一致） */
function circleColorExpression() {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'score'], 50],
    0, '#c25a39',
    50, '#d49a26',
    70, '#2e7d52',
    100, '#2e7d52',
  ];
}

/** circle-radius 数据驱动表达式：Math.sqrt(n) 缩放，n=1 → 8px，n=900 → 24px，超出自动钳制 */
function circleRadiusExpression() {
  return [
    'interpolate',
    ['linear'],
    ['sqrt', ['coalesce', ['get', 'n'], 1]],
    1, 8,
    30, 24,
  ];
}

/** 聚合点数组 → GeoJSON FeatureCollection（过滤非法坐标，字段补默认值） */
function buildClusterGeoJSON(clusters) {
  const list = Array.isArray(clusters) ? clusters : [];
  const features = [];
  list.forEach((c) => {
    if (!c || typeof c !== 'object') return;
    const lng = Number(c.lng);
    const lat = Number(c.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        id: c.id != null ? String(c.id) : '',
        regionName: c.regionName || '',
        n: Number.isFinite(Number(c.n)) ? Number(c.n) : 1,
        score: Number.isFinite(Number(c.score)) ? Number(c.score) : 50,
        scoreMin: Number.isFinite(Number(c.scoreMin)) ? Number(c.scoreMin) : null,
        scoreMax: Number.isFinite(Number(c.scoreMax)) ? Number(c.scoreMax) : null,
        confidenceAvg: Number.isFinite(Number(c.confidenceAvg)) ? Number(c.confidenceAvg) : null,
        createdFrom: c.createdFrom || '',
        createdTo: c.createdTo || '',
      },
    });
  });
  return { type: 'FeatureCollection', features };
}

/** HTML 转义（弹窗内 nickname / regionName 为用户输入，防 XSS） */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 日期格式化：ISO / 时间戳 / 纯日期字符串 → YYYY-MM-DD（无法解析时原样截断） */
function formatDate(value) {
  if (value == null || value === '') return '—';
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const t = new Date(s);
  if (!Number.isNaN(t.getTime())) {
    const y = t.getFullYear();
    const mo = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  return s.slice(0, 16);
}

/** 数值格式化：保留 1 位小数；非法值显示 — */
function formatScore(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(1) : '—';
}

/* ===================== 数据请求 ===================== */

/** 拉取聚合点（匿名只读）：bbox + 可选检索/筛选（region/species/minScore/maxScore/from/to） */
async function fetchClusters(bbox, filters = {}) {
  const params = new URLSearchParams();
  if (bbox) {
    params.set('minLng', String(Number(bbox.minLng).toFixed(6)));
    params.set('maxLng', String(Number(bbox.maxLng).toFixed(6)));
    params.set('minLat', String(Number(bbox.minLat).toFixed(6)));
    params.set('maxLat', String(Number(bbox.maxLat).toFixed(6)));
  }
  const region = (filters.region || '').trim();
  if (region) params.set('region', region);
  const species = (filters.species || '').trim();
  if (species) params.set('species', species);
  if (Number.isFinite(Number(filters.minScore))) params.set('minScore', String(Number(filters.minScore)));
  if (Number.isFinite(Number(filters.maxScore))) params.set('maxScore', String(Number(filters.maxScore)));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  params.set('limit', String(LIMIT));
  const url = `${API_BASE}/api/public/clusters?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.clusters)) throw new Error('响应格式错误');
  return {
    clusters: data.clusters,
    total: Number.isFinite(Number(data.total)) ? Number(data.total) : 0,
  };
}

/** 已识别物种列表（匿名只读，物种分布筛选用） */
async function speciesApi() {
  const res = await fetch(`${API_BASE}/api/public/species?limit=100`);
  if (!res.ok) return [];
  const d = await res.json();
  return Array.isArray(d.species) ? d.species : [];
}

/* ---------- 账号（与 App 同一后端 users 表，token 独立存网页 localStorage） ---------- */

const TOKEN_KEY = 'pm_token';
const USERNAME_KEY = 'pm_username';

function readStoredSession() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const username = localStorage.getItem(USERNAME_KEY);
    return token && username ? { token, username } : null;
  } catch (e) {
    return null;
  }
}

function storeSession(token, username) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USERNAME_KEY, username);
  } catch (e) {
    /* 隐私模式忽略 */
  }
}

function clearStoredSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
  } catch (e) {
    /* 忽略 */
  }
}

/** 统一请求（JSON + 可选 Bearer）；失败抛 {error, detail, status} */
async function apiRequest(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `HTTP ${res.status}`);
    err.status = res.status;
    err.error = data && data.error;
    err.detail = data && data.detail;
    throw err;
  }
  return data;
}

function loginApi(username, password) {
  return apiRequest('/api/auth/login', { method: 'POST', body: { username, password } });
}

function registerApi(username, password) {
  return apiRequest('/api/auth/register', { method: 'POST', body: { username, password } });
}

function meApi(token) {
  return apiRequest('/api/auth/me', { token });
}

function myRecordsApi(token) {
  return apiRequest('/api/public/me', { token });
}

function deleteRecordApi(id, token) {
  return apiRequest(`/api/public/records/${id}`, { method: 'DELETE', token });
}

/** 地名 → 坐标（GCJ-02），复用后端高德 geocode 代理 */
async function geocodeApi(query) {
  const res = await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(query)}`);
  if (!res.ok) return { results: [] };
  const data = await res.json();
  return { results: Array.isArray(data.results) ? data.results : [] };
}

/** 近 N 天筛选起点（ISO 日期，含当天零点） */
function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10) + 'T00:00:00Z';
}

/** 拉取聚合点详情 + 样本列表（id 含 | 和 :，必须 encodeURIComponent） */
async function fetchClusterDetail(id) {
  const url = `${API_BASE}/api/public/clusters/${encodeURIComponent(id)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data;
}

/** 多地区对比：ids 为 cluster_key 数组（≤4，各自 URL 编码后逗号连接） */
async function compareApi(ids) {
  const q = ids.map((id) => encodeURIComponent(id)).join(',');
  const res = await fetch(`${API_BASE}/api/public/compare?ids=${q}`);
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    const e = new Error((d && d.error) || `HTTP ${res.status}`);
    e.error = d && d.error;
    e.status = res.status;
    throw e;
  }
  const d = await res.json();
  if (!d || !Array.isArray(d.items)) throw new Error('响应格式错误');
  return d;
}

/** 地区生态简报（匿名只读） */
async function reportApi(id) {
  const res = await fetch(`${API_BASE}/api/public/clusters/${encodeURIComponent(id)}/report`);
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    const e = new Error((d && d.error) || `HTTP ${res.status}`);
    e.error = d && d.error;
    e.status = res.status;
    throw e;
  }
  return res.json();
}

/** 世界范围 bbox（首屏取全局 total 用） */
function worldBbox() {
  return { minLng: -180, maxLng: 180, minLat: -85, maxLat: 85 };
}

/** bbox 外扩 20%（避免视口边缘聚合点被裁掉），并设置最小外扩幅度 */
function expandBbox(bbox) {
  const dLng = Math.max(0.01, (bbox.maxLng - bbox.minLng) * 0.2);
  const dLat = Math.max(0.01, (bbox.maxLat - bbox.minLat) * 0.2);
  return {
    minLng: bbox.minLng - dLng,
    maxLng: bbox.maxLng + dLng,
    minLat: bbox.minLat - dLat,
    maxLat: bbox.maxLat + dLat,
  };
}

/** 当前地图视野 bbox */
function currentViewportBbox(map) {
  const b = map.getBounds();
  return { minLng: b.getWest(), maxLng: b.getEast(), minLat: b.getSouth(), maxLat: b.getNorth() };
}

/* ===================== 弹窗 HTML ===================== */

/** 垃圾桶图标（删除自己的记录） */
const TRASH_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

/**
 * 构建 Popup 内容。
 * @param {object} p 聚合点 properties
 * @param {Array|null} samples 样本列表；null 表示「加载中」或「加载失败」（由 loading/errorMsg 区分）
 * @param {boolean} loading 是否处于样本加载中
 * @param {string} [errorMsg] 样本加载失败提示
 */
function buildPopupHTML(p, samples, loading, errorMsg, myIds) {
  const regionName = p.regionName || '未知地区';
  const n = Number.isFinite(Number(p.n)) ? Number(p.n) : '—';
  const score = formatScore(p.score);
  const scoreMin = formatScore(p.scoreMin);
  const scoreMax = formatScore(p.scoreMax);
  const confidenceAvg = formatScore(p.confidenceAvg);
  const from = formatDate(p.createdFrom);
  const to = formatDate(p.createdTo);

  let samplesHtml = '';
  if (loading) {
    samplesHtml = '<div class="ljx-popup-hint">样本加载中…</div>';
  } else if (errorMsg) {
    samplesHtml = `<div class="ljx-popup-hint ljx-popup-error">${escapeHtml(errorMsg)}</div>`;
  } else if (!samples || samples.length === 0) {
    samplesHtml = '<div class="ljx-popup-hint">暂无样本明细</div>';
  } else {
    const rows = samples
      .slice(0, MAX_SAMPLES)
      .map((s) => {
        const isAnon = s && s.isAnonymous === true;
        const name = isAnon ? '匿名用户' : s && s.nickname ? s.nickname : '匿名用户';
        const mine = myIds && myIds.has(s.id);
        const delBtn = mine
          ? `<button type="button" class="ljx-del-btn" data-sample-id="${Number(s.id)}" title="删除该记录">${TRASH_SVG}</button>`
          : '';
        return `<div class="ljx-popup-sample">
          <span class="ljx-popup-sample-name">${escapeHtml(name)}</span>
          <span class="ljx-popup-sample-date">${formatDate(s.date)}</span>
          <span class="ljx-popup-sample-score">${formatScore(s.score)}</span>
          ${delBtn}
        </div>`;
      })
      .join('');
    const more =
      samples.length > MAX_SAMPLES
        ? `<div class="ljx-popup-more">… 仅显示前 ${MAX_SAMPLES} 条，共 ${samples.length} 条样本</div>`
        : '';
    samplesHtml = `<div class="ljx-popup-samples-title">样本明细（${samples.length}）</div>${rows}${more}`;
  }

  return `<div class="ljx-popup">
    <div class="ljx-popup-title">${escapeHtml(regionName)}</div>
    <div class="ljx-popup-score-row">
      <div class="ljx-popup-score">${score}</div>
      <div class="ljx-popup-score-label">宜居度加权均分</div>
    </div>
    <div class="ljx-popup-meta">
      <div class="ljx-popup-meta-item"><span>样本数</span><b>${n}</b></div>
      <div class="ljx-popup-meta-item"><span>评分区间</span><b>${scoreMin} ~ ${scoreMax}</b></div>
      <div class="ljx-popup-meta-item"><span>置信度均值</span><b>${confidenceAvg}</b></div>
      <div class="ljx-popup-meta-item"><span>日期范围</span><b>${from} ~ ${to}</b></div>
    </div>
    ${samplesHtml}
    <div class="ljx-popup-actions">
      <button type="button" class="ljx-popup-action" data-action="trend">📈 评分趋势</button>
      <button type="button" class="ljx-popup-action" data-action="report">📄 生态简报</button>
    </div>
    <div class="ljx-popup-note">坐标为近似位置（已模糊数百米）</div>
  </div>`;
}

/* ===================== 组件 ===================== */

export default function App() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  // 数据状态
  const [clusters, setClusters] = useState([]);
  const [total, setTotal] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState(null); // 首屏加载失败
  const [banner, setBanner] = useState(null); // 后续刷新失败的轻提示
  const [tileError, setTileError] = useState(null); // 底图瓦片异常轻提示

  // 检索 / 筛选（region 模糊 / 物种分布 / 评分区间 / 时间窗）
  const [filters, setFilters] = useState({ region: '', species: '', minScore: '', maxScore: '', range: 'all' });
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const [speciesList, setSpeciesList] = useState([]); // 已识别物种（分布筛选项）
  const [candidates, setCandidates] = useState(null); // 同名歧义候选地点 [{name,lng,lat}]

  // 账号（与 App 互通）
  const [user, setUser] = useState(null); // {token, username}
  const [myIds, setMyIds] = useState(null); // Set<recordId>（null=未登录/未拉取）
  const [showLogin, setShowLogin] = useState(false);
  const [loginMode, setLoginMode] = useState('login'); // login | register
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginErr, setLoginErr] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  // 删除确认（样本）
  const [delTarget, setDelTarget] = useState(null); // {id, regionName}
  const [delPwd, setDelPwd] = useState('');
  const [delErr, setDelErr] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState(null); // 顶部轻提示
  const toastTimerRef = useRef(null); // toast 自动消失计时器

  /** 顶部轻提示：3 秒自动消失 */
  const flashToast = useCallback((msg) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 3000);
  }, []);

  // 分析功能面板（图鉴 / 对比 / 趋势 / 生态简报）
  const [showBirds, setShowBirds] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [trendTarget, setTrendTarget] = useState(null); // {regionName, clusterId}
  const [reportTarget, setReportTarget] = useState(null); // {regionName, clusterId}

  // 分享 / 热门排行
  const [showShare, setShowShare] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [showTop10, setShowTop10] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // 地图状态
  const [unsupported, setUnsupported] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [retryTick, setRetryTick] = useState(0);

  // refs（异步回调/事件闭包内使用最新值）
  const clustersRef = useRef([]);
  const hasLoadedRef = useRef(false);
  const mapLoadedRef = useRef(false);
  const activePopupRef = useRef(null);
  const sizeRetryRef = useRef(0);
  const moveTimerRef = useRef(null);
  const bannerTimerRef = useRef(null);
  const tileTimerRef = useRef(null);
  const lastMoveFetchRef = useRef(0);
  const requestSeqRef = useRef(0);
  const myIdsRef = useRef(null); // 当前用户公开记录 id 集合（同步给弹窗闭包）

  /* ---------- 数据拉取 ---------- */

  const loadClusters = useCallback(async (bbox, { updateTotal = false } = {}) => {
    const seq = ++requestSeqRef.current;
    const f = filtersRef.current;
    const applied = {
      region: f.region,
      species: f.species,
      minScore: f.minScore === '' ? undefined : Number(f.minScore),
      maxScore: f.maxScore === '' ? undefined : Number(f.maxScore),
      from: f.range === '7d' ? daysAgoIso(7) : f.range === '30d' ? daysAgoIso(30) : undefined,
      to: undefined,
    };
    try {
      const { clusters: list, total: t } = await fetchClusters(bbox, applied);
      if (seq !== requestSeqRef.current) return; // 过期响应丢弃
      clustersRef.current = list;
      setClusters(list);
      hasLoadedRef.current = true;
      setHasLoaded(true);
      setError(null);
      setBanner(null);
      if (updateTotal) setTotal(t);
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      if (!hasLoadedRef.current) {
        setError('加载失败，请稍后重试');
      } else {
        setBanner('刷新失败，请稍后重试');
        clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = setTimeout(() => setBanner(null), 4000);
      }
    }
  }, []);

  /** 视口 moveend：300ms 节流后带 bbox 重新拉取 */
  const scheduleViewportFetch = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const now = Date.now();
    const elapsed = now - lastMoveFetchRef.current;
    const run = () => {
      lastMoveFetchRef.current = Date.now();
      const b = map.getBounds();
      loadClusters(
        expandBbox({
          minLng: b.getWest(),
          maxLng: b.getEast(),
          minLat: b.getSouth(),
          maxLat: b.getNorth(),
        })
      );
    };
    if (elapsed >= MOVEEND_THROTTLE_MS) {
      run();
    } else {
      clearTimeout(moveTimerRef.current);
      moveTimerRef.current = setTimeout(run, MOVEEND_THROTTLE_MS - elapsed);
    }
  }, [loadClusters]);

  /** 点击聚合点 → 弹窗（先展示概览，再异步拉样本；本人样本带删除按钮） */
  const showClusterPopup = useCallback(async (map, feature) => {
    const p = feature.properties || {};
    const coords = feature.geometry.coordinates;
    if (activePopupRef.current) {
      try {
        activePopupRef.current.remove();
      } catch (e) {
        /* 忽略 */
      }
      activePopupRef.current = null;
    }
    const popup = new maplibregl.Popup({
      offset: 20,
      maxWidth: '340px',
      closeButton: true,
      closeOnClick: false,
      className: 'ljx-popup-wrap',
    })
      .setLngLat(coords)
      .setHTML(buildPopupHTML(p, null, true, undefined, myIdsRef.current))
      .addTo(map);
    activePopupRef.current = popup;

    // 删除按钮事件委托：点击 .ljx-del-btn → 打开删除确认；点击 .ljx-popup-action → 趋势/简报
    const onPopupClick = (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest('.ljx-del-btn') : null;
      if (btn) {
        const id = Number(btn.getAttribute('data-sample-id'));
        if (Number.isFinite(id) && id > 0) {
          setDelTarget({ id, regionName: p.regionName || '' });
        }
        return;
      }
      const actionBtn = ev.target && ev.target.closest ? ev.target.closest('.ljx-popup-action') : null;
      if (actionBtn) {
        const act = actionBtn.getAttribute('data-action');
        if (act === 'trend') setTrendTarget({ regionName: p.regionName || '', clusterId: p.id });
        else if (act === 'report') setReportTarget({ regionName: p.regionName || '', clusterId: p.id });
      }
    };
    popup.getElement().addEventListener('click', onPopupClick);

    const clusterId = p.id;
    if (!clusterId) return;
    try {
      const data = await fetchClusterDetail(clusterId);
      const samples = data && Array.isArray(data.samples) ? data.samples : [];
      if (!popup.isOpen()) return;
      popup.setHTML(buildPopupHTML(p, samples, false, undefined, myIdsRef.current));
    } catch (err) {
      if (!popup.isOpen()) return;
      popup.setHTML(buildPopupHTML(p, null, false, '样本加载失败，请稍后重试', myIdsRef.current));
    }
  }, []);

  /* ---------- 账号 / 我的记录 / 删除 ---------- */

  /** 登录成功后：存会话、拉取我的记录 id 集合、关闭弹窗 */
  const afterAuth = useCallback(
    async (token, username) => {
      storeSession(token, username);
      setUser({ token, username });
      setShowLogin(false);
      setLoginErr('');
      setLoginForm({ username: '', password: '' });
      try {
        const data = await myRecordsApi(token);
        const ids = new Set((data.records || []).map((r) => Number(r.id)));
        myIdsRef.current = ids;
        setMyIds(ids);
      } catch (e) {
        myIdsRef.current = new Set();
        setMyIds(new Set());
      }
    },
    []
  );

  /** 提交登录/注册 */
  const onSubmitAuth = async () => {
    const username = (loginForm.username || '').trim();
    const password = loginForm.password || '';
    if (!username || !password) {
      setLoginErr('请输入用户名和密码');
      return;
    }
    if (password.length < 6) {
      setLoginErr('密码至少 6 个字符');
      return;
    }
    setLoginBusy(true);
    setLoginErr('');
    try {
      const data = loginMode === 'register' ? await registerApi(username, password) : await loginApi(username, password);
      await afterAuth(data.token, data.username);
    } catch (err) {
      if (loginMode === 'register' && err.status === 409) {
        setLoginErr('用户名已被占用，请更换或直接登录');
      } else if (err.status === 401) {
        setLoginErr('用户名或密码错误');
      } else {
        setLoginErr((err && err.error) || '请求失败，请稍后重试');
      }
    } finally {
      setLoginBusy(false);
    }
  };

  /** 登出 */
  const onLogout = () => {
    clearStoredSession();
    setUser(null);
    myIdsRef.current = null;
    setMyIds(null);
    // 若当前有弹窗，重建（去掉删除按钮）
    if (activePopupRef.current) {
      try {
        activePopupRef.current.remove();
      } catch (e) {
        /* 忽略 */
      }
      activePopupRef.current = null;
    }
  };

  /** 确认删除：先登录验证密码（刷新 token）→ 再 DELETE（本人校验在后端） */
  const onConfirmDelete = async () => {
    if (!user || !delTarget) return;
    setDelErr('');
    if (!delPwd) {
      setDelErr('请输入密码确认');
      return;
    }
    setDelBusy(true);
    try {
      const loginData = await loginApi(user.username, delPwd); // 验证账号密码，刷新 token
      storeSession(loginData.token, user.username);
      const nextUser = { token: loginData.token, username: user.username };
      setUser(nextUser);
      await deleteRecordApi(delTarget.id, nextUser.token);
      setDelTarget(null);
      setDelPwd('');
      setToastMsg('已删除该记录');
      setTimeout(() => setToastMsg(null), 3000);
      // 刷新我的记录集合 + 关闭当前弹窗 + 重拉聚合
      try {
        const data = await myRecordsApi(nextUser.token);
        const ids = new Set((data.records || []).map((r) => Number(r.id)));
        myIdsRef.current = ids;
        setMyIds(ids);
      } catch (e) {
        /* 忽略 */
      }
      if (activePopupRef.current) {
        try {
          activePopupRef.current.remove();
        } catch (err) {
          /* 忽略 */
        }
        activePopupRef.current = null;
      }
      const map = mapRef.current;
      if (map && mapLoadedRef.current) {
        const b = map.getBounds();
        loadClusters(
          expandBbox({
            minLng: b.getWest(),
            maxLng: b.getEast(),
            minLat: b.getSouth(),
            maxLat: b.getNorth(),
          }),
          { updateTotal: true }
        );
      }
    } catch (err) {
      if (err.status === 401) setDelErr('密码错误');
      else if (err.status === 403) setDelErr('只能删除自己的记录');
      else setDelErr((err && err.error) || '删除失败，请稍后重试');
    } finally {
      setDelBusy(false);
    }
  };

  /** 应用检索/筛选：地区名 → 先 geocode 定位（flyTo）再按 region 过滤；纯评分/时间 → 直接过滤
   *  regionOverride：搜索框输入后立刻回车时，用输入框实时值（避免 state/ref 未同步读到旧值）
   *  同名歧义（如「西湖」会命中台湾西湖乡）：多结果 → 展示候选列表让用户选，不自动跳 */
  const applyFilters = useCallback(
    async (regionOverride) => {
      const map = mapRef.current;
      const f = filtersRef.current;
      const region = (regionOverride != null ? String(regionOverride).trim() : (f.region || '').trim());
      const doFetch = (bbox, updateTotal) => loadClusters(bbox || worldBbox(), { updateTotal });

      if (region) {
        let results = [];
        try {
          const data = await geocodeApi(region);
          results = data.results || [];
        } catch (e) {
          results = [];
        }
        if (!results || results.length === 0) {
          setToastMsg(`未找到该地点：${region}`);
          setTimeout(() => setToastMsg(null), 3200);
          setCandidates(null);
          doFetch(map && mapLoadedRef.current ? expandBbox(currentViewportBbox(map)) : worldBbox(), true);
          return;
        }
        if (results.length === 1) {
          setCandidates(null);
          flyToPlace(results[0]);
          return;
        }
        // 同名歧义：展示候选（高德行政区优先可能排到台湾等，用户自选最稳）
        setCandidates(results);
        setToastMsg(`找到 ${results.length} 个「${region}」，请选择要定位的地点`);
        setTimeout(() => setToastMsg(null), 3600);
        return;
      }

      // 无地区名：纯评分/时间筛选 → 当前视野直接过滤
      setCandidates(null);
      doFetch(map && mapLoadedRef.current ? expandBbox(currentViewportBbox(map)) : worldBbox(), true);
    },
    [loadClusters]
  );

  /** 飞到指定地点（geocode 结果，GCJ-02）并按 region 过滤拉取 */
  const flyToPlace = useCallback(
    (place) => {
      const map = mapRef.current;
      const doFetch = (bbox, updateTotal) => loadClusters(bbox || worldBbox(), { updateTotal });
      if (map && mapLoadedRef.current) {
        map.flyTo({ center: [place.lng, place.lat], zoom: 12, essential: true, duration: 1200 });
        setTimeout(() => {
          const b = mapRef.current && mapRef.current.getBounds();
          if (b) {
            doFetch(
              expandBbox({ minLng: b.getWest(), maxLng: b.getEast(), minLat: b.getSouth(), maxLat: b.getNorth() }),
              true
            );
          }
        }, 1400);
      } else {
        doFetch(worldBbox(), true);
      }
    },
    [loadClusters]
  );

  /** 清除检索/筛选：重置 + 飞回全景 */
  const clearFilters = () => {
    setFilters({ region: '', species: '', minScore: '', maxScore: '', range: 'all' });
    filtersRef.current = { region: '', species: '', minScore: '', maxScore: '', range: 'all' };
    setCandidates(null);
    const map = mapRef.current;
    if (map && mapLoadedRef.current) {
      map.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, essential: true, duration: 1000 });
      setTimeout(() => {
        const b = mapRef.current && mapRef.current.getBounds();
        if (b) loadClusters(expandBbox({ minLng: b.getWest(), maxLng: b.getEast(), minLat: b.getSouth(), maxLat: b.getNorth() }), { updateTotal: true });
      }, 1200);
    } else {
      loadClusters(worldBbox(), { updateTotal: true });
    }
  };

  /* 恢复会话：页面加载时若有 pm_token → me 验证 + 拉我的记录集合（失败静默清除） */
  useEffect(() => {
    const session = readStoredSession();
    if (!session) return;
    setUser({ token: session.token, username: session.username });
    (async () => {
      try {
        await meApi(session.token);
        const data = await myRecordsApi(session.token);
        const ids = new Set((data.records || []).map((r) => Number(r.id)));
        myIdsRef.current = ids;
        setMyIds(ids);
      } catch (e) {
        clearStoredSession();
        setUser(null);
      }
    })();
  }, []);

  /* 已识别物种列表（物种分布筛选项）：拉取一次，失败静默（下拉为空） */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await speciesApi();
        if (alive) setSpeciesList(list);
      } catch (e) {
        /* 忽略 */
      }
    })();
    return () => { alive = false; };
  }, []);

  /* ---------- 分享（二维码）/ 热门排行 ---------- */

  /** 打开分享弹窗：生成当前页面的二维码 */
  const openShare = useCallback(async () => {
    setShowShare(true);
    setShareCopied(false);
    try {
      const dataUrl = await QRCode.toDataURL(window.location.href, {
        width: 240,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      setQrDataUrl(dataUrl);
    } catch (e) {
      setQrDataUrl('');
    }
  }, []);

  /** 复制当前链接（clipboard 优先，降级 execCommand） */
  const copyShareLink = () => {
    const url = window.location.href;
    const done = () => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    };
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) {
        /* 忽略 */
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(fallback);
    } else {
      fallback();
    }
  };

  /* ---------- 导出 CSV（当前筛选下的全量聚合点，供 Excel / MATLAB 分析） ---------- */

  const [exportBusy, setExportBusy] = useState(false);

  /** 按当前筛选拉取全量聚合点（limit 500，忽略地图视口） */
  const fetchAllClustersFiltered = async () => {
    const f = filtersRef.current;
    const params = new URLSearchParams({ limit: '500' });
    if ((f.region || '').trim()) params.set('region', f.region.trim());
    if ((f.species || '').trim()) params.set('species', f.species.trim());
    if (f.minScore !== '') params.set('minScore', String(Number(f.minScore)));
    if (f.maxScore !== '') params.set('maxScore', String(Number(f.maxScore)));
    if (f.range === '7d') params.set('from', daysAgoIso(7));
    else if (f.range === '30d') params.set('from', daysAgoIso(30));
    const res = await fetch(`${API_BASE}/api/public/clusters?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.clusters) ? data.clusters : [];
  };

  /** 导出当前筛选结果为 CSV（聚合，每地区一行）：调全量接口 → 序列化 → 下载 */
  const onExportCsv = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const clusters = await fetchAllClustersFiltered();
      if (!clusters.length) {
        flashToast('当前筛选下没有可导出的数据');
        return;
      }
      // 表头用英文（MATLAB 列名友好）；地区名/日期为中文值
      const columns = [
        { key: 'regionName', label: 'regionName' },
        { key: 'score', label: 'score' },
        { key: 'scoreMin', label: 'scoreMin' },
        { key: 'scoreMax', label: 'scoreMax' },
        { key: 'n', label: 'n' },
        { key: 'confidenceAvg', label: 'confidenceAvg' },
        { key: 'lat', label: 'lat' },
        { key: 'lng', label: 'lng' },
        { key: 'createdFrom', label: 'createdFrom' },
        { key: 'createdTo', label: 'createdTo' },
      ];
      const csv = toCsv(clusters, columns);
      const date = new Date().toISOString().slice(0, 10);
      downloadCsv(`linjianhuixiang_clusters_${date}.csv`, csv);
      flashToast(`已导出 ${clusters.length} 个地区（含当前筛选）`);
    } catch (e) {
      flashToast('导出失败：' + ((e && e.message) || '网络异常'));
    } finally {
      setExportBusy(false);
    }
  };

  /** 导出明细 CSV（每条采样记录一行）：遍历聚合点 → 各自详情 samples → 汇总下载。
   *  同一地区多次采样（不同日期）会各占一行 → MATLAB 可直接做时间对比。 */
  const onExportDetailCsv = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const clusters = await fetchAllClustersFiltered();
      if (!clusters.length) {
        flashToast('当前筛选下没有可导出的数据');
        return;
      }
      const rows = [];
      for (let i = 0; i < clusters.length; i++) {
        const c = clusters[i];
        let samples = [];
        try {
          const d = await fetchClusterDetail(c.id);
          samples = Array.isArray(d.samples) ? d.samples : [];
        } catch (e) {
          /* 单个地区详情失败跳过，不中断整体 */
        }
        for (const s of samples) {
          rows.push({
            regionName: c.regionName,
            date: s.date || '',
            score: s.score,
            confidence: s.confidence,
            noise: s.noise == null ? '' : s.noise,
            species: Array.isArray(s.species) && s.species.length ? s.species.join('、') : '',
          });
        }
        if (i === clusters.length - 1) setExportBusy(false); // 让按钮文案先恢复，再弹 toast
      }
      if (!rows.length) {
        flashToast('没有可导出的明细数据');
        return;
      }
      const columns = [
        { key: 'regionName', label: 'regionName' },
        { key: 'date', label: 'date' },
        { key: 'score', label: 'score' },
        { key: 'confidence', label: 'confidence' },
        { key: 'noise', label: 'noise' },
        { key: 'species', label: 'species' },
      ];
      const csv = toCsv(rows, columns);
      const date = new Date().toISOString().slice(0, 10);
      downloadCsv(`linjianhuixiang_samples_${date}.csv`, csv);
      flashToast(`已导出 ${rows.length} 条样本记录（${clusters.length} 个地区，含时间维度）`);
    } catch (e) {
      flashToast('导出失败：' + ((e && e.message) || '网络异常'));
    } finally {
      setExportBusy(false);
    }
  };

  /** Top10 点击 → 地图飞过去 + 重拉视野 */
  const onPickTop = useCallback(
    (place) => {
      setShowTop10(false);
      const map = mapRef.current;
      if (map && mapLoadedRef.current) {
        map.flyTo({ center: [place.lng, place.lat], zoom: 13, essential: true, duration: 1000 });
        setTimeout(() => {
          const b = mapRef.current && mapRef.current.getBounds();
          if (b) {
            loadClusters(
              expandBbox({ minLng: b.getWest(), maxLng: b.getEast(), minLat: b.getSouth(), maxLat: b.getNorth() }),
              { updateTotal: true }
            );
          }
        }, 1200);
      }
    },
    [loadClusters]
  );

  /* ---------- 地图生命周期 ---------- */

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    if (!isWebGLSupported()) {
      setUnsupported(true);
      return undefined;
    }

    // 容器尺寸守卫：布局未就绪时 rAF 重试（防 0 尺寸构造崩溃）
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      sizeRetryRef.current += 1;
      if (sizeRetryRef.current > MAX_SIZE_RETRY) {
        setMapError('地图容器尺寸未就绪');
        return undefined;
      }
      const raf = window.requestAnimationFrame(() => setRetryTick((t) => t + 1));
      return () => window.cancelAnimationFrame(raf);
    }
    sizeRetryRef.current = 0;

    let map;
    try {
      map = new maplibregl.Map({
        container,
        style: {
          version: 8,
          sources: {
            amap: {
              type: 'raster',
              tiles: AMAP_TILE_URLS,
              tileSize: 256,
              attribution: '© 高德地图',
            },
          },
          layers: [{ id: 'amap-raster', type: 'raster', source: 'amap' }],
        },
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: false,
      });
    } catch (err) {
      setMapError(err && err.message ? String(err.message) : '地图初始化失败');
      return undefined;
    }
    mapRef.current = map;
    setMapError(null);

    const onError = () => {
      setTileError('底图加载异常，请检查网络');
      clearTimeout(tileTimerRef.current);
      tileTimerRef.current = setTimeout(() => setTileError(null), 6000);
    };
    map.on('error', onError);

    const onLoad = () => {
      mapLoadedRef.current = true;
      try {
        if (!map.getSource(CLUSTER_SOURCE_ID)) {
          map.addSource(CLUSTER_SOURCE_ID, {
            type: 'geojson',
            data: buildClusterGeoJSON(clustersRef.current),
          });
        }
        if (!map.getLayer(CLUSTER_LAYER_ID)) {
          map.addLayer({
            id: CLUSTER_LAYER_ID,
            type: 'circle',
            source: CLUSTER_SOURCE_ID,
            paint: {
              'circle-color': circleColorExpression(),
              'circle-radius': circleRadiusExpression(),
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.92,
            },
          });
        }
        // 首屏：拉取全局聚合点（同时取样本总数 total）
        loadClusters(worldBbox(), { updateTotal: true });
      } catch (e) {
        setError('加载失败，请稍后重试');
      }
    };
    map.on('load', onLoad);

    const onMapClick = (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER_ID] });
      if (!features || features.length === 0) return;
      showClusterPopup(map, features[0]);
    };
    map.on('click', onMapClick);

    // 点击空白区域关闭弹窗
    const onMapClickEmpty = (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER_ID] });
      if (!features || features.length === 0) {
        if (activePopupRef.current) {
          try {
            activePopupRef.current.remove();
          } catch (err) {
            /* 忽略 */
          }
          activePopupRef.current = null;
        }
      }
    };
    map.on('click', onMapClickEmpty);

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };
    map.on('mouseenter', CLUSTER_LAYER_ID, onMouseEnter);
    map.on('mouseleave', CLUSTER_LAYER_ID, onMouseLeave);

    const onMoveEnd = () => scheduleViewportFetch();
    map.on('moveend', onMoveEnd);

    return () => {
      mapLoadedRef.current = false;
      clearTimeout(moveTimerRef.current);
      clearTimeout(bannerTimerRef.current);
      clearTimeout(tileTimerRef.current);
      if (activePopupRef.current) {
        try {
          activePopupRef.current.remove();
        } catch (e) {
          /* 忽略 */
        }
        activePopupRef.current = null;
      }
      try {
        map.off('error', onError);
        map.off('load', onLoad);
        map.off('click', onMapClick);
        map.off('click', onMapClickEmpty);
        map.off('mouseenter', CLUSTER_LAYER_ID, onMouseEnter);
        map.off('mouseleave', CLUSTER_LAYER_ID, onMouseLeave);
        map.off('moveend', onMoveEnd);
        map.remove();
      } catch (e) {
        /* 忽略清理错误 */
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryTick]);

  /* clusters 变化 → 更新 GeoJSON source */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    try {
      const source = map.getSource(CLUSTER_SOURCE_ID);
      if (source) source.setData(buildClusterGeoJSON(clusters));
    } catch (e) {
      /* 忽略 */
    }
  }, [clusters]);

  /** 重试：重置错误态并重建地图（load 事件会重新发起首屏请求） */
  const handleRetry = () => {
    requestSeqRef.current += 1; // 使在途请求全部失效
    setError(null);
    setMapError(null);
    setBanner(null);
    setTileError(null);
    setUnsupported(false);
    hasLoadedRef.current = false;
    setHasLoaded(false);
    sizeRetryRef.current = 0;
    setRetryTick((t) => t + 1);
  };

  const initialLoading = !hasLoaded && !error && !mapError && !unsupported;
  const showEmpty = !error && !mapError && !unsupported && hasLoaded && clusters.length === 0;

  /* ---------- 渲染 ---------- */

  return (
    <div className="ljx-page">
      <header className="ljx-header">
        <div className="ljx-header-left">
          <div className="ljx-header-title">林间回响 · 城市鸟类宜居度公共地图</div>
          <div className="ljx-header-sub">
            <span className="ljx-header-total">样本总数：{total == null ? '—' : total}</span>
            <span className="ljx-header-note">坐标为近似位置，已模糊处理</span>
          </div>
        </div>
        <div className="ljx-header-user">
          <button type="button" className="ljx-btn ljx-btn-ghost" onClick={openShare} title="生成二维码分享">
            📱 分享
          </button>
          <button type="button" className="ljx-btn ljx-btn-ghost" onClick={() => setShowStats(true)}>
            📊 看板
          </button>
          <button type="button" className="ljx-btn ljx-btn-ghost" onClick={() => setShowTop10(true)}>
            🏆 排行
          </button>
          {user ? (
            <>
              <span className="ljx-header-username">{user.username}</span>
              <button type="button" className="ljx-btn ljx-btn-ghost" onClick={onLogout}>
                登出
              </button>
            </>
          ) : (
            <button type="button" className="ljx-btn" onClick={() => setShowLogin(true)}>
              登录
            </button>
          )}
        </div>
      </header>

      {/* 检索 / 筛选条 */}
      <div className="ljx-filterbar">
        <input
          type="text"
          className="ljx-input ljx-input-search"
          placeholder="搜索地区，如 西湖公园"
          value={filters.region}
          onChange={(e) => setFilters((f) => ({ ...f, region: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyFilters(e.target.value);
          }}
        />
        <div className="ljx-filter-group">
          <input
            type="number"
            className="ljx-input ljx-input-score"
            placeholder="最低分"
            min="0"
            max="100"
            value={filters.minScore}
            onChange={(e) => setFilters((f) => ({ ...f, minScore: e.target.value }))}
          />
          <span className="ljx-filter-sep">~</span>
          <input
            type="number"
            className="ljx-input ljx-input-score"
            placeholder="最高分"
            min="0"
            max="100"
            value={filters.maxScore}
            onChange={(e) => setFilters((f) => ({ ...f, maxScore: e.target.value }))}
          />
        </div>
        <select
          className="ljx-select"
          value={filters.range}
          onChange={(e) => setFilters((f) => ({ ...f, range: e.target.value }))}
        >
          <option value="all">全部时间</option>
          <option value="7d">近 7 天</option>
          <option value="30d">近 30 天</option>
        </select>
        <select
          className="ljx-select"
          value={filters.species}
          onChange={(e) => setFilters((f) => ({ ...f, species: e.target.value }))}
        >
          <option value="">全部鸟种</option>
          {speciesList.map((s) => (
            <option key={s.name} value={s.name}>{s.name}（{s.count}）</option>
          ))}
        </select>
        <button type="button" className="ljx-btn" onClick={() => applyFilters(filters.region)}>
          查询
        </button>
        <button type="button" className="ljx-btn ljx-btn-ghost" onClick={clearFilters}>
          清除
        </button>
        <button
          type="button"
          className="ljx-btn ljx-btn-ghost"
          onClick={onExportCsv}
          disabled={exportBusy}
          title="导出当前筛选结果为 CSV（每地区一行，Excel 可直接打开，MATLAB readtable 可读取）"
        >
          {exportBusy ? '导出中…' : '⬇️ 聚合 CSV'}
        </button>
        <button
          type="button"
          className="ljx-btn ljx-btn-ghost"
          onClick={onExportDetailCsv}
          disabled={exportBusy}
          title="导出每条采样记录（同一地区多次采样各占一行，可对比不同时间）"
        >
          {exportBusy ? '导出中…' : '📋 明细 CSV'}
        </button>
        <span className="ljx-filter-sep" />
        <button type="button" className="ljx-btn ljx-btn-ghost" onClick={() => setShowCompare(true)}>
          📊 多地区对比
        </button>
        <button type="button" className="ljx-btn ljx-btn-ghost" onClick={() => setShowBirds(true)}>
          📖 鸟种图鉴
        </button>
      </div>

      {/* 同名歧义候选（如「西湖」可能命中台湾西湖乡，用户自选最稳） */}
      {candidates && candidates.length > 0 && (
        <div className="ljx-candidates">
          <span className="ljx-candidates-label">找到多个同名地点，选择要定位的：</span>
          {candidates.map((c, idx) => (
            <button
              key={`${c.name}-${idx}`}
              type="button"
              className="ljx-candidate-btn"
              onClick={() => {
                flyToPlace(c);
                setCandidates(null);
              }}
            >
              {c.name}
            </button>
          ))}
          <button
            type="button"
            className="ljx-candidate-close"
            onClick={() => setCandidates(null)}
            title="关闭候选"
          >
            ×
          </button>
        </div>
      )}

      <main className="ljx-map-wrap">
        <div ref={containerRef} className="ljx-map-canvas" />

        {unsupported && (
          <div className="ljx-overlay">
            <div className="ljx-overlay-card">
              <p>当前设备不支持 WebGL 渲染，无法显示地图</p>
            </div>
          </div>
        )}

        {!unsupported && mapError && (
          <div className="ljx-overlay">
            <div className="ljx-overlay-card">
              <p>地图加载失败（{mapError}）</p>
              <button type="button" className="ljx-btn" onClick={handleRetry}>
                重试
              </button>
            </div>
          </div>
        )}

        {initialLoading && (
          <div className="ljx-overlay">
            <div className="ljx-overlay-card">
              <p>加载中…</p>
            </div>
          </div>
        )}

        {showEmpty && (
          <div className="ljx-overlay">
            <div className="ljx-overlay-card">
              <p>
                {filters.region || filters.species || filters.minScore !== '' || filters.maxScore !== '' || filters.range !== 'all'
                  ? '没有匹配的数据，试试清除筛选'
                  : '还没有公开数据，快去 App 上传第一条吧'}
              </p>
            </div>
          </div>
        )}

        {!unsupported && error && (
          <div className="ljx-overlay">
            <div className="ljx-overlay-card">
              <p>{error}</p>
              <button type="button" className="ljx-btn" onClick={handleRetry}>
                重试
              </button>
            </div>
          </div>
        )}

        {banner && !error && <div className="ljx-banner">{banner}</div>}
        {tileError && <div className="ljx-banner ljx-banner-warn">{tileError}</div>}
        {toastMsg && <div className="ljx-banner ljx-banner-ok">{toastMsg}</div>}

        {/* 图例：底部左侧 红→黄→绿 */}
        <div className="ljx-legend">
          <span className="ljx-legend-title">宜居度</span>
          <span className="ljx-legend-label">低</span>
          <span className="ljx-legend-bar" />
          <span className="ljx-legend-label">高</span>
        </div>

        <div className="ljx-attribution">© 高德地图</div>
      </main>

      {/* 登录 / 注册弹窗 */}
      {showLogin && (
        <div className="ljx-modal">
          <div className="ljx-modal-card">
            <div className="ljx-modal-title">账号登录</div>
            <div className="ljx-modal-tabs">
              <button
                type="button"
                className={loginMode === 'login' ? 'on' : ''}
                onClick={() => {
                  setLoginMode('login');
                  setLoginErr('');
                }}
              >
                登录
              </button>
              <button
                type="button"
                className={loginMode === 'register' ? 'on' : ''}
                onClick={() => {
                  setLoginMode('register');
                  setLoginErr('');
                }}
              >
                注册
              </button>
            </div>
            <div className="ljx-modal-body">
              <input
                type="text"
                className="ljx-input"
                placeholder="用户名"
                value={loginForm.username}
                onChange={(e) => setLoginForm((f) => ({ ...f, username: e.target.value }))}
              />
              <input
                type="password"
                className="ljx-input"
                placeholder="密码（至少 6 位）"
                value={loginForm.password}
                onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSubmitAuth();
                }}
              />
              {loginErr && <div className="ljx-modal-err">{loginErr}</div>}
              <p className="ljx-modal-hint">与 App 使用同一账号体系，注册后 App / 网站均可登录</p>
            </div>
            <div className="ljx-modal-foot">
              <button type="button" className="ljx-btn ljx-btn-ghost" onClick={() => setShowLogin(false)}>
                取消
              </button>
              <button type="button" className="ljx-btn" disabled={loginBusy} onClick={onSubmitAuth}>
                {loginBusy ? '提交中…' : loginMode === 'register' ? '注册并登录' : '登录'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗（需账号密码） */}
      {delTarget && (
        <div className="ljx-modal">
          <div className="ljx-modal-card">
            <div className="ljx-modal-title">删除公开记录</div>
            <div className="ljx-modal-body">
              <p className="ljx-modal-hint">
                将以账号 <b>{user ? user.username : ''}</b> 删除
                {delTarget.regionName ? `「${delTarget.regionName}」` : ''}的这条记录（无法恢复）。
              </p>
              <input
                type="password"
                className="ljx-input"
                placeholder="输入账号密码确认"
                value={delPwd}
                onChange={(e) => setDelPwd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onConfirmDelete();
                }}
              />
              {delErr && <div className="ljx-modal-err">{delErr}</div>}
            </div>
            <div className="ljx-modal-foot">
              <button
                type="button"
                className="ljx-btn ljx-btn-ghost"
                onClick={() => {
                  setDelTarget(null);
                  setDelPwd('');
                  setDelErr('');
                }}
              >
                取消
              </button>
              <button type="button" className="ljx-btn ljx-btn-danger" disabled={delBusy} onClick={onConfirmDelete}>
                {delBusy ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 鸟种图鉴面板 */}
      {showBirds && <BirdBookPanel onClose={() => setShowBirds(false)} />}

      {/* 多地区对比面板 */}
      {showCompare && (
        <ComparePanel clusters={clusters} compareApi={compareApi} onClose={() => setShowCompare(false)} />
      )}

      {/* 地区评分趋势面板 */}
      {trendTarget && (
        <TrendPanel
          regionName={trendTarget.regionName}
          clusterId={trendTarget.clusterId}
          fetchDetail={fetchClusterDetail}
          onClose={() => setTrendTarget(null)}
        />
      )}

      {/* 地区生态简报面板 */}
      {reportTarget && (
        <ReportPanel
          regionName={reportTarget.regionName}
          clusterId={reportTarget.clusterId}
          reportApi={reportApi}
          onClose={() => setReportTarget(null)}
        />
      )}

      {/* 热门地区 Top10 排行 */}
      {showTop10 && (
        <Top10Panel
          filters={filters}
          onPick={onPickTop}
          onClose={() => setShowTop10(false)}
        />
      )}

      {/* 城市生态数据看板 */}
      {showStats && <StatsPanel onClose={() => setShowStats(false)} />}

      {/* 二维码分享弹窗 */}
      {showShare && (
        <div className="ljx-modal" onClick={() => setShowShare(false)}>
          <div className="ljx-modal-card ljx-share-card" onClick={(e) => e.stopPropagation()}>
            <div className="ljx-modal-title">分享公共地图</div>
            <div className="ljx-share-body">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="二维码" width={220} height={220} className="ljx-share-qr" />
              ) : (
                <div className="ljx-share-qr ljx-share-qr-empty">二维码生成中…</div>
              )}
              <p className="ljx-modal-hint">扫码即可打开公共地图（微信/相机/浏览器均可扫）</p>
            </div>
            <div className="ljx-modal-foot">
              <button type="button" className="ljx-btn ljx-btn-ghost" onClick={() => setShowShare(false)}>
                关闭
              </button>
              <button type="button" className="ljx-btn" onClick={copyShareLink}>
                {shareCopied ? '已复制 ✓' : '复制链接'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
