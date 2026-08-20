/* ===================== CSV 导出工具 =====================
 * 供公共地图「导出 CSV」使用：聚合点数据 → 可被 Excel 直接打开、
 * MATLAB readtable 直接读取的标准 CSV（UTF-8 BOM，中文不乱码）。
 */

/** 通用 CSV 转义：值含逗号/引号/换行时加双引号包裹，内部引号双写 */
export function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * 对象数组 → CSV 文本。
 * @param {Array<object>} rows 数据行
 * @param {Array<{key: string, label: string}>} columns 列定义（label 为表头）
 * @returns {string} 以 BOM(\uFEFF) 开头、\r\n 换行的 CSV 全文
 */
export function toCsv(rows, columns) {
  const head = columns.map((c) => c.label).join(',');
  const lines = rows.map((r) => columns.map((c) => csvEscape(r[c.key])).join(','));
  return '\uFEFF' + [head, ...lines].join('\r\n') + '\r\n';
}

/** 触发浏览器下载（Blob + 临时 <a>，自动回收 URL） */
export function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
