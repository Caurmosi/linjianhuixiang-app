/**
 * dates.js —— 日期格式化小工具
 * 后端/mock 的 created_at 均为 ISO 8601（如 2026-08-01T08:00:00+00:00）。
 * 需求明确「UTC 转本地可简单取前 10 位」，故直接截取 YYYY-MM-DD，避免时区偏移导致的日期跳动。
 */

/** ISO 日期字符串 → YYYY-MM-DD（取前 10 位；无效返回空串） */
export function formatISODate(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const m = String(iso).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}

/** ISO 日期字符串 → MM-DD（趋势折线图 x 轴紧凑标签；无效返回空串） */
export function formatShortISODate(iso) {
  const d = formatISODate(iso);
  return d ? d.slice(5) : '';
}
