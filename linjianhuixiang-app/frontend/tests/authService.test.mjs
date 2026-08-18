/**
 * authService.test.mjs
 * v2 登录系统（src/services/authService.js）单元测试：
 *  - 会话存取（ljx_token / ljx_username）；
 *  - 公开署名默认（ljx_sign_anonymous：username | anonymous，默认 username）；
 *  - register/login/logout 请求构造（复用 apiService.request：fetch + Bearer token）。
 * 运行：node --test tests/authService.test.mjs
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as auth from '../src/services/authService.js';
import { TOKEN_KEY, USERNAME_KEY } from '../src/services/apiService.js';

/** 简易 localStorage 模拟（Node 环境无原生实现） */
function createFakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
    _map: map,
  };
}

const fake = createFakeStorage();

beforeEach(() => {
  fake.clear();
  globalThis.localStorage = fake;
  globalThis.fetch = undefined; // 每个网络用例自行 mock，避免误触真实网络
});

describe('authService：会话存取', () => {
  test('未登录默认态', () => {
    assert.equal(auth.isLoggedIn(), false);
    assert.equal(auth.getToken(), null);
    assert.equal(auth.getUsername(), null);
  });

  test('setSession 保存 token 与用户名；getToken/getUsername/isLoggedIn 反映', () => {
    auth.setSession('tok-1', '绿荫观察员');
    assert.equal(fake._map.get(TOKEN_KEY), 'tok-1', `应写入 ${TOKEN_KEY}`);
    assert.equal(fake._map.get(USERNAME_KEY), '绿荫观察员', `应写入 ${USERNAME_KEY}`);
    assert.equal(auth.getToken(), 'tok-1');
    assert.equal(auth.getUsername(), '绿荫观察员');
    assert.equal(auth.isLoggedIn(), true);
  });

  test('setSession 无用户名时清除用户名键', () => {
    auth.setSession('t', 'old');
    auth.setSession('t2', null);
    assert.equal(auth.getUsername(), null);
  });

  test('clearSession 清空 token 与用户名', () => {
    auth.setSession('t', 'u');
    auth.clearSession();
    assert.equal(auth.getToken(), null);
    assert.equal(auth.getUsername(), null);
    assert.equal(auth.isLoggedIn(), false);
  });
});

describe('authService：公开署名默认', () => {
  test('默认用我的用户名（username）', () => {
    assert.equal(auth.getSignAnonymous(), 'username');
  });

  test('setSignAnonymous(anonymous) 持久化；回退 username 清除键', () => {
    auth.setSignAnonymous('anonymous');
    assert.equal(auth.getSignAnonymous(), 'anonymous');
    assert.equal(fake._map.get('ljx_sign_anonymous'), 'anonymous');
    auth.setSignAnonymous('username');
    assert.equal(auth.getSignAnonymous(), 'username');
    assert.equal(fake._map.has('ljx_sign_anonymous'), false, '默认值应清键回退');
  });
});

describe('authService：请求构造（复用 apiService.request）', () => {
  test('login 构造 POST /api/auth/login JSON 体并解析响应', async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return { status: 200, json: async () => ({ token: 'abc', username: 'birdman' }) };
    };
    const res = await auth.login('birdman', 'secret');
    assert.equal(res.token, 'abc');
    assert.equal(res.username, 'birdman');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/auth\/login$/);
    assert.equal(calls[0].opts.method, 'POST');
    assert.equal(calls[0].opts.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].opts.body), { username: 'birdman', password: 'secret' });
  });

  test('register 构造 POST /api/auth/register JSON 体并解析 201 响应', async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return { status: 201, json: async () => ({ token: 'abc', username: 'newbie' }) };
    };
    const res = await auth.register('newbie', 'pw');
    assert.equal(res.username, 'newbie');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/auth\/register$/);
    assert.equal(calls[0].opts.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].opts.body), { username: 'newbie', password: 'pw' });
  });

  test('login 失败透传后端 error（HTTP 401）', async () => {
    globalThis.fetch = async () => ({
      status: 401,
      json: async () => ({ error: '用户名或密码错误', detail: 'invalid credentials' }),
    });
    await assert.rejects(auth.login('x', 'y'), /用户名或密码错误/);
  });

  test('register 用户名被占透传 409', async () => {
    globalThis.fetch = async () => ({
      status: 409,
      json: async () => ({ error: '用户名已被占用', detail: 'username exists' }),
    });
    await assert.rejects(auth.register('taken', 'pw'), /用户名已被占用/);
  });

  test('logout 携带 Bearer token 且 method POST', async () => {
    auth.setSession('tok-xyz', 'u');
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return { status: 200, json: async () => ({ ok: true }) };
    };
    const res = await auth.logout();
    assert.deepEqual(res, { ok: true });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/auth\/logout$/);
    assert.equal(calls[0].opts.method, 'POST');
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok-xyz');
  });

  test('logout 未登录直接返回 ok（不发请求）', async () => {
    auth.clearSession();
    globalThis.fetch = async () => {
      throw new Error('不应发起请求');
    };
    const res = await auth.logout();
    assert.deepEqual(res, { ok: true });
  });

  test('me 请求携带 Bearer token', async () => {
    auth.setSession('tok-me', 'u');
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return { status: 200, json: async () => ({ username: 'u', createdAt: '2026-08-18T00:00:00+00:00' }) };
    };
    const res = await auth.me();
    assert.equal(res.username, 'u');
    assert.match(calls[0].url, /\/api\/auth\/me$/);
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok-me');
  });
});
