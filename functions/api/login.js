import { signToken, json } from './_auth.js';

const WINDOW_MS = 15 * 60 * 1000;  // 统计窗口 15 分钟
const MAX_FAILS = 10;              // 窗口内允许的失败次数
const KEEP_MS = 24 * 60 * 60 * 1000;

// 登录失败按来源 IP 计数；login_attempts 未迁移（表不存在）时静默降级为不限流
async function recordFailure(env, ip) {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO login_attempts (ip, ts) VALUES (?, ?)').bind(ip, Date.now()),
    env.DB.prepare('DELETE FROM login_attempts WHERE ts < ?').bind(Date.now() - KEEP_MS),
  ]);
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  try {
    const { n } = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND ts > ?'
    ).bind(ip, Date.now() - WINDOW_MS).first();
    if (n >= MAX_FAILS) return json({ error: '尝试次数过多，请 15 分钟后再试' }, 429);
  } catch { /* 表未迁移：跳过限流 */ }

  if (!body.password || body.password !== env.APP_PASSWORD) {
    try { await recordFailure(env, ip); } catch { /* 同上 */ }
    return json({ error: 'invalid password' }, 401);
  }

  try { await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run(); } catch { /* 同上 */ }

  const exp = Date.now() + 1000 * 60 * 60 * 24 * 30; // 30 天
  const token = await signToken(env.AUTH_SECRET, exp);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''; // 本地 http 下不加，线上自动带上
  return json({ ok: true }, 200, {
    'Set-Cookie': `fit_auth=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`,
  });
}
