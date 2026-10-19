import { describe, it, expect } from 'vitest';
import { signToken, verifyToken, getCookie } from '../functions/api/_auth.js';

describe('auth token', () => {
  const secret = 'test-secret';
  it('verifies a fresh token', async () => {
    const t = await signToken(secret, Date.now() + 100000);
    expect(await verifyToken(secret, t)).toBe(true);
  });
  it('rejects a tampered token', async () => {
    const t = await signToken(secret, Date.now() + 100000);
    expect(await verifyToken(secret, t + 'x')).toBe(false);
  });
  it('rejects an expired token', async () => {
    const t = await signToken(secret, Date.now() - 1000);
    expect(await verifyToken(secret, t)).toBe(false);
  });
  it('rejects a token signed with another secret', async () => {
    const t = await signToken('other-secret', Date.now() + 100000);
    expect(await verifyToken(secret, t)).toBe(false);
  });
  it('rejects malformed tokens', async () => {
    expect(await verifyToken(secret, '')).toBe(false);
    expect(await verifyToken(secret, 'only.two')).toBe(false);
    expect(await verifyToken(secret, 'v2.9999999999999.sig')).toBe(false);
    expect(await verifyToken(secret, 'v1.abc.signature')).toBe(false);
    expect(await verifyToken(secret, 'v1.9999999999999.not-base64!')).toBe(false);
  });
});

describe('getCookie', () => {
  const req = cookie => ({ headers: { get: () => cookie } });
  it('reads a cookie among others and decodes it', () => {
    expect(getCookie(req('a=1; fit_auth=abc%2Edef; b=2'), 'fit_auth')).toBe('abc.def');
  });
  it('returns null when missing', () => {
    expect(getCookie(req('a=1; b=2'), 'fit_auth')).toBeNull();
    expect(getCookie(req(null), 'fit_auth')).toBeNull();
  });
  it('does not match a suffix of another cookie name', () => {
    expect(getCookie(req('not_fit_auth=1'), 'fit_auth')).toBeNull();
  });
});
