/**
 * authService.js
 * 《林间回响》v2 登录系统 —— 用户名 + 密码（无手机号/邮箱，不提供找回）。
 *
 * 实现：
 *  - 复用 apiService 的 request 工具（fetch + AbortController 超时，同步风格一致）；
 *  - token 存 localStorage `ljx_token`（长期有效，服务端 token 表），用户名存 `ljx_username`；
 *  - 离线可用策略：App 启动只读 token 判定登录态，不强制 me 校验（后端不可达也能进主界面）；
 *  - 公开署名默认：localStorage `ljx_sign_anonymous` = 'username' | 'anonymous'，默认 'username'，
 *    设置页设定后上传公共地图时按此默认传 isAnonymous。
 */
import { request, TOKEN_KEY, USERNAME_KEY } from './apiService.js';

const SIGN_KEY = 'ljx_sign_anonymous';

/** 读取登录 token（存储受限 / 未登录返回 null） */
export function getToken() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem(TOKEN_KEY);
    return v && String(v).trim() ? String(v).trim() : null;
  } catch (e) {
    return null;
  }
}

/** 读取用户名快照（离线展示当前账号用） */
export function getUsername() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem(USERNAME_KEY);
    return v && String(v).trim() ? String(v).trim() : null;
  } catch (e) {
    return null;
  }
}

/** 是否已登录：有 token 即视为登录（离线可用，不强制 me 校验） */
export function isLoggedIn() {
  return !!getToken();
}

/**
 * 保存登录会话（登录 / 注册成功自动登录后调用）。
 * @param {string} token 服务端返回的 token
 * @param {string} username 用户名
 * @returns {boolean} 恒 true
 */
export function setSession(token, username) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, String(token));
      if (username) localStorage.setItem(USERNAME_KEY, String(username));
      else localStorage.removeItem(USERNAME_KEY);
    }
  } catch (e) {
    /* 存储受限忽略 */
  }
  return true;
}

/** 清除登录会话（登出） */
export function clearSession() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USERNAME_KEY);
    }
  } catch (e) {
    /* 存储受限忽略 */
  }
  return true;
}

/**
 * 注册（POST /api/auth/register）→ 201 {token, username}；用户名被占返回 409 {error,detail}。
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{token:string, username:string}>}
 */
export function register(username, password) {
  return request('/api/auth/register', {
    method: 'POST',
    json: { username: String(username == null ? '' : username), password: String(password == null ? '' : password) },
    fn: 'register',
  });
}

/**
 * 登录（POST /api/auth/login）→ 200 {token, username}；凭据错误返回 401 {error,detail}。
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{token:string, username:string}>}
 */
export function login(username, password) {
  return request('/api/auth/login', {
    method: 'POST',
    json: { username: String(username == null ? '' : username), password: String(password == null ? '' : password) },
    fn: 'login',
  });
}

/**
 * 登出（POST /api/auth/logout，Bearer token）→ {ok:true}。
 * 未登录时直接返回 ok，不发请求；后端不可达由调用方兜底本地清会话。
 * @returns {Promise<{ok:boolean}>}
 */
export function logout() {
  const token = getToken();
  if (!token) return Promise.resolve({ ok: true });
  return request('/api/auth/logout', { method: 'POST', token, fn: 'logout' });
}

/**
 * 当前账号信息（GET /api/auth/me，Bearer token）→ {username, createdAt}。
 * @returns {Promise<{username:string, createdAt:string}>}
 */
export function me() {
  return request('/api/auth/me', { token: getToken(), fn: 'me' });
}

/**
 * 公开署名默认：'username'（用我的用户名）| 'anonymous'（匿名）。
 * @returns {'username'|'anonymous'}
 */
export function getSignAnonymous() {
  try {
    if (typeof localStorage === 'undefined') return 'username';
    return localStorage.getItem(SIGN_KEY) === 'anonymous' ? 'anonymous' : 'username';
  } catch (e) {
    return 'username';
  }
}

/**
 * 设置公开署名默认（'username' 为默认值，存 anonymous 时写入；其余清除键回退默认）。
 * @param {'username'|'anonymous'} mode
 * @returns {'username'|'anonymous'} 实际生效值
 */
export function setSignAnonymous(mode) {
  const v = mode === 'anonymous' ? 'anonymous' : 'username';
  try {
    if (typeof localStorage !== 'undefined') {
      if (v === 'anonymous') localStorage.setItem(SIGN_KEY, v);
      else localStorage.removeItem(SIGN_KEY);
    }
  } catch (e) {
    /* 存储受限忽略 */
  }
  return v;
}
