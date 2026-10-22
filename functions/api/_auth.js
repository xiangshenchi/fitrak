const enc = new TextEncoder();
const dec = new TextDecoder();

async function hmacKey(secret, usage) {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage
  );
}

function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64url(buf) {
  return b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

// ============ PBKDF2 ============

export async function pbkdf2Hash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const dk = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 60000, hash: 'SHA-256' },
    keyMaterial, 32 * 8
  );
  return { hash: b64(dk), salt: b64(salt) };
}

export async function pbkdf2Verify(password, hashB64, saltB64) {
  try {
    const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const dk = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 60000, hash: 'SHA-256' },
      keyMaterial, 32 * 8
    );
    return b64(dk) === hashB64;
  } catch { return false; }
}

// ============ Token ============

// signToken 保持 v1 接口向后兼容：signToken(secret, exp) 是 v1；signToken(secret, {uid,demo}, exp) 是 v2
export async function signToken(secret, payloadOrExp, maybeExp) {
  let payload;
  if (typeof payloadOrExp === 'object') {
    const exp = maybeExp ?? (Date.now() + 1000 * 60 * 60 * 24 * 30);
    payload = JSON.stringify({ v: 2, ...payloadOrExp, exp });
  } else {
    // v1 旧接口
    payload = `v1.${payloadOrExp}`;
  }
  const key = await hmacKey(secret, ['sign']);
  return b64url(enc.encode(payload)) + '.' + b64url(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
}

export function parseToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    const json = dec.decode(fromB64url(parts[0]));
    const obj = JSON.parse(json);
    return obj;
  } catch { return null; }
}

export async function verifyToken(secret, token) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  let payload;
  try { payload = dec.decode(fromB64url(parts[0])); } catch { return false; }
  // v2 格式：带 JSON + exp 检查
  try {
    const p = JSON.parse(payload);
    if (p.v === 2 && (!p.exp || p.exp < Date.now())) return false;
  } catch { /* v1 格式（纯字符串 "v1.<exp>"）：也检查过期 */
    try {
      const m = payload.match(/^v1\.(\d+)$/);
      if (m && Number(m[1]) < Date.now()) return false;
    } catch { }
  }
  try {
    const sigBytes = fromB64url(parts[1]);
    const key = await hmacKey(secret, ['verify']);
    return crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(payload));
  } catch { return false; }
}

// ============ HTTP 工具（不变） ============

export function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const m = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}
