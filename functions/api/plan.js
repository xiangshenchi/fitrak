import { json } from './_auth.js';

export async function onRequestGet({ env }) {
  const { results: days } = await env.DB.prepare('SELECT id, name FROM plan_days ORDER BY id').all();
  const { results: ex } = await env.DB.prepare(
    'SELECT id, day_id, sort, name, equipment, target_sets, target_reps FROM plan_exercises ORDER BY day_id, sort'
  ).all();
  const out = days.map(d => ({ ...d, exercises: ex.filter(e => e.day_id === d.id) }));
  return json({ days: out });
}
