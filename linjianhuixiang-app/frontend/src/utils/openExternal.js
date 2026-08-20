/**
 * openExternal.js —— 打开公共地图网页
 *
 * 策略：直接在 WebView 内嵌加载（与微信同内核，绕开系统浏览器对部分域名的拦截）。
 * 不再跳系统浏览器——国内手机默认浏览器会拦截未备案/部分第三方域名（如 caurmosi.top 未备案被拦），
 * 而内嵌 WebView 与微信 X5 内核同源，微信能打开的内嵌就能打开。
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
 * 打开外部 URL（默认公共地图）：WebView 内嵌导航。
 * @param {string} url 目标链接（默认公共地图）
 * @returns {boolean} 是否成功发起打开
 */
export function openExternal(url = PUBLIC_MAP_URL) {
  if (typeof window !== 'undefined') {
    // 内嵌导航：WebView 内直接加载（shouldOverrideUrlLoading 已配置为内嵌加载）
    window.location.href = url;
    return true;
  }
  return false;
}
