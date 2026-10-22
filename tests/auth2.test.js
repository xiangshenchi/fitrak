import { describe, it, expect } from 'vitest';
import { pbkdf2Hash, pbkdf2Verify, signToken, verifyToken, parseToken } from '../functions/api/_auth.js';

describe('PBKDF2', () => {
  it('hash 32 bytes output + 16 bytes salt, verify 正确密码通过', async () => {
    const r = await pbkdf2Hash('hello');
    expect(r.hash).toBeTruthy();
    expect(r.salt).toBeTruthy();
    expect(r.hash.length).toBeGreaterThan(20);
    const ok = await pbkdf2Verify('hello', r.hash, r.salt);
    expect(ok).toBe(true);
  });

  it('错误密码 verify 失败', async () => {
    const r = await pbkdf2Hash('hello');
    const bad = await pbkdf2Verify('wrong', r.hash, r.salt);
    expect(bad).toBe(false);
  });

  it('每次 hash 盐不同', async () => {
    const a = await pbkdf2Hash('x');
    const b = await pbkdf2Hash('x');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('v2 Token', () => {
  const SECRET = 'test-secret-123';

  it('带 uid/demo 的 v2 token 可解析可校验', async () => {
    const exp = Date.now() + 3600_000;
    const token = await signToken(SECRET, { uid: 7, demo: false }, exp);
    const parsed = parseToken(token);
    expect(parsed.v).toBe(2);
    expect(parsed.uid).toBe(7);
    expect(parsed.demo).toBe(false);
    expect(parsed.exp).toBeGreaterThan(Date.now());
    expect(await verifyToken(SECRET, token)).toBe(true);
  });

  it('demo=true 可解析', async () => {
    const token = await signToken(SECRET, { uid: 1, demo: true }, Date.now() + 3600_000);
    expect(parseToken(token).demo).toBe(true);
  });

  it('签名错误 verify 返回 false', async () => {
    const token = await signToken('correct', { uid: 1 }, Date.now() + 3600_000);
    expect(await verifyToken('wrong', token)).toBe(false);
  });

  it('v2 token 过期后 verify 返回 false', async () => {
    const token = await signToken(SECRET, { uid: 1 }, -1000); // exp = Date.now() - 1000 + exp ≈ 已过期
    // signToken 里 exp = maybeExp ?? (Date.now() + ...)，传 -1000 会被当作负数直接用
    // 实际 exp = -1000，parseToken 解析后 exp < Date.now()
    const parsed = parseToken(token);
    expect(parsed.exp).toBeLessThan(Date.now());
    expect(await verifyToken(SECRET, token)).toBe(false);
  });
});

describe('向后兼容 v1 token', () => {
  const SECRET = 'test-secret-123';

  it('老 signToken(secret, exp) 接口仍可用', async () => {
    const exp = Date.now() + 3600_000;
    const token = await signToken(SECRET, exp); // 第二个参数是数字（v1 格式）
    expect(await verifyToken(SECRET, token)).toBe(true);
  });

  it('v1 token parseToken 返回 null（不是 JSON）', async () => {
    const exp = Date.now() + 3600_000;
    const token = await signToken(SECRET, exp);
    expect(parseToken(token)).toBeNull();
  });
});
