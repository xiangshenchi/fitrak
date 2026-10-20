# API 参考

本项目后端为 **Cloudflare Pages Functions**（源码位于 `functions/api/*`），数据存储于 D1（绑定名 `DB`）。

## 通用约定

- **Base URL**：与前端同域，路径均以 `/api/` 开头。
- **Content-Type**：请求与响应均为 `application/json; charset=utf-8`。
- **鉴权**：除 `POST /api/login` 外，所有接口经 [_middleware.js](../functions/api/_middleware.js) 校验 `fit_auth` Cookie（HMAC 签名，30 天有效）。未登录或签名失效返回 `401 {"error":"unauthorized"}`，前端收到 401 会跳转登录页。
- **错误格式**：统一为 `{ "error": "<说明>" }`，状态码为对应语义码。
- **时间格式**：`date` / `monthStart` 一律为 `YYYY-MM-DD`（本地时区由前端计算后传入，避免 Workers UTC 偏差）。

## 端点一览

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/login` | 公开 | 登录 |
| POST | `/api/logout` | 需要 | 退出登录 |
| GET | `/api/plan` | 需要 | 训练计划（含教程链接） |
| GET | `/api/sessions` | 需要 | 训练会话列表 |
| POST | `/api/sessions` | 需要 | 保存一次训练 |
| DELETE | `/api/sessions?id=` | 需要 | 删除一次训练（含明细） |
| GET | `/api/set-logs?session_id=` | 需要 | 某次训练的组明细 |
| POST | `/api/set-logs` | 需要 | 追加单条组明细 |
| DELETE | `/api/set-logs?id=` | 需要 | 删除单条组明细 |
| GET | `/api/body-weights` | 需要 | 体重记录列表 |
| POST | `/api/body-weights` | 需要 | 记录体重 |
| DELETE | `/api/body-weights?id=` | 需要 | 删除体重记录 |
| GET | `/api/history` | 需要 | 记录页聚合（游标分页） |
| GET | `/api/stats?monthStart=` | 需要 | 打卡页统计（只读聚合） |

---

## 鉴权

### POST /api/login（公开）

- **请求体**：`{ "password": "<APP_PASSWORD>" }`
- **成功**：`200 { "ok": true }`，并 `Set-Cookie: fit_auth=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000[; Secure]`（线上 HTTPS 自动带 `Secure`）。
- **失败**：
  - `400 {"error":"bad request"}`：请求体不是合法 JSON。
  - `401 {"error":"invalid password"}`：密码错误。
  - `429 {"error":"尝试次数过多，请 15 分钟后再试"}`：同一 IP 在 15 分钟窗口内失败 ≥ 10 次。

### POST /api/logout

- **请求体**：无。
- **成功**：`200 { "ok": true }`，并 `Set-Cookie: fit_auth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0[; Secure]`（清 Cookie）。

---

## 训练计划

### GET /api/plan

- **入参**：无。
- **响应**：`{ "days": [ { "id", "name", "exercises": [ { "id", "day_id", "sort", "name", "equipment", "target_sets", "target_reps", "tutorial_url" } ] } ] }`
- **说明**：`tutorial_url` 为动作示范链接。优先取 `exercise_tutorials` 表中预置的精确链接；缺失时回退为限定 MuscleWiki 的站内检索链接（`functions/api/_tutorials.js`）。

---

## 训练会话

### GET /api/sessions

- **查询参数**（可选）：`from=YYYY-MM-DD`、`to=YYYY-MM-DD`（需同时提供才生效，按 `date BETWEEN from AND to` 过滤）。
- **响应**：`{ "sessions": [ { "id", "date", "day_id", "note" } ] }`，按 `date DESC, id DESC` 排序。

### POST /api/sessions

保存一次训练：同一天（`date`）同一训练日（`day_id`）若已存在会话则**复用**，且传入 `logs` 时**覆盖**该会话的全部明细（先删后写，单批次原子）。

- **请求体**：
  - `date`（必填，`YYYY-MM-DD`）
  - `day_id`（必填，整数）
  - `note`（可选，字符串）
  - `logs`（可选，数组）：每项 `{ plan_exercise_id, set_no, weight?, reps? }`
    - `plan_exercise_id`、`set_no` 必须为正整数；`weight` ∈ `[0,1000]`；`reps` ∈ `[0,1000]` 整数；均可为空。
    - 数量须在 `1–200` 之间。
- **响应**：
  - 仅存会话（无 `logs`）：`{ "id", "reused": <boolean> }`（新建 `201` / 复用 `200`）。
  - 带 `logs`：`{ "id", "saved": <写入明细数>, "reused": <boolean> }`。
- **错误**：`400 {"error":"date and day_id required"}`；`400 {"error":"明细数量需在 1-200 之间"}`；`400 {"error":"invalid log row"}`；`400 {"error":"bad request"}`。

### DELETE /api/sessions?id=

- **查询参数**：`id`（正整数）。
- **响应**：`200 { "ok": true }`。明细（`set_logs`）与会话在同一批次内删除，保证原子、无残留。
- **错误**：`400 {"error":"invalid id"}`。

---

## 组明细

### GET /api/set-logs?session_id=

- **查询参数**：`session_id`（正整数）。
- **响应**：`{ "logs": [ { "id", "session_id", "plan_exercise_id", "set_no", "weight", "reps" } ] }`，按 `plan_exercise_id, set_no` 排序。
- **错误**：`400 {"error":"invalid session_id"}`。

### POST /api/set-logs

- **请求体**：`{ "session_id", "plan_exercise_id", "set_no", "weight?", "reps?" }`（字段规则同 POST /api/sessions 的 `logs` 项）。
- **响应**：`201 { "id" }`。
- **错误**：`400 {"error":"session_id, plan_exercise_id, set_no required"}`；`400 {"error":"invalid log row"}`。

### DELETE /api/set-logs?id=

- **查询参数**：`id`（正整数）。
- **响应**：`200 { "ok": true }`。
- **错误**：`400 {"error":"invalid id"}`。

---

## 体重

### GET /api/body-weights

- **响应**：`{ "weights": [ { "id", "date", "weight" } ] }`，按 `date` 升序。

### POST /api/body-weights

- **请求体**：`{ "date": "YYYY-MM-DD", "weight": <number> }`，`weight` 须满足 `0 < weight ≤ 500`。
- **响应**：`201 { "id" }`。
- **错误**：`400 {"error":"invalid date or weight"}`。

### DELETE /api/body-weights?id=

- **查询参数**：`id`。
- **响应**：`200 { "ok": true }`。
- **错误**：`400 {"error":"id required"}`。

---

## 记录页聚合

### GET /api/history

按 `(date, id)` 倒序的游标分页，一次返回本页会话及其明细（避免前端 N+1 请求拉全量）。

- **查询参数**（可选）：
  - `limit`：正整数，默认 `50`，上限 `500`（超限自动截断，非法值回落默认）。
  - `before`：游标，格式 `<date>,<id>`，返回比该条更早的记录。格式非法时忽略该参数。
- **响应**：`{ "items": [ { "id", "date", "day_id", "note", "logs": [ ... ] } ], "hasMore": <boolean> }`
- **分页用法**：首页不带 `before`；取回后以末条 `items[last]` 拼 `before=${date},${id}` 请求下一页，直到 `hasMore === false`。

---

## 打卡页统计

### GET /api/stats?monthStart=

只读聚合，避免前端为渲染打卡页而拉取全部明细。

- **查询参数**：`monthStart`（必填，`YYYY-MM-DD`，由前端按本地时区计算当月 1 日）。
- **响应**：
  ```json
  {
    "totalSessions": 0,
    "monthSessions": 0,
    "totalVolume": 0,
    "monthVolume": 0,
    "dates": ["YYYY-MM-DD", "..."]
  }
  ```
  - `totalSessions` / `monthSessions`：累计 / 本月训练次数。
  - `totalVolume` / `monthVolume`：累计 / 本月训练容量（`Σ weight × reps`）。
  - `dates`：所有训练日期（去重、升序），供前端计算连续天数、周次数、热力图与趋势条。
- **错误**：`400 {"error":"invalid monthStart"}`。
