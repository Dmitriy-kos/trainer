// Порт bot/logic.py. Паритет тестов: tests/test_logic.py.
import { PROGRAMS, programByNumber } from "./plan.js";

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

// Схема подтягиваний дня. Программа 2 — таблица спеки Шага 5; числа считает код.
export function pullupDayScheme(programNumber, week, day, maxReps) {
  if (maxReps == null) return pullupScheme(null);
  if (programNumber !== 2) return pullupScheme(maxReps);
  if (day === "T") return `Тест: максимум строгих (текущий макс ${maxReps})`;
  const w = Math.max(1, Math.min(4, week));
  const work = Math.max(1, maxReps - 2);
  const easy = Math.max(1, maxReps - 3);
  const table = {
    1: { A: `5×${work} (макс ${maxReps} − 2)`, C: `4×${work}, пауза 2 с вверху`, B: "лесенка 2-3-4-5, 2 круга" },
    2: { A: `5×${work} (макс ${maxReps} − 2)`, C: `5×${work}`, B: "лесенка 2-3-4-5, 3 круга" },
    3: { A: `6×${work} (макс ${maxReps} − 2)`, C: "перетест макса, затем 3 подхода на (новый − 2)", B: "лесенка от нового макса, 2 круга" },
    4: { A: `3×${easy}, легко (разгрузка)`, C: `2×${easy}, легко`, B: "пятница — день замеров: максимум строгих" },
  };
  return table[w][day] ?? pullupScheme(maxReps);
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

export function programForDate(startDate, today) {
  const deltaDays = Math.round((parseDate(today) - parseDate(startDate)) / DAY_MS);
  const weekAbs = deltaDays < 0 ? 1 : Math.floor(deltaDays / 7) + 1;
  let offset = 0;
  for (const p of PROGRAMS) {
    if (weekAbs <= offset + p.weeks) return { number: p.number, week: weekAbs - offset };
    offset += p.weeks;
  }
  const last = PROGRAMS[PROGRAMS.length - 1];
  return { number: last.number, week: last.weeks };
}

// Плитка «Замеры»: последняя неделя программы с днём T (если T-сессия этой
// программы ещё не создана — ни open, ни done); плюс первая неделя следующей
// программы, если день T предыдущей так и не был отработан (догнать).
export function measureTile(programStart, today, sessions) {
  const { number, week } = programForDate(programStart, today);
  const program = programByNumber(number);
  const hasT = (n) => sessions.some((s) => s.day === "T" && (s.program ?? 1) === n);
  if (program.dayPlans.T && week === program.weeks && !hasT(number)) return { programNumber: number };
  const prev = PROGRAMS.find((p) => p.number === number - 1);
  if (week === 1 && prev && prev.dayPlans.T && !hasT(prev.number)) return { programNumber: prev.number };
  return null;
}

// Таймер отдыха: отсчёт от метки времени старта, не от тиков — свёрнутое
// PWA при возврате на передний план показывает честный остаток.
export function restRemaining(startedAtMs, durationSec, nowMs) {
  const left = Math.ceil((startedAtMs + durationSec * 1000 - nowMs) / 1000);
  return Math.max(0, left);
}

export function formatRest(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

// Плитка-напоминание о бэкапе: нет данных — не показываем; данные есть, но
// копий ещё не было — показываем без числа дней; копия свежее недели — молчим;
// 7+ дней с последней копии — показываем сколько дней прошло.
export function backupReminder(lastBackupDate, today, hasData) {
  if (!hasData) return null;
  if (!lastBackupDate) return { days: null };
  const days = Math.round((parseDate(today) - parseDate(lastBackupDate)) / DAY_MS);
  return days >= 7 ? { days } : null;
}
