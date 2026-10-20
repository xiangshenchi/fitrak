# 健身记录 App · 优化设计方案

- 日期：2026-10-20
- 范围：均衡版（健壮性 A + 可扩展性 B + 文档 C）＋ 新增「动作教程链接」与「打卡页增强」两项功能
- 部署约束：Cloudflare Pages + Pages Functions + D1，**全部运行在 Cloudflare 免费套餐内**

## 1. 背景与目标

现状：单用户个人健身记录 Web App，无构建静态前端 + Pages Functions + D1。

目标：

1. 修掉确凿的健壮性问题（入参校验不一致、删除非原子、schema 误用风险）。
2. 让数据量增长后接口不会无限膨胀（history 分页）。
3. 减少前端重复请求、补齐静态资源缓存策略。
4. 新增「动作示范教程跳转」（权威、免费、精确链接 + 搜索回退）。
5. 充实「打卡」页（近期热力图 + 月度/累计统计卡 + 近 4 周趋势条）。
6. 更新项目文档：重写 README，新增 `docs/API.md`、`docs/DATA-MODEL.md`、`.dev.vars.example`。

## 2. 设计原则

- **最小改动**：只改与需求直接相关的代码，不做无关格式化/重构。
- **数据诚实**：所有统计数字从真实 `sessions` / `set_logs` 计算，不编造。
- **数据落在库里**：新增的业务数据（教程链接）存入 D1，便于 `wrangler d1 export` 备份与迁移。
- **迁移可重复执行**：所有迁移脚本保持幂等。
- **免费套餐适配**：只引入只读查询与静态资源，不引入 Cron/队列/R2/DO 等付费向能力。

## 3. 详细设计

### A. 后端健壮性

| # | 文件 | 改动 |
|---|---|---|
| A1 | `functions/api/_validate.js` | 新增纯函数 `isPositiveInt(v)`、`isValidWeight(v)`（`number` 且 `Number.isFinite` 且 `0 < v ≤ 500`） |
| A2 | `functions/api/body-weights.js` | POST 改用 `isValidDate(b.date)` + `isValidWeight(b.weight)`，非法返回 400 |
| A3 | `functions/api/sessions.js` | DELETE 的 `id` 用 `isPositiveInt` 校验；删除改为单次 `env.DB.batch([删明细, 删会话])` 保证原子 |
| A4 | `functions/api/set-logs.js` | GET 的 `session_id`、DELETE 的 `id` 用 `isPositiveInt` 校验 |
| A5 | `schema.sql` | 顶部加醒目注释：本脚本会 `DROP TABLE` 重建，**仅用于全新库**；已有库请用 `migrations/` |

### B. 可扩展性与性能

| # | 文件 | 改动 |
|---|---|---|
| B1 | `functions/api/history.js` | 支持 `limit`（默认 50，上限 500）与 `before`（游标，`date,id` 倒序取更早的数据）；返回 `{ items, hasMore }` |
| B2 | `public/app.js`（renderHistory） | 首屏 50 条，底部「加载更多」按游标续取；删除后重新加载首屏 |
| B3 | `functions/api/plan.js` | 两次串行查询改为一次 `env.DB.batch`，并在内存组装 |
| B4 | `public/app.js`（renderToday） | sessions 列表在页面内缓存，切日期/训练日走本地过滤，仅在保存/删除后重新拉取 |
| B5 | `public/_headers` | 为 `/*.html`、`/app.js`、`/styles.css` 加 `Cache-Control: no-cache`（仍走 ETag 校验，保证发布即生效） |

### C. 新功能 1：动作教程链接

**数据表**（`schema.sql` 与 `migrations/0003_exercise_tutorials.sql` 同时定义，保持内容一致）：

```sql
CREATE TABLE IF NOT EXISTS exercise_tutorials (
  exercise_name TEXT PRIMARY KEY,
  url           TEXT NOT NULL
);
```

- 建表用 `CREATE TABLE IF NOT EXISTS`、填充用 `INSERT OR REPLACE`，**幂等可重复执行**。
- 用**独立表**而非给 `plan_exercises` 加列：SQLite 无 `ADD COLUMN IF NOT EXISTS`，加列会破坏迁移幂等约定；独立表还可随 `wrangler d1 export` 干净导出。

**数据来源**：为现有 25 个动作逐个映射 **MuscleWiki**（免费、含示范视频/GIF、已实测可访问）的具体动作页 slug，例如
`哑铃卧推 → https://musclewiki.com/exercise/dumbbell-bench-press`。实现时逐条用 WebFetch 校验可访问性，**不编造 URL**。

**回退策略**：库里查不到 `url` 时，前端回退为站内检索链接
`https://www.bing.com/search?q=site%3Amusclewiki.com+<encodeURIComponent(动作名)>`。

**接口**：`functions/api/plan.js` 用 `LEFT JOIN exercise_tutorials ON exercise_name = e.name`，为每个动作附带 `tutorial_url`（未命中时回退为检索链接）。

**前端**：`renderPlan`、`renderToday` 的动作名旁加「↗ 示范」链接，`target="_blank" rel="noopener noreferrer"`。

### D. 新功能 2：打卡页增强

**新增接口** `functions/api/stats.js`（只读聚合，避免前端拉全量明细）：

- 入参：`monthStart`（`YYYY-MM-01`，前端按本地时区计算后传入，规避 Workers 的 UTC 时区偏差；用 `isValidDate` 校验）。
- 返回：

```json
{
  "totalSessions": 42,
  "monthSessions": 7,
  "totalVolume": 123456,
  "monthVolume": 23456,
  "dates": ["2026-10-01", "..."]
}
```

- SQL：`COUNT(*)`、`SELECT DISTINCT date FROM sessions ORDER BY date`、以及对 `set_logs` 关联 `sessions` 的 `SUM(COALESCE(weight,0)*COALESCE(reps,0))`。

**前端** `renderCheckin` 重排为四块（全部真实数据）：

1. 本周网格（保留现有 UI）。
2. **近 5 周热力图**：周一对齐、7 列 × 5 行共 35 格，用 `dates` 点亮，含今日高亮。
3. **月度/累计统计卡**（4 格）：本月次数、本月容量、连续天数、累计次数。
4. **近 4 周趋势条**：按 `dates` 分周计数，4 根柱状对比。

连续天数复用已有 `computeStreak`，周计数复用已有 `weekCountOf`。

### E. 文档与工程化

| # | 文件 | 改动 |
|---|---|---|
| E1 | `README.md` | 增量重写：修正目录结构、补 API 一览、数据模型、脚本清单、`.dev.vars` 示例、schema.sql 风险提示、排错 FAQ |
| E2 | `docs/API.md` | 新增：全接口一览（方法/路径/入参/响应/鉴权） |
| E3 | `docs/DATA-MODEL.md` | 新增：表结构、关系、索引、迁移编号策略 |
| E4 | `.dev.vars.example` | 新增：`APP_PASSWORD`、`AUTH_SECRET` 模板 |
| E5 | `package.json` | 新增 `db:init:local` / `db:init:remote`（导入 `schema.sql`）；`db:migrate:local` / `db:migrate:remote` 改为**按编号依次执行** `migrations/*.sql`（`0002 && 0003` 串联） |
| E6 | `docs/` 下 | 保存本设计方案、实施计划、任务清单等过程文件（遵循用户「文件留项目目录」要求） |

### F. 测试与验证

| # | 内容 |
|---|---|
| F1 | 补 `_validate` 新函数（`isPositiveInt` / `isValidWeight`）单测 |
| F2 | 补 `/api/stats` 的 `monthStart` 入参校验单测；连续/周计算沿用 `app.js` 已有 `computeStreak` / `weekCountOf`（把 `dates` 映射为 `{ date }` 后传入），本次不新增前端测试基建 |
| F3 | `npm install && npm test` 全绿 |
| F4 | 本地 `wrangler pages dev public` 起服务，端到端验证登录、记录、打卡、图表、教程链接 |

## 4. Cloudflare 免费套餐适配

- **不引入付费向能力**：无 Cron Triggers、无 Queues、无 R2/Durable Objects；仅静态资源 + Pages Functions + D1。
- **只读聚合**：新增的 `/api/stats`、history 分页均为只读查询，不增加写放大。
- **请求量**：新增 1 个只读端点，仅「打卡」页触发；个人使用规模远低于 Pages Functions 免费额度。
- **显式缓存**：静态资源缓存策略走 Pages 原生 `_headers`（免费套餐支持），ETag 校验保证发布即生效。
- **查询轻量**：为 join/聚合补齐/复用索引，避免 Pages Functions 免费版的 CPU 时长限制被长查询触碰。
- **备份与迁移**：数据全部存 D1，可用 `wrangler d1 export fitness-db --remote --output=backup.sql` 导出（含新增的 `exercise_tutorials` 表），迁移友好。

## 5. 明确不做（YAGNI）

- 不引入构建工具链、前端框架、TypeScript。
- 不做多用户/多密码/账号体系（当前定位单用户）。
- 不做 CSRF token 改造（`SameSite=Lax` 已覆盖，单用户场景可接受）。
- 不做唯一约束迁移（重复提交概率极低，本次不扩大改动面）。
- 不做全量重构/目录重排。

## 6. 验收清单

- 未登录访问任一数据接口仍返回 401。
- 非法入参（负数体重、`NaN`、非法日期、非整数 id）一律 400，不再写入脏数据。
- 删除一次训练：明细与会话一起消失，无半删残留。
- 记录页超过 50 条时可「加载更多」，不出现响应体无限膨胀。
- 计划页/今日页每个动作旁有可点击的「↗ 示范」链接，新窗口打开且可访问。
- 打卡页四块区域数据与真实记录一致（热力图、统计卡、4 周趋势）。
- README 目录结构与实际文件一致；`docs/API.md`、`docs/DATA-MODEL.md` 内容与实现一致。
- `npm test` 全绿。

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 教程 URL 失效/编造 | 实现时逐条 WebFetch 校验；查不到则回退检索链接 |
| schema.sql 与迁移脚本中教程数据不同步 | 迁移文件顶部注释注明「须与 schema.sql 保持一致」 |
| 本地无法起 wrangler（沙箱网络受限） | 单测保证逻辑正确；若无法本地起服务，明确说明并给出用户自测步骤 |
| 迁移脚本重复执行报错 | 全部使用 `CREATE TABLE IF NOT EXISTS` / `INSERT OR REPLACE` / `CREATE INDEX IF NOT EXISTS`，保持幂等 |
