DROP TABLE IF EXISTS set_logs;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS plan_exercises;
DROP TABLE IF EXISTS plan_days;
DROP TABLE IF EXISTS body_weights;

CREATE TABLE plan_days (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE plan_exercises (
  id INTEGER PRIMARY KEY,
  day_id INTEGER NOT NULL REFERENCES plan_days(id),
  sort INTEGER NOT NULL,
  name TEXT NOT NULL,
  equipment TEXT,
  target_sets INTEGER NOT NULL,
  target_reps TEXT NOT NULL
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  day_id INTEGER NOT NULL REFERENCES plan_days(id),
  note TEXT
);

CREATE TABLE set_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  plan_exercise_id INTEGER NOT NULL REFERENCES plan_exercises(id),
  set_no INTEGER NOT NULL,
  weight REAL,
  reps INTEGER
);

CREATE TABLE body_weights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  weight REAL NOT NULL
);

INSERT INTO plan_days (id, name) VALUES
  (1, '上肢A(胸+三头)'),
  (2, '下肢A'),
  (3, '上肢B(背+二头)'),
  (4, '下肢B+手臂');

INSERT INTO plan_exercises (day_id, sort, name, equipment, target_sets, target_reps) VALUES
  (1,1,'哑铃卧推','哑铃+平凳',4,'8-12'),
  (1,2,'上斜哑铃卧推','哑铃+上斜凳',3,'10'),
  (1,3,'龙门架夹胸','龙门架',3,'12-15'),
  (1,4,'哑铃肩推','哑铃',3,'10-12'),
  (1,5,'绳索下压(三头)','龙门架',3,'12-15'),
  (1,6,'俯卧撑','自重',2,'力竭'),
  (2,1,'哑铃高脚杯深蹲','哑铃',3,'10-12'),
  (2,2,'腿举机','器械',3,'10-12'),
  (2,3,'腿屈伸机','器械',3,'12'),
  (2,4,'提踵','器械/哑铃',3,'15-20'),
  (2,5,'平板支撑','自重',3,'30-45秒'),
  (3,1,'上斜哑铃卧推','哑铃+上斜凳',3,'10'),
  (3,2,'高位下拉','综合训练器',3,'10-12'),
  (3,3,'坐姿划船','综合训练器',3,'10-12'),
  (3,4,'绳索/哑铃弯举','龙门架/哑铃',3,'10-12'),
  (3,5,'锤式弯举','哑铃',3,'12'),
  (3,6,'哑铃侧平举','哑铃',3,'12-15'),
  (4,1,'哑铃罗马尼亚硬拉','哑铃',3,'10'),
  (4,2,'保加利亚分腿蹲/臀腿训练','哑铃/器械',3,'8-10'),
  (4,3,'腿弯举机','器械',3,'12'),
  (4,4,'臀桥','自重/杠铃片',3,'12-15'),
  (4,5,'手臂收尾:三头下压+弯举','龙门架',2,'12-15');
