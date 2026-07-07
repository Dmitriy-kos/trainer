export function buildBackup(programStart, sessions, sets, extraMeta = {}, food = []) {
  // pending-записи в бэкап не входят: без payload (base64 фото/текст) их не
  // распознать после восстановления — мёртвая запись без возможности удаления
  // из UI; а сам payload в файле бэкапа не место (файлы лежат в Google Диске).
  const cleanFood = (food || []).filter((f) => f.status !== "pending").map((f) => ({ ...f, pendingPayload: null }));
  return { app: "trainer", version: 3, exportedAt: new Date().toISOString(),
           meta: { programStart, pullupMax: null, lastBackupDate: null, ...extraMeta },
           sessions, sets, food: cleanFood };
}

// Принимает v1, v2 и v3; возвращает мигрированный v3-объект.
// v1 — до Шага 5 (без session.program и meta.pullupMax/lastBackupDate),
// v2 — до модуля питания (без food); старые копии в Google Диске обязаны читаться всегда.
export function validateBackup(obj) {
  const ok = obj && obj.app === "trainer" && (obj.version === 1 || obj.version === 2 || obj.version === 3) &&
    Array.isArray(obj.sessions) && Array.isArray(obj.sets) && obj.meta && obj.meta.programStart;
  if (!ok) throw new Error("Это не файл резервной копии тренера (ожидаю trainer v1–v3).");
  const sessions = obj.sessions.map((s) => (s.program == null ? { ...s, program: 1 } : s));
  const meta = { pullupMax: null, lastBackupDate: null, ...obj.meta };
  const food = Array.isArray(obj.food) ? obj.food : [];
  return { ...obj, version: 3, sessions, meta, food };
}
