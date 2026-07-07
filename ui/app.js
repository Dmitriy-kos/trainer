// Состояние + действия. Никакой бизнес-логики здесь — только вызовы core/* и store.js.
// screens.js отвечает за DOM; этот модуль решает, ЧТО показать и КОГДА писать в БД.

import * as store from "../core/store.js";
import { currentWeek, weekLabel, autoregulationHint, overtrainingAlert } from "../core/logic.js";
import { parseSetInput, formatLastSets, schemeTargetReps } from "../core/format.js";
import { DAY_PLANS, dayForWeekday, weekdayHint, techniqueImage } from "../core/plan.js";
import { lastSets, recentWellbeing, unfinishedSession, newerFirst } from "../core/queries.js";
import { buildBackup, validateBackup } from "../core/backup.js";
import * as screens from "./screens.js";

const DEFAULT_PROGRAM_START = "2026-06-22";

const state = {
  sessions: [],
  sets: [],
  programStart: DEFAULT_PROGRAM_START,
  session: null,       // текущая открытая силовая сессия (в памяти, синхронно с store)
  exercises: [],        // DAY_PLANS[session.day], отсортировано по orderIdx
  flash: null,           // {icon, text, danger} | null — плитка, показывается один раз
  runSession: null,       // сессия только что записанного бега, пока открыт экран деталей
  historyExpandedId: null, // id сессии, чьи подходы сейчас раскрыты в Истории (одна за раз)
};

function todayStr() {
  // ЛОКАЛЬНАЯ дата — не toISOString() (тот даёт UTC и после полуночи съедет на вчера).
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayWeekday() {
  // JS getDay(): Вс=0..Сб=6. Контракт plan.js: Пн=0..Вс=6.
  return (new Date().getDay() + 6) % 7;
}

function consumeFlash() {
  const f = state.flash;
  state.flash = null;
  return f;
}

// ---------- Экран «Сегодня» ----------

function goToday() {
  state.session = null;
  screens.showScreen("today");
  renderTodayScreen();
}

function renderTodayScreen() {
  const weekday = todayWeekday();
  const today = todayStr();
  const hint = weekdayHint(weekday);
  const week = currentWeek(state.programStart, today);
  const todayDay = dayForWeekday(weekday);
  const unfinished = unfinishedSession(state.sessions);

  let resumeLabel = null;
  if (unfinished) {
    const total = DAY_PLANS[unfinished.day].length;
    const n = Math.min(unfinished.progressIdx + 1, total);
    resumeLabel = `Продолжить: Силовая ${unfinished.day} от ${unfinished.date} (упражнение ${n}/${total})`;
  }

  screens.renderToday({ hint, weekLabel: weekLabel(week), todayDay, resumeLabel });
}

function onResume() {
  const s = unfinishedSession(state.sessions);
  if (!s) return;
  openSessionFlow(s);
}

function goHistory() {
  state.historyExpandedId = null;
  screens.showHistoryError("");
  screens.showScreen("history");
  renderHistoryScreen();
}

// ---------- Силовая сессия ----------

async function onStartStrength(day) {
  const today = todayStr();
  const week = currentWeek(state.programStart, today);
  const session = { date: today, day, week, status: "open", wellbeing: null, note: null, progressIdx: 0 };
  const id = await store.addSession(session);
  const withId = { ...session, id };
  state.sessions.push(withId);
  openSessionFlow(withId);
}

function openSessionFlow(session) {
  state.session = session;
  state.exercises = DAY_PLANS[session.day].slice().sort((a, b) => a.orderIdx - b.orderIdx);
  if (session.progressIdx >= state.exercises.length) {
    // Все 5 упражнений уже отмечены, самочувствие ещё не спросили (сессия
    // осталась open) — типичный «закрыли приложение между последним
    // подходом и экраном самочувствия».
    goWellbeing();
  } else {
    screens.showScreen("session");
    screens.renderSession(buildSessionVm());
  }
}

function currentItem() {
  return state.exercises[state.session.progressIdx];
}

function buildSessionVm() {
  const item = currentItem();
  const last = lastSets(state.sessions, state.sets, item.exercise);
  return {
    stepLabel: `Упражнение ${state.session.progressIdx + 1} / ${state.exercises.length}`,
    pillLabel: `Силовая ${state.session.day} · Неделя ${state.session.week}`,
    techniqueImg: techniqueImage(item.exercise),
    exercise: item.exercise,
    schemeLine: `${item.scheme} · усилие ${item.targetRpe}/10`,
    note: item.note || "",
    lastSetsText: formatLastSets(last),
    sameDisabled: last.length === 0,
    flash: consumeFlash(),
  };
}

async function logSetsAndAdvance(exercise, rows) {
  for (const row of rows) {
    const rec = { sessionId: state.session.id, exercise, ...row };
    const id = await store.addSet(rec);
    state.sets.push({ id, ...rec });
  }
  const updated = { ...state.session, progressIdx: state.session.progressIdx + 1 };
  await store.updateSession(updated);
  state.sessions = state.sessions.map((s) => (s.id === updated.id ? updated : s));
  state.session = updated;
}

function afterExerciseAction() {
  if (state.session.progressIdx >= state.exercises.length) {
    goWellbeing();
  } else {
    screens.renderSession(buildSessionVm());
  }
}

async function onSubmit() {
  const item = currentItem();
  let parsed;
  try {
    parsed = parseSetInput(screens.getSessionInput());
  } catch (e) {
    screens.showSessionError(e.message);
    return;
  }
  screens.showSessionError("");

  const rows = parsed.map((p, i) => ({ setIdx: i + 1, weight: p.weight, reps: p.reps, rpe: item.targetRpe, painFlag: 0 }));
  // Паритет с bot/handlers.py: автогуляция считается по введённым повторам
  // с целевым усилием (не фактическим) — так же, как записанный rpe каждого сета.
  const loggedForHint = parsed.map((p) => ({ reps: p.reps, rpe: item.targetRpe }));
  const hint = autoregulationHint(schemeTargetReps(item.scheme), item.targetRpe, loggedForHint);
  if (hint) state.flash = { icon: "💡", text: hint, danger: false };

  await logSetsAndAdvance(item.exercise, rows);
  afterExerciseAction();
}

async function onSame() {
  const item = currentItem();
  const last = lastSets(state.sessions, state.sets, item.exercise);
  if (last.length === 0) return;
  const rows = last.map((s) => ({ setIdx: s.setIdx, weight: s.weight, reps: s.reps, rpe: item.targetRpe, painFlag: 0 }));
  await logSetsAndAdvance(item.exercise, rows);
  afterExerciseAction();
}

async function onSkip() {
  await logSetsAndAdvance(currentItem().exercise, []);
  afterExerciseAction();
}

async function onPain() {
  const item = currentItem();
  state.flash = {
    icon: "🚑",
    text: "Стоп по этому движению — замени или пропусти, не геройствуй.",
    danger: true,
  };
  await logSetsAndAdvance(item.exercise, [{ setIdx: 0, weight: null, reps: null, rpe: null, painFlag: 1 }]);
  afterExerciseAction();
}

// ---------- Самочувствие ----------

function goWellbeing() {
  screens.showScreen("wellbeing");
  screens.renderWellbeing({ flash: consumeFlash() });
}

async function finishSession(wellbeing) {
  const updated = { ...state.session, status: "done", wellbeing };
  await store.updateSession(updated);
  state.sessions = state.sessions.map((s) => (s.id === updated.id ? updated : s));
  state.session = null;
  return updated;
}

async function onWellbeingPick(n) {
  await finishSession(n);
  const alert = overtrainingAlert(recentWellbeing(state.sessions));
  if (alert) {
    screens.showScreen("done");
    screens.renderDone({ alert });
  } else {
    goToday();
  }
}

async function onWellbeingSkip() {
  await finishSession(null);
  goToday();
}

// ---------- Бег ----------

async function onStartRun() {
  const today = todayStr();
  const week = currentWeek(state.programStart, today);
  const run = { date: today, day: "RUN", week, status: "done", wellbeing: null, note: null, progressIdx: 0 };
  const id = await store.addSession(run);
  const withId = { ...run, id };
  state.sessions.push(withId);
  state.runSession = withId;
  screens.showScreen("run");
  screens.renderRun();
}

async function onRunDone() {
  const details = screens.getRunInput().trim();
  if (details) {
    const updated = { ...state.runSession, note: details };
    await store.updateSession(updated);
    state.sessions = state.sessions.map((s) => (s.id === updated.id ? updated : s));
  }
  state.runSession = null;
  goToday();
}

// ---------- История ----------

// Подходы сессии, сгруппированные по упражнению в порядке orderIdx плана
// (RUN/чужие данные без плана — по первому появлению), внутри группы по setIdx.
// Больные подходы (painFlag=1) не подмешиваются в formatLastSets — это была
// бы потеря данных о боли; выводятся отдельной строкой-маркером.
function groupSessionSets(session) {
  const sets = state.sets.filter((x) => x.sessionId === session.id);
  if (sets.length === 0) return { noSets: true, lines: [] };

  const plan = DAY_PLANS[session.day];
  const planOrder = plan ? plan.slice().sort((a, b) => a.orderIdx - b.orderIdx).map((it) => it.exercise) : [];
  const present = [...new Set(sets.map((x) => x.exercise))];
  const extra = present.filter((ex) => !planOrder.includes(ex));
  const order = [...planOrder.filter((ex) => present.includes(ex)), ...extra];

  const lines = [];
  for (const exercise of order) {
    const exSets = sets.filter((x) => x.exercise === exercise).sort((a, b) => a.setIdx - b.setIdx);
    const clean = exSets.filter((x) => !x.painFlag);
    const pain = exSets.filter((x) => x.painFlag);
    if (clean.length > 0) lines.push({ text: `${exercise}: ${formatLastSets(clean)}`, pain: false });
    if (pain.length > 0) lines.push({ text: `${exercise}: 🚑 больно`, pain: true });
  }
  return { noSets: false, lines };
}

function buildHistoryItemVm(session) {
  const typeLabel = session.day === "RUN" ? "Бег" : `Силовая ${session.day}`;
  const wellbeingLabel = session.wellbeing != null ? `${session.wellbeing}/10` : "—";
  let subLabel = `Неделя ${session.week} · ${wellbeingLabel}`;
  if (session.status === "open") subLabel += " · не завершена";
  const { noSets, lines } = groupSessionSets(session);
  return {
    id: session.id,
    title: `${session.date} · ${typeLabel}`,
    subLabel,
    note: session.day === "RUN" && session.note ? session.note : null,
    expanded: state.historyExpandedId === session.id,
    noSets,
    lines,
  };
}

function buildHistoryVm() {
  return {
    items: state.sessions.slice().sort(newerFirst).map(buildHistoryItemVm),
    flash: consumeFlash(),
  };
}

function renderHistoryScreen() {
  screens.renderHistory(buildHistoryVm(), onHistoryToggle);
}

function onHistoryToggle(id) {
  state.historyExpandedId = state.historyExpandedId === id ? null : id;
  renderHistoryScreen();
}

// ---------- Бэкап ----------

function onExport() {
  screens.showHistoryError("");
  try {
    const backup = buildBackup(state.programStart, state.sessions, state.sets);
    const json = JSON.stringify(backup, null, 2);
    screens.downloadFile(`trainer-backup-${todayStr()}.json`, json, "application/json");
  } catch {
    screens.showHistoryError("Не получилось сохранить копию.");
  }
}

async function onImportPick(file) {
  if (!file) return;
  screens.showHistoryError("");
  try {
    let text;
    try {
      text = await file.text();
    } catch {
      screens.showHistoryError("Не получилось прочитать файл.");
      return;
    }

    let obj;
    try {
      obj = JSON.parse(text);
    } catch {
      screens.showHistoryError("Файл повреждён или это не JSON.");
      return;
    }

    let backup;
    try {
      backup = validateBackup(obj);
    } catch (e) {
      screens.showHistoryError(e.message);
      return;
    }

    const n = backup.sessions.length;
    if (!confirm(`Заменит текущие данные (сессий: ${n}). Продолжить?`)) return;

    await store.clearAll();
    await store.bulkImport({
      sessions: backup.sessions,
      sets: backup.sets,
      meta: { programStart: backup.meta.programStart },
    });
    state.sessions = await store.getAllSessions();
    state.sets = await store.getAllSets();
    state.programStart = backup.meta.programStart;
    state.historyExpandedId = null;
    state.flash = { icon: "✅", text: `Восстановлено: ${n} сессий`, danger: false };
    renderHistoryScreen();
  } catch {
    screens.showHistoryError("Не получилось восстановить данные. Попробуйте ещё раз.");
  } finally {
    screens.resetFileInput();
  }
}

// ---------- Демо-режим для скриншотов (без записи в БД) ----------

function renderDemoSession() {
  const item = {
    exercise: "Присед со штангой",
    scheme: "4×8",
    targetRpe: 7,
    note: "глубина в комфорте, спина прямая",
  };
  const demoLast = [{ weight: 80, reps: 8 }, { weight: 80, reps: 8 }, { weight: 80, reps: 7 }];

  screens.showScreen("session");
  screens.renderSession({
    stepLabel: "Упражнение 1 / 5",
    pillLabel: "Силовая A · Неделя 2",
    techniqueImg: techniqueImage(item.exercise),
    exercise: item.exercise,
    schemeLine: `${item.scheme} · усилие ${item.targetRpe}/10`,
    note: item.note,
    lastSetsText: formatLastSets(demoLast),
    sameDisabled: false,
    flash: null,
  });
}

function renderDemoHistory() {
  // Вымышленные данные для скриншота: одна раскрытая силовая (смешанные
  // группы — чистые подходы и «больно»), бег с заметкой, незавершённая.
  state.sessions = [
    { id: 3, date: "2026-07-01", day: "B", week: 2, status: "done", wellbeing: 8, note: null, progressIdx: 5 },
    { id: 2, date: "2026-06-29", day: "RUN", week: 1, status: "done", wellbeing: null, note: "5 км, 30 мин, лёгкий темп", progressIdx: 0 },
    { id: 1, date: "2026-06-24", day: "A", week: 1, status: "open", wellbeing: null, note: null, progressIdx: 2 },
  ];
  state.sets = [
    { id: 1, sessionId: 3, exercise: "Становая тяга", setIdx: 1, weight: 80, reps: 5, rpe: 7, painFlag: 0 },
    { id: 2, sessionId: 3, exercise: "Становая тяга", setIdx: 2, weight: 80, reps: 5, rpe: 7, painFlag: 0 },
    { id: 3, sessionId: 3, exercise: "Жим стоя (OHP)", setIdx: 1, weight: 30, reps: 8, rpe: 7, painFlag: 0 },
    { id: 4, sessionId: 3, exercise: "Выпады с гантелями", setIdx: 0, weight: null, reps: null, rpe: null, painFlag: 1 },
    { id: 5, sessionId: 1, exercise: "Присед со штангой", setIdx: 1, weight: 60, reps: 8, rpe: 7, painFlag: 0 },
  ];
  state.historyExpandedId = 3;
  screens.showScreen("history");
  renderHistoryScreen();
}

// ---------- Инициализация ----------

// Гвард от двойного тапа: пока асинхронное действие пишет в store, повторные
// тапы игнорируются. Без него два быстрых тапа реентрантно читают один и тот
// же currentItem(): дубли подходов, вторая сессия, рваный progressIdx.
let busy = false;
async function guarded(fn) {
  if (busy) return;
  busy = true;
  try { await fn(); } finally { busy = false; }
}

function bindEvents() {
  screens.on("btn-day-a", "click", () => guarded(() => onStartStrength("A")));
  screens.on("btn-day-b", "click", () => guarded(() => onStartStrength("B")));
  screens.on("btn-day-c", "click", () => guarded(() => onStartStrength("C")));
  screens.on("btn-run", "click", () => guarded(onStartRun));
  screens.on("btn-history", "click", goHistory);
  screens.on("btn-history-back", "click", goToday);
  screens.on("resume-tile", "click", onResume);

  screens.on("history-export", "click", () => guarded(onExport));
  screens.on("history-import", "click", screens.openFilePicker);
  screens.onFilePicked((file) => guarded(() => onImportPick(file)));

  screens.on("session-submit", "click", () => guarded(onSubmit));
  screens.onInputEnter("session-input", () => guarded(onSubmit));
  screens.on("session-same", "click", () => guarded(onSame));
  screens.on("session-skip", "click", () => guarded(onSkip));
  screens.on("session-pain", "click", () => guarded(onPain));

  screens.on("wellbeing-skip", "click", () => guarded(onWellbeingSkip));
  screens.on("done-back", "click", goToday);

  screens.on("run-done", "click", () => guarded(onRunDone));
}

async function init() {
  screens.initWellbeingGrid((n) => guarded(() => onWellbeingPick(n)));

  const params = new URLSearchParams(location.search);
  if (params.get("screen") === "session-demo") {
    renderDemoSession();
    return;
  }
  if (params.get("screen") === "history-demo") {
    renderDemoHistory();
    return;
  }

  bindEvents();

  await store.openDb();
  let programStart = await store.getMeta("programStart");
  if (!programStart) {
    programStart = DEFAULT_PROGRAM_START;
    await store.setMeta("programStart", programStart);
  }
  state.programStart = programStart;
  state.sessions = await store.getAllSessions();
  state.sets = await store.getAllSets();

  goToday();
}

init();
