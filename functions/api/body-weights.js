import { json } from './_auth.js';
import { isValidDate, isValidWeight } from './_validate.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT id, date, weight FROM body_weights ORDER BY date'
  ).all();
  return json({ weights: results });
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  if (!isValidDate(b.date) || !isValidWeight(b.weight)) return json({ error: 'invalid date or weight' }, 400);
  const r = await env.DB.prepare(
    'INSERT INTO body_weights (date, weight) VALUES (?, ?)'
  ).bind(b.date, b.weight).run();
  return json({ id: r.meta.last_row_id }, 201);
}

export async function onRequestDelete({ request, env }) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);
  await env.DB.prepare('DELETE FROM body_weights WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
