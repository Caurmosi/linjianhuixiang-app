/**
 * shareCard.js —— 分享卡片渲染（统一入口）
 *
 * 历史教训（2026-08-21）：这里原本是一套独立的「明信片拼贴」渲染函数，
 * 自带 drawPolaroidBird → drawBirdBadge 卡通兜底。结果：
 *  - share() 用的这份代码画的是卡通鸟
 *  - CardEditor 用 cardElements.js 画的是真实照片
 * 两套渲染不一致，导致"外面还是卡通、里面是真图"的 bug。
 *
 * 修复：drawShareCard 直接委托 cardElements.js 的 buildDefaultTree +
 * renderTreeToCanvas（同一套渲染逻辑），彻底删掉本文件内的卡通绘制代码。
 * 真实照片找不到时由 renderPolaroid 显示「该鸟暂未收录图鉴」占位（绝不画卡通）。
 */
import { buildDefaultTree, renderTreeToCanvas } from './cardElements.js';

export const CARD_W = 720;
export const CARD_H = 960;

export function gradeColor(score) {
  if (score >= 70) return '#2e7d52';
  if (score >= 50) return '#d49a26';
  return '#c0392b';
}

/** 兼容旧 API：buildShareCardData 纯函数（单测用）—— 委托 cardElements */
export { buildShareCardData } from './cardElements.js';

/**
 * 生成分享卡片 PNG
 * @param {object} analysis 分析快照
 * @param {{width?:number,height?:number}} opts
 * @returns {{canvas:HTMLCanvasElement, dataUrl:string}}
 */
export function drawShareCard(analysis, { width = CARD_W, height = CARD_H } = {}) {
  const tree = buildDefaultTree(analysis);
  return renderTreeToCanvas(tree, width / CARD_W);
}
