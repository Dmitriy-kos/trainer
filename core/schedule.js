// Подтверждённые корректировки календаря. Они добавляются поверх исходной
// даты старта, не переписывая историю уже завершённых недель.
export const CONFIRMED_SCHEDULE_ADJUSTMENTS = Object.freeze([
  Object.freeze({
    id: "repeat-week6-2026-08-03",
    effectiveFrom: "2026-08-03",
    days: 7,
    reason: "Повтор недели 6 после пропусков; подтверждено 01.08.2026",
  }),
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validAdjustment(value) {
  return value &&
    typeof value.id === "string" && value.id.trim() &&
    validDate(value.effectiveFrom) &&
    Number.isInteger(value.days) && value.days > 0 && value.days <= 28;
}

// Старые бэкапы не знают о подтверждённой корректировке, поэтому при чтении
// объединяем сохранённые записи с каноническим списком приложения. Версия из
// приложения имеет приоритет: повреждённый импорт не может отменить решение.
export function normalizeScheduleAdjustments(value) {
  const byId = new Map();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (validAdjustment(item)) byId.set(item.id, { ...item });
    }
  }
  for (const item of CONFIRMED_SCHEDULE_ADJUSTMENTS) byId.set(item.id, { ...item });
  return [...byId.values()].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom) || a.id.localeCompare(b.id));
}

function addDays(date, days) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!validDate(date) || Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

// Сдвиг начинает действовать только с effectiveFrom. Поэтому 01.08 остаётся
// неделей 6, 03.08 снова становится неделей 6, а история до вставки неизменна.
export function programStartForDate(baseStart, date, adjustments) {
  const totalDays = normalizeScheduleAdjustments(adjustments)
    .filter((item) => item.effectiveFrom <= date)
    .reduce((sum, item) => sum + item.days, 0);
  return addDays(baseStart, totalDays);
}
