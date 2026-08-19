/**
 * ReportPanel.jsx —— 地区生态简报（大模型/模板生成，Markdown 轻渲染）
 */
import { useEffect, useState } from 'react';

/** 轻量 Markdown → HTML（仅支持简报用到的子集：# 标题、- 列表、**加粗**、引用 >） */
function mdToHtml(md) {
  if (!md) return '';
  const esc = String(md)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const lines = esc.split('\n');
  const html = [];
  let inList = false;
  const closeList = () => {
    if (inList) { html.push('</ul>'); inList = false; }
  };
  lines.forEach((line) => {
    const t = line.trim();
    if (!t) { closeList(); return; }
    if (t.startsWith('### ')) { closeList(); html.push(`<h4>${t.slice(4)}</h4>`); return; }
    if (t.startsWith('## ')) { closeList(); html.push(`<h3>${t.slice(3)}</h3>`); return; }
    if (t.startsWith('# ')) { closeList(); html.push(`<h3>${t.slice(2)}</h3>`); return; }
    if (t.startsWith('> ')) { closeList(); html.push(`<p class="ljx-report-quote">${t.slice(2)}</p>`); return; }
    if (t.startsWith('- ') || t.startsWith('* ')) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${inline(t.slice(2))}</li>`);
      return;
    }
    closeList();
    html.push(`<p>${inline(t)}</p>`);
  });
  closeList();
  return html.join('');
}

function inline(text) {
  return String(text).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

export default function ReportPanel({ regionName, clusterId, reportApi, onClose }) {
  const [report, setReport] = useState(null);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await reportApi(clusterId);
        if (!alive) return;
        setReport(data.report || '');
        setSource(data.source || '');
      } catch (e) {
        if (!alive) return;
        setErr((e && e.error) || '简报生成失败，请稍后重试');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [clusterId, reportApi]);

  return (
    <div className="ljx-panel ljx-panel-report">
      <div className="ljx-panel-head">
        <h2>生态简报 · {regionName}</h2>
        <span className="ljx-panel-count">{source === 'llm' ? 'AI 生成' : '自动生成'}</span>
        <button type="button" className="ljx-panel-close" onClick={onClose} title="关闭">×</button>
      </div>
      {loading && <div className="ljx-panel-hint">正在生成简报…（AI 模式约需数秒）</div>}
      {!loading && err && <div className="ljx-modal-err">{err}</div>}
      {!loading && !err && (
        <div
          className="ljx-report-body"
          dangerouslySetInnerHTML={{ __html: mdToHtml(report) }}
        />
      )}
    </div>
  );
}
