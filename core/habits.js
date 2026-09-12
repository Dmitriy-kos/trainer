export const DAILY_HABITS = Object.freeze([
  Object.freeze({ id: "fish_oil", icon: "🐟", label: "Выпил рыбий жир" }),
  Object.freeze({ id: "protein", icon: "🥤", label: "Выпил протеин" }),
]);

const ACTIVE_HABIT_IDS = new Set(DAILY_HABITS.map((habit) => habit.id));
// Снятые с экрана фокусы сохраняем в истории и резервных копиях.
const HABIT_IDS = new Set([...ACTIVE_HABIT_IDS, "meditation", "creatine", "audiobook"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// В meta храним компактный журнал: { "2026-07-31": ["meditation", ...] }.
// Неизвестные привычки отбрасываем, чтобы старые/повреждённые данные не
// ломали экран после изменения списка фокусов.
export function normalizeHabitsByDate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const result = {};
  for (const [date, ids] of Object.entries(value)) {
    if (!DATE_RE.test(date) || !Array.isArray(ids)) continue;
    const clean = [...new Set(ids.filter((id) => HABIT_IDS.has(id)))];
    if (clean.length > 0) result[date] = clean;
  }
  return result;
}

export function toggleHabit(habitsByDate, date, habitId) {
  if (!DATE_RE.test(date) || !ACTIVE_HABIT_IDS.has(habitId)) return normalizeHabitsByDate(habitsByDate);

  const next = normalizeHabitsByDate(habitsByDate);
  const completed = new Set(next[date] ?? []);
  if (completed.has(habitId)) completed.delete(habitId);
  else completed.add(habitId);

  if (completed.size === 0) delete next[date];
  else next[date] = [...HABIT_IDS].filter((id) => completed.has(id));
  return next;
}

export function habitsViewModel(habitsByDate, date) {
  const completed = new Set(normalizeHabitsByDate(habitsByDate)[date] ?? []);
  const items = DAILY_HABITS
    .map((habit, order) => ({ ...habit, done: completed.has(habit.id), order }))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.order - b.order)
    .map(({ order: _order, ...habit }) => habit);
  return { items, done: items.filter((item) => item.done).length, total: items.length };
}
