/**
 * HistoryScreen.jsx
 * 历史记录（底部 Tab）：完整列表（⭐星标 / 最近分析 / 更早），点击回放进入结果页；
 * - 星标：每条右侧 ★/☆ 一键置顶收藏；
 * - 多选：右上角「选择」进入多选模式 → 批量分享（生成分享卡片）/ 批量删除；
 * - 单条删除：保留二次确认（防误删）。
 */
import { useEffect, useState } from 'react';
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import ConfirmModal from '../components/ConfirmModal';
import SharePreview from '../components/SharePreview';
import CardEditor from '../components/CardEditor';
import { analysisForHistory, buildMockAnalysis, deleteHistory, getHistory } from '../data/repository';
import { formatISODate } from '../utils/dates';
import { humanizeBackendError } from '../utils/errorText';
import { drawShareCard } from '../utils/shareCard';
import { buildDefaultTree } from '../utils/cardElements';
import { loadAll as loadBirdImages } from '../utils/birdImageLoader';
import { IconBird, IconClock, IconChevronRight, IconTrash, IconShare, IconStar } from '../components/icons';

export default function HistoryScreen() {
  const { state, dispatch } = useApp();
  const items = state.history || [];
  // 分组：⭐ 星标 → 最近分析（最新 1 条非星标）→ 更早
  const starred = items.filter((h) => h.starred);
  const rest = items.filter((h) => !h.starred);
  const recent = rest.slice(0, 1);
  const earlier = rest.slice(1);

  // 二次确认态：confirmId 命中时删除按钮变为「确认删除？」，再点一次才真正删除
  const [confirmId, setConfirmId] = useState(null);
  // 多选模式
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  // 分享卡片预览
  const [cards, setCards] = useState(null);
  const [editTree, setEditTree] = useState(null); // 分享卡片编辑器元素树
  const [sharing, setSharing] = useState(false);

  // 懒加载历史列表：首次进入历史页刷新（mock 同步返回演示数据；api 模式读本地 localStore）
  // 失败时【保留本地已有历史】——分析历史是本地资产，不随账号/网络状态丢失
  useEffect(() => {
    let alive = true;
    Promise.resolve(getHistory())
      .then((list) => {
        if (alive && Array.isArray(list) && list.length) {
          dispatch({ type: 'SET_HISTORY', items: list });
        }
      })
      .catch(() => {
        /* 拉取失败：保留现有本地历史，不清空 */
      });
    return () => {
      alive = false;
    };
  }, [dispatch]);

  const open = async (item) => {
    // 处于确认态时点击行主体取消确认，避免误删流程中误触回放
    setConfirmId(null);
    try {
      // Promise.resolve 归一化 mock 同步 / api 异步两种返回
      const analysis = await Promise.resolve(analysisForHistory(item));
      dispatch({ type: 'LOAD_HISTORY', analysis });
    } catch (err) {
      const reason = humanizeBackendError(err && err.message ? err.message : '未知错误');
      const demo = buildMockAnalysis(item.name, {
        speciesCount: item.species,
        livability: { score: item.score, noise: item.noise ?? 40, bio: item.bio ?? 70, sound: item.sound ?? 55 },
      });
      dispatch({ type: 'TOAST', message: `识别失败：${reason}，已用演示结果回放` });
      dispatch({ type: 'LOAD_HISTORY', analysis: demo });
    }
  };

  /** 星标切换 */
  const toggleStar = (e, item) => {
    e.stopPropagation();
    dispatch({ type: 'TOGGLE_STARRED', id: item.id });
  };

  /** 第一次点击删除：进入确认态 */
  const startDelete = (e, item) => {
    e.stopPropagation();
    setConfirmId(confirmId === item.id ? null : item.id);
  };

  /** 第二次点击：真正删除（真实模式 DELETE /api/history/{id}；mock 本地过滤），随后刷新列表 */
  const confirmDelete = async (item) => {
    try {
      await Promise.resolve(deleteHistory(item.id));
      dispatch({ type: 'SET_HISTORY', items: items.filter((h) => h.id !== item.id) });
      dispatch({ type: 'TOAST', message: '已删除该条历史记录' });
    } catch (err) {
      const reason = humanizeBackendError(err && err.message ? err.message : '未知错误');
      dispatch({ type: 'TOAST', message: `删除失败：${reason}` });
    }
    setConfirmId(null);
  };

  // ---- 多选 ----
  const toggleSelect = (e, item) => {
    e.stopPropagation();
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(item.id)) n.delete(item.id);
      else n.add(item.id);
      return n;
    });
  };
  const allSelected = items.length > 0 && selected.size === items.length;
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(items.map((h) => h.id)));
  };
  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };
  const selectedItems = items.filter((h) => selected.has(h.id));

  /** 批量删除（多选）：确认后逐条删除 */
  // 批量删除：自定义弹窗（confirm → running 进度 → done 摘要），替代 window.confirm
  const [delModal, setDelModal] = useState(false);
  const [delState, setDelState] = useState('confirm');
  const [delProg, setDelProg] = useState({ done: 0, total: 0, failed: 0 });
  const startBulkDelete = () => {
    if (!selectedItems.length) return;
    setDelProg({ done: 0, total: selectedItems.length, failed: 0 });
    setDelState('confirm');
    setDelModal(true);
  };
  const runBulkDelete = async () => {
    setDelState('running');
    const list = items.filter((h) => selected.has(h.id));
    const total = list.length;
    let done = 0;
    let failed = 0;
    setDelProg({ done: 0, total, failed: 0 });
    for (const it of list) {
      try {
        await Promise.resolve(deleteHistory(it.id));
      } catch (e) {
        failed += 1;
      }
      done += 1;
      setDelProg({ done, total, failed });
    }
    dispatch({ type: 'SET_HISTORY', items: items.filter((h) => !selected.has(h.id)) });
    dispatch({ type: 'TOAST', message: `已删除 ${total - failed} 条历史记录${failed ? `（失败 ${failed}）` : ''}` });
    setDelState('done');
  };
  const closeDelModal = () => {
    if (delState === 'running') return; // 运行中禁止关闭
    setDelModal(false);
    if (delState === 'done') exitSelect();
  };

  /** 批量分享：逐条生成分享卡片 → 预览（先预加载鸟图） */
  const bulkShare = async () => {
    if (!selectedItems.length || sharing) return;
    setSharing(true);
    try { await loadBirdImages(); } catch (e) { /* 加载失败时降级卡通 */ }
    const out = [];
    for (const item of selectedItems) {
      try {
        const analysis = await Promise.resolve(analysisForHistory(item));
        const { dataUrl } = drawShareCard(analysis);
        // 保留 analysis 供「编辑」生成元素树
        out.push({ dataUrl, title: item.name, analysis });
      } catch (e) {
        /* 单条失败跳过 */
      }
    }
    setSharing(false);
    if (!out.length) {
      dispatch({ type: 'TOAST', message: '生成分享卡片失败，请重试' });
      return;
    }
    setCards(out);
  };

  const onRowClick = (item) => {
    if (selectMode) {
      toggleSelect({ stopPropagation: () => {} }, item);
    } else {
      open(item);
    }
  };

  const renderItem = (item) => (
    <div key={item.id} className="recent" onClick={() => onRowClick(item)}>
      {selectMode && (
        <div className="hist-check" onClick={(e) => toggleSelect(e, item)}>
          <span className={selected.has(item.id) ? 'on' : ''}>{selected.has(item.id) ? '✓' : ''}</span>
        </div>
      )}
      <div className="thumb">
        <IconBird size={22} />
      </div>
      <div className="meta">
        <b>{item.name}</b>
        <span>
          {item.duration ? `${item.duration} · ` : ''}
          {item.species} 种鸟 · 宜居度 {item.score}
        </span>
        <i className="hist-date">{formatISODate(item.created_at)}</i>
      </div>
      <button
        className={`hist-star${item.starred ? ' on' : ''}`}
        aria-label={item.starred ? '取消星标' : '星标'}
        onClick={(e) => toggleStar(e, item)}
      >
        <IconStar size={16} filled={!!item.starred} />
      </button>
      {!selectMode &&
        (confirmId === item.id ? (
          <button
            className="hist-del hist-del-confirm"
            onClick={(e) => {
              e.stopPropagation();
              confirmDelete(item);
            }}
          >
            确认删除？
          </button>
        ) : (
          <button
            className="hist-del"
            aria-label="删除记录"
            onClick={(e) => startDelete(e, item)}
          >
            <IconTrash size={15} />
          </button>
        ))}
      {!selectMode && (
        <span className="go">
          <IconChevronRight size={16} />
        </span>
      )}
    </div>
  );

  const renderGroup = (label, list, padTop = false) =>
    list.length > 0 && (
      <>
        <div className={`eyebrow mb-2.5${padTop ? ' mt-5' : ''}`}>{label}</div>
        {list.map((item) => renderItem(item))}
      </>
    );

  return (
    <div>
      <AppBar
        title="历史记录"
        onBack={() => dispatch({ type: 'BACK' })}
        right={
          items.length > 0 &&
          (selectMode ? (
            <button className="chip" onClick={exitSelect}>
              完成
            </button>
          ) : (
            <button className="chip" onClick={() => setSelectMode(true)}>
              选择
            </button>
          ))
        }
      />

      {items.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-[13px] font-bold">暂无历史记录</p>
          <p className="text-[11.5px] text-ink-soft mt-1">完成一次分析后会自动出现在这里</p>
        </div>
      ) : (
        <>
          {renderGroup('⭐ 星标', starred)}
          {renderGroup('最近分析', recent)}
          {renderGroup('更早', earlier, true)}
        </>
      )}

      <div className="note-line mt-4">
        <IconClock size={14} />
        点击任意记录可回放分析结果；右侧 ★ 可置顶收藏
      </div>

      {/* 多选底部操作条 */}
      {selectMode && (
        <div className="hist-bulk">
          <button className="hist-bulk-btn" onClick={toggleAll}>
            {allSelected ? '取消全选' : '全选'}
          </button>
          <button className="hist-bulk-btn hist-bulk-share" onClick={bulkShare} disabled={sharing || !selected.size}>
            {sharing ? '生成中…' : `分享（${selected.size}）`}
            <IconShare size={15} />
          </button>
          <button className="hist-bulk-btn hist-bulk-del" onClick={startBulkDelete} disabled={!selected.size}>
            删除（{selected.size}）
          </button>
        </div>
      )}

      {/* 分享卡片预览 */}
      {cards && (
        <SharePreview
          cards={cards}
          onClose={() => setCards(null)}
          onEdit={(card) => {
            setCards(null);
            // card.analysis 存在（批量分享保留）→ 生成元素树编辑；缺失时用默认空树兜底
            setEditTree(buildDefaultTree(card && card.analysis ? card.analysis : undefined));
          }}
        />
      )}

      {/* 分享卡片编辑器 */}
      {editTree && <CardEditor initialTree={editTree} onClose={() => setEditTree(null)} />}

      {/* 自定义删除弹窗（确认 → 进度 → 摘要） */}
      <ConfirmModal
        open={delModal}
        state={delState}
        progress={delProg}
        title="删除历史记录"
        description={`确定删除选中的 ${delProg.total} 条历史记录吗？此操作不可撤销。`}
        confirmText="确认删除"
        cancelText="取消"
        doneText="知道了"
        danger
        onConfirm={runBulkDelete}
        onCancel={closeDelModal}
        onClose={closeDelModal}
      />
    </div>
  );
}
