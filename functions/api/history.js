import { json } from './_auth.js';

// 记录页专用：一次取回所有 session 及其明细，避免前端逐个 session 发请求（N+1）
export async function onRequestGet({ env }) {
  const [sessions, logs] = await env.DB.batch([
    env.DB.prepare('SELECT id, date, day_id, note FROM sessions ORDER BY date DESC, id DESC'),
    env.DB.prepare('SELECT id, session_id, plan_exercise_id, set_no, weight, reps FROM set_logs ORDER BY plan_exercise_id, set_no'),
  ]);
  const byId = new Map(sessions.results.map(s => [s.id, { ...s, logs: [] }]));
  for (const l of logs.results) byId.get(l.session_id)?.logs.push(l);
  return json({ items: [...byId.values()] });
}
