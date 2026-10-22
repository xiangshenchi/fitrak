import { verifyToken, parseToken, json } from './_auth.js';

// 白名单：无需登录即可访问
const PUBLIC_PATHS = ['/api/login', '/api/register'];

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (PUBLIC_PATHS.some(p => url.pathname.endsWith(p))) return next();

  const token = getCookie(request, 'fit_auth');
  if (!(await verifyToken(env.AUTH_SECRET, token))) {
    return json({ error: 'unauthorized' }, 401);
  }

  const parsed = parseToken(token);
  if (!parsed) return json({ error: 'unauthorized' }, 401);

  // v2 token: 有 uid/demo；v1 token（老格式）自动升级为 owner
  if (parsed.v !== 2 || parsed.uid == null) {
    context.data = { user: { uid: 1, demo: false } };
  } else {
    context.data = { user: { uid: parsed.uid, demo: !!parsed.demo } };
  }

  // Demo 模式只允许 GET
  if (context.data.user.demo && request.method !== 'GET') {
    return json({ error: 'demo_mode_readonly' }, 403);
  }

  return next();
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const m = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
