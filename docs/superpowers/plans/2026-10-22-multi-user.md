# 多用户体系 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把单用户 App 升级成支持多账号注册 + owner 快速密码登录 + Demo 只读体验的体系。

**Architecture:** D1 新增 users 表与 5 张业务表的 user_id 列；所有数据端点强制 `WHERE user_id = ?`；Pages Functions middleware 解析 token 把 uid 注入 handler；JWT-like HMAC-SHA256 v2 token；PBKDF2 存密码。

**Tech Stack:** Cloudflare Pages Functions + D1（免费套餐）、Web Crypto PBKDF2/HMAC、原生 HTML/CSS/JS。

---

## 任务 总览（11 步，对应实际 commit 序列）

| # | 任务 | 产出 | commit |
|---|---|---|---|
| 1 | PBKDF2 + v2 token 工具 | `_auth.js` | `831bb59` |
| 2 | 迁移 0004：users + user_id 列 | `migrations/0004_users.sql` | `7383731` |
| 3 | middleware：解析 v2 token + demo 拦截 | `_middleware.js` | `8b7b41a` |
| 4 | login：ensureOwner + v2 token | `login.js` | 同上 |
| 5 | register：注册 + cloneOwnerPlan | `register.js` | 同上 |
| 6 | 所有数据端点加 user_id 隔离 | 6 个 handler | `9a3ac0b` |
| 7 | 前端：登录改 username+password + 注册页 + demo UI | `app.js` | `712dd9d` |
| 8 | **坑位发现**：handler 误用 `context.data` 导致所有人 fallback uid=1 | - | - |
| 9 | **修复**：handler 改解构 `data` + 去掉默认值后门 + 加 401 guard | 6 个 handler + 单测 | `84451cd` |
| 10 | **自愈兜底**：`_schema.js` ensureSchema 在 login/register 前补齐表/列 | `_schema.js` + login/register | 同上 |
| 11 | **退出登录 + UI 统一** | `logout.js` + 前端浮动按钮 + `.control` class | 同上 |

---

## 实际执行中的两个关键教训

**教训 A：handler 签名必须解构 `data`，不是 `context.data`**

Pages Functions 的 middleware 把用户信息挂在 `context.data`，但 handler 收到的是从 `context` 上**解构出来**的扁平参数。所以 handler 的函数签名是 `({ env, data })`，不是 `({ env, context })`。

错误写法会导致 `context` 永远是 undefined → fallback 到默认值 → 所有人都读 owner 数据。

**教训 B：迁移要幂等，D1 控制台不支持事务**

`migrations/0004_users.sql` 用 `BEGIN TRANSACTION` 包裹，但 D1 控制台忽略事务，每条单独执行。如果中间某步报错、用户没跑完整套迁移，服务端就会因为 `no such table: users` 直接 500。

兜底方案：`functions/api/_schema.js` 在每次 login/register 之前跑 `ensureSchema()`，用 `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN`（失败时忽略）幂等补齐。

---

## Step 1：鉴权工具 `_auth.js`

**Files:**
- Create: `functions/api/_auth.js`

- [x] PBKDF2-HMAC-SHA256（60000 轮，32 字节密钥，16 字节 salt）
- [x] v2 token：`{ v: 2, uid, demo, exp }` → base64url payload + HMAC-SHA256 签名
- [x] 校验函数：验签 + 过期时间检查
- [x] `json()` 响应辅助、`getCookie()` 工具

关键代码：

```js
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
```

## Step 2：迁移 0004

**Files:**
- Create: `migrations/0004_users.sql`
- Modify: `schema.sql`（补 users 表 + 全表 user_id）
- Modify: `package.json`（`db:migrate:local/remote` 加 0004）

- [x] D1 控制台逐句执行；BEGIN/COMMIT 忽略
- [x] 五表各加 user_id INTEGER（允许 NULL，后续回填）
- [x] schema.sql 也完整对齐，包括默认计划的 INSERT 带 user_id=1

## Step 3：middleware + login + register

**Files:**
- Create: `functions/api/_middleware.js`
- Create: `functions/api/login.js`
- Create: `functions/api/register.js`
- Create: `functions/api/logout.js`

- [x] 白名单 `/api/login` / `/api/register`
- [x] 校验 cookie 里的 `fit_auth` token
- [x] 把用户注入 `context.data = { user: { uid, demo } }`
- [x] Demo 模式只允许 GET
- [x] Login：ensureSchema → ensureOwner（users 表为空时自动用 APP_PASSWORD 建 owner）→ 回退查 owner 或按 username 查
- [x] Register：ensureSchema → 限流 → INSERT users → cloneOwnerPlan → 签 token
- [x] Logout：返回 `Set-Cookie: fit_auth=; Max-Age=0`

## Step 4：数据端点隔离

**Files:**
- Modify: `body-weights.js` / `history.js` / `plan.js` / `sessions.js` / `set-logs.js` / `stats.js`

- [x] 所有查询加 `WHERE user_id = ?`
- [x] 写操作自动写 `user_id`
- [x] 统一从 `context.data.user.uid`（后续发现签名问题，实际要改成 `data?.user?.uid`）

## Step 5：前端

**Files:**
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [x] 登录页：username + password + Demo 按钮
- [x] 注册页：3 字段
- [x] Demo 模式 banner + 只读样式
- [x] 前端 `checkDemo()` 解 payload 判断 demo 状态

## Step 6：关键修复（合并时被覆盖后重新应用）

**Files:**
- Modify: 6 个数据端点 handler
- Create: `functions/api/_schema.js`
- Modify: `login.js`（ensureSchema + 回填更宽容）
- Modify: `register.js`（ensureSchema + cloneOwnerPlan 兼容 user_id NULL）
- Modify: `tests/handlers.test.js`（ctx 加 data 字段）

修复清单：

- [x] handler 签名：`{ env, context = { data: ... } }` → `{ env, data }`
- [x] 默认值移除：`context.data?.user?.uid || 1` → `data?.user?.uid` + 缺失时 401
- [x] 新增 `_schema.js` 做幂等自愈
- [x] login / register 开头先调 ensureSchema
- [x] ensureOwner 每次登录都回填 `user_id IS NULL` 的老数据（之前只在 users 表为空时跑）

## Step 7：退出登录 + UI 统一

**Files:**
- Modify: `public/app.js`（mountLogoutBtn + confirmLogout + renderLogin submit 放宽）
- Modify: `public/styles.css`（.logout-btn 浮动按钮 + .control 统一输入框样式）

- [x] 浮动圆形退出按钮（hero 区右上角）
- [x] Demo 模式隐藏退出按钮
- [x] 登录/注册输入框统一加 `.control` class
- [x] owner 仅密码登录路径：前端放宽校验 → 后端已有回退逻辑

## Step 8：验证命令（跑过的）

```bash
# 本地重建库 + 起服务
rm -rf .wrangler/state && npx wrangler d1 execute fitness-db --local --file=./schema.sql
npx wrangler pages dev public --port 8788 --binding AUTH_SECRET=testsecret --binding APP_PASSWORD=owner123

# owner 仅密码登录
curl -s -c o.cookie http://localhost:8788/api/login -X POST -d '{"password":"owner123"}'
# owner 查计划
curl -s -b o.cookie http://localhost:8788/api/plan
# 注册新用户
curl -s -c n.cookie http://localhost:8788/api/register -X POST -d '{"username":"alpha","password":"hello123"}'
# 新用户写体重 + 隔离验证
curl -s -b n.cookie http://localhost:8788/api/body-weights -X POST -d '{"date":"2026-10-22","weight":65}'
curl -s -b n.cookie http://localhost:8788/api/body-weights
curl -s -b o.cookie http://localhost:8788/api/body-weights   # 应空
# 退出端点
curl -s -D - -o /dev/null -b o.cookie http://localhost:8788/api/logout -X POST

# 单测
npx vitest run   # 预期 36 项全绿
```
