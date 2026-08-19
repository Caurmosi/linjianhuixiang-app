/**
 * ComparePanel.jsx —— 多地区对比面板
 * 从当前地图聚合点中选择 2-4 个地区 → 调 /api/public/compare → 并排卡片对比。
 */
import { useMemo, useState } from 'react';

function scoreColor(score) {
  if (score >= 70) return '#2e7d52';
  if (score >= 50) return '#d49a26';
  return '#c25a39';
}

export default function ComparePanel({ clusters, compareApi, onClose }) {
  const opts = useMemo(() => {
    const seen = new Set();
    const out = [];
    (clusters || []).forEach((c) => {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        out.push({ id: c.id, regionName: c.regionName, score: c.score, n: c.n });
      }
    });
    return out.sort((a, b) => a.regionName.localeCompare(b.regionName, 'zh'));
  }, [clusters]);

  const [selectedId, setSelectedId] = useState('');
  const [picked, setPicked] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const addPick = () => {
    if (!selectedId) return;
    if (picked.some((p) => p.id === selectedId)) return;
    if (picked.length >= 4) {
      setErr('最多对比 4 个地区');
      return;
    }
    const opt = opts.find((o) => o.id === selectedId);
    setPicked((prev) => [...prev, opt]);
    setSelectedId('');
    setErr('');
    setResult(null);
  };

  const removePick = (id) => {
    setPicked((prev) => prev.filter((p) => p.id !== id));
    setResult(null);
  };

  const runCompare = async () => {
    if (picked.length < 2) {
      setErr('请至少选择 2 个地区');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const data = await compareApi(picked.map((p) => p.id));
      setResult(data.items || []);
    } catch (e) {
      setErr((e && e.error) || '对比失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ljx-panel ljx-panel-compare">
      <div className="ljx-panel-head">
        <h2>多地区对比</h2>
        <span className="ljx-panel-count">{picked.length}/4</span>
        <button type="button" className="ljx-panel-close" onClick={onClose} title="关闭">×</button>
      </div>

      <div className="ljx-compare-pick">
        <select className="ljx-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">选择地图上的地区…</option>
          {opts.map((o) => (
            <option key={o.id} value={o.id}>{o.regionName}（{o.n} 样本）</option>
          ))}
        </select>
        <button type="button" className="ljx-btn" onClick={addPick}>添加</button>
      </div>

      {picked.length > 0 && (
        <div className="ljx-compare-picked">
          {picked.map((p) => (
            <span key={p.id} className="ljx-compare-chip">
              {p.regionName}
              <button type="button" onClick={() => removePick(p.id)} title="移除">×</button>
            </span>
          ))}
        </div>
      )}

      {err && <div className="ljx-modal-err">{err}</div>}

      <div className="ljx-compare-actions">
        <button type="button" className="ljx-btn" disabled={loading || picked.length < 2} onClick={runCompare}>
          {loading ? '对比中…' : '开始对比'}
        </button>
      </div>

      {result && result.length > 0 && (
        <div className="ljx-compare-result">
          {result.map((it) => (
            <div key={it.id} className="ljx-compare-card">
              <div className="ljx-compare-name">{it.regionName}</div>
              <div className="ljx-compare-score" style={{ color: scoreColor(it.score) }}>{it.score}</div>
              <div className="ljx-compare-bar">
                <div className="ljx-compare-bar-fill" style={{ width: `${it.score}%`, background: scoreColor(it.score) }} />
              </div>
              <div className="ljx-compare-meta">
                <span>样本 <b>{it.n}</b></span>
                <span>噪声 <b>{it.noiseAvg != null ? `${it.noiseAvg}%` : '—'}</b></span>
                <span>置信度 <b>{it.confidenceAvg}</b></span>
                <span>区间 <b>{it.scoreMin}~{it.scoreMax}</b></span>
              </div>
              {it.speciesTop && it.speciesTop.length > 0 && (
                <div className="ljx-compare-species">
                  {it.speciesTop.slice(0, 4).map((s) => (
                    <span key={s.name} className="ljx-species-chip">{s.name} ×{s.count}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
