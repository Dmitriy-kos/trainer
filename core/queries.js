// Семантика запросов бота (bot/db.py) на чистых массивах.
import { formatLastSets } from "./format.js";
export function newerFirst(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return b.id - a.id;
}

export function lastSets(sessions, sets, exercise) {
  const doneById = new Map(sessions.filter((s) => s.status === "done").map((s) => [s.id, s]));
  const clean = sets.filter((x) => x.exercise === exercise && !x.painFlag && doneById.has(x.sessionId));
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
    const clean = exSets.filter((x) => !x.painFlag);
    const pain = exSets.filter((x) => x.painFlag);
    if (exSets.length === 0) lines.push({ text: `${exercise}: пропущено`, pain: false, skipped: true, exercise });
    if (clean.length > 0) lines.push({ text: `${exercise}: ${formatLastSets(clean)}`, pain: false, skipped: false, exercise });
    if (pain.length > 0) lines.push({ text: `${exercise}: 🚑 больно`, pain: true, skipped: false, exercise });
  }
  return { noSets: false, lines };
}
