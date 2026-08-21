/**
 * jpg-stub.mjs —— node --test 测试环境专用的 .jpg import stub
 *
 * 背景：birdImageLoader.js 显式 import 122 张鸟图（`import m1 from '...jpg?url'`）。
 * 浏览器打包时由 Vite 处理成资源 URL；但 node --test 的 ESM loader 不认识 .jpg，
 * 会抛 ERR_UNKNOWN_FILE_EXTENSION。
 *
 * 方案：本 loader 把 .jpg 请求解析为空模块（导出空字符串 URL stub），
 * 让纯数据测试（buildShareCardData / gradeColor 等）能在 node 下运行。
 * 图片加载逻辑本身在浏览器里跑，不受影响。
 */
export async function load(url, context, nextLoad) {
  const cleanUrl = url.split('?')[0];
  if (cleanUrl.endsWith('.jpg')) {
    return {
      format: 'module',
      source: 'export default "";', // stub URL：测试只跑数据逻辑，不真正画图
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
