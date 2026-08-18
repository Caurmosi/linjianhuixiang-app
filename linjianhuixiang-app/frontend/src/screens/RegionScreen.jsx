/**
 * RegionScreen.jsx
 * 地区详情：展示该地区（同名归组）的所有测量记录 + 趋势折线图。
 *  - AppBar：标题 = 地区名；右侧「重命名」→ 输入新名 → renameRegion（组内全部记录同步改名）；
 *  - 记录列表：日期 / 宜居度 score / 噪声% / 鸟种数 speciesCount / 删除（二次确认），
 *    行标题显示 detail.recording 录音名便于识别；点击某条 → 列表上方展开该次录音的
 *    完整综合数据（复用 <RegionSummary summary={record.detail} />）+「← 返回列表」切换；
 *  - 趋势折线图：宜居度 score 与 人为噪声 noise 随时间对比（≥2 次测量才有意义）。
 */
import { useEffect, useState } from 'react';
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import Button from '../components/ui/Button';
import Chip from '../components/ui/Chip';
import LineChart from '../components/charts/LineChart';
import RegionSummary from '../components/RegionSummary';
import MapCanvas from '../components/map/MapCanvas';
import { mapFromSummary } from '../components/map/mapUtils';
import { deleteRegion, getRegions, renameRegion, uploadPublicRecord } from '../data/repository';
import { getSignAnonymous, isLoggedIn } from '../services/authService';
import { formatISODate } from '../utils/dates';
import { humanizeBackendError } from '../utils/errorText';
import { IconBack, IconChevronRight, IconGlobe, IconTrash } from '../components/icons';

export default function RegionScreen() {
  const { state, dispatch } = useApp();
  // 地区名本地态：进入时取 store.activeRegionName，重命名后就地更新
  const [name, setName] = useState(state.activeRegionName || '');
  const [confirmId, setConfirmId] = useState(null);
  const [showRename, setShowRename] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [renaming, setRenaming] = useState(false);
  // 当前选中查看完整综合数据的记录 id（null = 未选中，保持列表 + 趋势）
  const [selectedId, setSelectedId] = useState(null);
  // 上传到公共地图：请求中状态（防重复提交）
  const [uploading, setUploading] = useState(false);

  const loadRegions = async () => {
    try {
      const list = await Promise.resolve(getRegions());
      dispatch({ type: 'SET_REGIONS', items: Array.isArray(list) ? list : [] });
    } catch (err) {
      dispatch({ type: 'SET_REGIONS', items: [] });
    }
  };

  // 进入时刷新地区记录（保证展示最新；mock 同步返回，api 异步）
  useEffect(() => {
    loadRegions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const records = (state.regions || [])
    .filter((r) => r && r.name === name)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  // 当前选中的记录（详情展示源；记录被删/列表刷新后不存在则自动收起）
  const selected = records.find((r) => r.id === selectedId) || null;
  // 选中记录的简化固定地图（detail.map；无 map → null，不渲染地图区块）
  const detailMap = selected ? mapFromSummary(selected.detail) : null;

  /** 删除一条测量记录（二次确认） */
  const confirmDelete = async (r) => {
    try {
      await Promise.resolve(deleteRegion(r.id));
      dispatch({ type: 'TOAST', message: '已删除该条测量记录' });
      setConfirmId(null);
      if (selectedId === r.id) setSelectedId(null); // 删除的正是正在查看详情的记录 → 收起
      await loadRegions();
    } catch (err) {
      const reason = humanizeBackendError(err && err.message ? err.message : '未知错误');
      dispatch({ type: 'TOAST', message: `删除失败：${reason}` });
      setConfirmId(null);
    }
  };

  /** 重命名地区：组内全部记录同步改名（保持归组），随后刷新列表并更新标题 */
  const submitRename = async () => {
    const newName = renameInput.trim();
    if (!newName) {
      dispatch({ type: 'TOAST', message: '请输入新的地区名称' });
      return;
    }
    setRenaming(true);
    try {
      await Promise.all(records.map((r) => Promise.resolve(renameRegion(r.id, newName))));
      dispatch({ type: 'TOAST', message: '地区已重命名' });
      setShowRename(false);
      setRenameInput('');
      setName(newName);
      await loadRegions();
    } catch (err) {
      const reason = humanizeBackendError(err && err.message ? err.message : '未知错误');
      dispatch({ type: 'TOAST', message: `重命名失败：${reason}` });
    } finally {
      setRenaming(false);
    }
  };

  /**
   * 上传当前地区记录快照到公共地图（v2）：
   *  - 未登录 → 提示「请先登录」并跳 LoginScreen；
   *  - 有坐标（region.lat/lng）→ 直接传；无坐标 → 提示按地区名定位，后端 geocode 反查兜底；
   *  - 失败 400「无法定位」→ 引导用户去地图页为该地区选点。
   */
  const uploadToPublic = async (r) => {
    if (!isLoggedIn()) {
      dispatch({ type: 'TOAST', message: '请先登录' });
      dispatch({ type: 'OPEN_LOGIN' });
      return;
    }
    const lv = r.detail && r.detail.livability ? r.detail.livability : {};
    const hasCoords = Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng));
    if (!hasCoords) {
      dispatch({ type: 'TOAST', message: '该地区无坐标，正在按地区名定位…' });
    }
    setUploading(true);
    try {
      const payload = {
        regionName: r.name,
        score: typeof lv.score === 'number' ? lv.score : 0,
        confidence: typeof lv.confidence === 'number' ? lv.confidence : 0,
        summary: r.detail,
        isAnonymous: getSignAnonymous() === 'anonymous',
      };
      if (hasCoords) {
        payload.lat = Number(r.lat);
        payload.lng = Number(r.lng);
      }
      await Promise.resolve(uploadPublicRecord(payload));
      dispatch({ type: 'TOAST', message: '已上传到公共地图' });
    } catch (err) {
      const reason = humanizeBackendError(err && err.message ? err.message : '未知错误');
      if (/无法定位|请在地图上选点/.test(reason)) {
        dispatch({ type: 'TOAST', message: '无法定位该地区，请在地图页为该地区选点后重试' });
      } else {
        dispatch({ type: 'TOAST', message: `上传失败：${reason}` });
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <AppBar
        title={name || '地区详情'}
        onBack={() => dispatch({ type: 'BACK' })}
        right={
          <button className="appbar-action" onClick={() => { setRenameInput(name); setShowRename(true); }}>
            重命名
          </button>
        }
      />

      {/* 趋势折线图 */}
      <div className="eyebrow mb-2.5">宜居度 / 噪声 趋势</div>
      <div className="line-wrap">
        <LineChart records={records} />
        <div className="cap">按测量时间顺序 · 宜居度 score（森林绿）与 人为噪声%（陶土色）</div>
      </div>

      {/* 选中的单条记录 → 完整综合数据 + 返回列表 */}
      {selected && (
        <div className="region-detail">
          <div className="region-detail-back">
            <button onClick={() => setSelectedId(null)}>
              <IconBack size={14} />
              返回列表
            </button>
            <span className="region-detail-recording">
              {selected.detail && selected.detail.recording ? selected.detail.recording : formatISODate(selected.created_at)}
            </span>
          </div>

          {/* 录音分布：记录 detail.map 存在 → 渲染真实地图（简化固定视图，标点渐变）；无 map → 不渲染 */}
          {detailMap && (
            <div className="map-wrap">
              <h4>录音分布</h4>
              <div className="cap">
                {detailMap.points.length} 个录音标点 · 按宜居度渐变着色 · 简化固定视图
              </div>
              <MapCanvas
                key={selected.id}
                center={detailMap.center}
                zoom={detailMap.zoom}
                points={detailMap.points}
                interactive={false}
                simplified
                height={280}
              />
            </div>
          )}

          {/* 上传到公共地图（v2）：把该条地区记录快照发布到公共地图（登录后可用） */}
          <Button
            variant="sun"
            icon={<IconGlobe size={18} />}
            className="mb-3"
            onClick={() => uploadToPublic(selected)}
            disabled={uploading}
          >
            {uploading ? '上传中…' : '上传到公共地图'}
          </Button>

          <RegionSummary summary={selected.detail} />
        </div>
      )}

      {/* 测量记录列表 */}
      <div className="eyebrow mb-2.5 mt-5">测量记录 · {records.length} 次</div>
      {records.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-[12.5px] font-bold">暂无测量记录</p>
          <p className="text-[11px] text-ink-soft mt-1">在地图综合页保存地区记录后显示在这里</p>
        </div>
      ) : (
        records.map((r) => {
          const lv = r.detail && r.detail.livability ? r.detail.livability : {};
          const speciesCount = r.detail && typeof r.detail.speciesCount === 'number' ? r.detail.speciesCount : (r.detail && Array.isArray(r.detail.species) ? r.detail.species.length : '—');
          const recordingName = r.detail && r.detail.recording ? r.detail.recording : '';
          return (
            <div
              className={`region-row region-row-det${selectedId === r.id ? ' region-row-det-active' : ''}`}
              key={r.id}
              onClick={() => setSelectedId(r.id)}
            >
              <div className="region-row-main">
                <b>{recordingName || formatISODate(r.created_at)}</b>
                <span>
                  {formatISODate(r.created_at)} · 宜居度 {lv.score != null ? lv.score : '—'} · 噪声 {lv.noise != null ? `${lv.noise}%` : '—'} · {speciesCount} 种鸟
                </span>
              </div>
              {lv.score != null && (
                <Chip tone={lv.score >= 70 ? 'good' : lv.score >= 50 ? 'mid' : 'bad'} className="!px-2 !py-0.5">
                  {lv.score >= 70 ? '宜居' : lv.score >= 50 ? '一般' : '受压'}
                </Chip>
              )}
              <button
                className="detail-chevron"
                aria-label="查看完整综合数据"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(r.id);
                }}
              >
                <IconChevronRight size={15} />
              </button>
              {confirmId === r.id ? (
                <button
                  className="hist-del hist-del-confirm"
                  onClick={(e) => {
                    e.stopPropagation();
                    confirmDelete(r);
                  }}
                >
                  确认删除？
                </button>
              ) : (
                <button
                  className="hist-del"
                  aria-label="删除测量记录"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmId(r.id);
                  }}
                >
                  <IconTrash size={14} />
                </button>
              )}
            </div>
          );
        })
      )}

      {/* 重命名面板 */}
      {showRename && (
        <div className="save-panel-mask" onClick={() => setShowRename(false)}>
          <div className="save-panel" onClick={(e) => e.stopPropagation()}>
            <h4>重命名地区</h4>
            <p>输入新名称，该地区所有测量记录将一并更新</p>
            <input
              autoFocus
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename();
              }}
              placeholder="新地区名称"
              className="save-panel-input"
            />
            <div className="save-panel-actions">
              <Button variant="ghost" onClick={() => setShowRename(false)}>
                取消
              </Button>
              <Button variant="primary" onClick={submitRename} disabled={renaming}>
                {renaming ? '保存中…' : '确定'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
