/**
 * openExternal.js —— 打开外部链接（公共地图网页等）
 *
 * 优先走原生 JS 桥（Android 系统浏览器打开，避免 WebView 内嵌套跳转），
 * 无桥环境降级：新窗口打开 → 当前页跳转。
 */

/** 公共地图网页（阿里云 nginx 自托管，与后端同域 https://caurmosi.top） */
export const PUBLIC_MAP_URL = 'https://caurmosi.top';

/**
 * 打开外部 URL。
 * @param {string} url 目标链接（默认公共地图）
 * @returns {boolean} 是否成功发起打开
 */
export function openExternal(url = PUBLIC_MAP_URL) {
  const bridge = typeof window !== 'undefined' && window.AndroidBridge;
  if (bridge && typeof bridge.openExternal === 'function') {
    try {
      bridge.openExternal(url);
      return true;
    } catch (e) {
      // 桥调用异常，降级处理
    }
  }
  if (typeof window !== 'undefined') {
    const win = window.open(url, '_blank');
    if (win) return true;
    window.location.href = url;
    return true;
  }
  return false;
}
