// 17.09.2026: владелец подтвердил, что всегда выполнял наклонный жим со штангой.
// Исправляем только идентичность упражнения, без пересчёта веса и повторений.
const OLD_INCLINE = "Жим гантелей на наклонной";
const NEW_INCLINE = "Жим штанги на наклонной";

export function correctInclineExercise(row) {
  if (!row || row.exercise !== OLD_INCLINE) return row;
  return { ...row, exercise: NEW_INCLINE };
}

export function correctInclineSession(session) {
  const notes = session.exerciseNotes;
  if (!notes || !Object.hasOwn(notes, OLD_INCLINE)) return session;
  const corrected = { ...notes };
  // Если уже есть обе заметки, сохраняем содержание обеих.
  const oldNote = corrected[OLD_INCLINE];
  const newNote = corrected[NEW_INCLINE];
  corrected[NEW_INCLINE] = newNote && newNote !== oldNote
    ? `${newNote}\n${oldNote}` : oldNote;
  delete corrected[OLD_INCLINE];
  return { ...session, exerciseNotes: corrected };
}

export function buildBackup(programStart, sessions, sets, extraMeta = {}, food = [], weights = []) {
  // pending-записи в бэкап не входят: без payload (base64 фото/текст) их не
  // распознать после восстановления — мёртвая запись без возможности удаления
  // из UI; а сам payload в файле бэкапа не место (файлы лежат в Google Диске).
  const cleanFood = (food || []).filter((f) => f.status !== "pending").map((f) => ({ ...f, pendingPayload: null }));
  return { app: "trainer", version: 5, exportedAt: new Date().toISOString(),
           meta: { programStart, pullupMax: null, lastBackupDate: null, habitsByDate: {}, scheduleAdjustments: [], ...extraMeta },
           sessions: sessions.map(correctInclineSession), sets: sets.map(correctInclineExercise), food: cleanFood, weights: weights || [] };
}

// Принимает v1–v5; возвращает мигрированный v5-объект.
// v1 — до Шага 5 (без session.program и meta.pullupMax/lastBackupDate),
// v2 — до модуля питания (без food),
// v3 — до модуля взвешивания (без weights),
// v4 — до Шага 8 (без sets[].skipFlag); старые копии в Google Диске обязаны читаться всегда.
export function validateBackup(obj) {
  const ok = obj && obj.app === "trainer" && [1, 2, 3, 4, 5].includes(obj.version) &&
    Array.isArray(obj.sessions) && Array.isArray(obj.sets) && obj.meta && obj.meta.programStart;
  if (!ok) throw new Error("Это не файл резервной копии тренера (ожидаю trainer v1–v5).");
  const sessions = obj.sessions.map((s) => correctInclineSession(s.program == null ? { ...s, program: 1 } : s));
  const sets = obj.sets.map((x) => correctInclineExercise(x.skipFlag == null ? { ...x, skipFlag: 0 } : x));
  const meta = { pullupMax: null, lastBackupDate: null, habitsByDate: {}, scheduleAdjustments: [], ...obj.meta };
  const food = Array.isArray(obj.food) ? obj.food : [];
  const weights = Array.isArray(obj.weights) ? obj.weights : [];
  return { ...obj, version: 5, sessions, sets, meta, food, weights };
}
