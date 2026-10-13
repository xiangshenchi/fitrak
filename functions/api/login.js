import { signToken, json } from './_auth.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  if (!body.password || body.password !== env.APP_PASSWORD) {
    return json({ error: 'invalid password' }, 401);
  }
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 30; // 30 天
  const token = await signToken(env.AUTH_SECRET, exp);
  return json({ ok: true }, 200, {
    'Set-Cookie': `fit_auth=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`,
  });
}
