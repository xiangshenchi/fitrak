import { json } from './_auth.js';
import { isValidDate, isValidLogRow, isPositiveInt } from './_validate.js';

const MAX_LOGS = 200;

export async function onRequestGet({ request, env, context = { data: { user: { uid: 1, demo: false } } } }) {
  const uid = context.data?.user?.uid || 1;
  const u = new URL(request.url);
  const from = u.searchParams.get('from');
  const to = u.searchParams.get('to');
  let q = 'SELECT id, date, day_id, note FROM sessions WHERE user_id = ?';
  const binds = [uid];
  if (from && to) { q += ' AND date BETWEEN ? AND ?'; binds.push(from, to); }
  q += ' ORDER BY date DESC, id DESC';
  const { results } = await env.DB.prepare(q).bind(...binds).all();
  return json({ sessions: results });
}

// 保存一次训练：同一天同一训练日复用已有 session，重复保存覆盖明细而非新增记录
export async function onRequestPost({ request, env, context = { data: { user: { uid: 1, demo: false } } } }) {
  const uid = context.data?.user?.uid || 1;
  let b; try { b = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  if (!isValidDate(b.date) || !Number.isInteger(b.day_id)) {
    return json({ error: 'date and day_id required' }, 400);
  }

  const logs = Array.isArray(b.logs) ? b.logs : null;
  if (logs) {
    if (!logs.length || logs.length > MAX_LOGS) return json({ error: `明细数量需在 1-${MAX_LOGS} 之间` }, 400);
    if (!logs.every(isValidLogRow)) return json({ error: 'invalid log row' }, 400);
  }

  const existing = await env.DB.prepare(
    'SELECT id FROM sessions WHERE user_id = ? AND date = ? AND day_id = ? ORDER BY id DESC LIMIT 1'
  ).bind(uid, b.date, b.day_id).first();
  const sessionId = existing
    ? existing.id
    : (await env.DB.prepare('INSERT INTO sessions (user_id, date, day_id, note) VALUES (?, ?, ?, ?)')
        .bind(uid, b.date, b.day_id, b.note ?? null).run()).meta.last_row_id;

  if (!logs) return json({ id: sessionId, reused: !!existing }, existing ? 200 : 201);

  // 删除旧明细 + 写入本次全部明细，放在同一 batch 里保证原子性
  const stmts = [env.DB.prepare('DELETE FROM set_logs WHERE session_id = ?').bind(sessionId)];
  for (const l of logs) {
    stmts.push(env.DB.prepare(
      'INSERT INTO set_logs (session_id, plan_exercise_id, set_no, weight, reps) VALUES (?,?,?,?,?)'
    ).bind(sessionId, l.plan_exercise_id, l.set_no, l.weight ?? null, l.reps ?? null));
  }
  await env.DB.batch(stmts);
  return json({ id: sessionId, saved: logs.length, reused: !!existing });
}

export async function onRequestDelete({ request, env, context = { data: { user: { uid: 1, demo: false } } } }) {
  const uid = context.data?.user?.uid || 1;
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!isPositiveInt(id)) return json({ error: 'invalid id' }, 400);
  // 只能删自己的 session
  const own = await env.DB.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?').bind(id, uid).first();
  if (!own) return json({ error: 'not found' }, 404);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM set_logs WHERE session_id = ?').bind(id),
    env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}
