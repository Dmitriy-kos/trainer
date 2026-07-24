// Состояние + действия. Никакой бизнес-логики здесь — только вызовы core/* и store.js.
// screens.js отвечает за DOM; этот модуль решает, ЧТО показать и КОГДА писать в БД.

import * as store from "../core/store.js";
import { autoregulationHint, overtrainingAlert, programForDate, measureTile, boostDay, pullupDayScheme, restRemaining, restAlertSecond, formatRest, backupReminder } from "../core/logic.js";
import { parseSetInput, formatLastSets, schemeTargetReps, latestCacheVersion, humanScheme } from "../core/format.js";
import { PROGRAMS, programByNumber, planForSession, programWeekdayHint, programDayForWeekday, techniqueImage, DAY_PLANS, globalWeekNumber } from "../core/plan.js";
import { lastSets, recentWellbeing, unfinishedSession, newerFirst, sessionExerciseSets, groupSessionSets, exerciseStatus, sessionStatuses, sessionRemaining, nextTodoIdx, ghostSessionIds } from "../core/queries.js";
import { buildBackup, validateBackup } from "../core/backup.js";
import { latestWeigh, weighDeltas, sortedByDateDesc, daysSince, METRICS, BODYCOMP_METRICS, metricHistory, metricDelta, deltaTone, parseWeighDraft } from "../core/weigh.js";
import { DEFAULT_GOALS, dayTotals, scalePortion } from "../core/food.js";
import { recognizeFood, recognizeWeights } from "../core/claude.js";
import { compressImage } from "./image.js";
import * as screens from "./screens.js";

const DEFAULT_PROGRAM_START = "2026-06-22";
const DEFAULT_REST_DURATION = 120;

const state = {
  sessions: [],
  sets: [],
  programStart: DEFAULT_PROGRAM_START,
  session: null,       // текущая открытая силовая сессия (в памяти, синхронно с store)
  exercises: [],        // planForSession(session), отсортировано по orderIdx
  cursorIdx: 0,          // какое упражнение сессии сейчас на экране (Шаг 8: порядок свободный)
  flash: null,           // {icon, text, danger} | null — плитка, показывается один раз
  runSession: null,       // сессия только что записанного бега, пока открыт экран деталей
  historyExpandedId: null, // id сессии, чьи подходы сейчас раскрыты в Истории (одна за раз)
  historyEdit: null,     // {sessionId, exercise} | null — какая строка сейчас редактируется в Истории
  measureProgram: null,  // номер программы, чей день T ещё доступен для замеров («Замеры» плитка); null = не показывать
  boostDay: null,        // «P1»/«P2», если сегодня беговой день недель 6-7 с опцией подкачки; null = плитку не показывать
  pullupMax: null,       // {value, date} | null — сохранённый максимум строгих подтягиваний
  lastBackupDate: null,  // дата последней резервной копии (meta) — плитка-напоминание на «Сегодня»
  timer: { startedAt: null, durationSec: DEFAULT_REST_DURATION, running: false, finished: false },
  food: [],             // записи еды (все даты), зеркало store
  apiKey: null,          // ключ Claude API — только в meta, в бэкап не попадает
  foodGoals: { ...DEFAULT_GOALS }, // {kcal, protein} — цели дня, редактируются в настройках
  foodDraft: null,       // черновик карточки-подтверждения: {base:{kcal,protein,fat,carbs}, name, kcal, protein, fat, carbs, comment, portion, source, editingId|null, pendingPayload|null}
  foodTextOpen: false,
  foodSettingsOpen: false,
  foodBusy: false,       // идёт распознавание (спиннер)
  weights: [],           // записи взвешивания (все даты), зеркало store — читается в init()
  weighDraft: null,      // черновик карточки взвешивания: {values: {14 ключей METRICS}, source, editingId|null}
  weighBusy: false,      // идёт распознавание скрина весов (спиннер)
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
  screens.renderTabbar("today");
  renderTodayScreen();
}

function pullupMaxTileLabel() {
  return state.pullupMax
    ? `${state.pullupMax.value} (обновлён ${state.pullupMax.date}) · тап — изменить`
    : "не задан · тап — ввести";
}

// Число в русском виде («84,6», а не «84.6») — весь модуль «Взвешивание»
// хранит десятичные значения через точку (JS Number), на экране — запятая.
function numRu(x) {
  return String(x).replace(".", ",");
}

// Подзаголовок плитки «⚖️ Взвешивание» на хабе + признак «нужен акцент»
// (дизайн_v7, раздел 2 «Напоминание»): по понедельникам без сегодняшнего
// замера плитка акцентная; иначе — последний замер, при простое ≥8 дней —
// приписка «N дн. назад».
function weightsHubVm(today, weekday) {
  const latest = latestWeigh(state.weights);
  const hasTodayEntry = state.weights.some((w) => w.date === today);
  if (weekday === 0 && !hasTodayEntry) {
    const lastPart = latest ? ` · последний: ${numRu(latest.weight)} кг` : "";
    return { weightsSub: `Понедельник — день замера ⚖️${lastPart}`, weightsAccent: true };
  }
  if (!latest) return { weightsSub: "замеров ещё нет", weightsAccent: false };
  let sub = `${numRu(latest.weight)} кг`;
  if (latest.fatPct != null) sub += ` · жир ${numRu(latest.fatPct)}%`;
  const since = daysSince(latest.date, today);
  if (since >= 8) sub += ` · ${since} дн. назад`;
  return { weightsSub: sub, weightsAccent: false };
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
    // Шаг 8: порядок свободный — считаем незакрытые по данным, а не по progressIdx
    // (он теперь курсор «где я», а не счётчик «сколько сделано»).
    const remaining = plan ? sessionRemaining(state.sets, unfinished.id, plan) : 0;
    const label = dayTypeLabel(unfinished.day);
    resumeLabel = `Продолжить: ${label} от ${unfinished.date} (осталось ${remaining} из ${total})`;
  }

  const br = backupReminder(state.lastBackupDate, today, state.sessions.length > 0);
  const backupLabel = br ? (br.days == null ? "⚠️ Сделай резервную копию истории" : `⚠️ Копию не делал ${br.days} дн.`) : null;

  const dayLabel = todayDay ? `Силовая ${todayDay}` : "Бег/отдых";
  const pullupN = state.pullupMax ? state.pullupMax.value : "—";
  const workoutSub = `по плану: ${dayLabel} · макс подтягиваний ${pullupN}`;
  const { weightsSub, weightsAccent } = weightsHubVm(today, weekday);

  screens.renderToday({
    hint,
    weekLabel: `Месяц ${number} · ${program.weekLabels[week]}`,
    resumeLabel,
    backupLabel,
    workoutSub,
    weightsSub,
    weightsAccent,
  });
  screens.renderFoodTile(foodTileLabel());
}

// ---------- Экран «Тренировка» ----------

function goWorkout() {
  screens.showScreen("workout");
  screens.renderTabbar("workout");
  renderWorkoutScreen();
}

function renderWorkoutScreen() {
  screens.showWorkoutError("");
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
    // Шаг 8: порядок свободный — считаем незакрытые по данным, а не по progressIdx
    // (он теперь курсор «где я», а не счётчик «сколько сделано»).
    const remaining = plan ? sessionRemaining(state.sets, unfinished.id, plan) : 0;
    const label = dayTypeLabel(unfinished.day);
    resumeLabel = `Продолжить: ${label} от ${unfinished.date} (осталось ${remaining} из ${total})`;
  }

  const mt = measureTile(state.programStart, today, state.sessions);
  const measureLabel = mt ? "Замеры 📏 — рабочие максимумы месяца" : null;
  state.measureProgram = mt ? mt.programNumber : null;

  state.boostDay = boostDay(number, week, weekday);
  const boostLabel = state.boostDay
    ? `Подкачка 💪 после бега — ${state.boostDay === "P1" ? "руки + пресс" : "плечи + пресс"}, 15 мин (по желанию)`
    : null;

  screens.renderWorkout({
    hint,
    weekLabel: `Месяц ${number} · ${program.weekLabels[week]}`,
    todayDay,
    resumeLabel,
    measureLabel,
    boostLabel,
    pullupLabel: pullupMaxTileLabel(),
  });
}

// openSessionFlow стал async (нормализация старых пропусков пишет в БД) —
// поэтому и «Продолжить» теперь async и вешается через guarded.
async function onResume() {
  const s = unfinishedSession(state.sessions);
  if (!s) return;
  await openSessionFlow(s);
}

// ---------- Экран «Взвешивание» ----------
// Скрин весов → распознавание Claude → карточка-черновик → запись; ручной
// ввод; правка/удаление по тапу на запись (дизайн_v7_хаб_и_взвешивание.md).

function goWeights() {
  state.weighDraft = null;
  screens.showScreen("weights");
  screens.renderTabbar("weights");
  renderWeightsScreen();
}

// "2026-07-06" → "06.07" (день.месяц, как принято в устной речи — не ISO).
function formatDateShort(dateISO) {
  const [, mm, dd] = dateISO.split("-");
  return `${dd}.${mm}`;
}

function weighDeltaText(delta) {
  if (delta == null) return null;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  return `Δ ${sign}${numRu(Math.abs(delta))} кг`;
}

// Значение показателя с единицей: 51,5% / 3,3 кг / 1804 ккал / 26.
function metricValueText(m, v) {
  if (v == null) return "—";
  const num = numRu(v);
  if (!m.unit) return num;
  return m.unit === "%" ? `${num}%` : `${num} ${m.unit}`;
}

function buildBodycompVm() {
  const rows = BODYCOMP_METRICS.map((m) => {
    const hist = metricHistory(state.weights, m.key, 3);
    const delta = metricDelta(state.weights, m.key);
    const sign = delta == null ? "" : delta > 0 ? "+" : delta < 0 ? "−" : "±";
    return {
      label: m.label,
      hist: hist.length > 1 ? hist.map((v) => numRu(v)).join(" → ") : "",
      value: metricValueText(m, hist.length ? hist[hist.length - 1] : null),
      delta: delta == null ? null : `${sign}${numRu(Math.abs(delta))}`,
      tone: deltaTone(m.key, delta),
    };
  });
  return { rows };
}

function goBodycomp() {
  screens.showScreen("bodycomp");
  screens.renderTabbar("weights");
  screens.renderBodycomp(buildBodycompVm());
}

function buildWeightsVm() {
  const sorted = sortedByDateDesc(state.weights);
  const latestEntry = sorted[0] ?? null;

  let latest = null;
  if (latestEntry) {
    const parts = [];
    if (latestEntry.fatPct != null) parts.push(`жир ${numRu(latestEntry.fatPct)}%`);
    if (latestEntry.muscleKg != null) parts.push(`мышцы ${numRu(latestEntry.muscleKg)} кг`);
    const overallDelta = weighDeltas(state.weights);
    const deltaText = overallDelta ? weighDeltaText(overallDelta.weight) : null;
    if (deltaText) parts.push(deltaText);
    latest = { value: `${numRu(latestEntry.weight)} кг`, sub: parts.join(" · ") || "первый замер" };
  }

  // Дельта каждой записи — к предыдущей ПО ДАТЕ (следующий элемент в
  // sortedByDateDesc, т.к. сортировка от новых к старым).
  const entries = sorted.map((e, i) => {
    const prev = sorted[i + 1] ?? null;
    const delta = prev ? Math.round((e.weight - prev.weight) * 10) / 10 : null;
    const subParts = [];
    if (e.fatPct != null) subParts.push(`жир ${numRu(e.fatPct)}%`);
    const deltaText = weighDeltaText(delta);
    if (deltaText) subParts.push(deltaText);
    return { id: e.id, label: `${formatDateShort(e.date)} · ${numRu(e.weight)} кг`, sub: subParts.join(" · ") };
  });

  const draft = state.weighDraft ? { values: state.weighDraft.values, isEdit: state.weighDraft.editingId != null } : null;

  // Плитка «Состав тела»: видна при ≥1 замере; N — сколько показателей заполнено
  // в последней записи, где есть хоть один (жир/мышцы старых записей тоже считаются).
  let bodycomp = null;
  if (sorted.length) {
    const withComp = sorted.find((e) => BODYCOMP_METRICS.some((m) => e[m.key] != null));
    bodycomp = withComp
      ? { sub: `показателей: ${BODYCOMP_METRICS.filter((m) => withComp[m.key] != null).length} · обновлён ${formatDateShort(withComp.date)}` }
      : { sub: "пока только вес — пришли скрины весов" };
  }

  return { latest, draft, entries, busy: state.weighBusy, flash: consumeFlash(), bodycomp };
}

function renderWeightsScreen() {
  screens.showWeightsError("");
  screens.renderWeights(buildWeightsVm(), { onEntryTap: (id) => onWeighEntryTap(id) });
}

function onWeighEntryTap(id) {
  const e = state.weights.find((x) => x.id === id);
  if (!e) return;
  const values = Object.fromEntries(METRICS.map((m) => [m.key, e[m.key] ?? null]));
  state.weighDraft = { values, source: e.source, editingId: id };
  renderWeightsScreen();
}

function onWeighManual() {
  const values = Object.fromEntries(METRICS.map((m) => [m.key, null]));
  state.weighDraft = { values, source: "manual", editingId: null };
  renderWeightsScreen();
}

function onWeighScreenBtn() {
  if (!state.apiKey) {
    screens.showWeightsError("Ключ API вводится в «Еда → ⚙️ Настройки еды» — один на всё приложение.");
    return;
  }
  screens.showWeightsError("");
  screens.openWeightsFilePicker();
}

function openWeighDraftFromRecognition(parsed) {
  state.weighDraft = { values: parsed, source: "screen", editingId: null };
  state.weighBusy = false;
  renderWeightsScreen();
}

async function onWeighFilesPicked(files) {
  if (!files.length) return;
  if (files.length > 2) {
    screens.showWeightsError("Выбери не больше двух скринов — главный экран и список показателей.");
    return;
  }
  let images;
  try {
    images = await Promise.all(files.map((f) => compressImage(f)));
  } catch (e) {
    screens.showWeightsError(e.message);
    return;
  }
  state.weighBusy = true;
  screens.showWeightsError("");
  renderWeightsScreen();
  try {
    const parsed = await recognizeWeights({ apiKey: state.apiKey, images });
    openWeighDraftFromRecognition(parsed);
  } catch (e) {
    state.weighBusy = false;
    renderWeightsScreen();
    screens.showWeightsError(e.offline ? "Нет связи — попробуй позже или введи вручную." : e.message);
  }
}

function readWeighDraftFields() {
  const parsed = parseWeighDraft(screens.getWeightsDraft());
  if (!parsed.ok) {
    screens.showWeightsError(parsed.error);
    return null;
  }
  return parsed.values;
}

async function onWeighDraftSave() {
  if (!state.weighDraft) return;
  const fields = readWeighDraftFields();
  if (!fields) return;
  screens.showWeightsError("");
  const d = state.weighDraft;
  const today = todayStr();

  if (d.editingId != null) {
    const old = state.weights.find((x) => x.id === d.editingId);
    const updated = { ...old, ...fields };
    await store.updateWeigh(updated);
    state.weights = state.weights.map((x) => (x.id === updated.id ? updated : x));
  } else {
    // Одна запись на дату: повторный замер за сегодня заменяет существующий
    // после подтверждения, вместо второй строки в списке.
    const existing = state.weights.find((x) => x.date === today);
    if (existing) {
      if (!confirm("Замер за сегодня уже есть — заменить?")) return;
      const updated = { ...existing, ...fields, source: d.source };
      await store.updateWeigh(updated);
      state.weights = state.weights.map((x) => (x.id === updated.id ? updated : x));
    } else {
      const rec = { date: today, ...fields, source: d.source };
      const id = await store.addWeigh(rec);
      state.weights.push({ id, ...rec });
    }
  }
  state.weighDraft = null;
  state.flash = { icon: "⚖️", text: "Записано", danger: false };
  renderWeightsScreen();
}

async function onWeighDraftDelete() {
  if (!state.weighDraft || state.weighDraft.editingId == null) return;
  await store.deleteWeigh(state.weighDraft.editingId);
  state.weights = state.weights.filter((x) => x.id !== state.weighDraft.editingId);
  state.weighDraft = null;
  state.flash = { icon: "🗑", text: "Удалено", danger: false };
  renderWeightsScreen();
}

function onWeighDraftCancel() {
  state.weighDraft = null;
  screens.showWeightsError("");
  renderWeightsScreen();
}

function goHistory() {
  state.historyExpandedId = null;
  state.historyEdit = null;
  screens.showHistoryError("");
  screens.showScreen("history");
  screens.renderTabbar(null);
  renderHistoryScreen();
}

// ---------- Силовая сессия ----------

// Человеческое имя типа сессии по букве дня (P1/P2 — подкачки после бега).
function dayTypeLabel(day) {
  if (day === "RUN") return "Бег";
  if (day === "T") return "Замеры";
  if (day === "P1" || day === "P2") return "Подкачка";
  return `Силовая ${day}`;
}

async function onStartStrength(day) {
  const today = todayStr();
  const { number, week } = programForDate(state.programStart, today);
  const program = day === "T" && state.measureProgram ? state.measureProgram : number;
  const session = { date: today, day, week, status: "open", wellbeing: null, note: null, progressIdx: 0, program };
  const id = await store.addSession(session);
  const withId = { ...session, id };
  state.sessions.push(withId);
  await openSessionFlow(withId);
}

// Строка-пометка «пропущено»: живёт в таблице подходов рядом с пометкой боли.
// Именно она отличает «я не делал это упражнение» от «я до него ещё не дошёл».
function skipRow(exercise) {
  return { sessionId: state.session.id, exercise, setIdx: 0, weight: null, reps: null, rpe: null, painFlag: 0, skipFlag: 1 };
}

// Уборка «призраков»: открытых сессий без единой записи. Такая сессия заводится
// тапом по кнопке дня и остаётся в базе, если из неё ушли не кнопкой «← выйти»
// (например, просто закрыли приложение). Тренировкой она не является — терять
// в ней нечего, — но навсегда виснет плиткой «Продолжить» на «Сегодня».
// Вызывается ПЕРЕД normalizeLegacySkips: иначе та проставит призраку пометки
// пропуска, и он перестанет быть призраком.
async function dropGhostSessions() {
  const ids = ghostSessionIds(state.sessions, state.sets);
  if (ids.length === 0) return;
  for (const id of ids) await store.deleteSession(id);
  state.sessions = state.sessions.filter((s) => !ids.includes(s.id));
}

// Разовая починка данных, накопленных ДО Шага 8: тогда пропуски не помечались —
// их «съедал» счётчик progressIdx. У каждой незавершённой сессии всё, что счётчик
// считал закрытым, но следа в подходах не оставило, получает пометку пропуска.
//
// Запускается ОДИН раз на устройство (флаг в meta) при старте приложения, а не
// при открытии сессии. Так надо, потому что после Шага 8 у progressIdx другой
// смысл — курсор «где я»: перепрыгнутое стрелкой «вперёд →» упражнение уже НЕ
// значит «пропущено». Если чинить при каждом открытии, приложение стало бы само
// проставлять ложные пропуски тем упражнениям, мимо которых просто пролистали.
async function normalizeLegacySkips() {
  if (await store.getMeta("skipsNormalized")) return;
  let touched = false;
  for (const s of state.sessions.filter((x) => x.status === "open")) {
    const plan = (planForSession(s) ?? []).slice().sort((a, b) => a.orderIdx - b.orderIdx);
    const upto = Math.min(s.progressIdx ?? 0, plan.length);
    for (let i = 0; i < upto; i++) {
      const ex = plan[i].exercise;
      if (exerciseStatus(state.sets, s.id, ex) !== "todo") continue;
      const row = { sessionId: s.id, exercise: ex, setIdx: 0, weight: null, reps: null, rpe: null, painFlag: 0, skipFlag: 1 };
      await store.replaceSets(s.id, ex, [row]);
      touched = true;
    }
  }
  if (touched) state.sets = await store.getAllSets();
  await store.setMeta("skipsNormalized", true);
}

async function openSessionFlow(session) {
  state.session = session;
  state.exercises = (planForSession(session) ?? []).slice().sort((a, b) => a.orderIdx - b.orderIdx);
  if (state.exercises.length === 0) {
    goWellbeing();
    return;
  }
  if (sessionRemaining(state.sets, session.id, state.exercises) === 0) {
    // Все упражнения отмечены, самочувствие ещё не спросили — типичный «закрыли
    // приложение между последним подходом и экраном самочувствия».
    goWellbeing();
    return;
  }
  const saved = Math.min(Math.max(session.progressIdx ?? 0, 0), state.exercises.length - 1);
  state.cursorIdx = exerciseStatus(state.sets, session.id, state.exercises[saved].exercise) === "todo"
    ? saved
    : nextTodoIdx(state.sets, session.id, state.exercises, saved) ?? saved;
  screens.showScreen("session");
  renderSessionScreen();
}

function currentItem() {
  return state.exercises[state.cursorIdx];
}

function renderSessionScreen() {
  screens.renderSession(buildSessionVm(), (i) => guarded(() => setCursor(i)));
}

// Курсор (какое упражнение на экране) переезжает в progressIdx — поле осталось
// в БД и в бэкапах, но смысл у него теперь «где я», а не «сколько закрыто».
async function setCursor(idx) {
  state.cursorIdx = idx;
  const updated = { ...state.session, progressIdx: idx };
  await store.updateSession(updated);
  state.sessions = state.sessions.map((s) => (s.id === updated.id ? updated : s));
  state.session = updated;
  renderSessionScreen();
}

// Запись = замена всех строк упражнения целиком (одна транзакция). Возвращает
// true, если упражнение до этого было незакрытым, — от этого зависит, прыгать
// ли дальше и показывать ли подсказку автогуляции.
async function recordExercise(exercise, rows) {
  const wasTodo = exerciseStatus(state.sets, state.session.id, exercise) === "todo";
  await store.replaceSets(state.session.id, exercise, rows);
  state.sets = await store.getAllSets();
  return wasTodo;
}

// После закрытия упражнения — на ближайшее незакрытое (по кругу). Если таких
// нет — тренировка окончена.
async function advanceAfterRecord() {
  const next = nextTodoIdx(state.sets, state.session.id, state.exercises, state.cursorIdx);
  if (next == null) {
    const updated = { ...state.session, progressIdx: state.exercises.length };
    await store.updateSession(updated);
    state.sessions = state.sessions.map((s) => (s.id === updated.id ? updated : s));
    state.session = updated;
    goWellbeing();
    return;
  }
  await setCursor(next);
}

function buildSessionVm() {
  const idx = state.cursorIdx;
  const item = state.exercises[idx];
  const sid = state.session.id;
  const statuses = sessionStatuses(state.sets, sid, state.exercises);
  const remaining = statuses.filter((s) => s === "todo").length;
  const last = lastSets(state.sessions, state.sets, item.exercise);

  let recordedText = null;
  if (statuses[idx] === "skipped") recordedText = "⏭ пропущено";
  else if (statuses[idx] === "pain") recordedText = "🚑 больно";
  else if (statuses[idx] === "done") {
    const rec = sessionExerciseSets(state.sets, sid, item.exercise).filter((s) => !s.painFlag && !s.skipFlag);
    recordedText = "✓ " + formatLastSets(rec);
  }

  const isPullup = item.exercise.startsWith("Подтягивания");
  // Схему показываем словами («5 подходов по 3 повторения»), а вариант «нед. 5»
  // раскрываем по текущей неделе — на карточке нет скобок и шифровок (CEO 21.07.2026).
  const gWeek = globalWeekNumber(state.session.program ?? 1, state.session.week);
  let schemeLine = `${humanScheme(item.scheme, gWeek)} · усилие ${item.targetRpe}/10`;
  let pullupMaxLabel = null;
  if (isPullup) {
    const maxVal = state.pullupMax ? state.pullupMax.value : null;
    schemeLine = `${humanScheme(pullupDayScheme(state.session.program ?? 1, state.session.week, state.session.day, maxVal), gWeek)} · усилие ${item.targetRpe}/10`;
    pullupMaxLabel = pullupMaxTileLabel();
  }

  return {
    stepLabel: `Осталось ${remaining} из ${state.exercises.length}`,
    pillLabel: `${dayTypeLabel(state.session.day)} · Неделя ${state.session.week}`,
    strip: state.exercises.map((it, i) => ({ status: statuses[i], here: i === idx, label: stripLabel(it.exercise) })),
    techniqueImg: techniqueImage(item.exercise),
    exercise: item.exercise,
    schemeLine,
    pullupMaxLabel,
    note: item.note || "",
    lastSetsText: formatLastSets(last),
    // «Так же» имеет смысл только для ещё не записанного упражнения (ярлык «повторить
    // прошлый раз»). Если статус уже done/skipped/pain — кнопка неактивна, иначе тап по
    // кружку полоски на записанном упражнении может молча затереть сегодняшние числа.
    sameDisabled: last.length === 0 || statuses[idx] !== "todo",
    recordedText,
    backLabel: idx === 0 ? "← выйти" : "← назад",
    forwardDisabled: idx >= state.exercises.length - 1,
    flash: consumeFlash(),
  };
}

// Подпись под кружком полоски: первое слово названия, максимум 7 букв.
function stripLabel(exercise) {
  const w = exercise.split(" ")[0].replace(/[():]/g, "");
  return w.length > 7 ? `${w.slice(0, 7)}…` : w;
}

// ---------- Навигация «← назад» / «вперёд →» ----------

async function onBack() {
  if (state.cursorIdx > 0) {
    await setCursor(state.cursorIdx - 1);
    return;
  }
  // Первое упражнение — «← выйти»: возврат на «Сегодня». Пустую сессию (ни одной
  // записи) стираем без следа — иначе в истории виснет «не завершена», а «Сегодня»
  // тянет обратно плиткой «Продолжить» в ошибочно выбранный день.
  const s = state.session;
  if (!state.sets.some((x) => x.sessionId === s.id)) {
    await store.deleteSession(s.id);
    state.sessions = state.sessions.filter((x) => x.id !== s.id);
  }
  goToday();
}

async function onForward() {
  if (state.cursorIdx >= state.exercises.length - 1) return;
  await setCursor(state.cursorIdx + 1);
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
  if (await askPullupMax(screens.showSessionError)) renderSessionScreen();
}

async function onWorkoutPullupTap() {
  if (await askPullupMax(screens.showWorkoutError)) renderWorkoutScreen();
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

  const rows = parsed.map((p, i) => ({
    sessionId: state.session.id, exercise: item.exercise,
    setIdx: i + 1, weight: p.weight, reps: p.reps, rpe: item.targetRpe, painFlag: 0, skipFlag: 0,
  }));
  const wasTodo = await recordExercise(item.exercise, rows);

  if (wasTodo) {
    // Автогуляция считается по введённым повторам с целевым усилием (не фактическим) —
    // так же, как записанный rpe каждого сета. При исправлении уже записанного не
    // пересчитывается: там правка, а не новый подход.
    const loggedForHint = parsed.map((p) => ({ reps: p.reps, rpe: item.targetRpe }));
    const hint = autoregulationHint(schemeTargetReps(item.scheme), item.targetRpe, loggedForHint);
    if (hint) state.flash = { icon: "💡", text: hint, danger: false };
  } else {
    state.flash = { icon: "✏️", text: "Исправлено", danger: false };
  }

  if (state.session.day === "T" && item.exercise.startsWith("Подтягивания") && parsed.length > 0) {
    const best = Math.max(...parsed.map((p) => p.reps));
    state.pullupMax = { value: best, date: todayStr() };
    await store.setMeta("pullupMax", state.pullupMax);
    state.flash = { icon: "🎯", text: `Максимум подтягиваний обновлён: ${best}`, danger: false };
  }

  if (wasTodo) await advanceAfterRecord();
  else renderSessionScreen();
}

async function onSame() {
  const item = currentItem();
  // Страховка от гонки: кнопка и так неактивна для уже записанного упражнения
  // (см. sameDisabled в buildSessionVm), но если тап всё же прошёл — не пишем поверх.
  if (exerciseStatus(state.sets, state.session.id, item.exercise) !== "todo") return;
  const last = lastSets(state.sessions, state.sets, item.exercise);
  if (last.length === 0) return;
  const rows = last.map((s) => ({
    sessionId: state.session.id, exercise: item.exercise,
    setIdx: s.setIdx, weight: s.weight, reps: s.reps, rpe: item.targetRpe, painFlag: 0, skipFlag: 0,
  }));
  const wasTodo = await recordExercise(item.exercise, rows);
  if (wasTodo) {
    await advanceAfterRecord();
  } else {
    state.flash = { icon: "✏️", text: "Исправлено", danger: false };
    renderSessionScreen();
  }
}

async function onSkip() {
  const item = currentItem();
  const wasTodo = await recordExercise(item.exercise, [skipRow(item.exercise)]);
  if (wasTodo) {
    await advanceAfterRecord();
  } else {
    state.flash = { icon: "⏭", text: "Отмечено пропущенным", danger: false };
    renderSessionScreen();
  }
}

// Кнопка «Больно» убрана (решение CEO 10.07.2026). painFlag остаётся в модели:
// старые записи читаются из бэкапов и показываются в истории строкой «🚑 больно».

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
  screens.renderTabbar("food");
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
  const typeLabel = dayTypeLabel(session.day);
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
    canDelete: noSets && session.status !== "done",
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
    onDeleteSession: (id) => guarded(() => onHistoryDeleteSession(id)),
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
    sessionId, exercise, setIdx: i + 1, weight: p.weight, reps: p.reps, rpe, painFlag: 0, skipFlag: 0,
  }));
  await store.replaceSets(sessionId, exercise, rows);
  state.sets = await store.getAllSets();
  state.historyEdit = null;
  state.flash = { icon: "✏️", text: "Исправлено", danger: false };
  renderHistoryScreen();
}

// Удаление пустой (без подходов) незавершённой сессии из Истории — уборка
// «мусорных» open-сессий, оставшихся от тапа по «Силовая X» до появления
// «← выйти». Разрешено только для noSets && status !== "done" (canDelete
// в buildHistoryItemVm) — экран не показывает кнопку для остальных случаев,
// но проверяем и здесь на случай прямого вызова.
async function onHistoryDeleteSession(sessionId) {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  const { noSets } = groupSessionSets(session, state.sets, planForSession(session));
  if (!noSets || session.status === "done") return;
  if (!confirm("Удалить пустую сессию?")) return;
  await store.deleteSession(sessionId);
  state.sessions = state.sessions.filter((s) => s.id !== sessionId);
  if (state.historyExpandedId === sessionId) state.historyExpandedId = null;
  if (state.historyEdit && state.historyEdit.sessionId === sessionId) state.historyEdit = null;
  state.flash = { icon: "🗑", text: "Удалено", danger: false };
  renderHistoryScreen();
}

// ---------- Бэкап ----------

async function onExport() {
  screens.showHistoryError("");
  try {
    const backup = buildBackup(state.programStart, state.sessions, state.sets, {
      pullupMax: state.pullupMax ?? null,
      lastBackupDate: todayStr(),
    }, state.food, state.weights);
    const json = JSON.stringify(backup, null, 2);
    screens.downloadFile(`trainer-backup-${todayStr()}.json`, json, "application/json;charset=utf-8");
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
      weights: backup.weights,
    });
    // clearAll() стёр ВЕСЬ meta-store, включая настройки устройства (ключ API,
    // цели еды), которых в файле бэкапа нет и не должно быть. Пересеиваем их
    // из памяти обратно в базу — иначе после перезапуска PWA init() прочитает
    // null: распознавание молча отвалится, цели сбросятся на дефолт.
    if (state.apiKey) await store.setMeta("apiKey", state.apiKey);
    await store.setMeta("foodGoals", state.foodGoals);
    // Копия v5 уже хранит пометки пропуска — чинить в ней нечего, флага достаточно
    // (иначе нормализация приняла бы курсор за «сделано» и наштамповала ложные
    // пропуски). Решение принимаем по СЫРОЙ версии файла obj.version: validateBackup
    // возвращает копию, уже приведённую к 5, — по ней отличить старую от новой нельзя.
    if (obj.version === 5) await store.setMeta("skipsNormalized", true);
    state.sessions = await store.getAllSessions();
    state.sets = await store.getAllSets();
    state.food = await store.getAllFood();
    state.weights = await store.getAllWeights();
    // Старая копия (v1–v4): пометок пропуска в ней нет, флага после clearAll() тоже.
    // Чиним ПРЯМО СЕЙЧАС, а не при следующем запуске: иначе пользователь успеет
    // открыть восстановленную сессию и полистать «вперёд →», курсор перезапишет
    // progressIdx — и отложенная нормализация примет курсор за «сделано» и пометит
    // пропущенным то, что человек не пропускал.
    if (obj.version < 5) await normalizeLegacySkips();
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
  if (!state.timer.running) return;
  const left = restRemaining(state.timer.startedAt, state.timer.durationSec, Date.now());
  screens.renderTimer({
    text: formatRest(left),
    label: "Отдых",
    ariaLabel: `Таймер отдыха: осталось ${formatRest(left)}`,
    done: false,
    alertSecond: restAlertSecond(state.timer.durationSec, left),
  });
  if (left === 0) stopTimer(true);
}

function startTimer(durationSec) {
  state.timer = { startedAt: Date.now(), durationSec, running: true, finished: false };
  clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 500);
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  tickTimer();
}

function stopTimer(finished) {
  clearInterval(timerInterval);
  timerInterval = null;
  const durationSec = finished ? state.timer.durationSec : DEFAULT_REST_DURATION;
  state.timer = { startedAt: null, durationSec, running: false, finished };
  screens.renderTimer({
    text: formatRest(durationSec),
    label: finished ? "Готово · нажми повторить" : "Отдых · нажми запустить",
    ariaLabel: `${finished ? "Повторить" : "Запустить"} таймер отдыха на ${formatRest(durationSec)}`,
    done: finished,
    alertSecond: null,
  });
  if (finished) beep();
}

// ---------- Демо-режим для скриншотов (без записи в БД) ----------

// Шаг 8: режимы «просмотр»/«предпросмотр» удалены — фикстура больше не притворяется,
// что запись где-то заблокирована; шаг-лейбл в новом формате («осталось N из M»).
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
    stepLabel: "Осталось 5 из 5",
    pillLabel: "Силовая A · Неделя 2",
    techniqueImg: techniqueImage(item.exercise),
    exercise: item.exercise,
    schemeLine: `${humanScheme(item.scheme, 2)} · усилие ${item.targetRpe}/10`,
    note: item.note,
    lastSetsText: formatLastSets(demoLast),
    sameDisabled: false,
    recordedText: null,
    backLabel: "← выйти",
    forwardDisabled: false,
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

// Демо для скриншотов Шага 7 (вёрстка v7: хаб-плитки, экран «Взвешивание»).
// Без записи в БД — фикстуры прямо во view-model, как в остальных renderDemo*.

function renderDemoWeights() {
  screens.showScreen("weights");
  screens.renderTabbar("weights");
  screens.renderWeights({
    latest: { value: "84,6 кг", sub: "жир 24,9% · мышцы 59,7 кг · −0,4 кг за неделю" },
    draft: {
      values: {
        weight: 84.6, fatPct: 24.9, subFatPct: 18.2, visceral: 9, waterPct: 55.1, musclePct: 40.3,
        muscleKg: 59.7, skeletalPct: 37.8, proteinPct: 17.6, boneKg: 3.4, leanKg: 63.7, bmrKcal: 1720,
        bmi: 24.1, bioAge: 33,
      },
      isEdit: false,
    },
    entries: [
      { id: 3, label: "2026-07-08 · 84,6 кг", sub: "жир 24,9% · Δ −0,4 кг" },
      { id: 2, label: "2026-07-01 · 85,0 кг", sub: "жир 25,3% · Δ −0,3 кг" },
      { id: 1, label: "2026-06-24 · 85,3 кг", sub: "жир 25,6%" },
    ],
    busy: false,
    flash: null,
    bodycomp: { sub: "показателей: 12 · обновлён 08.07" },
  }, { onEntryTap: () => {} });
}

function renderDemoHub() {
  screens.showScreen("today");
  screens.renderTabbar("today");
  screens.renderToday({
    hint: "Сегодня силовая C 💪",
    weekLabel: "Месяц 2 · Неделя 3",
    resumeLabel: "Продолжить: Силовая B от 2026-07-08 (осталось 3 из 5)",
    backupLabel: "⚠️ Копию не делал 12 дн.",
    workoutSub: "по плану: Силовая C · макс подтягиваний 7",
    weightsSub: "Понедельник — день замера ⚖️",
    weightsAccent: true,
  });
  screens.renderFoodTile("Еда 🍽 1450 / 2250 ккал · белок 96 / 160 г");
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
  screens.on("btn-history-back", "click", goToday);
  screens.on("resume-tile", "click", () => guarded(onResume));
  screens.on("backup-tile", "click", goHistory);

  // Вкладки нижней панели + плитки-разделы хаба.
  screens.on("tab-today", "click", goToday);
  screens.on("tab-workout", "click", goWorkout);
  screens.on("tab-food", "click", goFood);
  screens.on("tab-weights", "click", goWeights);
  screens.on("hub-workout-tile", "click", goWorkout);
  screens.on("hub-weights-tile", "click", goWeights);
  screens.on("hub-history-tile", "click", goHistory);

  // Экран «Тренировка» — те же обработчики, что раньше висели на today
  // (measure-tile/today-pullup-tile), перевешаны на переехавшие id.
  screens.on("workout-measure-tile", "click", () => guarded(() => onStartStrength("T")));
  screens.on("workout-boost-tile", "click", () => guarded(() => state.boostDay && onStartStrength(state.boostDay)));
  screens.on("workout-pullup-tile", "click", () => guarded(onWorkoutPullupTap));
  screens.on("workout-resume-tile", "click", () => guarded(onResume));

  screens.on("history-export", "click", () => guarded(onExport));
  screens.on("history-import", "click", screens.openFilePicker);
  screens.onFilePicked((file) => guarded(() => onImportPick(file)));

  screens.on("session-pullup-max", "click", () => guarded(onPullupMaxTap));
  screens.on("session-submit", "click", () => guarded(onSubmit));
  screens.onInputEnter("session-input", () => guarded(onSubmit));
  screens.on("session-same", "click", () => guarded(onSame));
  screens.on("session-skip", "click", () => guarded(onSkip));
  screens.on("session-back", "click", () => guarded(onBack));
  screens.on("session-forward", "click", () => guarded(onForward));

  // Таймер отдыха ничего не пишет в БД — без guarded (иначе тап блокировался
  // бы, пока идёт запись подхода).
  screens.on("btn-rest-1", "click", () => startTimer(60));
  screens.on("btn-rest-90", "click", () => startTimer(90));
  screens.on("session-timer", "click", () => startTimer(state.timer.durationSec));

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

  screens.on("weights-screen-btn", "click", onWeighScreenBtn);
  screens.on("weights-manual-btn", "click", onWeighManual);
  screens.onWeightsFilePicked((files) => guarded(async () => { await onWeighFilesPicked(files); screens.resetWeightsFileInput(); }));
  screens.on("weights-draft-save", "click", () => guarded(onWeighDraftSave));
  screens.on("weights-draft-delete", "click", () => guarded(onWeighDraftDelete));
  screens.on("weights-draft-cancel", "click", onWeighDraftCancel);
  screens.on("weights-bodycomp-tile", "click", goBodycomp);
  screens.on("bodycomp-back", "click", goWeights);
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
  if (params.get("screen") === "food-demo") {
    renderDemoFood();
    return;
  }
  if (params.get("screen") === "weights-demo") {
    renderDemoWeights();
    return;
  }
  if (params.get("screen") === "bodycomp-demo") {
    state.weights = [
      { id: 1, date: "2026-06-16", weight: 86.7, fatPct: 26.4, subFatPct: 17.7, visceral: 10.1, waterPct: 51.0, musclePct: 69.2, muscleKg: 59.4, skeletalPct: 50.9, proteinPct: 18.9, boneKg: 3.32, leanKg: 63.4, bmrKcal: 1815, bmi: 26.4, bioAge: 39, source: "screen" },
      { id: 2, date: "2026-06-23", weight: 86.1, fatPct: 26.1, subFatPct: 17.4, visceral: 9.8, waterPct: 51.2, musclePct: 69.5, muscleKg: 59.5, skeletalPct: 51.0, proteinPct: 19.0, boneKg: 3.32, leanKg: 63.4, bmrKcal: 1810, bmi: 26.2, bioAge: 39, source: "screen" },
      { id: 3, date: "2026-06-30", weight: 85.4, fatPct: 25.6, subFatPct: 17.1, visceral: 9.6, waterPct: 51.5, musclePct: 69.8, muscleKg: 59.6, skeletalPct: 51.2, proteinPct: 19.1, boneKg: 3.33, leanKg: 63.6, bmrKcal: 1804, bmi: 26.0, bioAge: 38, source: "screen" },
    ];
    goBodycomp();
    return;
  }
  if (params.get("screen") === "hub-demo") {
    renderDemoHub();
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
  state.weights = await store.getAllWeights();

  // Записи в базу до показа первого экрана. Если упадут — приложение всё равно
  // должно открыться: обе уборки не критичны для «Сегодня», а повторятся при
  // следующем запуске.
  try {
    await dropGhostSessions();
    await normalizeLegacySkips();
  } catch (e) {
    console.warn("Не удалось прибраться в базе при старте — приложение работает, попробуем при следующем запуске.", e);
  }

  goToday();

  if ("caches" in window) {
    try {
      const v = latestCacheVersion(await caches.keys());
      screens.renderVersion(v);
    } catch {
      // Не удалось определить версию кэша — просто не показываем значок.
    }
  }
}

init();
