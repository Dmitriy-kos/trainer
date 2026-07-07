// Тонкий адаптер IndexedDB. Никакой бизнес-логики — только CRUD-примитивы.
// Форма записей — паритет с bot/db.py (SQLite), id теперь авто из IndexedDB.
// Без юнит-тестов (нет IndexedDB в Node) — проверяется в браузере.

const DB_NAME = "trainer";
const DB_VERSION = 1;

let db = null;

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Ждём завершения транзакции целиком (не per-request onsuccess): при ошибке
// одного request'а транзакция абортится и откатывает ВСЕ уже применённые
// put/clear внутри неё — resolve только когда это гарантировано (oncomplete).
function txDone(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function requireDb() {
  if (!db) throw new Error("store.js: openDb() ещё не вызван");
  return db;
}

export function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("sessions"))
        d.createObjectStore("sessions", { keyPath: "id", autoIncrement: true });
      if (!d.objectStoreNames.contains("sets"))
        d.createObjectStore("sets", { keyPath: "id", autoIncrement: true });
      if (!d.objectStoreNames.contains("meta"))
        d.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = () => { db = req.result; resolve(); };
    req.onerror = () => reject(req.error);
  });
}

export function addSession(session) {
  return wrap(requireDb().transaction("sessions", "readwrite").objectStore("sessions").add(session));
}

export function updateSession(session) {
  return wrap(requireDb().transaction("sessions", "readwrite").objectStore("sessions").put(session));
}

export function addSet(set) {
  return wrap(requireDb().transaction("sets", "readwrite").objectStore("sets").add(set));
}

export function getAllSessions() {
  return wrap(requireDb().transaction("sessions", "readonly").objectStore("sessions").getAll());
}

export function getAllSets() {
  return wrap(requireDb().transaction("sets", "readonly").objectStore("sets").getAll());
}

export async function getMeta(key) {
  const rec = await wrap(requireDb().transaction("meta", "readonly").objectStore("meta").get(key));
  return rec ? rec.value : undefined;
}

export function setMeta(key, value) {
  return wrap(requireDb().transaction("meta", "readwrite").objectStore("meta").put({ key, value }));
}

export async function clearAll() {
  const t = requireDb().transaction(["sessions", "sets", "meta"], "readwrite");
  t.objectStore("sessions").clear();
  t.objectStore("sets").clear();
  t.objectStore("meta").clear();
  await txDone(t);
}

// Восстановление из бэкапа (backup.js): пишет записи КАК ЕСТЬ, с их id —
// put(), не add(), иначе автонумерация порвёт связи sessionId в sets.
export async function bulkImport({ sessions, sets, meta }) {
  const t = requireDb().transaction(["sessions", "sets", "meta"], "readwrite");
  for (const s of sessions || []) t.objectStore("sessions").put(s);
  for (const x of sets || []) t.objectStore("sets").put(x);
  for (const [key, value] of Object.entries(meta || {})) t.objectStore("meta").put({ key, value });
  await txDone(t);
}

// Замена всех подходов упражнения в сессии ОДНОЙ транзакцией: удалить старые
// (включая painFlag) + добавить новые. rows — без id (autoIncrement).
// Вызывающий обязан перечитать getAllSets() после.
export async function replaceSets(sessionId, exercise, rows) {
  const t = requireDb().transaction("sets", "readwrite");
  const os = t.objectStore("sets");
  await new Promise((resolve, reject) => {
    const cur = os.openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return resolve();
      if (c.value.sessionId === sessionId && c.value.exercise === exercise) c.delete();
      c.continue();
    };
    cur.onerror = () => reject(cur.error);
  });
  for (const r of rows) os.add(r);
  await txDone(t);
}
