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
 *  - segments 各段录音信息清单（name/score/from/hasGps），供 MapPicker 底部「导入录音」列表与手动选点；
 *  - waveform 取最长录音的波形（拼接成本高且价值有限，取最长一段并注释说明重合度取舍）；
 *  - durationSec 为各段时长之和（各段 analysis.durationSec 由录音界面注入，缺失按 0 计）。
 */
import { gradeOf, confidenceLabelOf } from '../data/repository.js';
import { wgs84ToGcj02 } from '../components/map/mapUtils.js';

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
    // 兜底：pcts 为空且 idx.pct 缺失 / 非数字时回退 0，杜绝 toFixed 对 undefined 抛错
    const fallback = Number.isFinite(Number(idx && idx.pct)) ? Number(idx.pct) : 0;
    const avgPct = pcts.length > 0 ? pcts.reduce((x, y) => x + y, 0) / pcts.length : fallback;
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
 * 各段 GPS 坐标 → 真实地图标点（summary.map.points）。
 * 仅并入带合法 lng/lat 的段（无坐标的段留空，由 MapPicker 手动选点补充）。
 * GPS 点（from==='gps'）做 WGS84 → GCJ-02 火星坐标纠偏（Android 定位桥返回 WGS84，
 * 高德瓦片为 GCJ-02，直接混用偏移数百米）；手动点本身已是 GCJ-02，不转。
 * 标点 shape：{lng, lat, name, score, from:'gps'|'manual'}（与地图数据契约一致）。
 */
function buildMapPointsGeo(analyses) {
  const points = [];
  analyses.forEach((a, i) => {
    let lng = Number(a && a.lng);
    let lat = Number(a && a.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return; // 无坐标段留空
    if (a && a.from === 'gps') {
      const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
      if (Number.isFinite(gcjLng) && Number.isFinite(gcjLat)) {
        lng = gcjLng;
        lat = gcjLat;
      }
    }
    points.push({
      lng,
      lat,
      name: `第${i + 1}段`,
      score: a && a.livability && typeof a.livability.score === 'number' ? a.livability.score : 50,
      from: a && a.from === 'gps' ? 'gps' : 'manual',
    });
  });
  return points;
}

/**
 * 各段录音信息清单（MapPicker 底部「导入录音」列表数据源）。
 * 每段 {name: 录音文件名, score: 该段宜居度, from, hasGps}；
 * 无坐标段 hasGps=false，由 MapPicker 手动选点补齐。
 */
function buildSegments(analyses) {
  return analyses.map((a, i) => {
    const lng = Number(a && a.lng);
    const lat = Number(a && a.lat);
    const score = a && a.livability && typeof a.livability.score === 'number' ? a.livability.score : 50;
    return {
      name: a && typeof a.recording === 'string' && a.recording ? a.recording : `第${i + 1}段`,
      score,
      from: a && a.from === 'gps' ? 'gps' : 'manual',
      hasGps: Number.isFinite(lng) && Number.isFinite(lat),
    };
  });
}

/** 安全读取 analysis.livability（判对象；缺失/非对象返回 {}，不抛） */
function livabilityOf(a) {
  return a && a.livability && typeof a.livability === 'object' && !Array.isArray(a.livability)
    ? a.livability
    : {};
}

/**
 * 综合置信度：各段 confidence 按 durationSec 加权平均（round 2），档位同阈值。
 *  - 仅「有 confidence 的段」参与平均，旧数据（无 confidence）段忽略；
 *  - 各段 durationSec 缺失/非正时权重为 0，全部为 0 则退化为简单平均；
 *  - 空数组 / 全部段无 confidence：无输入质量信号可依，回退保守安全值 0.3/'低'。
 */
function aggregateConfidence(analyses) {
  const parts = analyses
    .map((a) => {
      const lv = livabilityOf(a);
      return { conf: lv.confidence, dur: Number(a && a.durationSec) || 0 };
    })
    .filter((p) => typeof p.conf === 'number' && Number.isFinite(p.conf));
  if (parts.length === 0) {
    // 全缺 confidence（旧数据）或空输入 → 保守安全值（注释见上）
    return { confidence: 0.3, confidenceLabel: '低' };
  }
  const totalWeight = parts.reduce((s, p) => s + Math.max(0, p.dur), 0);
  const confidence =
    totalWeight > 0
      ? parts.reduce((s, p) => s + p.conf * Math.max(0, p.dur), 0) / totalWeight
      : mean(parts.map((p) => p.conf));
  const rounded = Number(confidence.toFixed(2));
  return { confidence: rounded, confidenceLabel: confidenceLabelOf(rounded) };
}

/** 最小安全摘要（空输入 / 聚合过程异常时返回，绝不抛错、保证地图综合页可渲染） */
function emptySummary(n) {
  return {
    recording: `本区域 ${n} 段录音综合`,
    speciesCount: 0,
    species: [],
    indices: [],
    livability: {
      score: 0,
      grade: '受压',
      gradeEn: 'Stressed',
      noise: 0,
      bio: 0,
      sound: 0,
      confidence: 0.3,
      confidenceLabel: '低',
    },
    heatmap: Array.from({ length: 4 }, () => Array(12).fill(0)),
    mapPoints: [],
    segments: [],
    map: null,
    waveform: [],
    durationSec: 0,
  };
}

/**
 * 多录音聚合（D）
 * @param {Array<object>} analyses 多个完整 analysis（buildAnalysis 输出形态）
 * @returns {object} 综合摘要；空数组 / 非数组 / 单项异常 / 字段残缺时均返回安全摘要，绝不抛错。
 *
 * 守卫策略（加固点）：
 *  - 入口先过滤「非对象 / 数组」项（单项异常 → 跳过该项，不中断聚合）；
 *  - species/indices/livability/heatmap/waveform/segmentPoints/mapPoints/durationSec
 *    访问前一律 Array.isArray / typeof 判空，缺失字段按零值计；
 *  - 最外层 try/catch：任何意外（含新增字段访问）都不上抛，回退最小安全摘要。
 * 输出结构 / 数据契约与既有 batchSummary 完全一致。
 */
export function aggregateAnalyses(analyses) {
  // 单项异常过滤：非对象（null/undefined/字符串/数字/数组）一律跳过
  const list = Array.isArray(analyses)
    ? analyses.filter((a) => a && typeof a === 'object' && !Array.isArray(a))
    : [];
  const n = list.length;
  if (n === 0) return emptySummary(n);

  try {
    const summary = emptySummary(n);

    // 物种：合并去重，按出现次数降序
    const species = mergeSpecies(list);
    summary.species = species;
    summary.speciesCount = species.length;

    // 宜居度：各段平均，grade 由平均 score 推导；confidence 按 durationSec 加权平均
    const score = Math.round(mean(list.map((a) => livabilityOf(a).score)));
    const noise = Math.round(mean(list.map((a) => livabilityOf(a).noise)));
    const bio = Math.round(mean(list.map((a) => livabilityOf(a).bio)));
    const sound = Math.round(mean(list.map((a) => livabilityOf(a).sound)));
    const g = gradeOf(score);
    const { confidence, confidenceLabel } = aggregateConfidence(list);
    summary.livability = { score, noise, bio, sound, grade: g.zh, gradeEn: g.en, confidence, confidenceLabel };

    // 声学指数平均
    summary.indices = averageIndices(list);

    // 空间样点：每段一个
    summary.mapPoints = buildMapPoints(list);

    // 各段录音信息（名称/宜居度/定位状态），供 MapPicker 手动选点列表
    summary.segments = buildSegments(list);

    // 真实地图：各段 GPS 坐标并入 summary.map.points（无坐标 → map 为 null，地图页引导手动选点）
    const geoPoints = buildMapPointsGeo(list);
    summary.map =
      geoPoints.length > 0
        ? { center: [geoPoints[0].lng, geoPoints[0].lat], zoom: 13, bounds: null, points: geoPoints }
        : null;

    // 热力图：逐格平均（缺失 → 零矩阵）
    summary.heatmap = averageHeatmap(list);

    // 波形：取最长录音的波形（重合度取舍说明：多段拼接在视觉上等同加权平均，
    // 直接取时长最长一段作代表，避免 N 段不同长度波形混排失真）
    const longest = list
      .map((a, i) => ({ a, i, len: Array.isArray(a && a.waveform) ? a.waveform.length : 0 }))
      .sort((x, y) => y.len - x.len)[0];
    if (longest && longest.len > 0 && Array.isArray(longest.a.waveform)) {
      summary.waveform = longest.a.waveform;
    }

    // 时长：各段之和（缺 durationSec / 非数字按 0 计）
    summary.durationSec = Math.round(list.reduce((sum, a) => sum + (Number(a && a.durationSec) || 0), 0));

    return summary;
  } catch (err) {
    // 聚合过程任何意外都不上抛（reducer / dispatch 抛错会卸载 React 树 → 白屏），
    // 回退最小安全摘要，保地图综合页可渲染
    return emptySummary(n);
  }
}
