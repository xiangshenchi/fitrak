# 健身记录 App

个人健身记录 Web App,部署到 Cloudflare Pages + Pages Functions + D1。

- 前端:免构建静态页面(原生 HTML/CSS/JS),Chart.js 本地托管于 `public/vendor/`。
- 后端:Pages Functions(`functions/api/*`)。
- 数据:D1(SQLite),绑定名 `DB`。
- 认证:单一密码,HMAC 签名 `HttpOnly` Cookie。

## 目录结构

```
fitness-app/
├─ public/                     # 静态前端
│  ├─ index.html
│  ├─ styles.css
│  ├─ app.js
│  └─ _headers                 # 安全响应头 + 静态资源缓存策略
├─ functions/api/              # 接口
│  ├─ _middleware.js           # 统一鉴权(除 /api/login 外)
│  ├─ _auth.js                 # token 签名/校验、Cookie、json 工具
│  ├─ _validate.js             # 请求字段校验纯函数
│  ├─ login.js  logout.js
│  ├─ plan.js
│  ├─ sessions.js  set-logs.js
│  ├─ history.js               # 记录页聚合接口(一次取回 session + 明细)
│  └─ body-weights.js
├─ migrations/                 # 增量迁移(对已有库安全，可重复执行)
├─ tests/                      # 单测(鉴权/校验纯函数)
├─ schema.sql                  # 建表 + 预置 4 天训练计划(新库用)
├─ wrangler.toml
└─ package.json
```

## 本地开发

1. 安装依赖:
   ```
   npm install
   ```

2. 本地密钥文件 `.dev.vars`(已在 `.gitignore`,不会提交):
   ```
   APP_PASSWORD=change-me
   AUTH_SECRET=some-long-random-string
   ```

3. 初始化本地 D1 数据库:
   ```
   npx wrangler d1 execute fitness-db --local --file=./schema.sql
   ```

4. 启动本地预览(默认 http://localhost:8788):
   ```
   npx wrangler pages dev public
   ```

5. 运行单测:
   ```
   npm test
   ```

## 已有数据库升级(增量迁移)

新库直接执行 `schema.sql` 即可;已有库(本地或线上)用 `migrations/` 下的脚本升级,
脚本均为幂等,可重复执行:

- 本地:`npm run db:migrate:local`
- 线上:`npm run db:migrate:remote`

当前包含:索引补齐、`login_attempts` 表(登录限流用,表不存在时限流自动降级)。

## 部署到 Cloudflare

1. 创建远程 D1 数据库并记下 `database_id`:
   ```
   npx wrangler d1 create fitness-db
   ```

2. 把输出的 `database_id` 填进 `wrangler.toml` 的 `REPLACE_WITH_D1_ID`。

3. 初始化远程数据库:
   ```
   npx wrangler d1 execute fitness-db --remote --file=./schema.sql
   ```

4. 设置线上密钥(按提示输入值):
   ```
   npx wrangler pages secret put APP_PASSWORD
   npx wrangler pages secret put AUTH_SECRET
   ```

5. 部署:
   ```
   npx wrangler pages deploy public
   ```
   部署完成后会输出 `https://<project>.pages.dev`。

## 验收清单

- 能登录(错误密码被拒)。
- 能记录每组重量与次数。
- 刷新页面 / 换浏览器后数据仍在(D1 持久化生效)。
- 图表正确反映体重与训练次数。
- 未登录访问任一数据接口返回 401。

## 安全说明

- `APP_PASSWORD` 与 `AUTH_SECRET` 仅通过 `wrangler secret` / `.dev.vars` 注入,**不写入仓库**。
