export function buildBackup(programStart, sessions, sets) {
  return { app: "trainer", version: 1, exportedAt: new Date().toISOString(),
           meta: { programStart }, sessions, sets };
}

export function validateBackup(obj) {
  const ok = obj && obj.app === "trainer" && obj.version === 1 &&
    Array.isArray(obj.sessions) && Array.isArray(obj.sets) && obj.meta && obj.meta.programStart;
  if (!ok) throw new Error("Это не файл резервной копии тренера (ожидаю trainer v1).");
  return obj;
}
