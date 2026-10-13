import { json } from './_auth.js';

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const from = u.searchParams.get('from');
  const to = u.searchParams.get('to');
  let q = 'SELECT id, date, day_id, note FROM sessions';
  const binds = [];
  if (from && to) { q += ' WHERE date BETWEEN ? AND ?'; binds.push(from, to); }
  q += ' ORDER BY date DESC, id DESC';
  const { results } = await env.DB.prepare(q).bind(...binds).all();
  return json({ sessions: results });
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  if (!b.date || !b.day_id) return json({ error: 'date and day_id required' }, 400);
  const r = await env.DB.prepare(
    'INSERT INTO sessions (date, day_id, note) VALUES (?, ?, ?)'
  ).bind(b.date, b.day_id, b.note ?? null).run();
  return json({ id: r.meta.last_row_id }, 201);
}

export async function onRequestDelete({ request, env }) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);
  await env.DB.prepare('DELETE FROM set_logs WHERE session_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
