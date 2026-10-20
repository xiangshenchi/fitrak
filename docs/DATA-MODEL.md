# 数据模型

数据全部存储于 **Cloudflare D1**（SQLite），绑定名 `DB`。建表与预置数据见 [`schema.sql`](../schema.sql)（新库）与 [`migrations/`](../migrations)（已有库增量升级）。

## 表结构

### plan_days — 训练日

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY | 训练日编号（1–4） |
| `name` | TEXT | NOT NULL | 训练日名称，如「上肢A(胸+三头)」 |

### plan_exercises — 计划动作

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY | 动作编号 |
| `day_id` | INTEGER | NOT NULL, REFERENCES `plan_days(id)` | 所属训练日 |
| `sort` | INTEGER | NOT NULL | 同日内的展示顺序 |
| `name` | TEXT | NOT NULL | 动作名（与 `exercise_tutorials.exercise_name` 对应） |
| `equipment` | TEXT | — | 器械，如「哑铃」「自重」 |
| `target_sets` | INTEGER | NOT NULL | 目标组数 |
| `target_reps` | TEXT | NOT NULL | 目标次数，如 `8-12`、`力竭` |

### sessions — 一次训练

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 会话编号 |
| `date` | TEXT | NOT NULL | 训练日期 `YYYY-MM-DD` |
| `day_id` | INTEGER | NOT NULL, REFERENCES `plan_days(id)` | 训练日 |
| `note` | TEXT | — | 备注 |

> 同一 `(date, day_id)` 复用一条会话（保存时先查后写），避免重复记录。

### set_logs — 组明细

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 明细编号 |
| `session_id` | INTEGER | NOT NULL, REFERENCES `sessions(id)` ON DELETE CASCADE | 所属会话 |
| `plan_exercise_id` | INTEGER | NOT NULL, REFERENCES `plan_exercises(id)` | 动作 |
| `set_no` | INTEGER | NOT NULL | 第几组 |
| `weight` | REAL | — | 重量（kg），可空 |
| `reps` | INTEGER | — | 次数，可空 |

> `weight` 或 `reps` 为空表示该组仅记录部分信息（前端按 `-` 展示，容量计算按 0 计入）。

### body_weights — 体重记录

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 记录编号 |
| `date` | TEXT | NOT NULL | 日期 `YYYY-MM-DD` |
| `weight` | REAL | NOT NULL | 体重（kg），接口层约束 `0 < weight ≤ 500` |

### login_attempts — 登录失败限流

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `ip` | TEXT | NOT NULL | 来源 IP（`CF-Connecting-IP`） |
| `ts` | INTEGER | NOT NULL | 失败时间戳（毫秒） |

> 无主键，仅用于「15 分钟窗口内失败次数」计数；登录成功或过期（> 24h）记录会被清删。表缺失时登录限流自动降级为不限。

### exercise_tutorials — 动作示范链接

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `exercise_name` | TEXT | PRIMARY KEY | 动作名（对应 `plan_exercises.name`） |
| `url` | TEXT | NOT NULL | 示范链接（MuscleWiki 精确页） |

> 共 20 条预置链接。`/api/plan` 命中则以该链接为准；未命中（如组合动作「手臂收尾:三头下压+弯举」）回退为限定 MuscleWiki 的站内检索链接。本表随 `wrangler d1 export` 一并导出，便于迁移。

## 关系图

```
plan_days 1───* plan_exercises
plan_days 1───* sessions
sessions  1───* set_logs
plan_exercises 1─* set_logs          （通过 set_logs.plan_exercise_id）
plan_exercises.name ─── exercise_tutorials.exercise_name  （名称关联，非外键）
```

- `set_logs.session_id` 关联 `sessions` 并带 `ON DELETE CASCADE`；删除会话时明细级联删除（接口层亦用 `batch` 显式删除，保证原子）。
- `exercise_tutorials` 与 `plan_exercises` 通过**动作名**关联（非数据库外键），改名需同步两处。

## 索引

| 索引 | 表 | 字段 | 用途 |
|---|---|---|---|
| `idx_sessions_date_day` | `sessions` | `(date, day_id)` | 按日期/训练日查询与复用判断 |
| `idx_set_logs_session` | `set_logs` | `(session_id)` | 按会话取明细 |
| `idx_plan_exercises_day` | `plan_exercises` | `(day_id)` | 按训练日取动作 |
| `idx_body_weights_date` | `body_weights` | `(date)` | 体重按日期排序 |
| `idx_login_attempts_ip_ts` | `login_attempts` | `(ip, ts)` | 限流窗口计数 |

> `exercise_tutorials` 以 `exercise_name` 为主键，天然带索引，无需额外索引。

## 迁移策略

### 两种建库方式

- **新库**：执行 [`schema.sql`](../schema.sql)。⚠️ 该脚本开头 `DROP TABLE` 重建，**执行后原有数据全部丢失**，只可用于全新数据库。
- **已有库**：执行 [`migrations/`](../migrations) 下的增量脚本，全部**幂等、可重复执行**。

```bash
npm run db:init:local       # 新库（本地）       npm run db:init:remote       # 新库（线上）
npm run db:migrate:local    # 已有库（本地）     npm run db:migrate:remote    # 已有库（线上）
```

### 迁移编号与内容

| 迁移 | 内容 | 幂等手段 |
|---|---|---|
| `0002_indexes_and_login_attempts.sql` | 补齐索引；新增 `login_attempts` 表 | `CREATE INDEX IF NOT EXISTS`、`CREATE TABLE IF NOT EXISTS` |
| `0003_exercise_tutorials.sql` | 新增 `exercise_tutorials` 表与 20 条链接 | `CREATE TABLE IF NOT EXISTS`、`INSERT OR REPLACE` |

### 约定

- **顺序编号**：新增迁移按 `0004_`、`0005_` … 递增，文件名格式 `NNNN_<描述>.sql`。
- **幂等**：所有迁移必须可重复执行（`IF NOT EXISTS` / `INSERT OR REPLACE`），以便在面板 Console 中安全重放。
- **一致性**：`0003` 的动作→链接数据须与 `schema.sql` 中 `exercise_tutorials` 的预置数据保持一致；修改任一处需同步另一处。
- **发布顺序**：涉及新表的接口（如 `/api/plan` 读 `exercise_tutorials`）务必**先执行迁移、再发布代码**，否则线上会因表不存在而报错。

## 备份与迁移

数据可整体导出为 SQL（含所有表，包括 `exercise_tutorials`）：

```bash
npx wrangler d1 export fitness-db --remote --output=backup.sql
```

换环境步骤：新库 `db:init` → 导入 `backup.sql` → 重新配置 `APP_PASSWORD` / `AUTH_SECRET` 密钥。
