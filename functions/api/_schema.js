// 幂等 schema 自愈：即使 D1 控制台漏跑迁移，服务也能自动补齐
// CREATE TABLE IF NOT EXISTS 与 ALTER TABLE ADD COLUMN 失败（列已存在）都安全忽略
let ready = false;

export async function ensureSchema(env) {
  if (ready) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT    NOT NULL UNIQUE,
      pwd_hash   TEXT    NOT NULL,
      pwd_salt   TEXT    NOT NULL,
      created_at INTEGER NOT NULL
    )`
  ).run();
  try {
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)').run();
  } catch { }
  const alters = [
    'ALTER TABLE sessions ADD COLUMN user_id INTEGER',
    'ALTER TABLE set_logs ADD COLUMN user_id INTEGER',
    'ALTER TABLE body_weights ADD COLUMN user_id INTEGER',
    'ALTER TABLE plan_days ADD COLUMN user_id INTEGER',
    'ALTER TABLE plan_exercises ADD COLUMN user_id INTEGER',
  ];
  for (const sql of alters) {
    try { await env.DB.prepare(sql).run(); } catch { /* duplicate column name */ }
  }
  ready = true;
}
