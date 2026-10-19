import { json } from './_auth.js';

export async function onRequestPost({ request }) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return json({ ok: true }, 200, {
    'Set-Cookie': `fit_auth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
  });
}
