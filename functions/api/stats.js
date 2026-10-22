import { json } from './_auth.js';
import { isValidDate } from './_validate.js';

// 打卡页专用只读聚合：避免前端拉取全部明细
// monthStart 由前端按本地时区计算（如 2026-10-01），规避 Workers UTC 时区偏差
export async function onRequestGet({ request, env, context = { data: { user: { uid: 1, demo: false } } } }) {
  const uid = context.data?.user?.uid || 1;
  const monthStart = new URL(request.url).searchParams.get('monthStart');
  if (!isValidDate(monthStart)) return json({ error: 'invalid monthStart' }, 400);

  const [totals, dates] = await env.DB.batch([
    env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM sessions WHERE user_id = ?) AS total_sessions,
        (SELECT COUNT(*) FROM sessions WHERE user_id = ? AND date >= ?) AS month_sessions,
        (SELECT COALESCE(SUM(COALESCE(l.weight,0) * COALESCE(l.reps,0)), 0)
           FROM set_logs l JOIN sessions s ON s.id = l.session_id
          WHERE s.user_id = ?) AS total_volume,
        (SELECT COALESCE(SUM(COALESCE(l.weight,0) * COALESCE(l.reps,0)), 0)
           FROM set_logs l JOIN sessions s ON s.id = l.session_id
          WHERE s.user_id = ? AND s.date >= ?) AS month_volume`
    ).bind(uid, uid, monthStart, uid, uid, monthStart),
    env.DB.prepare('SELECT DISTINCT date FROM sessions WHERE user_id = ? ORDER BY date').bind(uid),
  ]);

  const t = totals.results[0] || {};
  return json({
    totalSessions: t.total_sessions ?? 0,
    monthSessions: t.month_sessions ?? 0,
    totalVolume: t.total_volume ?? 0,
    monthVolume: t.month_volume ?? 0,
    dates: dates.results.map(r => r.date),
  });
}
