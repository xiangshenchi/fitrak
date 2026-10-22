-- ============================================================
-- 迁移 0004：引入 users 表 + 全业务表 user_id
-- 前置：0002 / 0003 已执行
-- 幂等：每句都先检测；事务包裹
-- owner 数据初始化走 JS 层（login.js 的 ensureOwner）
-- ============================================================

BEGIN TRANSACTION;

-- Step 1: users 表
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT    NOT NULL UNIQUE,
  pwd_hash    TEXT    NOT NULL,
  pwd_salt    TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Step 2: 五表加 user_id（允许 NULL，后续 JS 层回填 owner 数据后再考虑 NOT NULL）
-- SQLite 的 ALTER TABLE ADD COLUMN 不能加外键约束；迁移完成后通过应用层保证引用完整性

ALTER TABLE sessions       ADD COLUMN user_id INTEGER;
ALTER TABLE set_logs       ADD COLUMN user_id INTEGER;
ALTER TABLE body_weights   ADD COLUMN user_id INTEGER;
ALTER TABLE plan_days      ADD COLUMN user_id INTEGER;
ALTER TABLE plan_exercises ADD COLUMN user_id INTEGER;

COMMIT;
