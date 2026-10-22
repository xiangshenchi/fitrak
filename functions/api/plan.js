import { json } from './_auth.js';
import { tutorialFallbackUrl } from './_tutorials.js';

export async function onRequestGet({ env, context }) {
  const uid = context?.data?.user?.uid;
  if (uid == null) return json({ error: "unauthorized" }, 401);
  const [days, ex, tut] = await env.DB.batch([
    env.DB.prepare('SELECT id, name FROM plan_days WHERE user_id = ? ORDER BY id').bind(uid),
    env.DB.prepare(`SELECT id, day_id, sort, name, equipment, target_sets, target_reps
                    FROM plan_exercises
                    WHERE day_id IN (SELECT id FROM plan_days WHERE user_id = ?)
                    ORDER BY day_id, sort`).bind(uid),
    env.DB.prepare('SELECT exercise_name, url FROM exercise_tutorials'),
  ]);
  const tutByName = new Map(tut.results.map(t => [t.exercise_name, t.url]));
  const out = days.results.map(d => ({
    ...d,
    exercises: ex.results.filter(e => e.day_id === d.id).map(e => ({
      ...e,
      tutorial_url: tutByName.get(e.name) || tutorialFallbackUrl(e.name),
    })),
  }));
  return json({ days: out });
}
