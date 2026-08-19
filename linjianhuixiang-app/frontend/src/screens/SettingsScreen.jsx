/**
 * SettingsScreen.jsx
 * 设置（「我的」Tab 内容）：账号与公开署名 / 置信度阈值滑杆 / 高通滤波开关 / 实时录音开关 / 后端地址 / 导出与说明
 */
import { useRef, useState } from 'react';
import { useApp } from '../store/appStore.jsx';
import AppBar from '../components/AppBar';
import Button from '../components/ui/Button';
import Toggle from '../components/ui/Toggle';
import Chip from '../components/ui/Chip';
import { exportReport } from '../utils/exportReport';
import { getApiBase, getDataSource } from '../config/dataConfig.js';
import { pingHealth } from '../data/repository';
import { clearSession, changePassword, getSignAnonymous, getUsername, isLoggedIn, logout, setSignAnonymous } from '../services/authService';
import { applyBackupPayload, fetchBackup, hasLocalData, uploadBackup } from '../services/syncService';
import { loadHistory, loadRegions } from '../utils/localStore';
import { IconFilter, IconWave, IconMic, IconShare, IconInfo, IconChart, IconChevronRight, IconUser, IconClock, IconUpload } from '../components/icons';

export default function SettingsScreen() {
  const { state, dispatch } = useApp();

  // 数据源模式：组件挂载时读取一次（进入设置页即重挂载）；保存后端地址后 Toast 触发重渲染也会同步刷新
  const dataSource = getDataSource();
  const apiBase = getApiBase();

  const setThreshold = (v) => dispatch({ type: 'SET_THRESHOLD', value: v });

  // 后端地址：非受控输入（ref + defaultValue），避免 Android IME 合成事件与 React 受控 value 冲突导致打不出字。
  // 重新进入设置页时组件重挂载，defaultValue 重新从 localStorage 读取 → 回显最新值。
  // onFocus 全选旧地址：换地址时点击即全选、直接输入即整体替换（杜绝拼接）。
  const apiInputRef = useRef(null);

  const onSaveApiBase = async () => {
    const input = apiInputRef.current;
    if (!input) return;
    let v = '';
    try {
      v = input.value.trim().replace(/\/$/, '');
      if (v) localStorage.setItem('ljx_api_base', v);
      else localStorage.removeItem('ljx_api_base');
      // 直接写回 input.value 回显规范化后的地址（非受控，不经 React 状态，无 IME 冲突）
      input.value = v;
    } catch (err) {
      dispatch({ type: 'TOAST', message: '保存失败：' + (err && err.message ? err.message : '存储不可用') });
      return;
    }
    if (!v) {
      dispatch({ type: 'TOAST', message: '已清空后端地址，恢复演示模式' });
      return;
    }
    // 保存后立即异步探测连通性（5s 超时，不阻塞 UI）：让用户当场知道地址对不对
    dispatch({ type: 'TOAST', message: '已保存，正在检测后端连通性…' });
    try {
      await pingHealth(v);
      dispatch({ type: 'TOAST', message: '后端已连通 ✅ 真实识别已就绪' });
    } catch (err) {
      const reason = err && err.message ? err.message : '未知错误';
      dispatch({ type: 'TOAST', message: `后端连通性检测失败：${reason}，请检查后端是否启动 / 手机电脑同一 WiFi` });
    }
  };

  const onClearApiBase = () => {
    const input = apiInputRef.current;
    if (!input) return;
    input.value = '';
    try {
      localStorage.removeItem('ljx_api_base');
    } catch (err) {
      /* 存储不可用按已清空处理 */
    }
    dispatch({ type: 'TOAST', message: '已清空后端地址，恢复演示模式' });
  };

  const onExport = async () => {
    const ok = await exportReport(state.analysis);
    dispatch({ type: 'TOAST', message: ok ? '报告已保存到手机相册（PDF 为后续版本）' : '保存失败，请重试' });
  };

  // ---- v2 账号区 ----
  const loggedIn = isLoggedIn();
  const username = getUsername();
  // 公开署名默认：本地 state 驱动 UI 高亮（localStorage 由 setSignAnonymous 写入）
  const [signMode, setSignMode] = useState(() => getSignAnonymous());

  /** 切换公开署名默认（用户名 / 匿名）：写 localStorage + 更新本地高亮 */
  const onSetSign = (mode) => {
    setSignAnonymous(mode);
    setSignMode(mode);
  };

  /** 登出：调后端 logout（尽力而为）+ 清本地 token → App 门控回 LoginScreen */
  const onLogout = async () => {
    try {
      await Promise.resolve(logout());
    } catch (err) {
      /* 后端不可达也允许本地登出 */
    }
    clearSession();
    dispatch({ type: 'CLEAR_USER' });
    dispatch({ type: 'TOAST', message: '已退出登录' });
  };

  /** 未登录 → 打开开屏登录（App 门控渲染 LoginScreen；登录成功后回到本页） */
  const onOpenLogin = () => {
    dispatch({ type: 'OPEN_LOGIN' });
  };

  // ---- 云同步（本地数据备份到账号） ----
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  /** 立即把本地数据备份到账号 */
  const onBackupNow = async () => {
    setSyncBusy(true);
    setSyncMsg('');
    try {
      const r = await uploadBackup();
      setSyncMsg(`已备份到账号 ${username || ''}（${(r && r.updatedAt || '').slice(0, 16).replace('T', ' ') || '刚刚'}）`);
      dispatch({ type: 'TOAST', message: '本地数据已备份到云端' });
    } catch (err) {
      setSyncMsg((err && err.message) || '备份失败，请稍后重试');
    } finally {
      setSyncBusy(false);
    }
  };

  /** 从云端恢复：以云端备份整体覆盖本地（会先提示确认） */
  const onRestoreNow = async () => {
    if (!window.confirm('将用云端备份覆盖本机数据（本机现有数据会被替换），确定恢复吗？')) return;
    setSyncBusy(true);
    setSyncMsg('');
    try {
      const payload = await fetchBackup();
      if (!payload) {
        setSyncMsg('云端暂无备份（该账号还没备份过数据）');
        return;
      }
      if (!applyBackupPayload(payload)) throw new Error('备份数据格式异常');
      dispatch({ type: 'SET_HISTORY', items: loadHistory() || [] });
      dispatch({ type: 'SET_REGIONS', items: loadRegions() || [] });
      dispatch({ type: 'TOAST', message: '已从云端恢复本地数据' });
      setSyncMsg('恢复完成');
    } catch (err) {
      setSyncMsg((err && err.message) || '恢复失败，请稍后重试');
    } finally {
      setSyncBusy(false);
    }
  };

  // ---- 修改密码 ----
  const [showPwd, setShowPwd] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdErr, setPwdErr] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  /** 提交修改密码：成功 → 清会话回登录页（后端已吊销旧 token） */
  const onSubmitPwd = async () => {
    setPwdErr('');
    if (!oldPwd || !newPwd) {
      setPwdErr('请填写旧密码与新密码');
      return;
    }
    if (newPwd.length < 6) {
      setPwdErr('新密码至少 6 个字符');
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdErr('两次输入的新密码不一致');
      return;
    }
    setPwdBusy(true);
    try {
      await changePassword(oldPwd, newPwd);
      clearSession();
      dispatch({ type: 'CLEAR_USER' });
      setShowPwd(false);
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
      dispatch({ type: 'TOAST', message: '密码已修改，请用新密码重新登录' });
    } catch (err) {
      const msg = (err && err.error) || (err && err.message) || '修改失败，请检查后重试';
      setPwdErr(msg);
    } finally {
      setPwdBusy(false);
    }
  };

  return (
    <div>
      <AppBar title="设置" onBack={() => dispatch({ type: 'BACK' })} />

      {/* 账号与公开署名（v2） */}
      <div className="eyebrow mb-2">账号与公开署名</div>
      <div className="set-list">
        <div className="set-row" onClick={loggedIn ? undefined : onOpenLogin}>
          <div className="ic">
            <IconUser size={18} />
          </div>
          <div className="t" style={{ flex: 1 }}>
            <b>{loggedIn ? username || '已登录' : '未登录'}</b>
            <span>{loggedIn ? '当前账号 · 上传公共地图默认署名如下' : '登录后可上传地区记录到公共地图'}</span>
          </div>
          {loggedIn ? (
            <button className="appbar-action" onClick={onLogout}>
              登出
            </button>
          ) : (
            <IconChevronRight size={16} className="text-ink-faint" />
          )}
        </div>
        {loggedIn && (
          <>
            <div className="set-row" onClick={() => setShowPwd((v) => !v)}>
              <div className="ic">
                <IconInfo size={18} />
              </div>
              <div className="t" style={{ flex: 1 }}>
                <b>修改密码</b>
                <span>修改后需重新登录</span>
              </div>
              <IconChevronRight size={16} className="text-ink-faint" />
            </div>
            {showPwd && (
              <div className="px-4 pb-4 pt-1">
                <div className="mb-2">
                  <input
                    type="password"
                    className="input w-full"
                    placeholder="旧密码"
                    value={oldPwd}
                    onChange={(e) => setOldPwd(e.target.value)}
                  />
                </div>
                <div className="mb-2">
                  <input
                    type="password"
                    className="input w-full"
                    placeholder="新密码（至少 6 位）"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                  />
                </div>
                <div className="mb-2">
                  <input
                    type="password"
                    className="input w-full"
                    placeholder="确认新密码"
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                  />
                </div>
                {pwdErr && <p className="mb-2 text-[12px] text-danger">{pwdErr}</p>}
                <Button variant="primary" disabled={pwdBusy} onClick={onSubmitPwd} style={{ width: '100%' }}>
                  {pwdBusy ? '提交中…' : '确认修改'}
                </Button>
              </div>
            )}
            <div className="set-row">
              <div className="ic">
                <IconShare size={18} />
              </div>
              <div className="t" style={{ flex: 1 }}>
                <b>公开署名</b>
                <span>上传公共地图时的默认署名（随上传快照，不影响已上传记录）</span>
              </div>
            </div>
            <div className="px-4 pb-4 pt-1">
              <div className="seg" style={{ marginBottom: 8 }}>
                <button
                  className={signMode === 'username' ? 'on' : ''}
                  onClick={() => onSetSign('username')}
                >
                  用我的用户名
                </button>
                <button
                  className={signMode === 'anonymous' ? 'on' : ''}
                  onClick={() => onSetSign('anonymous')}
                >
                  匿名
                </button>
              </div>
              <p className="faint text-[11px] leading-relaxed">
                {signMode === 'anonymous'
                  ? '上传时以「匿名用户」展示；记录仍归属你的账号，可在公共地图管理中撤回。'
                  : '上传时显示你的用户名；公共地图对外仅展示到天的日期，坐标为近似位置（已模糊数百米）。'}
              </p>
            </div>
            {/* 云同步：本地数据备份到账号（换机/重装可恢复） */}
            <div className="set-row" onClick={syncBusy ? undefined : onBackupNow} style={syncBusy ? { opacity: 0.6 } : undefined}>
              <div className="ic">
                <IconUpload size={18} />
              </div>
              <div className="t" style={{ flex: 1 }}>
                <b>备份到云端</b>
                <span>把本机分析/地区记录备份到当前账号（换机可恢复）</span>
              </div>
            </div>
            <div className="set-row" onClick={syncBusy ? undefined : onRestoreNow} style={syncBusy ? { opacity: 0.6 } : undefined}>
              <div className="ic">
                <IconClock size={18} />
              </div>
              <div className="t" style={{ flex: 1 }}>
                <b>从云端恢复</b>
                <span>用账号备份覆盖本机数据（会先确认）</span>
              </div>
            </div>
            {syncMsg && (
              <p className="faint text-[11px] px-4 pb-2 leading-relaxed" style={{ color: syncMsg.includes('失败') ? '#c0392b' : undefined }}>
                {syncMsg}
              </p>
            )}
          </>
        )}
      </div>

      {/* 识别参数 */}
      <div className="eyebrow mb-2">识别参数</div>
      <div className="set-list">
        <div className="set-row">
          <div className="ic">
            <IconFilter size={18} />
          </div>
          <div className="t" style={{ flex: 1 }}>
            <b>置信度阈值</b>
            <span>低于该值不计入清单</span>
          </div>
        </div>
        <div className="px-4 pb-4 pt-1">
          <div className="flex justify-between items-baseline">
            <span className="faint text-[12px]">0.30</span>
            <span className="slider-val">{state.threshold.toFixed(2)}</span>
            <span className="faint text-[12px]">0.90</span>
          </div>
          <input
            type="range"
            min="0.30"
            max="0.90"
            step="0.01"
            value={state.threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
          />
        </div>
        <div className="set-row">
          <div className="ic">
            <IconFilter size={18} />
          </div>
          <div className="t" style={{ flex: 1 }}>
            <b>后端地址</b>
            <span>留空 = 同源 /api，局域网联调填 http://IP:端口</span>
          </div>
        </div>
        <div className="px-4 pb-4 pt-1">
          {/* 数据源模式指示：一眼看出当前跑演示还是真实识别 */}
          <div className="mb-2.5 flex items-center gap-2">
            <Chip tone={dataSource === 'api' ? 'good' : 'mid'}>{dataSource === 'api' ? '真实识别' : '演示模式'}</Chip>
            {dataSource === 'api' ? (
              <span className="faint min-w-0 flex-1 truncate text-[12px]">后端 {apiBase}</span>
            ) : (
              <span className="faint min-w-0 flex-1 text-[12px]">填写后端地址后自动切换真实识别</span>
            )}
          </div>
          <div className="api-base-row">
            <input
              ref={apiInputRef}
              className="api-base-input"
              type="text"
              defaultValue={apiBase || ''}
              placeholder="如 http://192.168.1.5:8000"
              autoComplete="off"
              spellCheck={false}
              onFocus={(e) => e.target.select()}
            />
            <Button variant="primary" onClick={onSaveApiBase}>
              保存
            </Button>
            <Button variant="ghost" onClick={onClearApiBase}>
              清空
            </Button>
          </div>
        </div>
      </div>

      {/* 处理与分析 */}
      <div className="eyebrow mb-2">处理与分析</div>
      <div className="set-list">
        <div className="set-row">
          <div className="ic">
            <IconWave size={18} />
          </div>
          <div className="t" style={{ flex: 1 }}>
            <b>高通滤波降噪</b>
            <span>削弱低频人为噪声 (P1)</span>
          </div>
          <Toggle checked={state.highpass} onChange={(v) => dispatch({ type: 'SET_HIGHPASS', value: v })} />
        </div>
        <div className="set-row">
          <div className="ic">
            <IconMic size={18} />
          </div>
          <div className="t" style={{ flex: 1 }}>
            <b>实时录音分析</b>
            <span>录完即分析 (P1)</span>
          </div>
          <Toggle checked={state.realtime} onChange={(v) => dispatch({ type: 'SET_REALTIME', value: v })} />
        </div>
      </div>

      {/* 导出与说明 */}
      <div className="eyebrow mb-2">导出与说明</div>
      <div className="set-list">
        <div className="set-row" onClick={onExport}>
          <div className="ic">
            <IconShare size={18} />
          </div>
          <div className="t" style={{ flex: 1 }}>
            <b>导出格式</b>
            <span>图片（PNG）已支持 · PDF 后续版本</span>
          </div>
          <Chip>PNG</Chip>
        </div>
        <div className="set-row" onClick={() => dispatch({ type: 'GO', screen: 'method' })}>
          <div className="ic">
            <IconInfo size={18} />
          </div>
          <div className="t" style={{ flex: 1 }}>
            <b>方法学与关于</b>
            <span>为何用声音 · 算法说明</span>
          </div>
          <IconChevronRight size={16} className="text-ink-faint" />
        </div>
        <div className="set-row" onClick={() => dispatch({ type: 'GO', screen: 'sample' })}>
          <div className="ic">
            <IconChart size={18} />
          </div>
          <div className="t" style={{ flex: 1 }}>
            <b>样例音频管理</b>
            <span>BirdNET 官方样例</span>
          </div>
          <IconChevronRight size={16} className="text-ink-faint" />
        </div>
      </div>
    </div>
  );
}
