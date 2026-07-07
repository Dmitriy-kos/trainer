// Семантика запросов бота (bot/db.py) на чистых массивах.
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
