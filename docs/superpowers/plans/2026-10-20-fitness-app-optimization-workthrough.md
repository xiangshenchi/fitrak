# 健身记录 App 优化 实施记录（Workthrough）

**日期**：2026-10-20
**对应计划**：[2026-10-20-fitness-app-optimization.md](2026-10-20-fitness-app-optimization.md)
**对应设计**：[2026-10-20-fitness-app-optimization-design.md](../specs/2026-10-20-fitness-app-optimization-design.md)

## 一、完成清单

| Task | 内容 | 状态 | 产物 |
|---|---|---|---|
| 1 | 校验纯函数 `isPositiveInt` / `isValidWeight` | ✅ | [functions/api/_validate.js](../../../functions/api/_validate.js) |
| 2 | 接口接入严格校验 + 会话删除原子化 | ✅ | `body-weights.js`、`sessions.js`、`set-logs.js` |
| 3 | `schema.sql` 顶部 DROP 风险注释 | ✅ | [schema.sql](../../../schema.sql) |
| 4 | history 游标分页 + 前端「加载更多」 | ✅ | [history.js](../../../functions/api/history.js)、`public/app.js` |
| 5 | 教程表与数据（schema + 迁移 0003） | ✅ | [0003_exercise_tutorials.sql](../../../migrations/0003_exercise_tutorials.sql) |
| 6 | plan 附教程链接 + 回退函数 + 前端入口 | ✅ | `_tutorials.js`、`plan.js`、`app.js`、`styles.css` |
| 7 | `/api/stats` + 打卡页重排 | ✅ | [stats.js](../../../functions/api/stats.js)、`app.js`、`styles.css` |
| 8 | 静态资源缓存策略 | ✅ | [public/_headers](../../../public/_headers) |
| 9 | 今日页减少重复请求 | ✅ | `public/app.js`（`syncView(useCache)`） |
| 10 | package.json 脚本 + `.dev.vars.example` | ✅ | [package.json](../../../package.json)、`.dev.vars.example` |
| 11 | 重写 README | ✅ | [README.md](../../../README.md) |
| 12 | docs/API.md 与 docs/DATA-MODEL.md | ✅ | [docs/API.md](../../API.md)、[docs/DATA-MODEL.md](../../DATA-MODEL.md) |
| 13 | 端到端验证 + 免费套餐复核 | ✅ | 见下文 |

## 二、验证结果

### 单测（`npm test`）

- 4 个测试文件、**26 项全部通过**：`validate`(9)、`handlers`(8)、`auth`(8)、`tutorials`(1)。

### 迁移与建库

- `npm run db:init:local`：成功执行，无报错。
- `npm run db:migrate:local`：连续执行两次均成功，**幂等验证通过**。
- `SELECT COUNT(*) FROM exercise_tutorials` → **20**，与预期一致。

### 端到端主流程（本地 `wrangler pages dev` + curl）

| 场景 | 期望 | 实测 |
|---|---|---|
| 未登录访问 `/api/sessions` | 401 | ✅ 401 |
| 错误密码登录 | 401 | ✅ 401 |
| 正确密码登录 | 200 + Cookie | ✅ 200 |
| `/api/plan` 返回教程链接 | 含 `tutorial_url` | ✅ 精确 MuscleWiki 链接 |
| 保存训练（含明细） | `saved` 计数 | ✅ `{"saved":2}` |
| 同日同训练日再次保存 | `reused:true` 且明细覆盖 | ✅ `{"saved":1,"reused":true}`，明细已覆盖 |
| `/api/history` | 含 logs、`hasMore` | ✅ 正常返回 |
| `/api/stats` | 次数与容量正确 | ✅ 容量 760（40×10+40×9）正确 |
| `/api/stats` 缺 `monthStart` | 400 | ✅ 400（单测覆盖） |
| 组合动作回退链接 | 站内检索链接 | ✅ `bing.com/search?q=site:musclewiki.com ...` |
| 非法体重 | 400 | ✅ 400 |
| 非法 id 删除 | 400 | ✅ 400 |
| 删除会话 | 原子、无残留 | ✅ `set_logs` 返回空 |
| `/app.js` 缓存头 | `no-cache` | ✅ |
| `/vendor/*` 缓存头 | `immutable` | ✅ |

### 免费套餐适配复核

- `wrangler.toml` 仅含 `d1_databases` 与 `pages_build_output_dir`，**未新增任何绑定**。
- 本次改动**未引入** Cron Triggers / Queues / R2 / Durable Objects 等付费向能力。
- 新增接口均为只读聚合（`/api/stats`）或已有能力（`/api/history` 分页），缓存走 Pages 原生 `_headers`。

## 三、偏离与说明

- **教程链接落库为独立表**（而非代码常量或加列）：满足「可随 `wrangler d1 export` 导出迁移」的诉求，且保持迁移幂等约定。
- **`monthStart` 由前端按本地时区传入**：规避 Workers 运行在 UTC 导致的「本月」边界偏差。
- **未新增前端框架 / 构建工具链**：沿用免构建静态前端，符合 YAGNI 与「单用户自用」定位。
- **提交策略**：按计划约定，所有 `git commit` 步骤在用户明确同意前均未执行。

## 四、遗留与后续（YAGNI，暂不做）

- 多用户 / 账号体系、训练计划在线编辑、社交分享等高成本且非必要能力。
- 教程链接若后续失效，只需更新 `exercise_tutorials` 表数据（可新增迁移 `0004_` 覆盖）。
