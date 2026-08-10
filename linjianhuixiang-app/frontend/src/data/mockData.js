/**
 * mockData.js
 * 《林间回响》演示数据 —— 与高保真原型完全一致（物种 / 指数 / 宜居度 / 热力图 / 地图样点 / 历史记录）
 */

// 物种清单（含 2 个低于 0.50 阈值的物种，用于演示"阈值滑杆影响清单显示"）
export const SPECIES = [
  { id: 1, name: '白头鹎', latin: 'Pycnonotus sinensis', conf: 0.93, freq: 21, period: '清晨' },
  { id: 2, name: '麻雀', latin: 'Passer montanus', conf: 0.88, freq: 14, period: '全天' },
  { id: 3, name: '珠颈斑鸠', latin: 'Spilopelia chinensis', conf: 0.82, freq: 9, period: '清晨' },
  { id: 4, name: '乌鸫', latin: 'Turdus merula', conf: 0.77, freq: 8, period: '黄昏' },
  { id: 5, name: '大山雀', latin: 'Parus major', conf: 0.71, freq: 6, period: '上午' },
  { id: 6, name: '喜鹊', latin: 'Pica pica', conf: 0.66, freq: 5, period: '全天' },
  { id: 7, name: '八哥', latin: 'Acridotheres cristatellus', conf: 0.55, freq: 3, period: '黄昏' },
  { id: 8, name: '灰喜鹊', latin: 'Cyanopica cyanus', conf: 0.48, freq: 2, period: '清晨' },
  { id: 9, name: '戴胜', latin: 'Upupa epops', conf: 0.42, freq: 1, period: '上午' },
];

// 声学指数：ACI / NDSI / ADI / H
export const INDICES = [
  { key: 'ACI', name: '声学复杂度指数', display: '82.4', pct: 82, desc: '越高表示生物声活动越丰富、声景越复杂。' },
  { key: 'NDSI', name: '归一化声景指数', display: '0.41', pct: 70, desc: '正值代表生物声主导；负值代表人为噪声主导。' },
  { key: 'ADI', name: '声学多样性指数', display: '0.73', pct: 73, desc: '频带能量分布广度，反映声音类型多样性。' },
  { key: 'H', name: '声学均匀度（熵）', display: '0.85', pct: 85, desc: '越接近 1 表示各声源分布越均衡、干扰越小。' },
];

// 宜居度耦合结果
export const LIVABILITY = {
  score: 68,
  grade: '一般',
  gradeEn: 'Moderate',
  bio: 76, // 生物多样性
  sound: 60, // 声环境质量
  noise: 34, // 人为噪声占比
};

// 时段 × 频段 热力图（0..1 强度）
export const HEATMAP = [
  [0.2, 0.3, 0.5, 0.7, 0.8, 0.6, 0.4, 0.3, 0.5, 0.7, 0.6, 0.3],
  [0.3, 0.4, 0.6, 0.8, 0.9, 0.7, 0.5, 0.4, 0.6, 0.8, 0.7, 0.4],
  [0.4, 0.5, 0.7, 0.9, 0.7, 0.5, 0.4, 0.5, 0.7, 0.6, 0.5, 0.3],
  [0.5, 0.6, 0.8, 0.7, 0.5, 0.4, 0.3, 0.4, 0.5, 0.4, 0.3, 0.2],
];

// 录音波形：160 个 [0,1] 峰值包络值（中段更活跃，供结果页画波形）
export const WAVEFORM = Array.from({ length: 160 }, (_, i) => {
  const t = i / 159;
  const base = 0.35 + 0.55 * Math.sin(Math.PI * t);
  const ripples = 0.18 * Math.sin(7 * t * Math.PI) * Math.sin(3 * t * Math.PI + 0.5);
  return Number(Math.max(0.04, Math.min(1, base + ripples)).toFixed(3));
});

// 空间分布样点（默认绿地 = 中山公园）
export const MAP_POINTS = [
  { x: 70, y: 55, c: '#2e7d52', t: '宜居' },
  { x: 140, y: 80, c: '#2e7d52', t: '' },
  { x: 200, y: 100, c: '#d49a26', t: '一般' },
  { x: 105, y: 120, c: '#d49a26', t: '' },
  { x: 250, y: 90, c: '#c25a39', t: '受压' },
  { x: 175, y: 55, c: '#2e7d52', t: '' },
];

// 按时间切片的演示声景样点（录音分段：x 按段序、y 按段能量、c 按段等级）
export const SEGMENT_POINTS = [
  { x: 50, y: 90, c: '#d49a26', t: '开始' },
  { x: 97, y: 62, c: '#2e7d52', t: '' },
  { x: 144, y: 55, c: '#2e7d52', t: '' },
  { x: 191, y: 78, c: '#d49a26', t: '' },
  { x: 238, y: 120, c: '#c25a39', t: '' },
  { x: 285, y: 95, c: '#d49a26', t: '结束' },
];

// 多绿地对比：每个绿地的样点数组（颜色/标签体现宜居/一般/受压差异）
export const GREEN_SPACES = [
  { id: 'zhongshan', name: '中山公园', points: MAP_POINTS },
  {
    id: 'binjiang',
    name: '滨江绿地',
    points: [
      { x: 90, y: 60, c: '#d49a26', t: '一般' },
      { x: 160, y: 85, c: '#d49a26', t: '' },
      { x: 230, y: 70, c: '#c25a39', t: '受压' },
      { x: 120, y: 110, c: '#d49a26', t: '' },
      { x: 200, y: 130, c: '#c25a39', t: '' },
      { x: 150, y: 55, c: '#2e7d52', t: '宜居' },
    ],
  },
  {
    id: 'xijiao',
    name: '西郊森林公园',
    points: [
      { x: 80, y: 60, c: '#2e7d52', t: '宜居' },
      { x: 150, y: 80, c: '#2e7d52', t: '' },
      { x: 220, y: 65, c: '#2e7d52', t: '' },
      { x: 110, y: 115, c: '#d49a26', t: '一般' },
      { x: 190, y: 130, c: '#d49a26', t: '' },
      { x: 260, y: 95, c: '#2e7d52', t: '宜居' },
    ],
  },
];

// 提升建议
export const SUGGESTIONS = [
  '控制晨练音响音量，降低 6–9 时人为噪声峰值',
  '增植灌木与中层植被，提升鸟类隐蔽与筑巢空间',
  '设置低干扰生态廊道，连通破碎绿地',
];

// 历史记录
// 每条携带 analysis 完整快照（回放时优先恢复：物种清单/热力图/波形/指数等随记录变化）。
// 各条 species 清单不同（清晨 9 种全量 / 午后 6 种 / 黄昏以乌鸫·大山雀·喜鹊为主），
// 保证点击不同记录时回放内容不同，而非始终显示"最后一次测量"。
export const HISTORY = [
  {
    id: 1,
    name: '中山公园_晨.wav',
    species: 9,
    score: 68,
    duration: '3:24',
    noise: 34,
    bio: 76,
    sound: 60,
    created_at: '2026-08-05T06:40:00+00:00',
    analysis: buildAnalysis('中山公园_晨.wav', {
      speciesCount: 9,
      species: SPECIES,
      livability: { score: 68, noise: 34, bio: 76, sound: 60 },
    }),
  },
  {
    id: 2,
    name: '滨江绿地_午后.mp3',
    species: 6,
    score: 54,
    duration: '2:10',
    noise: 51,
    bio: 62,
    sound: 45,
    created_at: '2026-07-28T12:10:00+00:00',
    analysis: buildAnalysis('滨江绿地_午后.mp3', {
      speciesCount: 6,
      species: SPECIES.slice(0, 6),
      livability: { score: 54, noise: 51, bio: 62, sound: 45 },
    }),
  },
  {
    id: 3,
    name: '西郊森林公园_黄昏.wav',
    species: 12,
    score: 82,
    duration: '4:05',
    noise: 22,
    bio: 88,
    sound: 74,
    created_at: '2026-07-15T18:30:00+00:00',
    analysis: buildAnalysis('西郊森林公园_黄昏.wav', {
      speciesCount: 12,
      species: [...SPECIES.slice(3), ...SPECIES.slice(0, 3)], // 黄昏物种置前，清单与晨间不同
      livability: { score: 82, noise: 22, bio: 88, sound: 74 },
    }),
  },
];

/**
 * 地区记录演示数据（2 个地区各 1~2 条，detail 为 buildAnalysis 形状的完整 summary 快照）。
 *  - 中山公园 2 条（2026-07-20 / 2026-08-01）→ 趋势折线图有 ≥2 点可比对；
 *  - 滨江绿地 1 条（2026-07-25）→ 演示「至少 2 次测量才能对比趋势」提示。
 * score 字段与 detail.livability.score 保持一致（后端列表接口同样提取）。
 */
export const REGIONS = [
  {
    id: 1,
    name: '中山公园',
    created_at: '2026-07-20T08:00:00+00:00',
    score: 62,
    detail: buildAnalysis('中山公园_晨.wav', {
      speciesCount: 7,
      livability: { score: 62, noise: 41, bio: 70, sound: 55 },
    }),
  },
  {
    id: 2,
    name: '中山公园',
    created_at: '2026-08-01T07:30:00+00:00',
    score: 74,
    detail: buildAnalysis('中山公园_复测.wav', {
      speciesCount: 9,
      livability: { score: 74, noise: 28, bio: 82, sound: 68 },
    }),
  },
  {
    id: 3,
    name: '滨江绿地',
    created_at: '2026-07-25T09:15:00+00:00',
    score: 47,
    detail: buildAnalysis('滨江绿地_午后.mp3', {
      speciesCount: 5,
      livability: { score: 47, noise: 58, bio: 55, sound: 40 },
    }),
  },
];

/**
 * 根据录音名 + 覆盖项构建一份完整分析结果
 * @param {string} name 录音文件名
 * @param {object} overrides 可覆盖 { speciesCount, livability:{...}, recording }
 *
 * 自洽规则（A3）：
 *  - speciesCount 决定 species 清单长度（SPECIES.slice(0, count)），
 *    超过 SPECIES 长度时取全部 9 种，speciesCount 保留请求值（演示"更丰富样地"）。
 *  - livability 合并放在 ...overrides 之后，保证默认字段 bio/sound/grade/gradeEn 不被顶层展开覆盖（A1）。
 */
export function buildAnalysis(name, overrides = {}) {
  // audioFile / threshold 是 buildAnalysis 的控制参数（真实上传链路 apiService 消费），
  // 不进 mock 合并结果，保证 mock 模式下带音频/阈值与不带时输出完全一致。
  const { audioFile, threshold, ...rest } = overrides;
  const count = rest.speciesCount ?? SPECIES.length;
  const merged = {
    recording: name,
    species: count >= SPECIES.length ? SPECIES : SPECIES.slice(0, count),
    indices: INDICES,
    heatmap: HEATMAP,
    mapPoints: MAP_POINTS,
    suggestions: SUGGESTIONS,
    speciesCount: count,
    ...rest,
    // overrides 展开后显式补默认（参照 livability 合并模式）：未覆盖时用演示值，避免 undefined
    waveform: rest.waveform ?? WAVEFORM,
    segmentPoints: rest.segmentPoints ?? SEGMENT_POINTS,
    livability: { ...LIVABILITY, ...(rest.livability || {}) },
  };
  return merged;
}

/**
 * 由历史记录条目构建分析结果
 * @param {object} item HISTORY 中的一条
 * 优先返回 item.analysis 完整快照（回放恢复物种/波形/指数/热力图等）；
 * 旧记录无快照时降级用 buildAnalysis 按汇总字段重建。
 */
export function analysisForHistory(item) {
  if (item && item.analysis && typeof item.analysis === 'object') {
    // 浅拷贝 + 规范化：快照 speciesCount 恒等于 species 清单条数，
    // 避免旧快照 speciesCount≠species.length 时结果页「识别鸟种」与清单不一致（如西郊森林公园 12 vs 9）。
    const snap = { ...item.analysis };
    if (Array.isArray(snap.species)) snap.speciesCount = snap.species.length;
    return snap;
  }
  return buildAnalysis(item.name, {
    speciesCount: item.species,
    livability: { score: item.score, noise: item.noise, bio: item.bio, sound: item.sound },
  });
}

/** mock 本地删除历史记录：HISTORY 常量不可变，此处为纯函数占位（repository 层在内存态实现真实删除） */
export function deleteHistory() {
  // repository.deleteHistory 在 mock 模式走内存态 regionStore 逻辑；
  // 历史删除由 appStore 持有快照，UI 删除后重新拉取列表，无需改动此处静态数据。
  return { ok: true };
}

/**
 * 宜居度 → 文案与等级
 */
export function gradeOf(score) {
  if (score >= 70) return { zh: '宜居', en: 'Good', tone: 'good' };
  if (score >= 50) return { zh: '一般', en: 'Moderate', tone: 'mid' };
  return { zh: '受压', en: 'Stressed', tone: 'bad' };
}

export function livabilityDesc(analysis) {
  const s = analysis.livability.score;
  const n = analysis.livability.noise;
  if (s >= 70) return `生物声丰富、噪声干扰低（占比 ${n}%），绿地适合鸟类安居。`;
  if (s >= 50) return `物种较丰富，但人为噪声（占比 ${n}%）拉低声环境质量，仍有提升空间。`;
  return `人为噪声占比高达 ${n}%，鸟类活动明显受限，建议优先降噪。`;
}
