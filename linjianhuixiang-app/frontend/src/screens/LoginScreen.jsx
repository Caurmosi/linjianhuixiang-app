/**
 * LoginScreen.jsx
 * 开屏登录 / 注册合一页（v2）：
 *  - Tab 切换：登录 / 注册（用户名 + 密码，无手机号/邮箱）；
 *  - 错误提示（后端 error / detail 透传）；loading 态；注册成功自动登录；
 *  - 「继续使用（不登录）」跳过 → 游客态：本地功能可用，上传公共地图需登录。
 *
 * 登录成功（setSession + SET_USER）后 App 门控自动进入主界面（state.user 非空）。
 */
import { useState } from 'react';
import { useApp } from '../store/appStore.jsx';
import Button from '../components/ui/Button';
import { IconLeaf } from '../components/icons';
import { login, register, setSession } from '../services/authService';
import { uploadBackup } from '../services/syncService';
import { humanizeBackendError } from '../utils/errorText';

export default function LoginScreen() {
  const { dispatch } = useApp();
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /** 登录 / 注册提交：注册成功由后端直接返回 token → 自动登录 */
  const submit = async () => {
    const u = username.trim();
    const p = password;
    if (!u) {
      setError('请输入用户名');
      return;
    }
    if (!p) {
      setError('请输入密码');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const fn = tab === 'register' ? register : login;
      const res = await fn(u, p);
      const token = res && res.token;
      const name = (res && res.username) || u;
      if (!token) throw new Error('服务未返回登录凭证');
      setSession(token, name);
      dispatch({ type: 'SET_USER', username: name });
      dispatch({ type: 'TOAST', message: tab === 'register' ? '注册成功，已自动登录' : '登录成功' });
      // 登录成功 → 静默把本地数据备份到账号（失败不打断登录）
      uploadBackup().catch(() => {});
    } catch (err) {
      const reason = humanizeBackendError(err && err.message ? err.message : '未知错误');
      setError(reason || '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  /** 游客跳过：不登录直接使用（无 token，上传公共地图时提示需登录） */
  const skip = () => {
    dispatch({ type: 'SKIP_LOGIN' });
  };

  return (
    <div className="login-screen">
      <div className="login-hero">
        <div className="login-logo">
          <IconLeaf size={30} />
        </div>
        <h1>林间回响</h1>
        <p>城市鸟类宜居度 · 声景诊断</p>
      </div>

      <div className="login-card">
        <div className="seg">
          <button
            className={tab === 'login' ? 'on' : ''}
            onClick={() => {
              setTab('login');
              setError('');
            }}
          >
            登录
          </button>
          <button
            className={tab === 'register' ? 'on' : ''}
            onClick={() => {
              setTab('register');
              setError('');
            }}
          >
            注册
          </button>
        </div>

        <label className="login-label">用户名</label>
        <input
          className="save-panel-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="设置唯一用户名（注册后不提供找回）"
          autoComplete={tab === 'register' ? 'username' : 'username'}
          spellCheck={false}
        />

        <label className="login-label">密码</label>
        <input
          className="save-panel-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="请输入密码"
          autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />

        {error ? <p className="login-error">{error}</p> : null}

        <Button variant="primary" onClick={submit} disabled={loading}>
          {loading ? (tab === 'register' ? '注册中…' : '登录中…') : tab === 'register' ? '注册并登录' : '登录'}
        </Button>

        <div className="login-skip">
          <button onClick={skip}>继续使用（不登录）</button>
          <span>本地功能可用 · 上传到公共地图需登录</span>
        </div>
      </div>

      <p className="login-note">登录用于上传地区记录到公共地图；分析结果保存在手机本地。</p>
    </div>
  );
}
