/**
 * StatsPanel.jsx —— 城市生态数据看板（总样本/活跃用户/物种Top/地区Top/档位分布）
 * 数据：GET /api/public/stats（匿名只读）。
 */
import { useEffect, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE || 'https://caurmosi.top').replace(/\/+$/, '');

async function fetchStats() {
  const res = await fetch(`${API_BASE}/api/public/stats`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function scoreColor(score) {
  if (score >= 70) return '#2e7d52';
  if (score >= 50) return '#d49a26';
  return '#c25a39';
}

export default function StatsPanel({ onClose }) {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await fetchStats();
        if (!alive) return;
        setStats(d);
      } catch (e) {
        if (!alive) return;
        setErr('看板加载失败，请稍后重试');
      }
    })();
    return () => { alive = false; };
  }, []);

  const maxSpecies = stats && stats.speciesTop && stats.speciesTop.length
    ? Math.max(...stats.speciesTop.map((s) => s.count))
    : 1;
  const maxRegion = stats && stats.regionTop && stats.regionTop.length
    ? Math.max(...stats.regionTop.map((r) => r.count))
    : 1;

  return (
    <div className="ljx-panel ljx-panel-stats">
      <div className="ljx-panel-head">
        <h2>城市生态数据看板</h2>
        <span className="ljx-panel-count">全城公开数据</span>
        <button type="button" className="ljx-panel-close" onClick={onClose} title="关闭">×</button>
      </div>

      {err && <div className="ljx-modal-err ljx-top-err">{err}</div>}
      {!err && !stats && <div className="ljx-panel-hint">加载中…</div>}

      {stats && (
        <div className="ljx-stats-body">
          {/* 核心指标 */}
          <div className="ljx-stats-cards">
            <div className="ljx-stat-card">
              <div className="ljx-stat-num">{stats.totalSamples}</div>
              <div className="ljx-stat-label">总样本数</div>
            </div>
            <div className="ljx-stat-card">
              <div className="ljx-stat-num">{stats.totalClusters}</div>
              <div className="ljx-stat-label">覆盖地区</div>
            </div>
            <div className="ljx-stat-card">
              <div className="ljx-stat-num">{stats.activeUsers}</div>
              <div className="ljx-stat-label">活跃用户</div>
            </div>
            <div className="ljx-stat-card">
              <div className="ljx-stat-num">{stats.totalSpecies}</div>
              <div className="ljx-stat-label">识别鸟种</div>
            </div>
          </div>

          {/* 宜居度均分 + 档位分布 */}
          <div className="ljx-stats-section">
            <div className="ljx-stats-title">
              宜居度加权均分
              <span className="ljx-stats-score" style={{ color: scoreColor(stats.scoreAvg) }}>{stats.scoreAvg}</span>
            </div>
            <div className="ljx-stats-buckets">
              {[
                { key: 'stressed', label: '受压 (<50)', color: '#c25a39' },
                { key: 'moderate', label: '一般 (50-69)', color: '#d49a26' },
                { key: 'livable', label: '宜居 (≥70)', color: '#2e7d52' },
              ].map((b) => (
                <div key={b.key} className="ljx-bucket-row">
                  <span className="ljx-bucket-label" style={{ color: b.color }}>{b.label}</span>
                  <div className="ljx-bucket-bar">
                    <div
                      className="ljx-bucket-fill"
                      style={{ width: `${stats.totalSamples ? (stats.buckets[b.key] / stats.totalSamples) * 100 : 0}%`, background: b.color }}
                    />
                  </div>
                  <span className="ljx-bucket-num">{stats.buckets[b.key]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 物种 Top */}
          <div className="ljx-stats-section">
            <div className="ljx-stats-title">常见鸟种 Top</div>
            {stats.speciesTop.length === 0 ? (
              <div className="ljx-panel-empty">暂无物种数据，快去 App 上传第一条吧</div>
            ) : (
              stats.speciesTop.map((s, i) => (
                <div key={s.name} className="ljx-rank-row">
                  <span className="ljx-top-rank">{i + 1}</span>
                  <span className="ljx-top-name">{s.name}</span>
                  <div className="ljx-rank-bar">
                    <div className="ljx-rank-fill" style={{ width: `${(s.count / maxSpecies) * 100}%` }} />
                  </div>
                  <span className="ljx-top-stat">{s.count} 次</span>
                </div>
              ))
            )}
          </div>

          {/* 地区 Top */}
          <div className="ljx-stats-section">
            <div className="ljx-stats-title">热门观测地区 Top</div>
            {stats.regionTop.length === 0 ? (
              <div className="ljx-panel-empty">暂无地区数据</div>
            ) : (
              stats.regionTop.map((r, i) => (
                <div key={r.regionName} className="ljx-rank-row">
                  <span className="ljx-top-rank">{i + 1}</span>
                  <span className="ljx-top-name">{r.regionName}</span>
                  <div className="ljx-rank-bar">
                    <div className="ljx-rank-fill" style={{ width: `${(r.count / maxRegion) * 100}%` }} />
                  </div>
                  <span className="ljx-top-stat">{r.count} 条</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
