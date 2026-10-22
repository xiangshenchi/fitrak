import { signToken, pbkdf2Hash, pbkdf2Verify, json } from './_auth.js';
import { ensureSchema } from './_schema.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const KEEP_MS = 24 * 60 * 60 * 1000;

async function recordFailure(env, ip) {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO login_attempts (ip, ts) VALUES (?, ?)').bind(ip, Date.now()),
    env.DB.prepare('DELETE FROM login_attempts WHERE ts < ?').bind(Date.now() - KEEP_MS),
  ]);
}

// 幂等：users 表为空时用 APP_PASSWORD 初始化 owner；每次登录都回填 user_id 为 NULL 的老数据
async function ensureOwner(env) {
  if (env.APP_PASSWORD) {
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
    if (n === 0) {
      const { hash, salt } = await pbkdf2Hash(env.APP_PASSWORD);
      try {
        await env.DB.prepare(
          'INSERT INTO users (username, pwd_hash, pwd_salt, created_at) VALUES (?, ?, ?, ?)'
        ).bind('owner', hash, salt, Date.now()).run();
      } catch { /* 并发下可能已被插入 */ }
    }
  }
  try {
    await env.DB.batch([
      env.DB.prepare('UPDATE sessions SET user_id = 1 WHERE user_id IS NULL'),
      env.DB.prepare('UPDATE set_logs SET user_id = 1 WHERE user_id IS NULL'),
      env.DB.prepare('UPDATE body_weights SET user_id = 1 WHERE user_id IS NULL'),
      env.DB.prepare('UPDATE plan_days SET user_id = 1 WHERE user_id IS NULL'),
      env.DB.prepare('UPDATE plan_exercises SET user_id = 1 WHERE user_id IS NULL'),
    ]);
  } catch { /* 表结构异常时忽略 */ }
}

function setCookieHeader(request, token) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return { 'Set-Cookie': `fit_auth=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}` };
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  // Demo 模式：跳过密码直接给 owner 只读 token
  if (body.demo === true) {
    const token = await signToken(env.AUTH_SECRET, { uid: 1, demo: true }, Date.now() + 1000 * 60 * 60 * 24 * 30);
    return json({ ok: true, demo: true }, 200, setCookieHeader(request, token));
  }

  // 幂等自愈：补齐 users 表 / user_id 列，再初始化 owner
  try {
    await ensureSchema(env);
    await ensureOwner(env);
  } catch {
    return json({ error: '数据库结构初始化失败，请检查 D1 绑定' }, 500);
  }

  // 限流
  try {
    const { n } = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND ts > ?'
    ).bind(ip, Date.now() - WINDOW_MS).first();
    if (n >= MAX_FAILS) return json({ error: '尝试次数过多，请 15 分钟后再试' }, 429);
  } catch { /* login_attempts 表可能未迁移 */ }

  const username = body.username;
  const password = body.password;
  if (!password) return json({ error: 'password required' }, 400);

  let ok = false, uid = null;

  if (username) {
    // 新格式：username + password
    const user = await env.DB.prepare('SELECT id, pwd_hash, pwd_salt FROM users WHERE username = ?')
      .bind(username).first();
    if (user) {
      ok = await pbkdf2Verify(password, user.pwd_hash, user.pwd_salt);
      uid = user.id;
    }
  } else {
    // 老格式：只有 password → 尝试 owner 登录
    const owner = await env.DB.prepare("SELECT id, pwd_hash, pwd_salt FROM users WHERE username = 'owner'").first();
    if (owner) {
      ok = await pbkdf2Verify(password, owner.pwd_hash, owner.pwd_salt);
      uid = owner.id;
    }
  }

  if (!ok || !uid) {
    try { await recordFailure(env, ip); } catch { }
    return json({ error: 'invalid credentials' }, 401);
  }

  try { await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run(); } catch { }

  const token = await signToken(env.AUTH_SECRET, { uid, demo: false }, Date.now() + 1000 * 60 * 60 * 24 * 30);
  return json({ ok: true }, 200, setCookieHeader(request, token));
}
