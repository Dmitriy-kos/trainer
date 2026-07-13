// Семантика запросов бота (bot/db.py) на чистых массивах.
import { formatLastSets } from "./format.js";
export function newerFirst(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return b.id - a.id;
}

export function lastSets(sessions, sets, exercise) {
  const doneById = new Map(sessions.filter((s) => s.status === "done").map((s) => [s.id, s]));
  const clean = sets.filter((x) => x.exercise === exercise && !x.painFlag && !x.skipFlag && doneById.has(x.sessionId));
  if (clean.length === 0) return [];
  const latest = [...new Set(clean.map((x) => x.sessionId))]
    .map((id) => doneById.get(id)).sort(newerFirst)[0];
  return clean.filter((x) => x.sessionId === latest.id).sort((a, b) => a.setIdx - b.setIdx);
}

export function recentWellbeing(sessions, limit = 3) {
  return sessions.filter((s) => s.status === "done" && s.wellbeing != null)
    .sort(newerFirst).slice(0, limit).map((s) => s.wellbeing);
}

export function unfinishedSession(sessions) {
  return sessions.filter((s) => s.status === "open").sort(newerFirst)[0] ?? null;
}

// Все подходы упражнения в конкретной сессии (включая painFlag) — для экрана
// просмотра/правки. Сортировка по setIdx (painFlag-запись имеет setIdx 0 — первая).
export function sessionExerciseSets(sets, sessionId, exercise) {
  return sets
    .filter((x) => x.sessionId === sessionId && x.exercise === exercise)
    .sort((a, b) => a.setIdx - b.setIdx);
}

// Подходы сессии, сгруппированные по упражнению в порядке orderIdx плана
// (RUN/чужие данные без плана — по первому появлению), внутри группы по setIdx.
// Больные подходы (painFlag=1) не подмешиваются в общий формат — это была бы
// потеря данных о боли; выводятся отдельной строкой-маркером.
// У завершённой (done) сессии упражнения плана без единого подхода выводятся
// строкой «пропущено» (skipped: true) — их можно дописать задним числом.
// У открытой сессии не начатые упражнения «ещё впереди» — их не показываем.
export function groupSessionSets(session, allSets, plan) {
  const sets = allSets.filter((x) => x.sessionId === session.id);
  const planOrder = plan ? plan.slice().sort((a, b) => a.orderIdx - b.orderIdx).map((it) => it.exercise) : [];
  const present = [...new Set(sets.map((x) => x.exercise))];
  const extra = present.filter((ex) => !planOrder.includes(ex));
  const showSkipped = session.status === "done" && planOrder.length > 0;
  const order = showSkipped
    ? [...planOrder, ...extra]
    : [...planOrder.filter((ex) => present.includes(ex)), ...extra];
  if (sets.length === 0 && !showSkipped) return { noSets: true, lines: [] };

  const lines = [];
  for (const exercise of order) {
    const exSets = sets.filter((x) => x.exercise === exercise).sort((a, b) => a.setIdx - b.setIdx);
    const clean = exSets.filter((x) => !x.painFlag && !x.skipFlag);
    const pain = exSets.filter((x) => x.painFlag);
    const skipped = exSets.some((x) => x.skipFlag);
    // Пропуск теперь помечается строкой в sets (Шаг 8). Старые сессии пропуск не
    // помечали — там признак прежний: у упражнения плана нет ни одной строки.
    if (exSets.length === 0 || skipped) lines.push({ text: `${exercise}: пропущено`, pain: false, skipped: true, exercise });
    if (clean.length > 0) lines.push({ text: `${exercise}: ${formatLastSets(clean)}`, pain: false, skipped: false, exercise });
    if (pain.length > 0) lines.push({ text: `${exercise}: 🚑 больно`, pain: true, skipped: false, exercise });
  }
  return { noSets: false, lines };
}

// Статус упражнения в сессии выводится из самих записей, а не из счётчика
// (Шаг 8: порядок упражнений свободный, счётчик progressIdx стал курсором).
// Приоритет: боль → пропуск → записано → не записано.
export function exerciseStatus(sets, sessionId, exercise) {
  const rows = sets.filter((x) => x.sessionId === sessionId && x.exercise === exercise);
  if (rows.length === 0) return "todo";
  if (rows.some((x) => x.painFlag)) return "pain";
  if (rows.some((x) => x.skipFlag)) return "skipped";
  return "done";
}

// exercises — элементы плана дня ({exercise, orderIdx, …}) в порядке показа.
export function sessionStatuses(sets, sessionId, exercises) {
  return exercises.map((it) => exerciseStatus(sets, sessionId, it.exercise));
}

export function sessionRemaining(sets, sessionId, exercises) {
  return sessionStatuses(sets, sessionId, exercises).filter((s) => s === "todo").length;
}

// Ближайшее незакрытое упражнение после fromIdx, по кругу (занятый станок:
// перепрыгнули присед — вернёмся к нему, когда всё остальное закрыто).
export function nextTodoIdx(sets, sessionId, exercises, fromIdx) {
  const n = exercises.length;
  for (let k = 1; k <= n; k++) {
    const i = (fromIdx + k) % n;
    if (exerciseStatus(sets, sessionId, exercises[i].exercise) === "todo") return i;
  }
  return null;
}

// «Призрачные» сессии: открытые, но без единой записи (ни подхода, ни пометки
// пропуска, ни пометки боли). Появляются, когда тренировку начали тапом по
// кнопке дня и ушли из приложения, не выйдя кнопкой «← выйти» с первого
// упражнения. Настоящей тренировкой такая сессия не является — теряться в ней
// нечему, — но она навсегда виснет плиткой «Продолжить» на «Сегодня» и строкой
// «не завершена» в истории. Удаляются при старте приложения.
export function ghostSessionIds(sessions, sets) {
  const withData = new Set(sets.map((x) => x.sessionId));
  return sessions.filter((s) => s.status === "open" && !withData.has(s.id)).map((s) => s.id);
}
