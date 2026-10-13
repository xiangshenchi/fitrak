import { verifyToken, getCookie, json } from './_auth.js';

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  if (url.pathname.endsWith('/api/login')) return next();
  const token = getCookie(request, 'fit_auth');
  if (!(await verifyToken(env.AUTH_SECRET, token))) {
    return json({ error: 'unauthorized' }, 401);
  }
  return next();
}
