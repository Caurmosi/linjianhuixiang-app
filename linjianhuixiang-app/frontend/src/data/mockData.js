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

// 空间分布样点（默认绿地 = 中山公园）
export const MAP_POINTS = [
  { x: 70, y: 55, c: '#2e7d52', t: '宜居' },
  { x: 140, y: 80, c: '#2e7d52', t: '' },
  { x: 200, y: 100, c: '#d49a26', t: '一般' },
  { x: 105, y: 120, c: '#d49a26', t: '' },
  { x: 250, y: 90, c: '#c25a39', t: '受压' },
  { x: 175, y: 55, c: '#2e7d52', t: '' },
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
export const HISTORY = [
  { id: 1, name: '中山公园_晨.wav', species: 9, score: 68, duration: '3:24', noise: 34, bio: 76, sound: 60 },
  { id: 2, name: '滨江绿地_午后.mp3', species: 6, score: 54, duration: '2:10', noise: 51, bio: 62, sound: 45 },
  { id: 3, name: '西郊森林公园_黄昏.wav', species: 12, score: 82, duration: '4:05', noise: 22, bio: 88, sound: 74 },
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
  const count = overrides.speciesCount ?? SPECIES.length;
  const merged = {
    recording: name,
    species: count >= SPECIES.length ? SPECIES : SPECIES.slice(0, count),
    indices: INDICES,
    heatmap: HEATMAP,
    mapPoints: MAP_POINTS,
    suggestions: SUGGESTIONS,
    speciesCount: count,
    ...overrides,
    livability: { ...LIVABILITY, ...(overrides.livability || {}) },
  };
  return merged;
}

/**
 * 由历史记录条目构建分析结果
 * @param {object} item HISTORY 中的一条
 */
export function analysisForHistory(item) {
  return buildAnalysis(item.name, {
    speciesCount: item.species,
    livability: { score: item.score, noise: item.noise, bio: item.bio, sound: item.sound },
  });
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
