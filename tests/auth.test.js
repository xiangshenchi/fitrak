import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from '../functions/api/_auth.js';

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
});
