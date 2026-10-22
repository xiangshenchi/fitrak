import { describe, it, expect } from 'vitest';
import { onRequestPost as bwPost } from '../functions/api/body-weights.js';
import { onRequestDelete as sessDelete } from '../functions/api/sessions.js';
import { onRequestGet as logsGet, onRequestDelete as logsDelete } from '../functions/api/set-logs.js';
import { onRequestGet as statsGet } from '../functions/api/stats.js';

// env.DB 传 null：若校验正确，非法入参在触达 DB 之前即返回 400（不会抛错）
// data 由 middleware 注入；缺失时应 401
const ctx = (url, opts) => ({
  request: new Request(url, opts),
  env: { DB: null },
  data: { user: { uid: 1, demo: false } },
});

describe('auth guard', () => {
  it('returns 401 when middleware data is missing', async () => {
    const res = await statsGet({ request: new Request('https://x/api/stats?monthStart=2026-10-01'), env: { DB: null } });
    expect(res.status).toBe(401);
  });
});

describe('body-weights POST validation', () => {
  it('rejects negative weight', async () => {
    const res = await bwPost(ctx('https://x/api/body-weights', {
      method: 'POST', body: JSON.stringify({ date: '2026-10-01', weight: -5 }),
    }));
    expect(res.status).toBe(400);
  });
  it('rejects NaN weight', async () => {
    const res = await bwPost(ctx('https://x/api/body-weights', {
      method: 'POST', body: JSON.stringify({ date: '2026-10-01', weight: NaN }),
    }));
    expect(res.status).toBe(400);
  });
  it('rejects bad date', async () => {
    const res = await bwPost(ctx('https://x/api/body-weights', {
      method: 'POST', body: JSON.stringify({ date: '2026/10/01', weight: 70 }),
    }));
    expect(res.status).toBe(400);
  });
});

describe('sessions DELETE validation', () => {
  it('rejects non-integer id', async () => {
    const res = await sessDelete(ctx('https://x/api/sessions?id=abc', { method: 'DELETE' }));
    expect(res.status).toBe(400);
  });
});

describe('set-logs validation', () => {
  it('rejects non-integer session_id', async () => {
    const res = await logsGet(ctx('https://x/api/set-logs?session_id=abc'));
    expect(res.status).toBe(400);
  });
  it('rejects non-integer id on delete', async () => {
    const res = await logsDelete(ctx('https://x/api/set-logs?id=abc', { method: 'DELETE' }));
    expect(res.status).toBe(400);
  });
});

describe('stats monthStart validation', () => {
  it('rejects missing monthStart', async () => {
    const res = await statsGet(ctx('https://x/api/stats'));
    expect(res.status).toBe(400);
  });
  it('rejects malformed monthStart', async () => {
    const res = await statsGet(ctx('https://x/api/stats?monthStart=2026-10'));
    expect(res.status).toBe(400);
  });
});
