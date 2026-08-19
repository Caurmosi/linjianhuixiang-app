/**
 * TrendPanel.jsx —— 地区评分趋势面板（拉取详情 trend 数据 → SVG 折线）
 */
import { useEffect, useState } from 'react';
import TrendChart from './TrendChart.jsx';

export default function TrendPanel({ regionName, clusterId, fetchDetail, onClose }) {
  const [trend, setTrend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchDetail(clusterId);
        if (!alive) return;
        setTrend(data.trend || []);
      } catch (e) {
        if (!alive) return;
        setErr('趋势数据加载失败，请稍后重试');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [clusterId, fetchDetail]);

  return (
    <div className="ljx-panel ljx-panel-trend">
      <div className="ljx-panel-head">
        <h2>评分趋势 · {regionName}</h2>
        <span className="ljx-panel-count">多次采样随时间变化</span>
        <button type="button" className="ljx-panel-close" onClick={onClose} title="关闭">×</button>
      </div>
      {loading && <div className="ljx-panel-hint">加载中…</div>}
      {!loading && err && <div className="ljx-modal-err">{err}</div>}
      {!loading && !err && <TrendChart points={trend} />}
    </div>
  );
}
