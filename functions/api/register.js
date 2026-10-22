import { signToken, pbkdf2Hash, json } from './_auth.js';
import { ensureSchema } from './_schema.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;

// 克隆 owner(user_id=1) 的 plan_days + plan_exercises 到新用户
// owner 老数据可能 user_id 仍为 NULL，一并兼容
async function cloneOwnerPlan(env, newUid) {
  const days = await env.DB.prepare(
    'SELECT id, name FROM plan_days WHERE user_id = 1 OR user_id IS NULL ORDER BY id'
  ).all();
  const oldToNewDayId = new Map();
  for (const d of days.results) {
    const r = await env.DB.prepare(
      'INSERT INTO plan_days (user_id, name) VALUES (?, ?)'
    ).bind(newUid, d.name).run();
    oldToNewDayId.set(d.id, r.meta.last_row_id);
  }
  for (const d of days.results) {
    const exs = await env.DB.prepare(
      'SELECT sort, name, equipment, target_sets, target_reps FROM plan_exercises WHERE day_id = ?'
    ).bind(d.id).all();
    const newDayId = oldToNewDayId.get(d.id);
    const stmts = exs.results.map(e =>
      env.DB.prepare(
        'INSERT INTO plan_exercises (user_id, day_id, sort, name, equipment, target_sets, target_reps) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(newUid, newDayId, e.sort, e.name, e.equipment, e.target_sets, e.target_reps)
    );
    if (stmts.length) await env.DB.batch(stmts);
  }
}

function setCookieHeader(request, token) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return { 'Set-Cookie': `fit_auth=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}` };
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const username = (body.username || '').trim();
  const password = body.password || '';

  try {
    await ensureSchema(env);
  } catch {
    return json({ error: '数据库结构初始化失败，请检查 D1 绑定' }, 500);
  }

  // 限流（复用 login_attempts 表）
  try {
    const { n } = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND ts > ?'
    ).bind(ip, Date.now() - WINDOW_MS).first();
    if (n >= MAX_FAILS) return json({ error: '尝试次数过多，请 15 分钟后再试' }, 429);
  } catch { }

  if (!username || username.length < 3 || username.length > 20) {
    return json({ error: '用户名需 3-20 字符' }, 400);
  }
  if (!password || password.length < 6) {
    return json({ error: '密码至少 6 位' }, 400);
  }
  if (body.confirm && body.confirm !== password) {
    return json({ error: '两次密码不一致' }, 400);
  }

  const exist = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (exist) return json({ error: '用户名已存在' }, 409);

  const { hash, salt } = await pbkdf2Hash(password);
  const r = await env.DB.prepare(
    'INSERT INTO users (username, pwd_hash, pwd_salt, created_at) VALUES (?, ?, ?, ?)'
  ).bind(username, hash, salt, Date.now()).run();
  const newUid = r.meta.last_row_id;

  // 克隆 owner 默认计划（失败不阻断注册）
  try { await cloneOwnerPlan(env, newUid); } catch { /* 静默 */ }

  const token = await signToken(env.AUTH_SECRET, { uid: newUid, demo: false }, Date.now() + 1000 * 60 * 60 * 24 * 30);
  return json({ ok: true, username }, 201, setCookieHeader(request, token));
}
