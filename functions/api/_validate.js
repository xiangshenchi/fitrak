export function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// 单条组记录：动作/组号必须是正整数；重量与次数要么为空要么是合理数值
export function isValidLogRow(l) {
  if (!l || typeof l !== 'object') return false;
  if (!Number.isInteger(l.plan_exercise_id) || l.plan_exercise_id <= 0) return false;
  if (!Number.isInteger(l.set_no) || l.set_no <= 0) return false;
  if (l.weight != null && (typeof l.weight !== 'number' || !Number.isFinite(l.weight) || l.weight < 0 || l.weight > 1000)) return false;
  if (l.reps != null && (!Number.isInteger(l.reps) || l.reps < 0 || l.reps > 1000)) return false;
  return true;
}

// 正整数字段（id / session_id 等）
export function isPositiveInt(v) {
  return Number.isInteger(v) && v > 0;
}

// 体重：合理人体范围 (0, 500] kg，仅接受有限数字
export function isValidWeight(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 500;
}
