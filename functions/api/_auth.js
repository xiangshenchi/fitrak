const enc = new TextEncoder();

async function hmacKey(secret, usage) {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage
  );
}

function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

export async function signToken(secret, exp) {
  const payload = `v1.${exp}`;
  const key = await hmacKey(secret, ['sign']);
  return `${payload}.${b64(await crypto.subtle.sign('HMAC', key, enc.encode(payload)))}`;
}

export async function verifyToken(secret, token) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [v, exp, sig] = parts;
  if (v !== 'v1') return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now()) return false;
  let sigBytes;
  try { sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0)); } catch { return false; }
  // 交给 WebCrypto 校验：比较本身是常量时间，避免签名逐字节比较的时序侧信道
  const key = await hmacKey(secret, ['verify']);
  return crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(`${v}.${exp}`));
}

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
