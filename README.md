# 健身记录 App

个人健身记录 Web App：记录每次训练的每组重量/次数、体重变化，并提供训练计划、历史记录、数据图表与每周打卡。部署在 **Cloudflare Pages（免费套餐）**。

- **前端**：免构建静态页面（原生 HTML/CSS/JS），Chart.js 本地托管于 `public/vendor/`。
- **后端**：Cloudflare Pages Functions（`functions/api/*`）。
- **数据**：Cloudflare D1（SQLite），绑定名 `DB`。
- **认证**：单一密码，HMAC 签名 `HttpOnly` Cookie（30 天有效期 + 按 IP 登录限流）。

> 定位：单用户自用。不引入账号体系、不引入构建工具链。

## 目录结构

```
.
├─ public/                          # 静态前端（Pages 构建输出目录）
│  ├─ index.html
│  ├─ styles.css
│  ├─ app.js
│  ├─ _headers                      # 安全响应头 + 静态资源缓存策略
│  └─ vendor/chart.umd.js           # 本地托管的 Chart.js
├─ functions/api/                   # Pages Functions 接口
│  ├─ _middleware.js                # 统一鉴权（/api/login 除外）
│  ├─ _auth.js                      # token 签名/校验、Cookie、json 工具
│  ├─ _validate.js                  # 请求字段校验纯函数
│  ├─ _tutorials.js                 # 动作教程回退链接
│  ├─ login.js  logout.js
│  ├─ plan.js  stats.js  history.js
│  ├─ sessions.js  set-logs.js  body-weights.js
├─ migrations/                      # 增量迁移（幂等，对已有库安全）
│  ├─ 0002_indexes_and_login_attempts.sql
│  └─ 0003_exercise_tutorials.sql
├─ tests/                           # Vitest 单测（鉴权/校验/处理器入参）
├─ docs/                            # API 参考、数据模型、设计与实施记录
├─ schema.sql                       # 建表 + 预置 4 天训练计划 + 教程链接（新库用）
├─ wrangler.toml                    # Pages + D1 绑定
└─ package.json
```

## 快速开始（本地）

1. 安装依赖：

   ```bash
   npm install
   ```

2. 创建本地密钥文件 `.dev.vars`（参考模板，已在 `.gitignore`，不会提交）：

   ```bash
   cp .dev.vars.example .dev.vars
   ```

   ```
   APP_PASSWORD=change-me
   AUTH_SECRET=some-long-random-string
   ```

3. 初始化本地 D1 数据库：

   ```bash
   npm run db:init:local
   ```

4. 启动本地预览（默认 http://localhost:8788）：

   ```bash
   npm run dev
   ```

5. 运行单测：

   ```bash
   npm test
   ```

## 数据库与迁移

**新库**直接用 `schema.sql`（含建表、索引、4 天训练计划、动作教程链接）：

```bash
npm run db:init:local     # 本地
npm run db:init:remote     # 线上
```

> ⚠️ `schema.sql` 开头会 `DROP TABLE` 重建，**执行后原有数据全部丢失**，只可用于全新数据库。已有数据的库请走下面的增量迁移。

**已有库**用 `migrations/` 下的增量脚本升级，全部幂等、可重复执行：

```bash
npm run db:migrate:local   # 本地
npm run db:migrate:remote  # 线上
```

| 迁移 | 内容 |
|---|---|
| `0002_indexes_and_login_attempts.sql` | 补齐索引；新增 `login_attempts` 表（登录限流用，表不存在时限流自动降级） |
| `0003_exercise_tutorials.sql` | 新增 `exercise_tutorials` 表（动作名 → MuscleWiki 示范链接） |

迁移为顺序编号制；`0003` 的动作链接数据须与 `schema.sql` 中的 `exercise_tutorials` 保持一致。

## 部署到 Cloudflare（面板操作，Git 集成）

本项目通过 **Cloudflare 面板 + Pages 的 Git 集成**自动构建部署，无需本地 wrangler。

1. **创建 D1 数据库**：面板 → **Storage & Databases → D1 SQL database → Create**，数据库名填 `fitness-db`。
2. **写入 `database_id`**：把上一步的 ID 填进 `wrangler.toml` 的 `d1_databases.database_id`（Pages 构建时会读取其中的 D1 绑定）。
3. **初始化线上库**：面板 → 进入该 D1 数据库 → **Console**，粘贴 `schema.sql` 全文并执行（新库）。若库中已有数据，改为粘贴 `migrations/` 下缺失的脚本（见下节）。
4. **配置密钥**：Pages 项目 → **Settings → Environment variables**，新增两条加密变量（Production 与 Preview 都建议配置）：
   - `APP_PASSWORD`：你的登录密码
   - `AUTH_SECRET`：一段长随机字符串
5. **部署**：连接 Git 仓库后，每次 push 到生产分支即自动构建发布；也可在 Pages 项目页手动 **Retry deployment**。

> 备选（命令行部署）：`npm run deploy`（`wrangler pages deploy public`），以及用 `wrangler pages secret put APP_PASSWORD` 设置密钥。

### 线上已有数据的升级（面板操作）

> ⚠️ **顺序很重要**：本版新增的 `/api/plan` 会读取 `exercise_tutorials` 表。**请先执行 `0003` 迁移，再发布新代码**，否则计划页会因表不存在而报错。

1. 面板 → **Storage & Databases → D1 → `fitness-db` → Console**。
2. 若尚未执行过 `0002`，先粘贴 `migrations/0002_indexes_and_login_attempts.sql` 全文执行。
3. 再粘贴 `migrations/0003_exercise_tutorials.sql` 全文执行。
4. 校验：在 Console 执行 `SELECT COUNT(*) AS n FROM exercise_tutorials;`，应返回 `20`。
5. 随后发布新代码（push 或手动 Retry deployment）。

脚本均为幂等，重复执行无副作用（`CREATE TABLE IF NOT EXISTS` / `INSERT OR REPLACE` / `CREATE INDEX IF NOT EXISTS`）。

## 备份与迁移

数据全部存放在 D1，可整体导出为 SQL（含 `exercise_tutorials`），便于迁移或换库：

```bash
npx wrangler d1 export fitness-db --remote --output=backup.sql
```

换到新环境时：`db:init` 建库 → 导入备份 → 重新配置 `APP_PASSWORD` / `AUTH_SECRET` 即可。

## API 一览

完整的方法、入参、响应与错误码见 **[docs/API.md](docs/API.md)**。端点清单：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/login` | 登录（公开，无需鉴权）；失败按 IP 限流 |
| POST | `/api/logout` | 退出登录 |
| GET | `/api/plan` | 训练计划（含 `tutorial_url` 教程链接） |
| GET | `/api/sessions` | 训练会话列表（可选 `from`/`to` 过滤） |
| POST | `/api/sessions` | 保存一次训练（按日期+训练日复用并覆盖明细） |
| DELETE | `/api/sessions?id=` | 删除一次训练及其明细（原子） |
| GET | `/api/set-logs?session_id=` | 某次训练的组明细 |
| POST | `/api/set-logs` | 追加单条组明细 |
| DELETE | `/api/set-logs?id=` | 删除单条组明细 |
| GET | `/api/body-weights` | 体重记录列表 |
| POST | `/api/body-weights` | 记录体重（`0 < weight ≤ 500`） |
| GET | `/api/history` | 记录页聚合（游标分页：`limit` / `before`） |
| GET | `/api/stats?monthStart=` | 打卡页统计（只读聚合） |

除 `/api/login` 外，所有接口经 `_middleware.js` 校验 `fit_auth` Cookie，未登录返回 `401`。

## 数据模型

表结构、关系、索引与迁移策略见 **[docs/DATA-MODEL.md](docs/DATA-MODEL.md)**。

## 验收清单

- 能登录（错误密码被拒），未登录访问任一数据接口返回 401。
- 能记录每组重量与次数；刷新页面 / 换浏览器后数据仍在（D1 持久化生效）。
- 非法入参（负数体重、`NaN`、非法日期、非整数 id）返回 400，不写入脏数据。
- 删除一次训练后，明细与会话一起消失，无残留。
- 计划页与今天页每个动作都有「示范」链接，新窗口打开且可访问。
- 记录页可「加载更多」；打卡页热力图/统计卡/趋势与真实记录一致。
- 图表正确反映体重与训练次数。

## 安全说明

- `APP_PASSWORD` 与 `AUTH_SECRET` 仅通过面板环境变量 / `.dev.vars` 注入，**不写入仓库**（`.dev.vars` 已在 `.gitignore`）。
- 认证 Cookie 为 `HttpOnly` + `SameSite=Lax`；线上（HTTPS）自动附带 `Secure`。
- 登录失败按来源 IP 限流（15 分钟窗口内 10 次），`login_attempts` 表缺失时限流自动降级为不限。
- `public/_headers` 配置了 CSP、`nosniff`、`X-Frame-Options: DENY` 等安全响应头。

## 排错 FAQ

| 现象 | 原因与处理 |
|---|---|
| 登录后仍反复跳回登录页 | `AUTH_SECRET` 变更导致旧 Cookie 失效 → 重新登录；或未同时配置 Production/Preview 的变量 |
| 提示「尝试次数过多，请 15 分钟后再试」 | 触发了登录限流。等待 15 分钟，或在 D1 Console 执行 `DELETE FROM login_attempts;` 清空 |
| 计划页报错 / 动作没有「示范」链接 | 线上库未执行 `0003` 迁移 → 按上文「线上已有数据的升级」执行 |
| 图表页提示「图表库加载失败」 | `public/vendor/chart.umd.js` 缺失或路径错误 → 确认文件存在后重新部署 |
| 数据库命令报 `duplicate column` 之类错误 | 误在已有库执行 `schema.sql` → 立刻停止，改用 migrations；必要时先从备份恢复 |
| 本地 `npm run dev` 起不来 | 未初始化本地库 → 先执行 `npm run db:init:local` |

## 开发约定

- 迁移脚本一律幂等（`IF NOT EXISTS` / `INSERT OR REPLACE`）。
- 数据诚实：页面上的所有统计数字均由真实 `sessions` / `set_logs` 计算，不做估算或编造。
- 单用户自用，不引入不必要的用户体系与前端框架。
