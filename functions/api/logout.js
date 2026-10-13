import { json } from './_auth.js';

export async function onRequestPost() {
  return json({ ok: true }, 200, {
    'Set-Cookie': 'fit_auth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
  });
}
