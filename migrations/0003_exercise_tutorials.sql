-- 0003: 动作示范教程链接表（幂等，可重复执行）
-- 用法：npx wrangler d1 execute fitness-db --local  --file=./migrations/0003_exercise_tutorials.sql
--       npx wrangler d1 execute fitness-db --remote --file=./migrations/0003_exercise_tutorials.sql
-- 注意：本文件的「动作 -> 链接」数据须与 schema.sql 中的 exercise_tutorials 保持一致。

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
