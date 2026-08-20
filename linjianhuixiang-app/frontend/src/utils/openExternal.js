/**
 * openExternal.js —— 打开外部链接（公共地图网页等）
 *
 * 优先走原生 JS 桥（Android 系统浏览器打开，避免 WebView 内嵌套跳转），
 * 无桥环境降级：新窗口打开 → 当前页跳转。
 */

/**
 * 公共地图网页入口。
 *
 * 为什么是 CloudStudio 而非 caurmosi.top：
 *  - caurmosi.top 尚未 ICP 备案 → 国内手机网络（尤其移动数据）直接访问域名主页会被运营商/浏览器拦截，
 *    但该域名的 API（https://caurmosi.top/api/*）多数网络可通；
 *  - CloudStudio 域名（app.workbuddy.link）已备案、手机可正常打开，且其网页 API_BASE 已指向 caurmosi.top，
 *    即：手机打开 CloudStudio 页面 = 看到阿里云最新数据。
 *  - ICP 备案通过后，再改回 https://caurmosi.top（见 Git 注释）。
 */
export const PUBLIC_MAP_URL = 'https://9b6e1c8c9443446abd1f865dcc782ebb.app.workbuddy.link';

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
