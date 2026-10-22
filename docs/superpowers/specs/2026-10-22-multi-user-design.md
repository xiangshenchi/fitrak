# 多用户体系 · 设计方案

- 日期：2026-10-22
- 前置：`2026-10-20-fitness-app-optimization-design.md`（均衡版优化）已落地
- 部署约束：Cloudflare Pages + Pages Functions + D1，**不引入付费向能力**
- 核心定位：个人自用 App，单用户为主；新增「分享给朋友体验」与「基础多用户注册」两个场景

## 1. 背景与目标

现状：单用户 Web App，密码通过 `APP_PASSWORD` 明文 env 变量鉴权。`APP_PASSWORD` 是"唯一"密钥，无法区分"我本人"和"朋友来体验"。

用户提出两个需求：

1. **公用密码分享体验**：分享一个密码让朋友登录看我的数据，但不影响我的账号本身。
2. **注册新用户**：朋友想要可以注册自己的账号，数据完全隔离。

目标：

1. 引入多用户体系（注册/登录/鉴权/隔离）。
2. 保留 owner 快速登录路径（只输密码 = 登录 owner）。
3. 新增 Demo 只读入口（首页「先试试 Demo」按钮 → 无需任何凭证体验 owner 数据）。
4. 所有数据端点按 `user_id` 隔离。
5. 新用户注册时克隆 owner 的默认训练计划。
6. 幂等自愈：D1 控制台漏跑迁移时，服务端自动建表。

非目标（明确不做）：

- 邮箱验证 / 短信验证（无付费能力，也没必要）。
- 密码找回（注册页写了即可）。
- 账号体系之外的社交功能（关注、好友、分享训练等）。
- 服务端 session 持久化（只用 JWT-like token in cookie）。

## 2. 设计原则

- **向后兼容**：现有 owner 账号 + `APP_PASSWORD` 的登录路径必须保持可用。
- **隔离优先**：任何能读写业务数据的端点都必须有 `user_id` 约束。
- **迁移幂等**：SQL 层 + JS 层双重兜底（`CREATE TABLE IF NOT EXISTS` + `ensureSchema`）。
- **免费套餐适配**：只新增 D1 表与静态函数，不引入 Workers for Platforms / R2 / Queues / DO。
- **用户迁移友好**：用户可以用 `wrangler d1 export` 把整个库 dump 下来，user_id 天然在数据里。

## 3. 详细设计

### 3.1 数据库变更

```sql
-- 新增表
CREATE TABLE users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT    NOT NULL UNIQUE,
  pwd_hash   TEXT    NOT NULL,     -- PBKDF2-HMAC-SHA256 b64
  pwd_salt   TEXT    NOT NULL,     -- 16 字节随机 b64
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_users_username ON users(username);

-- 五张业务表各加一列（允许 NULL，迁移后 JS 层回填 owner 老数据）
ALTER TABLE sessions       ADD COLUMN user_id INTEGER;
ALTER TABLE set_logs       ADD COLUMN user_id INTEGER;
ALTER TABLE body_weights   ADD COLUMN user_id INTEGER;
ALTER TABLE plan_days      ADD COLUMN user_id INTEGER;
ALTER TABLE plan_exercises ADD COLUMN user_id INTEGER;
```

owner 账号 `id=1`，首次登录时由 `ensureOwner` 按 `APP_PASSWORD` 自动创建。老数据（user_id IS NULL）在每次 owner 登录时回填为 1。

为什么让新列允许 NULL？D1 控制台不支持事务，迁移可能被拆得七零八落。允许 NULL 让应用层兜底更安全。

### 3.2 鉴权

#### 后端 token：v2 JSON HMAC

```js
{ v: 2, uid: <number>, demo: <bool>, exp: <ms> }
// base64url(payload) + "." + base64url(HMAC-SHA256(secret, payload))
```

- 签名密钥：`env.AUTH_SECRET`（Cloudflare Pages env）。
- 校验：每次请求验证签名 + 过期时间。
- 位置：HttpOnly `fit_auth` cookie，Path=/，Max-Age=30d。
- Demo token 硬编码 `uid=1, demo=true`。

#### Middleware：`functions/api/_middleware.js`

Pages Functions 的 middleware 把解析后的用户信息写入 `context.data`：

```js
context.data = { user: { uid: parsed.uid, demo: !!parsed.demo } };
```

业务 handler 通过解构 `{ env, data }` 拿用户 uid。

Demo 模式只允许 GET 请求，POST/PUT/DELETE 返回 403。

#### Handler 签名（关键细节）

Pages Functions 传进去的对象属性名叫 `data`，**不是** `context.data`：

```js
// ❌ 之前的错误写法
export async function onRequestGet({ env, context = { data: { user: { uid: 1 } } } }) {
  const uid = context.data?.user?.uid || 1;  // context 不存在，永远 fallback 到 uid=1
}

// ✅ 正确写法
export async function onRequestGet({ env, data }) {
  const uid = data?.user?.uid;
  if (uid == null) return json({ error: 'unauthorized' }, 401);
}
```

### 3.3 登录流程

```
POST /api/login
  body: { username, password } | { password } | { demo: true }
  ├── demo=true   → 签 demo token (uid=1 demo=true)，200
  ├── username 空 → 查 users WHERE username='owner'，校验 PBKDF2
  └── username 有 → 查 users WHERE username=?，校验 PBKDF2
  前置：ensureSchema + ensureOwner
  返回：Set-Cookie: fit_auth=<v2 token>
```

owner 可以只输密码登录（快速路径）。这是**刻意保留**的向后兼容行为。

### 3.4 注册流程

```
POST /api/register
  body: { username, password, confirm }
  ├── 校验：3-20 字符用户名、≥6 位密码、两次一致
  ├── 限流：login_attempts 表（复用）
  ├── INSERT users
  ├── cloneOwnerPlan：把 owner (user_id=1) 的 plan_days / plan_exercises 克隆到新 uid
  └── 签 v2 token，Set-Cookie
```

为什么克隆默认计划？新用户打开后看到空页面体验极差。把 owner 的默认 4 天训练计划克隆过去，他们就能直接开始用。

### 3.5 数据隔离

所有数据端点的 GET/POST/DELETE 都必须带 `user_id` 约束。示例：

```sql
-- 之前
SELECT * FROM sessions WHERE date >= ?;
-- 之后
SELECT * FROM sessions WHERE date >= ? AND user_id = ?;
```

检查过的端点：sessions / set-logs / body-weights / history / stats / plan / tutorials（tutorials 是 owner 公用表，不加 user_id）。

### 3.6 幂等自愈

新增 `functions/api/_schema.js`，每次 login / register 先跑：

1. `CREATE TABLE IF NOT EXISTS users (...)`
2. `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`
3. 五条 `ALTER TABLE ... ADD COLUMN user_id INTEGER`（失败时忽略，列已存在）

这样 D1 控制台漏跑迁移也不会让服务挂掉。这是吸取了"控制台不支持事务 + 我误操作"两次血泪教训后的兜底。

### 3.7 前端

- 登录页：保留快速密码登录（username 可留空），加 Demo 按钮。
- 注册页：3 字段（用户名 + 密码 + 确认密码）。
- 退出登录：hero 区右上角圆形按钮，POST `/api/logout` 清 cookie。
- Demo 模式：顶部 banner + 只读样式（按钮 disabled + 403 兜底）。

### 3.8 密码存储

PBKDF2-HMAC-SHA256，60000 轮，32 字节派生密钥，16 字节随机 salt。

为什么用 PBKDF2？Cloudflare Workers 原生支持 Web Crypto API 的 PBKDF2，不需要引入外部库。60000 轮在 Workers 冷启动 50ms 预算内是合理强度。

## 4. 安全考量

| 场景 | 防护 |
|---|---|
| 明文密码泄露 | PBKDF2 单向后缀，泄露 DB 也解不开 |
| Token 篡改 | HMAC-SHA256 签名，AUTH_SECRET 不知无法伪造 |
| 跨用户读数据 | 所有查询强制 `user_id`，缺 token 直接 401 |
| Demo 模式越权写 | middleware 拦截 demo && method !== GET → 403 |
| 暴力破解 | login_attempts 表限流，15 分钟 10 次上限 |
| Cookie 窃取 | HttpOnly + Secure（生产 HTTPS）+ SameSite=Lax |
| Session 持久化 | 无服务端 session，无 Redis 依赖，Worker 天然无状态 |

## 5. 迁移步骤

**D1 控制台（Cloudflare Dashboard）逐句执行 `migrations/0004_users.sql`**。每句单独 Run，忽略 BEGIN/COMMIT（D1 不支持事务）。

**或者更简单：直接部署，让 ensureSchema 自动补齐**。幂等自愈是默认行为。

## 6. 验收清单

- [x] owner 仅密码登录返回 200，owner 数据正确。
- [x] 新用户注册返回 201，自动克隆 owner 训练计划。
- [x] 新用户 GET /api/plan 能看到 4 天计划。
- [x] 新用户写体重 → 只能自己查到。
- [x] owner 查体重 → 隔离，看不到新用户的。
- [x] Demo 模式 GET 只读正常，POST 返回 403。
- [x] /api/logout 清 cookie 后再查数据 → 401。
- [x] 无 cookie 访问数据端点 → 401。
- [x] 36 项单测全绿。
- [x] schema.sql 与 migrations/0004_users.sql 一致。
