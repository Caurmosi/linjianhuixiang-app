/**
 * RegionScreen.jsx
 * 地区详情：展示该地区（同名归组）的所有测量记录 + 趋势折线图。
 *  - AppBar：标题 = 地区名；右侧「重命名」→ 输入新名 → renameRegion（组内全部记录同步改名）；
 *  - 记录列表：日期 / 宜居度 score / 噪声% / 鸟种数 speciesCount / 删除（二次确认）；
 *  - 趋势折线图：宜居度 score 与 人为噪声 noise 随时间对比（≥2 次测量才有意义）。
 */
import { useEffect, useState } from 'react';
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import Button from '../components/ui/Button';
import Chip from '../components/ui/Chip';
import LineChart from '../components/charts/LineChart';
import { deleteRegion, getRegions, renameRegion } from '../data/repository';
import { formatISODate } from '../utils/dates';
import { humanizeBackendError } from '../utils/errorText';
import { IconTrash } from '../components/icons';

export default function RegionScreen() {
  const { state, dispatch } = useApp();
  // 地区名本地态：进入时取 store.activeRegionName，重命名后就地更新
  const [name, setName] = useState(state.activeRegionName || '');
  const [confirmId, setConfirmId] = useState(null);
  const [showRename, setShowRename] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [renaming, setRenaming] = useState(false);

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

  /** 删除一条测量记录（二次确认） */
  const confirmDelete = async (r) => {
    try {
      await Promise.resolve(deleteRegion(r.id));
      dispatch({ type: 'TOAST', message: '已删除该条测量记录' });
      setConfirmId(null);
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
          return (
            <div className="region-row region-row-det" key={r.id}>
              <div className="region-row-main">
                <b>{formatISODate(r.created_at)}</b>
                <span>
                  宜居度 {lv.score != null ? lv.score : '—'} · 噪声 {lv.noise != null ? `${lv.noise}%` : '—'} · {speciesCount} 种鸟
                </span>
              </div>
              {lv.score != null && (
                <Chip tone={lv.score >= 70 ? 'good' : lv.score >= 50 ? 'mid' : 'bad'} className="!px-2 !py-0.5">
                  {lv.score >= 70 ? '宜居' : lv.score >= 50 ? '一般' : '受压'}
                </Chip>
              )}
              {confirmId === r.id ? (
                <button
                  className="hist-del hist-del-confirm"
                  onClick={() => confirmDelete(r)}
                >
                  确认删除？
                </button>
              ) : (
                <button
                  className="hist-del"
                  aria-label="删除测量记录"
                  onClick={() => setConfirmId(r.id)}
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
