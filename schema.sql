-- ⚠️ 本脚本用于【全新数据库】：会 DROP TABLE 重建，执行后原有数据将全部丢失。
--    已有数据的库（本地或线上）请改用 migrations/ 下的增量脚本：
--    本地: npm run db:migrate:local   线上: npm run db:migrate:remote
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS set_logs;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS plan_exercises;
DROP TABLE IF EXISTS plan_days;
DROP TABLE IF EXISTS body_weights;
DROP TABLE IF EXISTS users;

-- 用户表：owner(id=1) 由 login.js 首次登录时按 APP_PASSWORD 初始化
CREATE TABLE users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT    NOT NULL UNIQUE,
  pwd_hash   TEXT    NOT NULL,
  pwd_salt   TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_users_username ON users(username);

CREATE TABLE plan_days (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  name TEXT NOT NULL
);

CREATE TABLE plan_exercises (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  day_id INTEGER NOT NULL REFERENCES plan_days(id),
  sort INTEGER NOT NULL,
  name TEXT NOT NULL,
  equipment TEXT,
  target_sets INTEGER NOT NULL,
  target_reps TEXT NOT NULL
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  date TEXT NOT NULL,
  day_id INTEGER NOT NULL REFERENCES plan_days(id),
  note TEXT
);

CREATE TABLE set_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  plan_exercise_id INTEGER NOT NULL REFERENCES plan_exercises(id),
  set_no INTEGER NOT NULL,
  weight REAL,
  reps INTEGER
);

CREATE TABLE body_weights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  date TEXT NOT NULL,
  weight REAL NOT NULL
);

-- 登录失败记录（按 IP 限流用）
CREATE TABLE login_attempts (
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
);

CREATE INDEX idx_sessions_date_day ON sessions(date, day_id);
CREATE INDEX idx_set_logs_session ON set_logs(session_id);
CREATE INDEX idx_plan_exercises_day ON plan_exercises(day_id);
CREATE INDEX idx_body_weights_date ON body_weights(date);
CREATE INDEX idx_login_attempts_ip_ts ON login_attempts(ip, ts);

-- 动作示范教程链接（动作名 -> MuscleWiki 具体页；缺失时前端回退为站内检索）
CREATE TABLE IF NOT EXISTS exercise_tutorials (
  exercise_name TEXT PRIMARY KEY,
  url           TEXT NOT NULL
);

INSERT OR REPLACE INTO exercise_tutorials (exercise_name, url) VALUES
  ('哑铃卧推', 'https://musclewiki.com/exercise/dumbbell-bench-press'),
  ('上斜哑铃卧推', 'https://musclewiki.com/exercise/dumbbell-incline-bench-press'),
  ('龙门架夹胸', 'https://musclewiki.com/exercise/cable-pec-fly'),
  ('哑铃肩推', 'https://musclewiki.com/exercise/dumbbell-seated-overhead-press'),
  ('绳索下压(三头)', 'https://musclewiki.com/exercise/cable-rope-pushdown'),
  ('俯卧撑', 'https://musclewiki.com/exercise/push-up'),
  ('哑铃高脚杯深蹲', 'https://musclewiki.com/exercise/dumbbell-goblet-squat'),
  ('腿举机', 'https://musclewiki.com/exercise/machine-leg-press'),
  ('腿屈伸机', 'https://musclewiki.com/exercise/machine-leg-extension'),
  ('提踵', 'https://musclewiki.com/exercise/machine-standing-calf-raises'),
  ('平板支撑', 'https://musclewiki.com/exercise/forearm-plank'),
  ('高位下拉', 'https://musclewiki.com/exercise/machine-pulldown'),
  ('坐姿划船', 'https://musclewiki.com/exercise/machine-seated-cable-row'),
  ('绳索/哑铃弯举', 'https://musclewiki.com/exercise/dumbbell-curl'),
  ('锤式弯举', 'https://musclewiki.com/exercise/dumbbell-hammer-curl'),
  ('哑铃侧平举', 'https://musclewiki.com/exercise/dumbbell-lateral-raise'),
  ('哑铃罗马尼亚硬拉', 'https://musclewiki.com/exercise/dumbbell-romanian-deadlift'),
  ('保加利亚分腿蹲/臀腿训练', 'https://musclewiki.com/exercise/bulgarian-split-squat'),
  ('腿弯举机', 'https://musclewiki.com/exercise/machine-hamstring-curl'),
  ('臀桥', 'https://musclewiki.com/exercise/glute-bridge');

INSERT INTO plan_days (id, user_id, name) VALUES
  (1, 1, '上肢A(胸+三头)'),
  (2, 1, '下肢A'),
  (3, 1, '上肢B(背+二头)'),
  (4, 1, '下肢B+手臂');

INSERT INTO plan_exercises (user_id, day_id, sort, name, equipment, target_sets, target_reps) VALUES
  (1,1,1,'哑铃卧推','哑铃+平凳',4,'8-12'),
  (1,1,2,'上斜哑铃卧推','哑铃+上斜凳',3,'10'),
  (1,1,3,'龙门架夹胸','龙门架',3,'12-15'),
  (1,1,4,'哑铃肩推','哑铃',3,'10-12'),
  (1,1,5,'绳索下压(三头)','龙门架',3,'12-15'),
  (1,1,6,'俯卧撑','自重',2,'力竭'),
  (1,2,1,'哑铃高脚杯深蹲','哑铃',3,'10-12'),
  (1,2,2,'腿举机','器械',3,'10-12'),
  (1,2,3,'腿屈伸机','器械',3,'12'),
  (1,2,4,'提踵','器械/哑铃',3,'15-20'),
  (1,2,5,'平板支撑','自重',3,'30-45秒'),
  (1,3,1,'上斜哑铃卧推','哑铃+上斜凳',3,'10'),
  (1,3,2,'高位下拉','综合训练器',3,'10-12'),
  (1,3,3,'坐姿划船','综合训练器',3,'10-12'),
  (1,3,4,'绳索/哑铃弯举','龙门架/哑铃',3,'10-12'),
  (1,3,5,'锤式弯举','哑铃',3,'12'),
  (1,3,6,'哑铃侧平举','哑铃',3,'12-15'),
  (1,4,1,'哑铃罗马尼亚硬拉','哑铃',3,'10'),
  (1,4,2,'保加利亚分腿蹲/臀腿训练','哑铃/器械',3,'8-10'),
  (1,4,3,'腿弯举机','器械',3,'12'),
  (1,4,4,'臀桥','自重/杠铃片',3,'12-15'),
  (1,4,5,'手臂收尾:三头下压+弯举','龙门架',2,'12-15');
