import { json } from './_auth.js';
import { tutorialFallbackUrl } from './_tutorials.js';

export async function onRequestGet({ env }) {
  const [days, ex, tut] = await env.DB.batch([
    env.DB.prepare('SELECT id, name FROM plan_days ORDER BY id'),
    env.DB.prepare('SELECT id, day_id, sort, name, equipment, target_sets, target_reps FROM plan_exercises ORDER BY day_id, sort'),
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
