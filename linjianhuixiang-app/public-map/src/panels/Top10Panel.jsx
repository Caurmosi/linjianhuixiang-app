/**
 * Top10Panel.jsx —— 热门地区 Top10 排行（样本最多 / 评分最高）
 * 数据：调 /api/public/clusters（不带 bbox 全量，最多 500），前端排序取前 10。
 */
import { useEffect, useMemo, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE || 'https://caurmosi.top').replace(/\/+$/, '');

async function fetchTopClusters(filters) {
  const params = new URLSearchParams();
  params.set('limit', '500');
  const region = (filters && filters.region || '').trim();
  if (region) params.set('region', region);
  if (filters && Number.isFinite(Number(filters.minScore))) params.set('minScore', String(Number(filters.minScore)));
  if (filters && Number.isFinite(Number(filters.maxScore))) params.set('maxScore', String(Number(filters.maxScore)));
  const res = await fetch(`${API_BASE}/api/public/clusters?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.clusters) ? data.clusters : [];
}

function scoreColor(score) {
  if (score >= 70) return '#2e7d52';
  if (score >= 50) return '#d49a26';
  return '#c25a39';
}

export default function Top10Panel({ filters, onPick, onClose }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('samples'); // samples | score

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const clusters = await fetchTopClusters(filters);
        if (!alive) return;
        setList(clusters);
      } catch (e) {
        if (!alive) return;
        setErr('排行加载失败，请稍后重试');
      }
    })();
    return () => { alive = false; };
  }, [filters]);

  const top = useMemo(() => {
    if (!list) return [];
    const sorted = [...list];
    if (tab === 'samples') sorted.sort((a, b) => b.n - a.n || b.score - a.score);
    else sorted.sort((a, b) => b.score - a.score || b.n - a.n);
    return sorted.slice(0, 10);
  }, [list, tab]);

  return (
    <div className="ljx-panel ljx-panel-top">
      <div className="ljx-panel-head">
        <h2>热门地区 Top10</h2>
        <span className="ljx-panel-count">{list ? `${list.length} 个地区` : '加载中…'}</span>
        <button type="button" className="ljx-panel-close" onClick={onClose} title="关闭">×</button>
      </div>
      <div className="ljx-top-tabs">
        <button type="button" className={tab === 'samples' ? 'on' : ''} onClick={() => setTab('samples')}>样本最多</button>
        <button type="button" className={tab === 'score' ? 'on' : ''} onClick={() => setTab('score')}>评分最高</button>
      </div>
      {err && <div className="ljx-modal-err ljx-top-err">{err}</div>}
      {!err && !list && <div className="ljx-panel-hint">加载中…</div>}
      {!err && list && top.length === 0 && (
        <div className="ljx-panel-empty">暂无公开数据，快去 App 上传第一条吧</div>
      )}
      {!err && top.length > 0 && (
        <div className="ljx-top-list">
          {top.map((c, i) => (
            <button
              type="button"
              key={c.id}
              className="ljx-top-row"
              onClick={() => onPick({ lng: c.lng, lat: c.lat, regionName: c.regionName })}
            >
              <span className={`ljx-top-rank${i < 3 ? ' hot' : ''}`}>{i + 1}</span>
              <span className="ljx-top-name">{c.regionName}</span>
              {tab === 'samples' ? (
                <span className="ljx-top-stat">样本 {c.n}</span>
              ) : (
                <span className="ljx-top-score" style={{ color: scoreColor(c.score) }}>{c.score}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
