import { json } from './_auth.js';
import { isValidDate } from './_validate.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

// 记录页专用：按 (date, id) 倒序游标分页，一次返回本页 session 及其明细，避免 N+1
// 游标格式：before=<date>,<id>，取比该条更早的记录
export async function onRequestGet({ request, env, context = { data: { user: { uid: 1, demo: false } } } }) {
  const uid = context.data?.user?.uid || 1;
  const u = new URL(request.url);
  let limit = Number(u.searchParams.get('limit') ?? DEFAULT_LIMIT);
  if (!Number.isInteger(limit) || limit <= 0) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);

  const before = u.searchParams.get('before');
  const binds = [uid];
  let where = 'WHERE user_id = ?';
  if (before) {
    const [d, i] = before.split(',');
    const bid = Number(i);
    if (isValidDate(d) && Number.isInteger(bid)) {
      where += ' AND (date < ? OR (date = ? AND id < ?))';
      binds.push(d, d, bid);
    }
  }

  // 多取 1 条用于判断是否还有更多
  const { results } = await env.DB.prepare(
    `SELECT id, date, day_id, note FROM sessions ${where} ORDER BY date DESC, id DESC LIMIT ?`
  ).bind(...binds, limit + 1).all();

  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;

  let logs = [];
  if (items.length) {
    const ph = items.map(() => '?').join(',');
    const r = await env.DB.prepare(
      `SELECT id, session_id, plan_exercise_id, set_no, weight, reps
       FROM set_logs WHERE session_id IN (${ph}) ORDER BY plan_exercise_id, set_no`
    ).bind(...items.map(s => s.id)).all();
    logs = r.results;
  }

  const byId = new Map(items.map(s => [s.id, { ...s, logs: [] }]));
  for (const l of logs) byId.get(l.session_id)?.logs.push(l);
  return json({ items: [...byId.values()], hasMore });
}
