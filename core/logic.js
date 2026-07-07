// Порт bot/logic.py. Паритет тестов: tests/test_logic.py.
const WEEK_LABELS = {
  1: "Неделя 1 — усилие 6/10, втягивание, чуть меньше подходов",
  2: "Неделя 2 — усилие 7/10, полный объём, +вес/повтор",
  3: "Неделя 3 — усилие 7-8/10, пик объёма (не до отказа)",
  4: "Неделя 4 — разгрузка −20%, перетесты",
};

const DAY_MS = 86400000;
const parseDate = (d) => Date.parse(d + "T00:00:00Z");

export function currentWeek(startDate, today) {
  const deltaDays = Math.round((parseDate(today) - parseDate(startDate)) / DAY_MS);
  if (deltaDays < 0) return 1;
  return Math.min(4, Math.floor(deltaDays / 7) + 1);
}

export function weekLabel(week) {
  return WEEK_LABELS[week] ?? WEEK_LABELS[1];
}

export function pullupScheme(maxReps) {
  if (maxReps == null) return "Сделай тест: максимум строгих подтягиваний (с резинкой, если хват не держит).";
  if (maxReps <= 3) return "0-3: негативы 4×3-5 (опускание 3-5 сек) + с резинкой 3×6-8 + тяга верхнего блока.";
  if (maxReps <= 6) return "4-6: субмаксимальные 4-5 подходов (на 1-2 меньше максимума, БЕЗ отказа).";
  return "7+: 5 подходов с 1-2 в запасе, можно добавить вес/паузы.";
}

export function autoregulationHint(targetReps, targetRpe, logged) {
  const rpes = logged.filter((s) => s.rpe != null).map((s) => s.rpe);
  const repss = logged.filter((s) => s.reps != null).map((s) => s.reps);
  if (rpes.length === 0 || targetRpe == null) return "";
  const avg = rpes.reduce((a, b) => a + b, 0) / rpes.length;
  const hitReps = (targetReps == null && repss.length > 0) ||
    (targetReps != null && repss.length > 0 && Math.min(...repss) >= targetReps);
  if (avg <= targetRpe - 1.5 && hitReps)
    return "Было легко (усилие ниже цели) — в следующем блоке можно чуть добавить вес.";
  if (avg >= targetRpe + 1.5 || (targetReps != null && repss.length > 0 && Math.min(...repss) < targetReps))
    return "Тяжело / не добил повторы — держим вес, не грузим.";
  return "";
}

export function overtrainingAlert(recentWellbeing) {
  // Контракт: массив «новые первыми» (как отдаёт queries.recentWellbeing).
  if (recentWellbeing.length < 3) return null;
  if (recentWellbeing.slice(0, 3).every((w) => w <= 5))
    return "Самочувствие низкое 3 сессии подряд — маркер перетрена. Снизь объём, добавь сон, не геройствуй.";
  return null;
}
