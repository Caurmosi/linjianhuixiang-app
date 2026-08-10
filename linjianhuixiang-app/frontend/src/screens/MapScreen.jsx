/**
 * MapScreen.jsx
 * 声景地图：
 *  - 有 batchSummary（多录音聚合综合）→ 综合视图：复用 <RegionSummary summary={batchSummary} />
 *    渲染完整综合数据（宜居度大卡 + 统计 + 物种清单 + 声学指数 + 热力图 + 声景分布 + 波形），
 *    并提供「录音分布」真实地图（MapLibre+高德瓦片）：已有简化固定地图 → MapCanvas 锁定视图，
 *    无地图 → MapPicker 引导（搜索地名 / 拖动缩放 / 点击加点 → 简化固定）；
 *    以及「保存地区记录」（命名输入 → saveRegion → 同名自动归组）+「清除综合，返回首页」；
 *  - 无 batchSummary → 原单点分析视图：分段切换「时间热力图 / 空间分布」，
 *    空间分布显示「先完成多段分析，再在地图上标记位置」空态引导；
 *  - 两种视图下均展示「地区记录」区块：按名称分组、组内按时间升序，点击进入地区详情（趋势对比）。
 */
import { useEffect, useState } from 'react';
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import Button from '../components/ui/Button';
import RegionSummary from '../components/RegionSummary';
import HeatmapChart from '../components/charts/HeatmapChart';
import MapCanvas from '../components/map/MapCanvas';
import MapPicker from '../components/map/MapPicker';
import { mapFromSummary } from '../components/map/mapUtils';
import { getRegions, deleteRegion, saveRegion } from '../data/repository';
import { formatISODate } from '../utils/dates';
import { humanizeBackendError } from '../utils/errorText';
import { IconChevronRight, IconTrash } from '../components/icons';

/** 按名称归组地区记录：同名一组，组内按 created_at 时间升序，组间按名称排序 */
function groupRegionsByName(regions) {
  const map = new Map();
  for (const r of regions) {
    if (!r || !r.name) continue;
    if (!map.has(r.name)) map.set(r.name, []);
    map.get(r.name).push(r);
  }
  return [...map.entries()]
    .map(([name, items]) => ({
      name,
      items: items.slice().sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
}

export default function MapScreen() {
  const { state, dispatch } = useApp();
  const [seg, setSeg] = useState('heat');
  // 地区记录：列表 + 保存命名面板 + 行删除二次确认
  const regions = state.regions || [];
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmRegionId, setConfirmRegionId] = useState(null);
  // 录音分布：已有简化固定地图时锁定视图，「重新调整」→ MapPicker 编辑态
  const [editingMap, setEditingMap] = useState(false);
  const a = state.analysis;
  const summary = state.batchSummary;

  const loadRegions = async () => {
    try {
      const list = await Promise.resolve(getRegions());
      dispatch({ type: 'SET_REGIONS', items: Array.isArray(list) ? list : [] });
    } catch (err) {
      dispatch({ type: 'SET_REGIONS', items: [] });
    }
  };

  // 加载地区记录（mock 同步返回；api 后端不可达降级空数组，守卫渲染防白屏）
  useEffect(() => {
    loadRegions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 保存当前综合摘要为地区记录（同名自动归组） */
  const saveCurrentSummary = async () => {
    const name = saveName.trim();
    if (!name) {
      dispatch({ type: 'TOAST', message: '请输入地区名称' });
      return;
    }
    setSaving(true);
    try {
      await Promise.resolve(saveRegion(name, summary));
      dispatch({ type: 'TOAST', message: '地区记录已保存' });
      setShowSavePanel(false);
      setSaveName('');
      await loadRegions();
    } catch (err) {
      const reason = humanizeBackendError(err && err.message ? err.message : '未知错误');
      dispatch({ type: 'TOAST', message: `保存失败：${reason}` });
    } finally {
      setSaving(false);
    }
  };

  /** 地区记录行删除：第一次确认态，第二次真正删除 */
  const startDeleteRegion = (e, r) => {
    e.stopPropagation();
    setConfirmRegionId(confirmRegionId === r.id ? null : r.id);
  };

  const confirmDeleteRegion = async (e, r) => {
    e.stopPropagation();
    try {
      await Promise.resolve(deleteRegion(r.id));
      dispatch({ type: 'TOAST', message: '已删除该条地区记录' });
      setConfirmRegionId(null);
      await loadRegions();
    } catch (err) {
      const reason = humanizeBackendError(err && err.message ? err.message : '未知错误');
      dispatch({ type: 'TOAST', message: `删除失败：${reason}` });
      setConfirmRegionId(null);
    }
  };

  const openRegion = (name) => {
    dispatch({ type: 'OPEN_REGION', name });
  };

  /** 地区记录区块（两种视图共用）：按名称分组、组内按时间升序 */
  const renderRegionBlock = () => {
    if (regions.length === 0) return null;
    const groups = groupRegionsByName(regions);
    return (
      <div className="mt-5">
        <div className="eyebrow mb-2.5">地区记录</div>
        {groups.map((g) => (
          <div key={g.name} className="region-group">
            <button className="region-group-head" onClick={() => openRegion(g.name)}>
              <b>{g.name}</b>
              <span className="region-count">{g.items.length} 次测量</span>
              <IconChevronRight size={15} />
            </button>
            {g.items.map((r) => (
              <div key={r.id} className="region-row" onClick={() => openRegion(g.name)}>
                <span className="region-date">{formatISODate(r.created_at)}</span>
                <span className="region-score">宜居度 {r.score != null ? r.score : '—'}</span>
                {confirmRegionId === r.id ? (
                  <button
                    className="hist-del hist-del-confirm"
                    onClick={(e) => confirmDeleteRegion(e, r)}
                  >
                    确认删除？
                  </button>
                ) : (
                  <button
                    className="hist-del"
                    aria-label="删除地区记录"
                    onClick={(e) => startDeleteRegion(e, r)}
                  >
                    <IconTrash size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  /** 保存地区记录命名面板（prompt 式自绘小面板） */
  const renderSavePanel = () => {
    if (!showSavePanel) return null;
    return (
      <div className="save-panel-mask" onClick={() => setShowSavePanel(false)}>
        <div className="save-panel" onClick={(e) => e.stopPropagation()}>
          <h4>保存为地区记录</h4>
          <p>输入地区名称，同名记录将自动归组（如「中山公园」）</p>
          <input
            autoFocus
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveCurrentSummary();
            }}
            placeholder="地区名称"
            className="save-panel-input"
          />
          <div className="save-panel-actions">
            <Button variant="ghost" onClick={() => setShowSavePanel(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={saveCurrentSummary} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  /** 综合视图：多录音聚合摘要（复用 RegionSummary 渲染完整综合数据） */
  if (summary) {
    // 段数 = mapPoints 数量（每段一个样点）；空摘要时回退物种数 / 0
    const n =
      Array.isArray(summary.mapPoints) && summary.mapPoints.length > 0
        ? summary.mapPoints.length
        : summary.speciesCount || 0;
    const mapData = mapFromSummary(summary);

    const clearBatch = () => {
      dispatch({ type: 'CLEAR_BATCH' });
      dispatch({ type: 'TAB', tab: 'home', screen: 'home' });
    };

    /** 简化固定：写入 batchSummary.map（保存地区记录时随 detail 落库） */
    const handleFixed = (data) => {
      dispatch({ type: 'SET_BATCH_MAP', map: data });
      setEditingMap(false);
    };

    return (
      <div>
        <AppBar title={`本区域 ${n} 段录音综合`} onBack={() => dispatch({ type: 'BACK' })} />

        {/* 完整综合数据：宜居度大卡 + 统计 + 物种清单 + 声学指数 + 热力图 + 声景分布 + 波形 */}
        <RegionSummary summary={summary} />

        {/* 录音分布：真实地图（MapLibre + 高德瓦片）——
            已有简化固定地图 → MapCanvas 锁定视图；无地图 → MapPicker 引导 */}
        <div className="map-wrap">
          <h4>录音分布</h4>
          {editingMap ? (
            <MapPicker
              initialCenter={mapData ? mapData.center : undefined}
              initialZoom={mapData ? mapData.zoom : 12}
              points={mapData ? mapData.points : []}
              onFixed={handleFixed}
            />
          ) : mapData ? (
            <>
              <div className="cap">
                {mapData.points.length} 个录音标点 · 按宜居度渐变着色 · 简化固定视图
              </div>
              <MapCanvas
                center={mapData.center}
                zoom={mapData.zoom}
                points={mapData.points}
                interactive={false}
                height={300}
              />
              <div className="legend">
                <span>受压</span>
                <span className="scale" />
                <span>宜居</span>
                <span className="ml-auto">录音点：GPS / 手动</span>
              </div>
              <div className="map-picker-fixed-actions">
                <Button variant="ghost" onClick={() => setEditingMap(true)} className="mt-3">
                  重新调整
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="cap">搜索地名定位 · 拖动缩放 · 点击地图添加录音点 → 简化固定</div>
              <MapPicker
                initialCenter={undefined}
                initialZoom={12}
                points={[]}
                onFixed={handleFixed}
              />
            </>
          )}
        </div>

        {/* 保存地区记录 */}
        <div className="mt-4">
          <Button variant="primary" onClick={() => setShowSavePanel(true)}>
            保存地区记录
          </Button>
        </div>

        {renderRegionBlock()}

        <div className="mt-4">
          <Button variant="ghost" onClick={clearBatch}>
            清除综合，返回首页
          </Button>
        </div>

        {renderSavePanel()}
      </div>
    );
  }

  // ---- 原单点分析视图 ----
  return (
    <div>
      <AppBar title="声景地图" onBack={() => dispatch({ type: 'BACK' })} />

      <div className="seg">
        <button className={seg === 'heat' ? 'on' : ''} onClick={() => setSeg('heat')}>
          时间热力图
        </button>
        <button className={seg === 'map' ? 'on' : ''} onClick={() => setSeg('map')}>
          空间分布
        </button>
      </div>

      {seg === 'heat' ? (
        <div className="heat-wrap">
          <h4>本次录音 时段 × 频段</h4>
          <div className="cap">真实时频能量 · {a.recording || '中山公园_晨.wav'}</div>
          <HeatmapChart data={a.heatmap} />
          <div className="legend">
            <span>弱</span>
            <span className="scale" />
            <span>强</span>
            <span className="ml-auto">频段：低 → 高</span>
          </div>
        </div>
      ) : (
        <div className="map-wrap">
          <h4>空间分布</h4>
          <div className="cap">真实地图 · 多段录音聚合后在地图上标记位置</div>
          <div className="py-4 text-center">
            <p className="text-[12.5px] font-bold">先完成多段分析，再在地图上标记位置</p>
            <p className="text-[11px] text-ink-soft mt-1">
              在「实时录音」录制 ≥2 段，或在首页导入多段音频完成批量分析后，
              即可在综合页搜索地名 / 手动选点标记各段录音位置
            </p>
          </div>
        </div>
      )}

      {renderRegionBlock()}
    </div>
  );
}
