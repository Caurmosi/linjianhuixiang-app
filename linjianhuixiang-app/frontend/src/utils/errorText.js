/**
 * errorText.js
 * 用户可见错误文案工具：把后端/网络错误原因转成适合 Toast 展示的文本。
 */

/**
 * 把内部错误原因转成用户友好的展示文本：
 *  - 空值兜底「未知错误」；
 *  - 去掉 request() 追加的内部调试后缀「（函数名）」（如「…（buildAnalysis）」），
 *    仅匹配 ASCII 函数名形态，避免误伤后端返回的中文括号/URL（如「（网络不可达）」「（https://ffmpeg.org）」）；
 *  - 后端业务 detail（ffmpeg 缺失、格式不支持等）原样透传，让用户看到真实原因。
 */
export function humanizeBackendError(reason) {
  if (!reason) return '未知错误';
  return String(reason).replace(/\s*（[A-Za-z_$][\w$]*）\s*$/u, '');
}
