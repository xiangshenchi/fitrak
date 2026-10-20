# 健身记录 App 优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **提交约定**：所有 `git commit` 步骤仅在用户明确同意提交后执行；否则跳过，保留改动待用户确认。

**Goal:** 在保持 Cloudflare 免费套餐可部署的前提下，修复后端健壮性问题、为 history 加分页、新增动作教程链接与打卡页统计，并重写项目文档。

**Architecture:** 无构建静态前端（原生 HTML/CSS/JS）+ Cloudflare Pages Functions（`functions/api/*`）+ D1（绑定名 `DB`）。新增业务数据（教程链接）落库为独立表 `exercise_tutorials`，便于 `wrangler d1 export` 迁移。新增只读聚合端点 `/api/stats` 供打卡页使用。

**Tech Stack:** 原生 HTML/CSS/JS、Chart.js 4.5.1（本地 vendored）、Cloudflare Pages Functions、D1（SQLite）、Vitest 2.x、Wrangler 3.x

**规格来源：** [2026-10-20-fitness-app-optimization-design.md](../specs/2026-10-20-fitness-app-optimization-design.md)

---

## 文件结构（本计划涉及的文件与职责）

| 文件 | 动作 | 职责 |
|---|---|---|
| `functions/api/_validate.js` | 改 | 请求字段校验纯函数（新增 `isPositiveInt` / `isValidWeight`） |
| `functions/api/_tutorials.js` | 建 | 教程回退链接生成纯函数 `tutorialFallbackUrl` |
| `functions/api/body-weights.js` | 改 | 体重接口：接入严格校验 |
| `functions/api/sessions.js` | 改 | 训练会话：删除校验 + 原子化 |
| `functions/api/set-logs.js` | 改 | 组明细：id 校验 |
| `functions/api/history.js` | 改 | 记录聚合：limit/before 游标分页 |
| `functions/api/plan.js` | 改 | 计划：查询合并 + 附教程链接 |
| `functions/api/stats.js` | 建 | 打卡页统计（只读聚合） |
| `migrations/0003_exercise_tutorials.sql` | 建 | 教程表 + 数据（幂等） |
| `schema.sql` | 改 | 新库：加教程表与数据、加顶部风险注释 |
| `public/app.js` | 改 | 记录页分页、今日页缓存、教程链接、打卡页重排 |
| `public/_headers` | 改 | 静态资源缓存策略 |
| `public/styles.css` | 改 | 打卡页新增区块样式 |
| `package.json` | 改 | db:init / db:migrate 脚本 |
| `.dev.vars.example` | 建 | 本地密钥模板 |
| `README.md` | 改 | 主文档重写 |
| `docs/API.md` | 建 | 接口一览 |
| `docs/DATA-MODEL.md` | 建 | 数据模型与迁移策略 |
| `tests/validate.test.js` | 改 | 新校验函数单测 |
| `tests/tutorials.test.js` | 建 | 回退链接单测 |
| `tests/handlers.test.js` | 建 | 非法入参 → 400 的处理器单测 |

---

## Task 1: 新增校验纯函数（TDD）

**Files:**
- Modify: `functions/api/_validate.js`
- Test: `tests/validate.test.js`

- [ ] **Step 1: 写失败测试**

在 `tests/validate.test.js` 顶部 import 处追加，并在文件末尾追加：

```js
import { isValidDate, isValidLogRow, isPositiveInt, isValidWeight } from '../functions/api/_validate.js';
```

```js
describe('isPositiveInt', () => {
  it('accepts positive integers', () => {
    expect(isPositiveInt(1)).toBe(true);
    expect(isPositiveInt(42)).toBe(true);
  });
  it('rejects zero, negatives, floats, strings, non-numbers', () => {
    expect(isPositiveInt(0)).toBe(false);
    expect(isPositiveInt(-1)).toBe(false);
    expect(isPositiveInt(1.5)).toBe(false);
    expect(isPositiveInt('1')).toBe(false);
    expect(isPositiveInt(NaN)).toBe(false);
    expect(isPositiveInt(null)).toBe(false);
  });
});

describe('isValidWeight', () => {
  it('accepts a realistic weight', () => {
    expect(isValidWeight(72.5)).toBe(true);
    expect(isValidWeight(0.5)).toBe(true);
    expect(isValidWeight(500)).toBe(true);
  });
  it('rejects zero, negatives, oversize, NaN, strings', () => {
    expect(isValidWeight(0)).toBe(false);
    expect(isValidWeight(-5)).toBe(false);
    expect(isValidWeight(501)).toBe(false);
    expect(isValidWeight(NaN)).toBe(false);
    expect(isValidWeight(Infinity)).toBe(false);
    expect(isValidWeight('72')).toBe(false);
    expect(isValidWeight(null)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/validate.test.js`
Expected: FAIL（`isPositiveInt is not a function` 之类）

- [ ] **Step 3: 最小实现**

在 `functions/api/_validate.js` 末尾追加：

```js
// 正整数字段（id / session_id 等）
export function isPositiveInt(v) {
  return Number.isInteger(v) && v > 0;
}

// 体重：合理人体范围 (0, 500] kg，仅接受有限数字
export function isValidWeight(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 500;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- tests/validate.test.js`
Expected: PASS

- [ ] **Step 5: 提交（需用户同意）**

```bash
git add functions/api/_validate.js tests/validate.test.js
git commit -m "feat: add isPositiveInt and isValidWeight validators"
```

---

## Task 2: 接口接入严格校验 + 删除原子化

**Files:**
- Modify: `functions/api/body-weights.js`
- Modify: `functions/api/sessions.js`
- Modify: `functions/api/set-logs.js`
- Test: `tests/handlers.test.js`（新建）

- [ ] **Step 1: 写失败测试（处理器非法入参 → 400，且不触碰 DB）**

新建 `tests/handlers.test.js`：

```js
import { describe, it, expect } from 'vitest';
import { onRequestPost as bwPost } from '../functions/api/body-weights.js';
import { onRequestDelete as sessDelete } from '../functions/api/sessions.js';
import { onRequestGet as logsGet, onRequestDelete as logsDelete } from '../functions/api/set-logs.js';

// env.DB 传 null：若校验正确，非法入参在触达 DB 之前即返回 400（不会抛错）
const req = (url, opts) => new Request(url, opts);
const ctx = (url, opts) => ({ request: req(url, opts), env: { DB: null } });

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
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/handlers.test.js`
Expected: FAIL（当前实现会因 `env.DB` 为 null 抛出，或用宽松校验放行）

- [ ] **Step 3: 改 body-weights.js**

`functions/api/body-weights.js` 头部 import 改为：

```js
import { json } from './_auth.js';
import { isValidDate, isValidWeight } from './_validate.js';
```

`onRequestPost` 校验行替换为：

```js
  if (!isValidDate(b.date) || !isValidWeight(b.weight)) return json({ error: 'invalid date or weight' }, 400);
```

- [ ] **Step 4: 改 sessions.js（删除原子化 + 校验）**

`functions/api/sessions.js` 头部 import 改为：

```js
import { json } from './_auth.js';
import { isValidDate, isValidLogRow, isPositiveInt } from './_validate.js';
```

`onRequestDelete` 整体替换为：

```js
export async function onRequestDelete({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!isPositiveInt(id)) return json({ error: 'invalid id' }, 400);
  // 明细与会话一次 batch 删除，保证原子，避免半删残留
  await env.DB.batch([
    env.DB.prepare('DELETE FROM set_logs WHERE session_id = ?').bind(id),
    env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}
```

- [ ] **Step 5: 改 set-logs.js（id 校验）**

`functions/api/set-logs.js` 头部 import 改为：

```js
import { json } from './_auth.js';
import { isValidLogRow, isPositiveInt } from './_validate.js';
```

`onRequestGet` 开头替换为：

```js
export async function onRequestGet({ request, env }) {
  const sid = Number(new URL(request.url).searchParams.get('session_id'));
  if (!isPositiveInt(sid)) return json({ error: 'invalid session_id' }, 400);
```

`onRequestDelete` 整体替换为：

```js
export async function onRequestDelete({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!isPositiveInt(id)) return json({ error: 'invalid id' }, 400);
  await env.DB.prepare('DELETE FROM set_logs WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
```

- [ ] **Step 6: 运行确认通过**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 7: 提交（需用户同意）**

```bash
git add functions/api/body-weights.js functions/api/sessions.js functions/api/set-logs.js tests/handlers.test.js
git commit -m "fix: validate request ids/weights and make session delete atomic"
```

---

## Task 3: schema.sql 风险提示

**Files:**
- Modify: `schema.sql:1`

- [ ] **Step 1: 加顶部注释**

在 `schema.sql` 第 1 行之前插入：

```sql
-- ⚠️ 本脚本用于【全新数据库】：会 DROP TABLE 重建，执行后原有数据将全部丢失。
--    已有数据（本地或线上）请改用 migrations/ 下的增量脚本：
--    本地: npm run db:migrate:local   线上: npm run db:migrate:remote
```

- [ ] **Step 2: 验证语法（本地起库执行一次）**

Run: `npm run db:init:local`
Expected: 输出 `Executed N queries`，无报错。（本地 `.wrangler` 目录会被重建）

- [ ] **Step 3: 提交（需用户同意）**

```bash
git add schema.sql
git commit -m "docs: warn that schema.sql drops existing data"
```

---

## Task 4: history 分页（接口 + 前端「加载更多」）

**Files:**
- Modify: `functions/api/history.js`
- Modify: `public/app.js:450-504`

- [ ] **Step 1: 重写 history.js**

`functions/api/history.js` 全部内容替换为：

```js
import { json } from './_auth.js';
import { isValidDate } from './_validate.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

// 记录页专用：按 (date, id) 倒序游标分页，一次返回本页 session 及其明细，避免 N+1
// 游标格式：before=<date>,<id>，取比该条更早的记录
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  let limit = Number(u.searchParams.get('limit') ?? DEFAULT_LIMIT);
  if (!Number.isInteger(limit) || limit <= 0) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);

  const before = u.searchParams.get('before');
  const binds = [];
  let where = '';
  if (before) {
    const [d, i] = before.split(',');
    const bid = Number(i);
    if (isValidDate(d) && Number.isInteger(bid)) {
      where = 'WHERE (date < ? OR (date = ? AND id < ?))';
      binds.push(d, d, bid);
    }
  }

  // 多取 1 条用于判断是否还有更多
  const { results } = await env.DB.prepare(
    `SELECT id, date, day_id, note FROM sessions ${where} ORDER BY date DESC, id DESC LIMIT ?`
  ).bind(...binds, limit + 1).all();

  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;

  let logs = [];
  if (items.length) {
    const ph = items.map(() => '?').join(',');
    const r = await env.DB.prepare(
      `SELECT id, session_id, plan_exercise_id, set_no, weight, reps
       FROM set_logs WHERE session_id IN (${ph}) ORDER BY plan_exercise_id, set_no`
    ).bind(...items.map(s => s.id)).all();
    logs = r.results;
  }

  const byId = new Map(items.map(s => [s.id, { ...s, logs: [] }]));
  for (const l of logs) byId.get(l.session_id)?.logs.push(l);
  return json({ items: [...byId.values()], hasMore });
}
```

- [ ] **Step 2: 改前端记录页**

把 `public/app.js` 中 `renderHistory`（约 450-504 行）整体替换为下面两个函数：

```js
/* ============================================================
   历史记录（游标分页，首屏 50 条 + 加载更多）
   ============================================================ */
let histState = { items: [], hasMore: false, next: null };

async function renderHistory(reset = true) {
  const { days } = await getPlan();
  const dayName = id => (days.find(d => d.id === id) || {}).name || `Day${id}`;
  const exName = id => {
    for (const d of days) {
      const e = d.exercises.find(x => x.id === id);
      if (e) return e.name;
    }
    return `动作${id}`;
  };

  if (reset) {
    const first = await api('/api/history');
    histState = { items: first.items, hasMore: first.hasMore, next: null };
  } else {
    if (!histState.next) return;
    const more = await api('/api/history?before=' + encodeURIComponent(histState.next));
    histState.items = histState.items.concat(more.items);
    histState.hasMore = more.hasMore;
  }
  const last = histState.items[histState.items.length - 1];
  histState.next = last ? `${last.date},${last.id}` : null;

  const detailHtml = s => {
    const valid = s.logs.filter(l => l.weight != null || l.reps != null);
    if (!valid.length) return '<span class="loading-txt">无明细</span>';
    const groups = {};
    valid.forEach(l => { (groups[l.plan_exercise_id] = groups[l.plan_exercise_id] || []).push(l); });
    const vol = valid.reduce((a, l) => a + (Number(l.weight) || 0) * (Number(l.reps) || 0), 0);
    return `<div class="hist-vol">总容量 ${fmtVolume(vol)} · ${valid.length} 组</div>` +
      Object.keys(groups).map(pid => {
        const g = groups[pid].sort((a, b) => a.set_no - b.set_no);
        return `<div class="hist-ex">
          <span class="hist-ex-name">${escapeHtml(exName(Number(pid)))}</span>
          <span class="hist-ex-sets">${g.map(l => `${l.weight ?? '-'}kg×${l.reps ?? '-'}`).join(' · ')}</span>
        </div>`;
      }).join('');
  };

  app.innerHTML = `<main>
    <div class="page-head"><h1>训练记录</h1><p>已加载 ${histState.items.length} 次训练</p></div>
    ${histState.items.length ? histState.items.map(s => `
      <section class="card hist-card">
        <div class="hist-head">
          <div>
            <div class="hist-date">${escapeHtml(s.date)}</div>
            <div class="hist-day">${escapeHtml(dayName(s.day_id))}</div>
          </div>
          <button type="button" class="btn-del" data-del="${s.id}">删除</button>
        </div>
        <div class="hist-detail">${detailHtml(s)}</div>
      </section>`).join('') : '<div class="empty">还没有训练记录，去「今天」记录一次吧。</div>'}
    ${histState.hasMore ? '<button type="button" class="primary big" id="histMore">加载更多</button>' : ''}
  </main>`;

  const moreBtn = document.getElementById('histMore');
  if (moreBtn) moreBtn.onclick = async () => {
    moreBtn.disabled = true;
    try { await renderHistory(false); }
    catch { toast('加载失败，请重试', 'error'); moreBtn.disabled = false; }
  };

  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const ok = await askConfirm('删除这次训练？此操作不可恢复。', { confirmText: '删除' });
    if (!ok) return;
    try {
      await api('/api/sessions?id=' + b.dataset.del, { method: 'DELETE' });
      toast('已删除该次训练');
      renderHistory(true);
    } catch {
      toast('删除失败，请重试', 'error');
    }
  });
}
```

- [ ] **Step 3: 语法自检**

Run: `node --check public/app.js`
Expected: 无输出（语法通过）

- [ ] **Step 4: 端到端手测（需本地服务）**

Run: `npm run dev`（另开终端）→ 浏览器打开 `http://localhost:8788`，登录后进「记录」页。
Expected: 首屏最多 50 条；若超过 50 条出现「加载更多」且点击后追加；「已加载 N 次训练」计数递增。

- [ ] **Step 5: 提交（需用户同意）**

```bash
git add functions/api/history.js public/app.js
git commit -m "feat: paginate history with cursor and load-more button"
```

---

## Task 5: 教程表与数据（schema.sql + 迁移 0003）

**Files:**
- Modify: `schema.sql`
- Create: `migrations/0003_exercise_tutorials.sql`

> 链接已于 2026-10-20 逐条 WebFetch 实测可访问（MuscleWiki，免费含示范）。`手臂收尾:三头下压+弯举` 为组合动作、无单一页面，走回退搜索（Task 6 处理）。

- [ ] **Step 1: schema.sql 增加教程表与数据**

在 `schema.sql` 中 `CREATE INDEX idx_login_attempts_ip_ts ...;` 之后、`INSERT INTO plan_days ...` 之前插入：

```sql
-- 动作示范教程链接（动作名 -> MuscleWiki 具体页；缺失时前端回退为站内检索）
CREATE TABLE IF NOT EXISTS exercise_tutorials (
  exercise_name TEXT PRIMARY KEY,
  url           TEXT NOT NULL
);

INSERT OR REPLACE INTO exercise_tutorials (exercise_name, url) VALUES
  ('哑铃卧推', 'https://musclewiki.com/exercise/dumbbell-bench-press'),
  ('上斜哑铃卧推', 'https://musclewiki.com/exercise/dumbbell-incline-bench-press'),
  ('龙门架夹胸', 'https://musclewiki.com/exercise/cable-pec-fly'),
  ('哑铃肩推', 'https://musclewiki.com/exercise/dumbbell-seated-overhead-press'),
  ('绳索下压(三头)', 'https://musclewiki.com/exercise/cable-rope-pushdown'),
  ('俯卧撑', 'https://musclewiki.com/exercise/push-up'),
  ('哑铃高脚杯深蹲', 'https://musclewiki.com/exercise/dumbbell-goblet-squat'),
  ('腿举机', 'https://musclewiki.com/exercise/machine-leg-press'),
  ('腿屈伸机', 'https://musclewiki.com/exercise/machine-leg-extension'),
  ('提踵', 'https://musclewiki.com/exercise/machine-standing-calf-raises'),
  ('平板支撑', 'https://musclewiki.com/exercise/forearm-plank'),
  ('高位下拉', 'https://musclewiki.com/exercise/machine-pulldown'),
  ('坐姿划船', 'https://musclewiki.com/exercise/machine-seated-cable-row'),
  ('绳索/哑铃弯举', 'https://musclewiki.com/exercise/dumbbell-curl'),
  ('锤式弯举', 'https://musclewiki.com/exercise/dumbbell-hammer-curl'),
  ('哑铃侧平举', 'https://musclewiki.com/exercise/dumbbell-lateral-raise'),
  ('哑铃罗马尼亚硬拉', 'https://musclewiki.com/exercise/dumbbell-romanian-deadlift'),
  ('保加利亚分腿蹲/臀腿训练', 'https://musclewiki.com/exercise/bulgarian-split-squat'),
  ('腿弯举机', 'https://musclewiki.com/exercise/machine-hamstring-curl'),
  ('臀桥', 'https://musclewiki.com/exercise/glute-bridge');
```

- [ ] **Step 2: 新建迁移 0003**

新建 `migrations/0003_exercise_tutorials.sql`（内容与 Step 1 保持同步的一致性注释 + 同样的 DDL/DML）：

```sql
-- 0003: 动作示范教程链接表（幂等，可重复执行）
-- 用法：npx wrangler d1 execute fitness-db --local  --file=./migrations/0003_exercise_tutorials.sql
--       npx wrangler d1 execute fitness-db --remote --file=./migrations/0003_exercise_tutorials.sql
-- 注意：本文件的动作->链接数据须与 schema.sql 中的 exercise_tutorials 保持一致。

CREATE TABLE IF NOT EXISTS exercise_tutorials (
  exercise_name TEXT PRIMARY KEY,
  url           TEXT NOT NULL
);

INSERT OR REPLACE INTO exercise_tutorials (exercise_name, url) VALUES
  ('哑铃卧推', 'https://musclewiki.com/exercise/dumbbell-bench-press'),
  ('上斜哑铃卧推', 'https://musclewiki.com/exercise/dumbbell-incline-bench-press'),
  ('龙门架夹胸', 'https://musclewiki.com/exercise/cable-pec-fly'),
  ('哑铃肩推', 'https://musclewiki.com/exercise/dumbbell-seated-overhead-press'),
  ('绳索下压(三头)', 'https://musclewiki.com/exercise/cable-rope-pushdown'),
  ('俯卧撑', 'https://musclewiki.com/exercise/push-up'),
  ('哑铃高脚杯深蹲', 'https://musclewiki.com/exercise/dumbbell-goblet-squat'),
  ('腿举机', 'https://musclewiki.com/exercise/machine-leg-press'),
  ('腿屈伸机', 'https://musclewiki.com/exercise/machine-leg-extension'),
  ('提踵', 'https://musclewiki.com/exercise/machine-standing-calf-raises'),
  ('平板支撑', 'https://musclewiki.com/exercise/forearm-plank'),
  ('高位下拉', 'https://musclewiki.com/exercise/machine-pulldown'),
  ('坐姿划船', 'https://musclewiki.com/exercise/machine-seated-cable-row'),
  ('绳索/哑铃弯举', 'https://musclewiki.com/exercise/dumbbell-curl'),
  ('锤式弯举', 'https://musclewiki.com/exercise/dumbbell-hammer-curl'),
  ('哑铃侧平举', 'https://musclewiki.com/exercise/dumbbell-lateral-raise'),
  ('哑铃罗马尼亚硬拉', 'https://musclewiki.com/exercise/dumbbell-romanian-deadlift'),
  ('保加利亚分腿蹲/臀腿训练', 'https://musclewiki.com/exercise/bulgarian-split-squat'),
  ('腿弯举机', 'https://musclewiki.com/exercise/machine-hamstring-curl'),
  ('臀桥', 'https://musclewiki.com/exercise/glute-bridge');
```

- [ ] **Step 3: 本地执行迁移并核对行数**

Run: `npm run db:migrate:local` 然后 `npx wrangler d1 execute fitness-db --local --command="SELECT COUNT(*) AS n FROM exercise_tutorials"`
Expected: `n = 20`；再次执行迁移无报错（幂等）。

- [ ] **Step 4: 提交（需用户同意）**

```bash
git add schema.sql migrations/0003_exercise_tutorials.sql
git commit -m "feat: add exercise_tutorials table with verified MuscleWiki links"
```

---

## Task 6: plan 接口附教程链接 + 回退函数 + 前端入口

**Files:**
- Create: `functions/api/_tutorials.js`
- Modify: `functions/api/plan.js`
- Modify: `public/app.js`（`renderPlan`、`renderToday` 的动作头）
- Test: `tests/tutorials.test.js`（新建）

- [ ] **Step 1: 写失败测试**

新建 `tests/tutorials.test.js`：

```js
import { describe, it, expect } from 'vitest';
import { tutorialFallbackUrl } from '../functions/api/_tutorials.js';

describe('tutorialFallbackUrl', () => {
  it('builds a musclewiki-scoped search URL and encodes the name', () => {
    const url = tutorialFallbackUrl('手臂收尾:三头下压+弯举');
    expect(url.startsWith('https://www.bing.com/search?q=')).toBe(true);
    expect(url).toContain('site%3Amusclewiki.com');
    expect(url).not.toContain(' ');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/tutorials.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 _tutorials.js**

新建 `functions/api/_tutorials.js`：

```js
// 教程回退链接：极少数未预置精确链接的动作，回退为限定 MuscleWiki 的站内检索
export function tutorialFallbackUrl(name) {
  return 'https://www.bing.com/search?q=' +
    encodeURIComponent(`site:musclewiki.com ${name}`);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- tests/tutorials.test.js`
Expected: PASS

- [ ] **Step 5: 改 plan.js**

`functions/api/plan.js` 全部内容替换为：

```js
import { json } from './_auth.js';
import { tutorialFallbackUrl } from './_tutorials.js';

export async function onRequestGet({ env }) {
  const [days, ex, tut] = await env.DB.batch([
    env.DB.prepare('SELECT id, name FROM plan_days ORDER BY id'),
    env.DB.prepare('SELECT id, day_id, sort, name, equipment, target_sets, target_reps FROM plan_exercises ORDER BY day_id, sort'),
    env.DB.prepare('SELECT exercise_name, url FROM exercise_tutorials'),
  ]);
  const tutByName = new Map(tut.results.map(t => [t.exercise_name, t.url]));
  const out = days.results.map(d => ({
    ...d,
    exercises: ex.results.filter(e => e.day_id === d.id).map(e => ({
      ...e,
      tutorial_url: tutByName.get(e.name) || tutorialFallbackUrl(e.name),
    })),
  }));
  return json({ days: out });
}
```

- [ ] **Step 6: 改前端计划页（加「示范」链接）**

`public/app.js` 中 `renderPlan` 里 `<li>` 模板那一行替换为：

```js
          ${d.exercises.map(e => `<li><span class="pe-name">${escapeHtml(e.name)}</span><span class="pe-meta">${e.target_sets}×${e.target_reps} · ${escapeHtml(e.equipment || '自重')}</span><a class="pe-demo" href="${escapeHtml(e.tutorial_url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(e.name)} 动作示范">示范</a></li>`).join('')}
```

- [ ] **Step 7: 改前端今日页（动作头加「示范」链接）**

`public/app.js` 中 `draw()` 里 `ex-head` 的动作标题块（`<div class="ex-titles">...</div>` 那段）替换为：

```js
          <div class="ex-titles">
            <div class="ex-name">${escapeHtml(e.name)}<a class="ex-demo" href="${escapeHtml(e.tutorial_url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(e.name)} 动作示范">↗</a></div>
            <div class="ex-sub">${escapeHtml(e.equipment || '自重')} · ${e.target_sets}×${e.target_reps}</div>
          </div>
```

- [ ] **Step 8: 补样式**

`public/styles.css` 末尾追加：

```css
/* ---------- 动作示范链接 ---------- */
.pe-demo {
  margin-left: auto; flex: none;
  font-size: 12px; font-weight: 700;
  color: var(--accent-deep); text-decoration: none;
  padding: 2px 8px; border: 1px solid var(--accent); border-radius: 999px;
}
.ex-demo {
  margin-left: 6px; font-size: 13px; font-weight: 800;
  color: var(--accent-deep); text-decoration: none;
}
```

- [ ] **Step 9: 语法自检 + 单测**

Run: `node --check public/app.js && npm test`
Expected: 无语法错误；测试全绿

- [ ] **Step 10: 提交（需用户同意）**

```bash
git add functions/api/_tutorials.js functions/api/plan.js public/app.js public/styles.css tests/tutorials.test.js
git commit -m "feat: attach exercise tutorial links to plan and today views"
```

---

## Task 7: /api/stats + 打卡页重排

**Files:**
- Create: `functions/api/stats.js`
- Modify: `public/app.js`（`renderCheckin`）
- Modify: `public/styles.css`
- Test: `tests/handlers.test.js`（追加 stats 用例）

- [ ] **Step 1: 写失败测试（stats 非法 monthStart → 400）**

在 `tests/handlers.test.js` 追加：

```js
import { onRequestGet as statsGet } from '../functions/api/stats.js';

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
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/handlers.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 stats.js**

新建 `functions/api/stats.js`：

```js
import { json } from './_auth.js';
import { isValidDate } from './_validate.js';

// 打卡页专用只读聚合：避免前端拉取全部明细
// monthStart 由前端按本地时区计算（如 2026-10-01），规避 Workers UTC 时区偏差
export async function onRequestGet({ request, env }) {
  const monthStart = new URL(request.url).searchParams.get('monthStart');
  if (!isValidDate(monthStart)) return json({ error: 'invalid monthStart' }, 400);

  const [totals, dates] = await env.DB.batch([
    env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM sessions) AS total_sessions,
        (SELECT COUNT(*) FROM sessions WHERE date >= ?) AS month_sessions,
        (SELECT COALESCE(SUM(COALESCE(weight,0) * COALESCE(reps,0)), 0) FROM set_logs) AS total_volume,
        (SELECT COALESCE(SUM(COALESCE(l.weight,0) * COALESCE(l.reps,0)), 0)
           FROM set_logs l JOIN sessions s ON s.id = l.session_id
          WHERE s.date >= ?) AS month_volume`
    ).bind(monthStart, monthStart),
    env.DB.prepare('SELECT DISTINCT date FROM sessions ORDER BY date'),
  ]);

  const t = totals.results[0] || {};
  return json({
    totalSessions: t.total_sessions ?? 0,
    monthSessions: t.month_sessions ?? 0,
    totalVolume: t.total_volume ?? 0,
    monthVolume: t.month_volume ?? 0,
    dates: dates.results.map(r => r.date),
  });
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- tests/handlers.test.js`
Expected: PASS

- [ ] **Step 5: 重排前端打卡页**

`public/app.js` 中 `renderCheckin` 整体替换为：

```js
/* ============================================================
   本周打卡（本周网格 + 近 5 周热力图 + 月度/累计统计 + 近 4 周趋势）
   ============================================================ */
async function renderCheckin() {
  const d = new Date();
  const today = todayISO();
  const monthStart = toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
  const stats = await api('/api/stats?monthStart=' + monthStart);
  const sess = stats.dates.map(date => ({ date }));   // 复用 computeStreak / weekCountOf 所需结构

  const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const isoOf = dt => toISODate(dt);
  const done = new Set(stats.dates);
  const labels = ['一', '二', '三', '四', '五', '六', '日'];

  // 1) 本周网格
  const weekCells = labels.map((label, i) => {
    const dt = new Date(monday); dt.setDate(monday.getDate() + i);
    const iso = isoOf(dt);
    const ok = done.has(iso);
    return `<div class="day-cell${ok ? ' done' : ''}${iso === today ? ' today' : ''}">
      <span class="dc-w">周${label}</span>
      <span class="dc-mark">${ok ? '✓' : ''}</span>
      <span class="dc-date">${dt.getMonth() + 1}/${dt.getDate()}</span>
    </div>`;
  }).join('');

  // 2) 近 5 周热力图（周一对齐，5 行 × 7 列）
  let heat = '';
  for (let w = 4; w >= 0; w--) {
    for (let i = 0; i < 7; i++) {
      const dt = new Date(monday); dt.setDate(monday.getDate() - w * 7 + i);
      const iso = isoOf(dt);
      heat += `<div class="heat-cell${done.has(iso) ? ' on' : ''}${iso === today ? ' today' : ''}" title="${iso}"></div>`;
    }
  }

  // 3) 近 4 周趋势（含本周）
  const trend = [3, 2, 1, 0].map(offset => {
    const ws = new Date(monday); ws.setDate(monday.getDate() - offset * 7);
    const count = weekCountOf(sess, isoOf(ws));
    const max = Math.max(1, ...([3, 2, 1, 0].map(o => {
      const x = new Date(monday); x.setDate(monday.getDate() - o * 7);
      return weekCountOf(sess, isoOf(x));
    })));
    const h = Math.round((count / max) * 100);
    return `<div class="trend-col"><div class="trend-bar" style="height:${h}%"><span>${count}</span></div><div class="trend-lb">${ws.getMonth() + 1}/${ws.getDate()}</div></div>`;
  }).join('');

  app.innerHTML = `<main>
    <div class="page-head"><h1>本周打卡</h1><p>本周已练 ${weekCountOf(sess, today)} 次</p></div>
    <div class="checkin-grid">${weekCells}</div>

    <section class="card"><h3>近 5 周</h3><div class="heat-grid">${heat}</div></section>

    <div class="stats">
      <div class="stat"><b>${stats.monthSessions}</b><span>本月次数</span></div>
      <div class="stat"><b>${computeStreak(sess, today)}</b><span>连续天数</span></div>
      <div class="stat"><b>${stats.totalSessions}</b><span>累计次数</span></div>
      <div class="stat"><b>${fmtVolume(stats.monthVolume)}</b><span>本月容量</span></div>
    </div>

    <section class="card"><h3>近 4 周趋势</h3><div class="trend">${trend}</div></section>
  </main>`;
}
```

- [ ] **Step 6: 补样式**

`public/styles.css` 末尾追加：

```css
/* ---------- 打卡页增强 ---------- */
.heat-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.heat-cell { aspect-ratio: 1; border-radius: 4px; background: var(--field); border: 1px solid var(--line); }
.heat-cell.on { background: var(--accent); border-color: var(--accent); }
.heat-cell.today { outline: 2px solid var(--accent-deep); outline-offset: 1px; }
.trend { display: flex; align-items: flex-end; gap: 12px; height: 140px; }
.trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
.trend-bar { width: 100%; max-width: 46px; background: var(--accent); border-radius: 8px 8px 4px 4px; display: flex; align-items: flex-start; justify-content: center; color: var(--accent-ink); font-weight: 800; font-size: 12px; }
.trend-lb { margin-top: 6px; font-size: 11px; color: var(--muted); }
```

> 注：`.trend-bar` 的 `style="height:...%"` 由 JS 动态设置。CSP `style-src 'self'` 不拦截通过 DOM 设置的内联样式（仅拦截 `<style>` 与 `style` 属性字面量），此写法与现有 `progBar.style.width` 一致，安全。

- [ ] **Step 7: 语法自检 + 单测**

Run: `node --check public/app.js && npm test`
Expected: 无语法错误；测试全绿

- [ ] **Step 8: 提交（需用户同意）**

```bash
git add functions/api/stats.js public/app.js public/styles.css tests/handlers.test.js
git commit -m "feat: add /api/stats and enrich checkin page with heatmap/stats/trend"
```

---

## Task 8: 静态资源缓存策略

**Files:**
- Modify: `public/_headers`

- [ ] **Step 1: 追加显式规则**

在 `public/_headers` 末尾追加（显式列路径，避免影响已有的 `/vendor/*` 长缓存规则）：

```
# 页面与自有脚本：始终走 ETag 校验，保证发布即生效
/index.html
  Cache-Control: no-cache
/app.js
  Cache-Control: no-cache
/styles.css
  Cache-Control: no-cache
```

- [ ] **Step 2: 端到端核对响应头（需本地服务）**

Run: `npm run dev`，另开终端 `curl -sI http://localhost:8788/app.js | grep -i cache-control`
Expected: 含 `cache-control: no-cache`；`curl -sI http://localhost:8788/vendor/chart.umd.js` 仍含 `immutable`。

- [ ] **Step 3: 提交（需用户同意）**

```bash
git add public/_headers
git commit -m "chore: no-cache for own HTML/JS/CSS assets"
```

---

## Task 9: 今日页减少重复请求

**Files:**
- Modify: `public/app.js`（`renderToday`）

- [ ] **Step 1: 缓存 sessions 并本地过滤**

在 `renderToday` 中，把 `syncView` 改为支持「使用缓存」：

```js
  let sessionsLoaded = false;   // 页面内会话缓存标记

  async function syncView(useCache = false) {
    if (!useCache || !sessionsLoaded) {
      sessions = sortSessions((await api('/api/sessions')).sessions);
      sessionsLoaded = true;
    }
    const matches = sessions.filter(s => s.date === selectedDate && s.day_id === selectedDayId);
    const session = matches[matches.length - 1] || null;
    if (session) {
      try {
        const { logs } = await api('/api/set-logs?session_id=' + session.id);
        currentLogs = logs || [];
      } catch {
        currentLogs = [];
      }
    } else {
      currentLogs = [];
    }
    paintView();
    draw();
  }
```

并把切换日期、切换训练日两处调用改为走缓存：

```js
    syncView(true);   // dayChips 点击内
```

```js
    syncView(true);   // dateIn onchange 内
```

保存成功后保留原样 `await syncView();`（需真实刷新）。

- [ ] **Step 2: 语法自检**

Run: `node --check public/app.js`
Expected: 无输出

- [ ] **Step 3: 端到端手测**

在「今天」页反复切换训练日与日期，打开浏览器 Network 面板。
Expected: 切换时不再重复请求 `/api/sessions`（仅切换后有 1 次 `/api/set-logs`）；保存后数据正确刷新。

- [ ] **Step 4: 提交（需用户同意）**

```bash
git add public/app.js
git commit -m "perf: cache sessions list in today view to avoid refetch on tab/date switch"
```

---

## Task 10: package.json 脚本 + .dev.vars.example

**Files:**
- Modify: `package.json`
- Create: `.dev.vars.example`

- [ ] **Step 1: 更新 scripts**

`package.json` 的 `scripts` 替换为：

```json
  "scripts": {
    "dev": "wrangler pages dev public",
    "deploy": "wrangler pages deploy public",
    "test": "vitest run",
    "db:init:local": "wrangler d1 execute fitness-db --local --file=./schema.sql",
    "db:init:remote": "wrangler d1 execute fitness-db --remote --file=./schema.sql",
    "db:migrate:local": "wrangler d1 execute fitness-db --local --file=./migrations/0002_indexes_and_login_attempts.sql && wrangler d1 execute fitness-db --local --file=./migrations/0003_exercise_tutorials.sql",
    "db:migrate:remote": "wrangler d1 execute fitness-db --remote --file=./migrations/0002_indexes_and_login_attempts.sql && wrangler d1 execute fitness-db --remote --file=./migrations/0003_exercise_tutorials.sql"
  },
```

- [ ] **Step 2: 新建密钥模板**

新建 `.dev.vars.example`：

```
APP_PASSWORD=change-me
AUTH_SECRET=please-change-to-a-long-random-string
```

- [ ] **Step 3: 校验**

Run: `npm test`
Expected: 全绿；`.dev.vars.example` 不被 `.gitignore` 忽略（确认 `git status` 可见该文件，而 `.dev.vars` 不可见）。

- [ ] **Step 4: 提交（需用户同意）**

```bash
git add package.json .dev.vars.example
git commit -m "chore: db init/migrate scripts and .dev.vars example"
```

---

## Task 11: 重写 README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 按下列结构重写 README**

必须覆盖（内容须与实现一致）：

1. 项目简介 + 技术栈（前端/后端/数据/认证/部署目标：Cloudflare 免费套餐）。
2. 目录结构（与实际一致：`public/`（含 `vendor/chart.umd.js`、`_headers`）、`functions/api/`、`migrations/`、`tests/`、`docs/`、`design-demos/`、`schema.sql`、`wrangler.toml`）。
3. 快速开始：`npm install` → 复制 `.dev.vars.example` 为 `.dev.vars` → `npm run db:init:local` → `npm run dev` → `npm test`。
4. 数据库与迁移：新库用 `schema.sql`（**含 DROP 警告**），已有库用 `npm run db:migrate:local|remote`；说明迁移编号策略（0002 索引/限流表、0003 教程表，均幂等）。
5. 部署：`wrangler d1 create` → 填 `wrangler.toml` 的 `database_id` → `npm run db:init:remote` → 设 `APP_PASSWORD`/`AUTH_SECRET` secret → `npm run deploy`。
6. API 一览（指向 `docs/API.md`，并列出端点清单）。
7. 数据模型（指向 `docs/DATA-MODEL.md`）。
8. 备份与迁移：`wrangler d1 export fitness-db --remote --output=backup.sql`（含 `exercise_tutorials`）。
9. 验收清单（与设计文档 §6 一致）。
10. 安全说明（密钥不入库；Cookie 属性；登录限流）。
11. 排错 FAQ（登录 401 反复出现、限流提示、图表库加载失败、迁移重复执行报错的处理）。

- [ ] **Step 2: 核对目录结构无遗漏**

Run: `ls -a public functions/api migrations tests docs`
Expected: 与 README 中结构描述一一对应。

- [ ] **Step 3: 提交（需用户同意）**

```bash
git add README.md
git commit -m "docs: rewrite README with setup, API, data model, migration and FAQ"
```

---

## Task 12: docs/API.md 与 docs/DATA-MODEL.md

**Files:**
- Create: `docs/API.md`
- Create: `docs/DATA-MODEL.md`

- [ ] **Step 1: 写 docs/API.md**

必须逐条覆盖端点（方法与路径、鉴权、入参、响应、错误码），端点清单：

- `POST /api/login`（公开）：`{ password }` → `{ ok: true }` + Set-Cookie；401 密码错、429 限流。
- `POST /api/logout` → `{ ok: true }` + 清 Cookie。
- `GET /api/plan` → `{ days: [{ id, name, exercises: [{ id, day_id, sort, name, equipment, target_sets, target_reps, tutorial_url }] }] }`。
- `GET /api/sessions?from&to`（可选过滤）→ `{ sessions: [...] }`。
- `POST /api/sessions`：`{ date, day_id, note?, logs? }` → `{ id, saved?, reused }`；400 非法日期/day_id/明细数量或字段。
- `DELETE /api/sessions?id` → `{ ok: true }`；400 非法 id。
- `GET /api/set-logs?session_id` → `{ logs: [...] }`；400 非法 session_id。
- `POST /api/set-logs` → `{ id }`；400 非法字段。
- `DELETE /api/set-logs?id` → `{ ok: true }`；400 非法 id。
- `GET /api/body-weights` → `{ weights: [...] }`。
- `POST /api/body-weights`：`{ date, weight }` → `{ id }`；400 非法日期或体重（`0 < weight ≤ 500`）。
- `DELETE /api/body-weights?id` → `{ ok: true }`。
- `GET /api/history?limit&before` → `{ items: [{ id, date, day_id, note, logs: [...] }], hasMore }`（默认 50，上限 500，游标 `before=<date>,<id>`）。
- `GET /api/stats?monthStart` → `{ totalSessions, monthSessions, totalVolume, monthVolume, dates }`；400 非法 `monthStart`。

并说明：除 `/api/login` 外所有端点经 `_middleware.js` 校验 `fit_auth` Cookie，未登录返回 401。

- [ ] **Step 2: 写 docs/DATA-MODEL.md**

必须覆盖：`plan_days` / `plan_exercises` / `sessions` / `set_logs` / `body_weights` / `login_attempts` / `exercise_tutorials` 的字段、类型、约束、外键关系；全部索引；迁移策略（编号顺序、幂等约定、schema.sql 与迁移的一致性要求、`wrangler d1 export` 备份方式）。

- [ ] **Step 3: 交叉核对与实现一致**

Run: `npm run dev` 后在浏览器访问 `/api/plan`（登录后）与 `/api/stats?monthStart=<本月1日>`
Expected: 实际响应字段与 `docs/API.md` 描述完全一致。

- [ ] **Step 4: 提交（需用户同意）**

```bash
git add docs/API.md docs/DATA-MODEL.md
git commit -m "docs: add API reference and data model"
```

---

## Task 13: 端到端验证

**Files:** 无（仅验证）

- [ ] **Step 1: 依赖与单测**

Run: `npm install && npm test`
Expected: 全绿（validate / auth / handlers / tutorials 全部 PASS）

- [ ] **Step 2: 起本地服务并跑通主流程**

Run: `npm run db:init:local && npm run db:migrate:local && npm run dev`
浏览器依次验证：
- 错误密码被拒；正确密码进入。
- 「今天」记录一组重量/次数并保存；刷新后数据仍在。
- 切换训练日/日期不再重复打 `/api/sessions`。
- 「记录」页显示记录、可删除、超过 50 条有「加载更多」。
- 「计划」页与「今天」页每个动作有「示范」链接，新窗口打开且可访问。
- 「打卡」页四块数据与真实记录一致。
- 「图表」页体重曲线与每周次数正常。
- 未登录直接访问 `/api/sessions` 返回 401。

- [ ] **Step 3: 免费套餐适配复核**

确认本次改动**未引入**：Cron Triggers、Queues、R2、Durable Objects、任何付费绑定；`wrangler.toml` 仅保留 `d1_databases` 与 `pages_build_output_dir`。
Run: `cat wrangler.toml`
Expected: 无新增绑定。

- [ ] **Step 4: 汇总实施记录**

把实际执行结果、遇到的问题与偏离记录写入 `docs/superpowers/plans/` 同目录的实施记录文件，供后续回顾。

---

## 自检结果

- **规格覆盖**：设计 §3.A→Task 1/2/3；§3.B→Task 4/5(教程无关)/6/8/9；§3.C→Task 5/6；§3.D→Task 7；§3.E→Task 10/11/12；§3.F→Task 13。§4 免费套餐适配→Task 13 Step 3。§5 YAGNI 项均未列入任务。无遗漏。
- **占位符扫描**：无 TBD/TODO；所有代码块均为可直接落地的完整内容。
- **类型/命名一致性**：`isPositiveInt` / `isValidWeight` / `tutorialFallbackUrl` / `histState` / `sessionsLoaded` 在定义与使用处拼写一致；`/api/history` 返回 `{ items, hasMore }`，`/api/stats` 返回字段与前端 `stats.monthSessions` / `totalSessions` / `monthVolume` / `dates` 一致。
