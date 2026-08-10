/**
 * recorder.js
 * 录音工具（C）：dataUrl→Blob、getUserMedia 错误文案、Web MediaRecorder 启停封装。
 *
 * 策略：真机优先走原生桥（window.AndroidBridge.startNativeRecord / stopNativeRecord），
 * 浏览器 / 无桥环境降级 getUserMedia + MediaRecorder（长按录音由组件控制 start / stop）。
 */

/** dataUrl → Blob：优先 fetch；失败则手动 atob 构造（兼容老 WebView 拦截 data: fetch） */
export async function dataUrlToBlob(dataUrl) {
  try {
    const resp = await fetch(dataUrl);
    if (resp.ok) return await resp.blob();
  } catch (e) {
    // 落到 atob 兜底
  }
  const comma = dataUrl.indexOf(',');
  const meta = /^data:([^;]*)(?:;base64)?$/i.exec(dataUrl.slice(0, comma));
  const mime = meta && meta[1] ? meta[1] : 'audio/mp4';
  const bin = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** getUserMedia 失败原因细化（不吞掉具体原因） */
export function getUserMediaErrorText(err) {
  const name = err && err.name ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
      return '未获得麦克风权限，请在系统设置中允许';
    case 'NotFoundError':
      return '未找到麦克风设备';
    case 'NotReadableError':
      return '麦克风被占用';
    default:
      return `无法获取麦克风权限（${name || '未知错误'}）`;
  }
}

/**
 * 启动浏览器降级录音（getUserMedia + MediaRecorder）。
 * @returns {Promise<{ recorder, stream, stop: () => Promise<File|null> }>}
 *   stop() 收尾 chunks 并返回 File；无有效音频数据返回 null。
 * @throws 浏览器不支持 / 未获得麦克风权限等（原因可经 getUserMediaErrorText 展示）
 */
export async function startWebMediaRecorder() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('当前浏览器不支持实时录音');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const options =
    typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('audio/webm')
      ? { mimeType: 'audio/webm' }
      : {};
  const recorder = new MediaRecorder(stream, options);
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();
  return {
    recorder,
    stream,
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const mimeType = recorder.mimeType || 'audio/webm';
          const blob = chunks.length > 0 ? new Blob(chunks, { type: mimeType }) : null;
          resolve(blob ? new File([blob], `实时录音_${Date.now()}.webm`, { type: mimeType }) : null);
        };
        if (recorder.state !== 'inactive') recorder.stop();
      }),
  };
}
