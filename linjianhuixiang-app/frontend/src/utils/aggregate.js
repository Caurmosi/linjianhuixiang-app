/**
 * aggregate.js
 * 多录音综合聚合（D）：把多个完整 analysis（各段/各文件）聚合成一份综合摘要，
 * 顶层结构尽量与单 analysis 对齐（species/livability/indices/heatmap/mapPoints/waveform/
 * speciesCount/recording/durationSec），供地图综合页等现有屏幕直接消费。
 *
 * 约定：
 *  - species 按 name 合并去重，输出 {name, latin, count(出现次数), maxConf, freq(总频次), period}，按 count 降序；
 *  - livability 各项取平均，grade/gradeEn 由平均 score 推导；
 *  - indices 四个指数取平均，格式与单 analysis.indices 一致（key/name/display/pct/desc）；
 *  - heatmap 逐格平均（4×12）；
 *  - mapPoints 每段一个样点：x/y 在 50~285 / 30~150 均匀分布，c 按该段宜居度等级，t 仅奇数段标「第N段」；
 *  - waveform 取最长录音的波形（拼接成本高且价值有限，取最长一段并注释说明重合度取舍）；
 *  - durationSec 为各段时长之和（各段 analysis.durationSec 由录音界面注入，缺失按 0 计）。
 */
import { gradeOf } from '../data/repository.js';

/** 每个样点的宜居度等级色（与 MapScreen / gradeOf 一致） */
const COLOR = { good: '#2e7d52', mid: '#d49a26', bad: '#c25a39' };

/** 数值平均值（空数组返回 0） */
function mean(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** 求若干 analysis 的逐格热力图平均（按第一份的形状 4×12；缺行/缺格按 0 补） */
function averageHeatmap(analyses) {
  const ROWS = 4;
  const COLS = 12;
  const sum = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  let count = 0;
  for (const a of analyses) {
    const h = a && Array.isArray(a.heatmap) ? a.heatmap : [];
    if (h.length === 0) continue;
    count += 1;
    for (let r = 0; r < ROWS; r++) {
      const row = h[r] || [];
      for (let c = 0; c < COLS; c++) {
        const v = row[c];
        if (typeof v === 'number' && Number.isFinite(v)) sum[r][c] += v;
      }
    }
  }
  if (count === 0) return sum; // 全缺热力图时返回零矩阵（守卫不崩）
  return sum.map((row) => row.map((v) => Number((v / count).toFixed(3))));
}

/** 合并去重物种（按 name），每项 {name, latin, count, maxConf, freq, period} */
function mergeSpecies(analyses) {
  const map = new Map();
  for (const a of analyses) {
    const species = a && Array.isArray(a.species) ? a.species : [];
    for (const s of species) {
      if (!s || !s.name) continue;
      const cur = map.get(s.name);
      if (!cur) {
        map.set(s.name, {
          name: s.name,
          latin: s.latin || '',
          count: 1,
          maxConf: typeof s.conf === 'number' ? s.conf : typeof s.maxConf === 'number' ? s.maxConf : 0,
          freq: typeof s.freq === 'number' ? s.freq : 0,
          period: s.period || '全天',
        });
      } else {
        const conf = typeof s.conf === 'number' ? s.conf : typeof s.maxConf === 'number' ? s.maxConf : 0;
        cur.count += 1;
        if (conf > cur.maxConf) {
          cur.maxConf = conf;
          cur.period = s.period || cur.period;
        }
        cur.freq += typeof s.freq === 'number' ? s.freq : 0;
      }
    }
  }
  return [...map.values()].sort((x, y) => y.count - x.count || y.maxConf - x.maxConf);
}

/** 四个声学指数取平均，格式对齐单 analysis.indices（key/name/display/pct/desc） */
function averageIndices(analyses) {
  const first = analyses.find((a) => a && Array.isArray(a.indices) && a.indices.length > 0);
  if (!first) return [];
  return first.indices.map((idx) => {
    const pcts = analyses
      .filter((a) => Array.isArray(a.indices))
      .map((a) => {
        const same = a.indices.find((i) => i && i.key === idx.key);
        return same && typeof same.pct === 'number' ? same.pct : null;
      })
      .filter((v) => v != null);
    const avgPct = pcts.length > 0 ? pcts.reduce((x, y) => x + y, 0) / pcts.length : idx.pct;
    return {
      key: idx.key,
      name: idx.name,
      display: String(Number(avgPct.toFixed(1))),
      pct: Math.round(avgPct),
      desc: idx.desc,
    };
  });
}

/** 每段录音一个样点：x/y 在 50~285 / 30~150 均匀分布（按索引），颜色按该段宜居度等级 */
function buildMapPoints(analyses) {
  const n = analyses.length;
  if (n === 0) return [];
  return analyses.map((a, i) => {
    const x = n === 1 ? 167 : Math.round(50 + (i / (n - 1)) * (285 - 50));
    const y = n === 1 ? 90 : Math.round(30 + (i / (n - 1)) * (150 - 30));
    const score = a && a.livability && typeof a.livability.score === 'number' ? a.livability.score : 0;
    const tone = gradeOf(score).tone;
    // 简洁标注：仅奇数段标「第N段」（1 段时不标，避免与已有图例重复）
    const t = i % 2 === 0 ? `第${i + 1}段` : '';
    return { x, y, c: COLOR[tone] || COLOR.mid, t };
  });
}

/**
 * 多录音聚合（D）
 * @param {Array<object>} analyses 多个完整 analysis（buildAnalysis 输出形态）
 * @returns {object} 综合摘要；空数组返回一份「零值」摘要（守卫，不抛错）
 */
export function aggregateAnalyses(analyses) {
  const list = Array.isArray(analyses) ? analyses.filter(Boolean) : [];
  const n = list.length;
  const summary = {
    recording: `本区域 ${n} 段录音综合`,
    speciesCount: 0,
    species: [],
    indices: [],
    livability: { score: 0, grade: '受压', gradeEn: 'Stressed', noise: 0, bio: 0, sound: 0 },
    heatmap: averageHeatmap(list),
    mapPoints: [],
    waveform: [],
    durationSec: 0,
  };
  if (n === 0) return summary;

  // 物种：合并去重，按出现次数降序
  const species = mergeSpecies(list);
  summary.species = species;
  summary.speciesCount = species.length;

  // 宜居度：各段平均，grade 由平均 score 推导
  const score = Math.round(mean(list.map((a) => a && a.livability && a.livability.score)));
  const noise = Math.round(mean(list.map((a) => a && a.livability && a.livability.noise)));
  const bio = Math.round(mean(list.map((a) => a && a.livability && a.livability.bio)));
  const sound = Math.round(mean(list.map((a) => a && a.livability && a.livability.sound)));
  const g = gradeOf(score);
  summary.livability = { score, noise, bio, sound, grade: g.zh, gradeEn: g.en };

  // 声学指数平均
  summary.indices = averageIndices(list);

  // 空间样点：每段一个
  summary.mapPoints = buildMapPoints(list);

  // 波形：取最长录音的波形（重合度取舍说明：多段拼接在视觉上等同加权平均，
  // 直接取时长最长一段作代表，避免 N 段不同长度波形混排失真）
  const longest = list
    .map((a, i) => ({ a, i, len: Array.isArray(a && a.waveform) ? a.waveform.length : 0 }))
    .sort((x, y) => y.len - x.len)[0];
  if (longest && longest.len > 0) summary.waveform = longest.a.waveform;

  // 时长：各段之和
  summary.durationSec = Math.round(list.reduce((sum, a) => sum + (Number(a && a.durationSec) || 0), 0));

  return summary;
}
