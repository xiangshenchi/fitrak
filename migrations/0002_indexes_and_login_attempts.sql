-- 0002: 增量优化（对已有数据库安全，可重复执行）
-- 用法：npx wrangler d1 execute fitness-db --local  --file=./migrations/0002_indexes_and_login_attempts.sql
--       npx wrangler d1 execute fitness-db --remote --file=./migrations/0002_indexes_and_login_attempts.sql

CREATE INDEX IF NOT EXISTS idx_sessions_date_day ON sessions(date, day_id);
CREATE INDEX IF NOT EXISTS idx_set_logs_session ON set_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_plan_exercises_day ON plan_exercises(day_id);
CREATE INDEX IF NOT EXISTS idx_body_weights_date ON body_weights(date);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_ts ON login_attempts(ip, ts);
