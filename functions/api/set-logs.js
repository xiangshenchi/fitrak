import { json } from './_auth.js';
import { isValidLogRow } from './_validate.js';

export async function onRequestGet({ request, env }) {
  const sid = new URL(request.url).searchParams.get('session_id');
  if (!sid) return json({ error: 'session_id required' }, 400);
  const { results } = await env.DB.prepare(
    'SELECT id, session_id, plan_exercise_id, set_no, weight, reps FROM set_logs WHERE session_id = ? ORDER BY plan_exercise_id, set_no'
  ).bind(sid).all();
  return json({ logs: results });
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  if (!Number.isInteger(b.session_id)) {
    return json({ error: 'session_id, plan_exercise_id, set_no required' }, 400);
  }
  if (!isValidLogRow(b)) return json({ error: 'invalid log row' }, 400);
  const r = await env.DB.prepare(
    'INSERT INTO set_logs (session_id, plan_exercise_id, set_no, weight, reps) VALUES (?,?,?,?,?)'
  ).bind(b.session_id, b.plan_exercise_id, b.set_no, b.weight ?? null, b.reps ?? null).run();
  return json({ id: r.meta.last_row_id }, 201);
}

export async function onRequestDelete({ request, env }) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);
  await env.DB.prepare('DELETE FROM set_logs WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
