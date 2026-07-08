// Состояние + действия. Никакой бизнес-логики здесь — только вызовы core/* и store.js.
// screens.js отвечает за DOM; этот модуль решает, ЧТО показать и КОГДА писать в БД.

import * as store from "../core/store.js";
import { autoregulationHint, overtrainingAlert, programForDate, measureTile, pullupDayScheme, restRemaining, formatRest, backupReminder } from "../core/logic.js";
import { parseSetInput, formatLastSets, schemeTargetReps } from "../core/format.js";
import { PROGRAMS, programByNumber, planForSession, programWeekdayHint, programDayForWeekday, techniqueImage, DAY_PLANS } from "../core/plan.js";
import { lastSets, recentWellbeing, unfinishedSession, newerFirst, sessionExerciseSets, groupSessionSets } from "../core/queries.js";
import { buildBackup, validateBackup } from "../core/backup.js";
import { DEFAULT_GOALS, dayTotals, scalePortion } from "../core/food.js";
import { recognizeFood } from "../core/claude.js";
import { compressImage } from "./image.js";
import * as screens from "./screens.js";

const DEFAULT_PROGRAM_START = "2026-06-22";

const state = {
  sessions: [],
  sets: [],
  programStart: DEFAULT_PROGRAM_START,
  session: null,       // текущая открытая силовая сессия (в памяти, синхронно с store)
  exercises: [],        // planForSession(session), отсортировано по orderIdx
  viewIdx: null,          // индекс просматриваемого упражнения при навигации ←/→; null = обычный ввод текущего
  flash: null,           // {icon, text, danger} | null — плитка, показывается один раз
  runSession: null,       // сессия только что записанного бега, пока открыт экран деталей
  historyExpandedId: null, // id сессии, чьи подходы сейчас раскрыты в Истории (одна за раз)
  historyEdit: null,     // {sessionId, exercise} | null — какая строка сейчас редактируется в Истории
  measureProgram: null,  // номер программы, чей день T ещё доступен для замеров («Замеры» плитка); null = не показывать
  pullupMax: null,       // {value, date} | null — сохранённый максимум строгих подтягиваний
  lastBackupDate: null,  // дата последней резервной копии (meta) — плитка-напоминание на «Сегодня»
  timer: null,           // {startedAt, durationSec} | null — таймер отдыха (ничего не пишет в БД)
  food: [],             // записи еды (все даты), зеркало store
  apiKey: null,          // ключ Claude API — только в meta, в бэкап не попадает
  foodGoals: { ...DEFAULT_GOALS }, // {kcal, protein} — цели дня, редактируются в настройках
  foodDraft: null,       // черновик карточки-подтверждения: {base:{kcal,protein,fat,carbs}, name, kcal, protein, fat, carbs, comment, portion, source, editingId|null, pendingPayload|null}
  foodTextOpen: false,
  foodSettingsOpen: false,
  foodBusy: false,       // идёт распознавание (спиннер)
};

function pluralRu(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

function todayStr() {
  // ЛОКАЛЬНАЯ дата — не toISOString() (тот даёт UTC и после полуночи съедет на вчера).
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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
  stopTimer(false);
  state.session = null;
  screens.showScreen("today");
  renderTodayScreen();
}

function pullupMaxTileLabel() {
  return state.pullupMax
    ? `${state.pullupMax.value} (обновлён ${state.pullupMax.date}) · тап — изменить`
    : "не задан · тап — ввести";
}

function renderTodayScreen() {
  screens.showTodayError("");
  const weekday = todayWeekday();
  const today = todayStr();
  const { number, week } = programForDate(state.programStart, today);
  const program = programByNumber(number);
  const hint = programWeekdayHint(program, weekday);
  const todayDay = programDayForWeekday(program, weekday);
  const unfinished = unfinishedSession(state.sessions);

  let resumeLabel = null;
  if (unfinished) {
    const plan = planForSession(unfinished);
    const total = plan ? plan.length : 0;
    const n = Math.min(unfinished.progressIdx + 1, total);
    const label = unfinished.day === "T" ? "Замеры" : `Силовая ${unfinished.day}`;
    resumeLabel = `Продолжить: ${label} от ${unfinished.date} (упражнение ${n}/${total})`;
  }

  const mt = measureTile(state.programStart, today, state.sessions);
  const measureLabel = mt ? "Замеры 📏 — рабочие максимумы месяца" : null;
  state.measureProgram = mt ? mt.programNumber : null;

  const br = backupReminder(state.lastBackupDate, today, state.sessions.length > 0);
  const backupLabel = br ? (br.days == null ? "⚠️ Сделай резервную копию истории" : `⚠️ Копию не делал ${br.days} дн.`) : null;

  screens.renderToday({
    hint,
    weekLabel: `Месяц ${number} · ${program.weekLabels[week]}`,
    todayDay,
    resumeLabel,
    measureLabel,
    backupLabel,
    pullupLabel: pullupMaxTileLabel(),
  });
  screens.renderFoodTile(foodTileLabel());
}

function onResume() {
  const s = unfinishedSession(state.sessions);
  if (!s) return;
  openSessionFlow(s);
}

function goHistory() {
  state.historyExpandedId = null;
  state.historyEdit = null;
  screens.showHistoryError("");
  screens.showScreen("history");
  renderHistoryScreen();
}

// ---------- Силовая сессия ----------

async function onStartStrength(day) {
  const today = todayStr();
  const { number, week } = programForDate(state.programStart, today);
  const program = day === "T" && state.measureProgram ? state.measureProgram : number;
  const session = { date: today, day, week, status: "open", wellbeing: null, note: null, progressIdx: 0, program };
  const id = await store.addSession(session);
  const withId = { ...session, id };
  state.sessions.push(withId);
  openSessionFlow(withId);
}

function openSessionFlow(session) {
  state.session = session;
  state.viewIdx = null;
  state.exercises = (planForSession(session) ?? []).slice().sort((a, b) => a.orderIdx - b.orderIdx);
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

function effectiveIdx() {
  return state.viewIdx ?? state.session.progressIdx;
}

function currentItem() {
  return state.exercises[effectiveIdx()];
}

function buildSessionVm() {
  const idx = effectiveIdx();
  const item = state.exercises[idx];
  const isReview = state.viewIdx != null && state.viewIdx < state.session.progressIdx;
  const last = lastSets(state.sessions, state.sets, item.exercise);

  let recordedText = null;
  if (isReview) {
    const recorded = sessionExerciseSets(state.sets, state.session.id, item.exercise);
    if (recorded.length === 0) recordedText = "пропущено";
    else if (recorded.every((s) => s.painFlag)) recordedText = "🚑 больно";
    else recordedText = "✓ " + formatLastSets(recorded.filter((s) => !s.painFlag));
  }

  const isPullup = item.exercise.startsWith("Подтягивания");
  let schemeLine = `${item.scheme} · усилие ${item.targetRpe}/10`;
  let pullupMaxLabel = null;
  if (isPullup) {
    const maxVal = state.pullupMax ? state.pullupMax.value : null;
    schemeLine = `${pullupDayScheme(state.session.program ?? 1, state.session.week, state.session.day, maxVal)} · усилие ${item.targetRpe}/10`;
    pullupMaxLabel = pullupMaxTileLabel();
  }

  return {
    stepLabel: `Упражнение ${idx + 1} / ${state.exercises.length}${state.viewIdx != null ? " · просмотр" : ""}`,
    pillLabel: `${state.session.day === "T" ? "Замеры" : `Силовая ${state.session.day}`} · Неделя ${state.session.week}`,
    techniqueImg: techniqueImage(item.exercise),
    exercise: item.exercise,
    schemeLine,
    pullupMaxLabel,
    note: item.note || "",
    lastSetsText: formatLastSets(last),
    sameDisabled: last.length === 0,
    recordedText,
    backLabel: idx === 0 ? "← выйти" : "← назад",
    isReview,
    isPreview: inPreview(),
    forwardDisabled: idx >= state.exercises.length - 1,
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

// ---------- Навигация «← назад» и режим просмотра/правки ----------

function inReview() {
  return state.viewIdx != null && state.viewIdx < state.session.progressIdx;
}

function inPreview() {
  return state.session != null && state.viewIdx != null && state.viewIdx > state.session.progressIdx;
}

async function onBack() {
  const idx = effectiveIdx();
  if (idx > 0) {
    state.viewIdx = idx - 1;
    if (state.viewIdx === state.session.progressIdx) state.viewIdx = null; // вернулись к текущему — обычный ввод
    screens.renderSession(buildSessionVm());
    return;
  }
  // Первое упражнение — «← выйти»: возврат на «Сегодня». Пустую сессию (ничего
  // не отмечено) стираем без следа — иначе в истории виснет «не завершена»,
  // а «Сегодня» тянет обратно плиткой «Продолжить» в ошибочно выбранный день.
  const s = state.session;
  const empty = s.progressIdx === 0 && !state.sets.some((x) => x.sessionId === s.id);
  if (empty) {
    await store.deleteSession(s.id);
    state.sessions = state.sessions.filter((x) => x.id !== s.id);
  }
  goToday();
}

function onForward() {
  const idx = effectiveIdx();
  if (idx >= state.exercises.length - 1) return; // дальше некуда — кнопка и так неактивна
  state.viewIdx = idx + 1;
  if (state.viewIdx === state.session.progressIdx) state.viewIdx = null; // дошли до текущего — обычный ввод
  screens.renderSession(buildSessionVm());
}

// Общий ввод максимума через prompt. true — сохранено; false — отмена или
// невалидный ввод (сообщение уходит в showError вызывающего экрана).
async function askPullupMax(showError) {
  const cur = state.pullupMax ? String(state.pullupMax.value) : "";
  const raw = prompt("Максимум строгих подтягиваний?", cur);
  if (raw == null) return false;
  const v = parseInt(raw.trim(), 10);
  if (!Number.isInteger(v) || v < 0 || v > 50) {
    showError("Максимум — целое число 0–50.");
    return false;
  }
  state.pullupMax = { value: v, date: todayStr() };
  await store.setMeta("pullupMax", state.pullupMax);
  showError("");
  return true;
}

async function onPullupMaxTap() {
  if (await askPullupMax(screens.showSessionError)) screens.renderSession(buildSessionVm());
}

async function onTodayPullupTap() {
  if (await askPullupMax(screens.showTodayError)) renderTodayScreen();
}

async function replaceCurrent(rows) {
  const item = currentItem();
  await store.replaceSets(state.session.id, item.exercise, rows);
  state.sets = await store.getAllSets();
  state.flash = { icon: "✏️", text: "Исправлено", danger: false };
  screens.renderSession(buildSessionVm());
}

async function onSubmit() {
  if (inPreview()) return;
  const item = currentItem();
  let parsed;
  try {
    parsed = parseSetInput(screens.getSessionInput());
  } catch (e) {
    screens.showSessionError(e.message);
    return;
  }
  screens.showSessionError("");

  if (inReview()) {
    const rows = parsed.map((p, i) => ({
      sessionId: state.session.id, exercise: item.exercise,
      setIdx: i + 1, weight: p.weight, reps: p.reps, rpe: item.targetRpe, painFlag: 0,
    }));
    await replaceCurrent(rows);
    return;
  }

  const rows = parsed.map((p, i) => ({ setIdx: i + 1, weight: p.weight, reps: p.reps, rpe: item.targetRpe, painFlag: 0 }));
  // Паритет с bot/handlers.py: автогуляция считается по введённым повторам
  // с целевым усилием (не фактическим) — так же, как записанный rpe каждого сета.
  const loggedForHint = parsed.map((p) => ({ reps: p.reps, rpe: item.targetRpe }));
  const hint = autoregulationHint(schemeTargetReps(item.scheme), item.targetRpe, loggedForHint);
  if (hint) state.flash = { icon: "💡", text: hint, danger: false };

  await logSetsAndAdvance(item.exercise, rows);

  if (state.session.day === "T" && item.exercise.startsWith("Подтягивания") && parsed.length > 0) {
    const best = Math.max(...parsed.map((p) => p.reps));
    state.pullupMax = { value: best, date: todayStr() };
    await store.setMeta("pullupMax", state.pullupMax);
    state.flash = { icon: "🎯", text: `Максимум подтягиваний обновлён: ${best}`, danger: false };
  }

  afterExerciseAction();
}

async function onSame() {
  if (inReview() || inPreview()) return;
  const item = currentItem();
  const last = lastSets(state.sessions, state.sets, item.exercise);
  if (last.length === 0) return;
  const rows = last.map((s) => ({ setIdx: s.setIdx, weight: s.weight, reps: s.reps, rpe: item.targetRpe, painFlag: 0 }));
  await logSetsAndAdvance(item.exercise, rows);
  afterExerciseAction();
}

async function onSkip() {
  if (inPreview()) return;
  if (inReview()) {
    await replaceCurrent([]);
    return;
  }
  await logSetsAndAdvance(currentItem().exercise, []);
  afterExerciseAction();
}

async function onPain() {
  if (inPreview()) return;
  if (inReview()) {
    const item = currentItem();
    state.flash = { icon: "🚑", text: "Записана боль по этому движению.", danger: true };
    await store.replaceSets(state.session.id, item.exercise,
      [{ sessionId: state.session.id, exercise: item.exercise, setIdx: 0, weight: null, reps: null, rpe: null, painFlag: 1 }]);
    state.sets = await store.getAllSets();
    screens.renderSession(buildSessionVm());
    return;
  }
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
  stopTimer(false);
  screens.showScreen("wellbeing");
  screens.renderWellbeing({ flash: consumeFlash() });
}

async function finishSession(wellbeing) {
  const note = screens.getWellbeingNote().trim() || null;
  const updated = { ...state.session, status: "done", wellbeing, note };
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
  const { number, week } = programForDate(state.programStart, today);
  const run = { date: today, day: "RUN", week, status: "done", wellbeing: null, note: null, progressIdx: 0, program: number };
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

// ---------- Еда ----------

function foodTileLabel() {
  const t = dayTotals(state.food, todayStr());
  return `Еда 🍽 ${t.kcal} / ${state.foodGoals.kcal} ккал · белок ${t.protein} / ${state.foodGoals.protein} г`;
}

function goFood() {
  state.foodDraft = null;
  state.foodTextOpen = false;
  state.foodSettingsOpen = false;
  screens.showFoodError("");
  screens.showScreen("food");
  renderFoodScreen();
}

function buildFoodVm() {
  const today = todayStr();
  const t = dayTotals(state.food, today);
  const todays = state.food.filter((e) => e.date === today)
    .slice().sort((a, b) => (a.time < b.time ? 1 : -1));
  return {
    totals: { kcal: t.kcal, kcalGoal: state.foodGoals.kcal, protein: t.protein, proteinGoal: state.foodGoals.protein },
    entries: todays.map((e) => ({
      id: e.id,
      label: e.status === "pending" ? `${e.time} · ⏳ ждёт сети` : `${e.time} · ${e.name}`,
      sub: e.status === "pending" ? (e.pendingPayload && e.pendingPayload.text ? `«${e.pendingPayload.text}»` : "фото сохранено") : `${e.kcal} ккал · белок ${e.protein} г`,
      pending: e.status === "pending",
    })),
    pendingCount: state.food.filter((e) => e.status === "pending").length,
    draft: state.foodDraft ? {
      name: state.foodDraft.name, kcal: state.foodDraft.kcal, protein: state.foodDraft.protein,
      portion: state.foodDraft.portion, isEdit: state.foodDraft.editingId != null,
    } : null,
    settings: state.foodSettingsOpen ? { hasKey: !!state.apiKey, kcalGoal: state.foodGoals.kcal, proteinGoal: state.foodGoals.protein } : null,
    textOpen: state.foodTextOpen,
    busy: state.foodBusy,
    flash: consumeFlash(),
  };
}

function renderFoodScreen() {
  screens.renderFood(buildFoodVm(), { onEntryTap: (id) => onFoodEntryTap(id) });
}

function onFoodEntryTap(id) {
  const e = state.food.find((x) => x.id === id);
  if (!e || e.status === "pending") return;
  state.foodDraft = {
    base: { kcal: e.kcal, protein: e.protein, fat: e.fat, carbs: e.carbs },
    name: e.name, kcal: e.kcal, protein: e.protein, fat: e.fat, carbs: e.carbs,
    comment: "", portion: e.portion, source: e.source, editingId: id, pendingPayload: null,
  };
  renderFoodScreen();
}

function onFoodPortion(factor) {
  if (!state.foodDraft || state.foodDraft.editingId != null) return;
  const scaled = scalePortion(state.foodDraft.base, factor);
  state.foodDraft = { ...state.foodDraft, ...scaled, portion: factor };
  renderFoodScreen();
}

function readDraftFields() {
  const f = screens.getFoodDraftFields();
  if (!f.name.trim() || String(f.kcal).trim() === "" || String(f.protein).trim() === "") {
    screens.showFoodError("Нужны название и неотрицательные числа.");
    return null;
  }
  const kcal = Math.round(Number(f.kcal));
  const protein = Math.round(Number(f.protein));
  if (!f.name.trim() || !Number.isFinite(kcal) || kcal < 0 || !Number.isFinite(protein) || protein < 0) {
    screens.showFoodError("Нужны название и неотрицательные числа.");
    return null;
  }
  return { name: f.name.trim(), kcal, protein };
}

async function onFoodDraftSave() {
  if (!state.foodDraft) return;
  const fields = readDraftFields();
  if (!fields) return;
  screens.showFoodError("");
  const d = state.foodDraft;
  if (d.editingId != null) {
    const old = state.food.find((x) => x.id === d.editingId);
    const updated = { ...old, ...fields, fat: d.fat, carbs: d.carbs, status: "done", pendingPayload: null };
    await store.updateFood(updated);
    state.food = state.food.map((x) => (x.id === updated.id ? updated : x));
  } else {
    const rec = { date: todayStr(), time: todayTimeStr(), ...fields, fat: d.fat, carbs: d.carbs,
      portion: d.portion, source: d.source, status: "done", pendingPayload: null };
    const id = await store.addFood(rec);
    state.food.push({ id, ...rec });
  }
  state.foodDraft = null;
  state.flash = { icon: "🍽", text: "Записано", danger: false };
  renderFoodScreen();
}

async function onFoodDraftDelete() {
  if (!state.foodDraft || state.foodDraft.editingId == null) return;
  await store.deleteFood(state.foodDraft.editingId);
  state.food = state.food.filter((x) => x.id !== state.foodDraft.editingId);
  state.foodDraft = null;
  state.flash = { icon: "🗑", text: "Удалено", danger: false };
  renderFoodScreen();
}

function onFoodDraftCancel() {
  state.foodDraft = null;
  screens.showFoodError("");
  renderFoodScreen();
}

async function onFoodSettingsSave() {
  const s = screens.getFoodSettings();
  const kcalGoal = Math.round(Number(s.kcalGoal));
  const proteinGoal = Math.round(Number(s.proteinGoal));
  if (!Number.isFinite(kcalGoal) || kcalGoal <= 0 || !Number.isFinite(proteinGoal) || proteinGoal <= 0) {
    screens.showFoodError("Цели должны быть положительными числами.");
    return;
  }
  screens.showFoodError("");
  if (s.apiKey) {
    await store.setMeta("apiKey", s.apiKey);
    state.apiKey = s.apiKey;
  }
  state.foodGoals = { kcal: kcalGoal, protein: proteinGoal };
  await store.setMeta("foodGoals", state.foodGoals);
  state.foodSettingsOpen = false;
  state.flash = { icon: "⚙️", text: "Настройки сохранены", danger: false };
  renderFoodScreen();
}

function openDraftFromRecognition(parsed, source, editingId = null) {
  state.foodDraft = {
    base: { kcal: parsed.kcal, protein: parsed.protein, fat: parsed.fat, carbs: parsed.carbs },
    ...parsed, portion: 1, source, editingId, pendingPayload: null,
  };
  state.foodBusy = false;
  renderFoodScreen();
}

async function queuePending(payload) {
  // Нет сети: сохраняем сырьё (сжатое фото или текст) в очередь — распознаем позже.
  const rec = { date: todayStr(), time: todayTimeStr(), name: "", kcal: 0, protein: 0, fat: 0, carbs: 0,
    portion: 1, source: payload.image ? "photo" : "text", status: "pending", pendingPayload: payload };
  const id = await store.addFood(rec);
  state.food.push({ id, ...rec });
  state.foodBusy = false;
  state.flash = { icon: "⏳", text: "Нет связи — сохранил, распознаю при сети.", danger: false };
  renderFoodScreen();
}

async function recognizeOrQueue(payload, source) {
  if (!state.apiKey) {
    state.foodSettingsOpen = true;
    state.foodBusy = false;
    renderFoodScreen();
    screens.showFoodError("Сначала укажи ключ API (console.anthropic.com) и сохрани настройки.");
    return;
  }
  state.foodBusy = true;
  screens.showFoodError("");
  renderFoodScreen();
  try {
    const parsed = await recognizeFood({ apiKey: state.apiKey, image: payload.image ?? null, text: payload.text ?? null });
    openDraftFromRecognition(parsed, source);
  } catch (e) {
    if (e.offline) { await queuePending(payload); return; }
    state.foodBusy = false;
    renderFoodScreen();
    screens.showFoodError(e.message);
  }
}

async function onFoodPhotoPick(file) {
  if (!file) return;
  let image;
  try {
    image = await compressImage(file);
  } catch (e) {
    screens.showFoodError(e.message);
    return;
  }
  await recognizeOrQueue({ image }, "photo");
}

async function onFoodTextSubmit() {
  const text = screens.getFoodTextInput().trim();
  if (!text) return;
  state.foodTextOpen = false;
  await recognizeOrQueue({ text }, "text");
}

async function onFoodRetryPending() {
  if (state.foodDraft) return;
  const p = state.food.filter((e) => e.status === "pending").sort((a, b) => a.id - b.id)[0];
  if (!p || !state.apiKey) return;
  state.foodBusy = true;
  screens.showFoodError("");
  renderFoodScreen();
  try {
    const parsed = await recognizeFood({ apiKey: state.apiKey,
      image: p.pendingPayload.image ?? null, text: p.pendingPayload.text ?? null });
    openDraftFromRecognition(parsed, p.source, p.id);
  } catch (e) {
    state.foodBusy = false;
    renderFoodScreen();
    screens.showFoodError(e.offline ? "Сети всё ещё нет — попробуй позже." : e.message);
  }
}

// ---------- История ----------

function buildHistoryItemVm(session) {
  const typeLabel = session.day === "RUN" ? "Бег" : session.day === "T" ? "Замеры" : `Силовая ${session.day}`;
  const wellbeingLabel = session.wellbeing != null ? `${session.wellbeing}/10` : "—";
  let subLabel = `Неделя ${session.week} · ${wellbeingLabel}`;
  if (session.status === "open") subLabel += " · не завершена";
  const { noSets, lines } = groupSessionSets(session, state.sets, planForSession(session));
  return {
    id: session.id,
    title: `${session.date} · ${typeLabel}`,
    subLabel,
    note: session.note || null,
    expanded: state.historyExpandedId === session.id,
    editExercise: state.historyEdit && state.historyEdit.sessionId === session.id ? state.historyEdit.exercise : null,
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
  screens.renderHistory(buildHistoryVm(), {
    onToggle: onHistoryToggle,
    onEditOpen: onHistoryEditOpen,
    onEditCancel: onHistoryEditCancel,
    onEditSubmit: (t) => guarded(() => onHistoryEditSubmit(t)),
  });
}

function onHistoryToggle(id) {
  state.historyExpandedId = state.historyExpandedId === id ? null : id;
  state.historyEdit = null;
  renderHistoryScreen();
}

function onHistoryEditOpen(sessionId, exercise) {
  state.historyEdit = { sessionId, exercise };
  state.historyExpandedId = sessionId;
  renderHistoryScreen();
}

function onHistoryEditCancel() {
  state.historyEdit = null;
  renderHistoryScreen();
}

function historyTargetRpe(session, exercise) {
  const plan = planForSession(session);
  const item = plan ? plan.find((it) => it.exercise === exercise) : null;
  return item ? item.targetRpe : null;
}

async function onHistoryEditSubmit(text) {
  if (!state.historyEdit) return;
  const { sessionId, exercise } = state.historyEdit;
  const session = state.sessions.find((s) => s.id === sessionId);
  let parsed;
  try {
    parsed = parseSetInput(text);
  } catch (e) {
    screens.showHistoryEditError(e.message);
    return;
  }
  const rpe = historyTargetRpe(session, exercise);
  const rows = parsed.map((p, i) => ({
    sessionId, exercise, setIdx: i + 1, weight: p.weight, reps: p.reps, rpe, painFlag: 0,
  }));
  await store.replaceSets(sessionId, exercise, rows);
  state.sets = await store.getAllSets();
  state.historyEdit = null;
  state.flash = { icon: "✏️", text: "Исправлено", danger: false };
  renderHistoryScreen();
}

// ---------- Бэкап ----------

async function onExport() {
  screens.showHistoryError("");
  try {
    const backup = buildBackup(state.programStart, state.sessions, state.sets, {
      pullupMax: state.pullupMax ?? null,
      lastBackupDate: todayStr(),
    }, state.food);
    const json = JSON.stringify(backup, null, 2);
    screens.downloadFile(`trainer-backup-${todayStr()}.json`, json, "application/json");
    await store.setMeta("lastBackupDate", todayStr());
    state.lastBackupDate = todayStr();
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
      meta: {
        programStart: backup.meta.programStart,
        pullupMax: backup.meta.pullupMax,
        lastBackupDate: backup.meta.lastBackupDate,
      },
      food: backup.food,
    });
    // clearAll() стёр ВЕСЬ meta-store, включая настройки устройства (ключ API,
    // цели еды), которых в файле бэкапа нет и не должно быть. Пересеиваем их
    // из памяти обратно в базу — иначе после перезапуска PWA init() прочитает
    // null: распознавание молча отвалится, цели сбросятся на дефолт.
    if (state.apiKey) await store.setMeta("apiKey", state.apiKey);
    await store.setMeta("foodGoals", state.foodGoals);
    state.sessions = await store.getAllSessions();
    state.sets = await store.getAllSets();
    state.food = await store.getAllFood();
    state.programStart = backup.meta.programStart;
    state.pullupMax = backup.meta.pullupMax;
    state.lastBackupDate = backup.meta.lastBackupDate;
    state.historyExpandedId = null;
    state.historyEdit = null;
    state.flash = { icon: "✅", text: `Восстановлено: ${n} ${pluralRu(n, "сессия", "сессии", "сессий")}`, danger: false };
    renderHistoryScreen();
  } catch {
    screens.showHistoryError("Не получилось восстановить данные. Попробуйте ещё раз.");
  } finally {
    screens.resetFileInput();
  }
}

// ---------- Таймер отдыха ----------
// Ничего не пишет в БД — интервал только обновляет текст плитки, отсчёт от
// метки времени старта (не от тиков), чтобы свёрнутое PWA при возврате
// показывало честный остаток.

let timerInterval = null;
let audioCtx = null;

function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = 880; g.gain.value = 0.3;
    o.start(); o.stop(audioCtx.currentTime + 0.6);
  } catch { /* звук — best effort */ }
}

function tickTimer() {
  if (!state.timer) return;
  const left = restRemaining(state.timer.startedAt, state.timer.durationSec, Date.now());
  screens.renderTimer({ text: formatRest(left), done: left === 0 });
  if (left === 0) stopTimer(true);
}

function startTimer(durationSec) {
  state.timer = { startedAt: Date.now(), durationSec };
  clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 500);
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  tickTimer();
}

function stopTimer(finished) {
  clearInterval(timerInterval);
  timerInterval = null;
  state.timer = null;
  if (finished) beep(); // плитка остаётся с 0:00 и подсветкой до следующего действия
  else screens.renderTimer(null);
}

// ---------- Демо-режим для скриншотов (без записи в БД) ----------

function renderDemoSession(mode) {
  const item = {
    exercise: "Присед со штангой",
    scheme: "4×8",
    targetRpe: 7,
    note: "глубина в комфорте, спина прямая",
  };
  const demoLast = [{ weight: 80, reps: 8 }, { weight: 80, reps: 8 }, { weight: 80, reps: 7 }];
  const isReview = mode === "review";
  const isPreview = mode === "preview";

  screens.showScreen("session");
  screens.renderSession({
    stepLabel: `Упражнение ${isPreview ? 4 : 1} / 5${isReview || isPreview ? " · просмотр" : ""}`,
    pillLabel: "Силовая A · Неделя 2",
    techniqueImg: techniqueImage(item.exercise),
    exercise: item.exercise,
    schemeLine: `${item.scheme} · усилие ${item.targetRpe}/10`,
    note: item.note,
    lastSetsText: formatLastSets(demoLast),
    sameDisabled: false,
    recordedText: isReview ? "✓ 80×8, 8, 7" : null,
    backLabel: isReview ? "← выйти" : "← назад",
    forwardDisabled: false,
    isReview,
    isPreview,
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

function renderDemoFood() {
  screens.showScreen("food");
  screens.renderFood({
    totals: { kcal: 1450, kcalGoal: 2250, protein: 96, proteinGoal: 160 },
    entries: [
      { id: 2, label: "13:05 · Гречка с курицей", sub: "550 ккал · белок 45 г", pending: false },
      { id: 1, label: "08:30 · Овсянка с бананом", sub: "420 ккал · белок 14 г", pending: false },
    ],
    pendingCount: 1,
    draft: { name: "Борщ со сметаной", kcal: 320, protein: 14, portion: 1, isEdit: false },
    settings: null, textOpen: false, busy: false, flash: null,
  }, { onEntryTap: () => {} });
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
  screens.on("measure-tile", "click", () => guarded(() => onStartStrength("T")));
  screens.on("backup-tile", "click", goHistory);
  screens.on("today-pullup-tile", "click", () => guarded(onTodayPullupTap));

  screens.on("history-export", "click", () => guarded(onExport));
  screens.on("history-import", "click", screens.openFilePicker);
  screens.onFilePicked((file) => guarded(() => onImportPick(file)));

  screens.on("session-pullup-max", "click", () => guarded(onPullupMaxTap));
  screens.on("session-submit", "click", () => guarded(onSubmit));
  screens.onInputEnter("session-input", () => guarded(onSubmit));
  screens.on("session-same", "click", () => guarded(onSame));
  screens.on("session-skip", "click", () => guarded(onSkip));
  screens.on("session-pain", "click", () => guarded(onPain));
  screens.on("session-back", "click", () => guarded(onBack));
  screens.on("session-forward", "click", () => guarded(async () => onForward()));

  // Таймер отдыха ничего не пишет в БД — без guarded (иначе тап блокировался
  // бы, пока идёт запись подхода).
  screens.on("btn-rest-1", "click", () => startTimer(60));
  screens.on("btn-rest-2", "click", () => startTimer(120));
  screens.on("btn-rest-3", "click", () => startTimer(180));
  screens.on("session-timer", "click", () => stopTimer(false));

  screens.on("wellbeing-skip", "click", () => guarded(onWellbeingSkip));
  screens.on("done-back", "click", goToday);

  screens.on("run-done", "click", () => guarded(onRunDone));

  screens.on("food-tile", "click", goFood);
  screens.on("food-back", "click", goToday);
  screens.on("food-portion-half", "click", () => onFoodPortion(0.5));
  screens.on("food-portion-one", "click", () => onFoodPortion(1));
  screens.on("food-portion-big", "click", () => onFoodPortion(1.5));
  screens.on("food-draft-save", "click", () => guarded(onFoodDraftSave));
  screens.on("food-draft-delete", "click", () => guarded(onFoodDraftDelete));
  screens.on("food-draft-cancel", "click", onFoodDraftCancel);
  screens.on("food-settings-btn", "click", () => { state.foodSettingsOpen = !state.foodSettingsOpen; renderFoodScreen(); });
  screens.on("food-settings-save", "click", () => guarded(onFoodSettingsSave));
  screens.on("food-text-btn", "click", () => { state.foodTextOpen = !state.foodTextOpen; renderFoodScreen(); });
  screens.on("food-photo-btn", "click", screens.openFoodFilePicker);
  screens.onFoodFilePicked((file) => guarded(async () => { await onFoodPhotoPick(file); screens.resetFoodFileInput(); }));
  screens.on("food-text-submit", "click", () => guarded(onFoodTextSubmit));
  screens.onInputEnter("food-text-input", () => guarded(onFoodTextSubmit));
  screens.on("food-pending-tile", "click", () => guarded(onFoodRetryPending));
}

async function init() {
  screens.initWellbeingGrid((n) => guarded(() => onWellbeingPick(n)));

  const params = new URLSearchParams(location.search);
  if (params.get("screen") === "session-demo") {
    renderDemoSession(params.get("mode"));
    return;
  }
  if (params.get("screen") === "history-demo") {
    renderDemoHistory();
    return;
  }
  if (params.get("screen") === "food-demo") {
    renderDemoFood();
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
  state.pullupMax = (await store.getMeta("pullupMax")) ?? null;
  state.lastBackupDate = (await store.getMeta("lastBackupDate")) ?? null;
  state.apiKey = (await store.getMeta("apiKey")) ?? null;
  state.foodGoals = (await store.getMeta("foodGoals")) ?? { ...DEFAULT_GOALS };
  state.food = await store.getAllFood();
  state.sessions = await store.getAllSessions();
  state.sets = await store.getAllSets();

  goToday();
}

init();
