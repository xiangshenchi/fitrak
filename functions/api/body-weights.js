import { json } from './_auth.js';
import { isValidDate, isValidWeight } from './_validate.js';

export async function onRequestGet({ env, data }) {
  const uid = data?.user?.uid;
  if (uid == null) return json({ error: 'unauthorized' }, 401);
  const { results } = await env.DB.prepare(
    'SELECT id, date, weight FROM body_weights WHERE user_id = ? ORDER BY date'
  ).bind(uid).all();
  return json({ weights: results });
}

export async function onRequestPost({ request, env, data }) {
  const uid = data?.user?.uid;
  if (uid == null) return json({ error: 'unauthorized' }, 401);
  let b; try { b = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  if (!isValidDate(b.date) || !isValidWeight(b.weight)) return json({ error: 'invalid date or weight' }, 400);
  const r = await env.DB.prepare(
    'INSERT INTO body_weights (user_id, date, weight) VALUES (?, ?, ?)'
  ).bind(uid, b.date, b.weight).run();
  return json({ id: r.meta.last_row_id }, 201);
}

export async function onRequestDelete({ request, env, data }) {
  const uid = data?.user?.uid;
  if (uid == null) return json({ error: 'unauthorized' }, 401);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);
  await env.DB.prepare('DELETE FROM body_weights WHERE id = ? AND user_id = ?').bind(id, uid).run();
  return json({ ok: true });
}
