/**
 * ConfirmModal.jsx —— 自定义确认/进度弹窗（替代 window.confirm/alert）
 *
 * 多种状态由 props.state 控制：
 *   - 'confirm'  ：确认/取消（默认）
 *   - 'running'  ：执行中（显示进度条 + 隐藏运行信息：当前/总数/失败数）
 *   - 'done'     ：完成（显示成功/失败摘要 + 关闭按钮）
 *
 * 进度由 progress={done, total, failed} 驱动（仅在 running 状态显示）。
 */
import { useEffect } from 'react';

export default function ConfirmModal({
  open,
  title = '确认操作',
  description = '此操作不可撤销，是否继续？',
  confirmText = '确定',
  cancelText = '取消',
  doneText = '完成',
  state = 'confirm', // 'confirm' | 'running' | 'done'
  progress, // {done, total, failed}
  onConfirm,
  onCancel,
  onClose,
  danger = false,
}) {
  // 完成后用户可按 Esc 关闭
  useEffect(() => {
    if (!open || state !== 'done') return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose && onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, state, onClose]);

  if (!open) return null;

  const pct = progress && progress.total > 0 ? progress.done / progress.total : 0;
  const isRunning = state === 'running';
  const isDone = state === 'done';

  return (
    <div
      className="ljx-modal"
      onClick={state === 'confirm' ? onCancel : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`ljx-modal-card ljx-confirm ${danger ? 'danger' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {state === 'confirm' && (
          <>
            <div className="ljx-modal-title">{title}</div>
            <p className="ljx-confirm-desc">{description}</p>
            <div className="ljx-modal-foot">
              <button type="button" className="ljx-btn ljx-btn-ghost" onClick={onCancel}>
                {cancelText}
              </button>
              <button
                type="button"
                className={`ljx-btn ${danger ? 'ljx-btn-danger' : 'ljx-btn-primary'}`}
                onClick={onConfirm}
              >
                {confirmText}
              </button>
            </div>
          </>
        )}

        {isRunning && progress && (
          <>
            <div className="ljx-modal-title">{title || '正在执行…'}</div>
            <p className="ljx-confirm-desc">
              正在处理 {progress.done} / {progress.total}
              {progress.failed > 0 && (
                <span className="ljx-confirm-failed">，失败 {progress.failed}</span>
              )}
            </p>
            <div className="ljx-progress" aria-valuenow={pct}>
              <div
                className={`ljx-progress-bar ${progress.failed > 0 ? 'has-fail' : ''}`}
                style={{ width: `${Math.round(pct * 100)}%` }}
              />
            </div>
            <div className="ljx-confirm-hidden">
              <div className="ljx-confirm-hidden-row">
                <span>已处理</span>
                <b>{progress.done}</b>
              </div>
              <div className="ljx-confirm-hidden-row">
                <span>总数</span>
                <b>{progress.total}</b>
              </div>
              {progress.failed > 0 && (
                <div className="ljx-confirm-hidden-row ljx-confirm-hidden-fail">
                  <span>失败</span>
                  <b>{progress.failed}</b>
                </div>
              )}
            </div>
          </>
        )}

        {isDone && progress && (
          <>
            <div className="ljx-modal-title">
              {progress.failed > 0 ? '部分完成' : '已完成'}
            </div>
            <p className="ljx-confirm-desc">
              成功处理 <b>{progress.done - progress.failed}</b> / {progress.total}
              {progress.failed > 0 && (
                <>
                  ，失败 <b style={{ color: '#c0392b' }}>{progress.failed}</b>
                </>
              )}
            </p>
            <div className="ljx-modal-foot">
              <button type="button" className="ljx-btn ljx-btn-primary" onClick={onClose}>
                {doneText}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
