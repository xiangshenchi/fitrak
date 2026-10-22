import { json } from './_auth.js';
import { isValidLogRow, isPositiveInt } from './_validate.js';

export async function onRequestGet({ request, env, data }) {
  const uid = data?.user?.uid;
  if (uid == null) return json({ error: 'unauthorized' }, 401);
  const sid = Number(new URL(request.url).searchParams.get('session_id'));
  if (!isPositiveInt(sid)) return json({ error: 'invalid session_id' }, 400);
  const { results } = await env.DB.prepare(
    `SELECT l.id, l.session_id, l.plan_exercise_id, l.set_no, l.weight, l.reps
     FROM set_logs l JOIN sessions s ON s.id = l.session_id
     WHERE l.session_id = ? AND s.user_id = ?
     ORDER BY l.plan_exercise_id, l.set_no`
  ).bind(sid, uid).all();
  return json({ logs: results });
}

export async function onRequestPost({ request, env, data }) {
  const uid = data?.user?.uid;
  if (uid == null) return json({ error: 'unauthorized' }, 401);
  let b; try { b = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  if (!Number.isInteger(b.session_id)) {
    return json({ error: 'session_id, plan_exercise_id, set_no required' }, 400);
  }
  if (!isValidLogRow(b)) return json({ error: 'invalid log row' }, 400);
  // session_id 必须归属当前用户
  const own = await env.DB.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?').bind(b.session_id, uid).first();
  if (!own) return json({ error: 'session not found' }, 404);
  const r = await env.DB.prepare(
    'INSERT INTO set_logs (session_id, plan_exercise_id, set_no, weight, reps) VALUES (?,?,?,?,?)'
  ).bind(b.session_id, b.plan_exercise_id, b.set_no, b.weight ?? null, b.reps ?? null).run();
  return json({ id: r.meta.last_row_id }, 201);
}

export async function onRequestDelete({ request, env, data }) {
  const uid = data?.user?.uid;
  if (uid == null) return json({ error: 'unauthorized' }, 401);
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!isPositiveInt(id)) return json({ error: 'invalid id' }, 400);
  const own = await env.DB.prepare(
    `SELECT l.id FROM set_logs l JOIN sessions s ON s.id = l.session_id
     WHERE l.id = ? AND s.user_id = ?`
  ).bind(id, uid).first();
  if (!own) return json({ error: 'not found' }, 404);
  await env.DB.prepare('DELETE FROM set_logs WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
