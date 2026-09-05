// DOM-рендеринг. Никакой бизнес-логики, никаких вызовов core/* или store.js —
// только готовые данные (view-model) на входе и манипуляции с DOM внутри.
// Вся работа с document живёт здесь; app.js эту функцию (screens.on/…) не обходит.
// Исключение — METRICS: это данные-описатель (порядок/подписи полей), а не логика.

import { METRICS } from "../core/weigh.js";

const $ = (id) => document.getElementById(id);

const SCREEN_IDS = ["today", "history", "session", "done", "run", "food", "workout", "weights", "bodycomp"];

// Экраны-разделы: на них постоянно видна нижняя панель вкладок. Остальные —
// фокус-режимы (сессия, итоги, бег) — панель прячут, чтобы
// случайный тап не выбил из записи подхода (дизайн_v7, раздел 1).
const TAB_SCREENS = ["today", "workout", "food", "weights", "history", "bodycomp"];

export function showScreen(name) {
  for (const s of SCREEN_IDS) $(`screen-${s}`).hidden = s !== name;
  const isTabScreen = TAB_SCREENS.includes(name);
  $("tabbar").hidden = !isTabScreen;
  document.body.classList.toggle("no-tabbar", !isTabScreen);
  document.body.classList.toggle("session-mode", name === "session");
  if (name !== "session") {
    $("session-technique").hidden = true;
    $("session-effort").hidden = true;
  }
}

// active: "today" | "workout" | "food" | "weights" | null (напр. на экране
// «История» — она не вкладка, подсветки нет).
export function renderTabbar(active) {
  for (const t of ["today", "workout", "food", "weights"]) {
    $(`tab-${t}`).classList.toggle("on", t === active);
  }
}

export function on(id, event, handler) {
  $(id).addEventListener(event, handler);
}

export function onInputEnter(id, handler) {
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") handler();
  });
}

export function getSessionInput() {
  return $("session-input").value;
}

export function getRunInput() {
  return $("run-input").value;
}

function renderFlash(el, flash) {
  if (!flash) {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("danger");
    return;
  }
  el.hidden = false;
  el.textContent = `${flash.icon} ${flash.text}`;
  el.classList.toggle("danger", !!flash.danger);
}

// ---------- Сегодня (хаб) ----------

export function renderToday({ resumeLabel, backupLabel, workoutSub, weightsSub, weightsAccent }) {
  const resumeTile = $("resume-tile");
  if (resumeLabel) {
    resumeTile.textContent = resumeLabel;
    resumeTile.hidden = false;
  } else {
    resumeTile.hidden = true;
    resumeTile.textContent = "";
  }

  const backup = $("backup-tile");
  backup.hidden = !backupLabel;
  if (backupLabel) backup.textContent = backupLabel;

  $("hub-workout-sub").textContent = workoutSub ?? "";
  $("hub-weights-sub").textContent = weightsSub ?? "";
  $("hub-weights-tile").classList.toggle("accent", !!weightsAccent);
}

export function renderHabits({ items, done, total }) {
  $("habits-count").textContent = `${done} из ${total}`;
  $("habits-summary").textContent = done === total
    ? "Все выполнено — день закрыт"
    : done === 0 ? "Отмечай одним нажатием" : `Осталось: ${total - done}`;
  $("habits-progress-fill").style.width = `${total > 0 ? Math.round((done / total) * 100) : 0}%`;

  const list = document.querySelector(".habits-list");
  for (const item of items) {
    const row = $(`habit-${item.id}`);
    row.classList.toggle("done", item.done);
    row.setAttribute("aria-pressed", String(item.done));
    row.querySelector(".habit-check").textContent = item.done ? "✓" : "";
    list.appendChild(row);
  }
}

export function renderFocusWidgetSettings({ connected, gistId, busy, status, error }) {
  $("focus-widget-disconnected").hidden = connected;
  $("focus-widget-connected").hidden = !connected;
  $("focus-widget-gist-id").value = gistId ?? "";

  const connect = $("focus-widget-connect");
  connect.disabled = !!busy;
  connect.textContent = busy ? "Подключаю…" : "Подключить виджет";

  const statusEl = $("focus-widget-status");
  statusEl.hidden = !status;
  statusEl.textContent = status ?? "";

  const errorEl = $("focus-widget-error");
  errorEl.hidden = !error;
  errorEl.textContent = error ?? "";
}

export function renderFocusViewerNotice({ stale = false, error = "" } = {}) {
  document.body.classList.add("focus-viewer");
  $("focus-widget-settings").hidden = true;
  const notice = $("focus-viewer-notice");
  notice.hidden = false;
  notice.textContent = error
    ? `${error} Открой «Тренер» с иконки приложения для отметок.`
    : stale
      ? "Показаны данные последнего дня. Для сегодняшних отметок открой «Тренер» с иконки приложения."
      : "Это просмотр из виджета. Для отметки фокуса открой «Тренер» с иконки приложения.";
}

export function getFocusWidgetToken() {
  return $("focus-widget-token").value.trim();
}

export function clearFocusWidgetToken() {
  $("focus-widget-token").value = "";
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = $("focus-widget-gist-id");
  input.focus();
  input.select();
  if (!document.execCommand("copy")) throw new Error("copy failed");
}

export function showTodayError(msg) {
  const el = $("today-error");
  if (msg) {
    el.textContent = msg;
    el.hidden = false;
  } else {
    el.hidden = true;
    el.textContent = "";
  }
}

// ---------- Тренировка ----------

export function renderWorkout({ hint, programTitle, weekLabel, dayLabels, cardioLabel, todayDay, resumeLabel, measureLabel, boostLabel, pullupLabel }) {
  $("workout-program").textContent = programTitle ?? "План на сегодня";
  $("workout-title").textContent = hint;
  $("workout-week").textContent = weekLabel;
  $("workout-pullup-value").textContent = pullupLabel ?? "";

  const resumeTile = $("workout-resume-tile");
  if (resumeLabel) {
    resumeTile.textContent = resumeLabel;
    resumeTile.hidden = false;
  } else {
    resumeTile.hidden = true;
    resumeTile.textContent = "";
  }

  const measure = $("workout-measure-tile");
  measure.hidden = !measureLabel;
  if (measureLabel) measure.textContent = measureLabel;

  const boost = $("workout-boost-tile");
  boost.hidden = !boostLabel;
  boost.textContent = boostLabel ?? "";

  for (const day of ["A", "B", "C"]) {
    const button = $(`btn-day-${day.toLowerCase()}`);
    button.textContent = dayLabels?.[day] ?? `Силовая ${day}`;
    button.classList.toggle("btn-accent", todayDay === day);
  }
  $("btn-run").textContent = cardioLabel ?? "Бег 🏃";
  $("btn-run").classList.toggle("btn-accent", todayDay === null);
}

export function showWorkoutError(msg) {
  const el = $("workout-error");
  if (msg) {
    el.textContent = msg;
    el.hidden = false;
  } else {
    el.hidden = true;
    el.textContent = "";
  }
}

// ---------- История ----------

function renderHistoryItem(list, item, handlers) {
  const tile = document.createElement("div");
  tile.className = "card card-btn history-tile";

  const title = document.createElement("div");
  title.className = "history-title";
  title.textContent = item.title;
  tile.appendChild(title);

  const sub = document.createElement("div");
  sub.className = "history-sub";
  sub.textContent = item.subLabel;
  tile.appendChild(sub);

  if (item.note) {
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = item.note;
    tile.appendChild(note);
  }

  if (item.expanded) {
    const details = document.createElement("div");
    details.className = "history-details";
    if (item.noSets) {
      const empty = document.createElement("div");
      empty.className = "note";
      empty.textContent = "подходов нет";
      details.appendChild(empty);
      if (item.canDelete) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn btn-danger";
        del.textContent = "🗑 Удалить пустую сессию";
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          handlers.onDeleteSession(item.id);
        });
        details.appendChild(del);
      }
    } else {
      for (const line of item.lines) {
        const row = document.createElement("div");
        row.className = "history-line";
        row.classList.toggle("pain", !!line.pain);
        row.classList.toggle("skipped", !!line.skipped);
        const txt = document.createElement("span");
        txt.textContent = line.text;
        row.appendChild(txt);
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "line-edit";
        edit.textContent = "✏️";
        edit.addEventListener("click", (e) => {
          e.stopPropagation();
          handlers.onEditOpen(item.id, line.exercise);
        });
        row.appendChild(edit);
        details.appendChild(row);

        if (item.editExercise === line.exercise) {
          const editor = document.createElement("div");
          editor.className = "input-row";
          const input = document.createElement("input");
          input.type = "text";
          input.inputMode = "text";
          input.id = "history-edit-input";
          input.placeholder = "напр. 50-5,5,5 или 50-5 52-5";
          input.addEventListener("click", (e) => e.stopPropagation());
          editor.appendChild(input);
          const okBtn = document.createElement("button");
          okBtn.type = "button";
          okBtn.className = "btn btn-accent";
          okBtn.textContent = "Заменить";
          okBtn.addEventListener("click", (e) => { e.stopPropagation(); handlers.onEditSubmit(input.value); });
          editor.appendChild(okBtn);
          const cancel = document.createElement("button");
          cancel.type = "button";
          cancel.className = "btn";
          cancel.textContent = "Отмена";
          cancel.addEventListener("click", (e) => { e.stopPropagation(); handlers.onEditCancel(); });
          editor.appendChild(cancel);
          details.appendChild(editor);
          const err = document.createElement("div");
          err.className = "error";
          err.id = "history-edit-error";
          err.hidden = true;
          details.appendChild(err);
        }
      }
    }
    tile.appendChild(details);
  }

  tile.addEventListener("click", () => handlers.onToggle(item.id));
  list.appendChild(tile);
}

export function renderHistory(vm, handlers) {
  const list = $("history-list");
  list.textContent = "";

  if (vm.items.length === 0) {
    const card = document.createElement("div");
    card.className = "card";
    const p = document.createElement("p");
    p.textContent = "Пока пусто — начни первую тренировку 💪";
    card.appendChild(p);
    list.appendChild(card);
  } else {
    for (const item of vm.items) renderHistoryItem(list, item, handlers);
  }

  renderFlash($("history-flash"), vm.flash);
}

export function showHistoryEditError(msg) {
  const el = document.getElementById("history-edit-error");
  if (!el) return;
  el.textContent = msg || "";
  el.hidden = !msg;
}

export function showHistoryError(msg) {
  const el = $("history-error");
  if (msg) {
    el.textContent = msg;
    el.hidden = false;
  } else {
    el.hidden = true;
    el.textContent = "";
  }
}

// ---------- Бэкап ----------

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function openFilePicker() {
  $("history-file-input").click();
}

export function onFilePicked(handler) {
  $("history-file-input").addEventListener("change", (e) => {
    handler(e.target.files[0] || null);
  });
}

export function resetFileInput() {
  $("history-file-input").value = "";
}

// ---------- Сессия ----------

export function renderSession(vm, onStripTap) {
  renderStrip(vm.strip, onStripTap);
  $("session-step").textContent = vm.stepLabel;
  $("session-pill").textContent = vm.pillLabel;

  $("session-exercise").textContent = vm.exercise;
  renderSessionTechnique(vm);
  const schemeWrap = $("session-scheme");
  schemeWrap.textContent = "";
  const schemeParts = vm.schemeParts ?? (vm.schemeLine || "").split(" · ").filter(Boolean);
  for (const text of schemeParts) {
    const chip = document.createElement("span");
    chip.className = "session-scheme-chip";
    chip.textContent = text;
    schemeWrap.appendChild(chip);
  }

  const formatEl = $("session-format");
  if (vm.dayBrief) {
    formatEl.textContent = vm.dayBrief;
    formatEl.hidden = false;
  } else {
    formatEl.textContent = "";
    formatEl.hidden = true;
  }

  const noteEl = $("session-note");
  if (vm.note) {
    noteEl.textContent = vm.note;
    noteEl.hidden = false;
  } else {
    noteEl.hidden = true;
    noteEl.textContent = "";
  }

  const lastDate = $("session-last-date");
  lastDate.textContent = vm.lastDateLabel ?? "";
  lastDate.hidden = !vm.lastDateLabel;

  const lastValue = $("session-last-value");
  lastValue.textContent = "";
  const lastSetLabels = vm.lastSetLabels ?? (
    vm.lastSetsText && vm.lastSetsText !== "—"
      ? vm.lastSetsText.split(" · ")
      : []
  );
  if (lastSetLabels.length === 0) {
    const empty = document.createElement("span");
    empty.className = "session-last-empty";
    empty.textContent = "—";
    lastValue.appendChild(empty);
  } else {
    for (const text of lastSetLabels) {
      const chip = document.createElement("span");
      chip.className = "session-set-chip";
      chip.textContent = text;
      lastValue.appendChild(chip);
    }
  }

  const lastComment = $("session-last-comment");
  if (vm.lastComment) {
    lastComment.textContent = `На следующий раз: ${vm.lastComment}`;
    lastComment.hidden = false;
  } else {
    lastComment.textContent = "";
    lastComment.hidden = true;
  }

  const pm = $("session-pullup-max");
  pm.hidden = vm.pullupMaxLabel == null;
  if (vm.pullupMaxLabel != null) $("session-pullup-max-value").textContent = vm.pullupMaxLabel;

  $("session-input").value = "";
  $("session-input").placeholder = vm.inputPlaceholder ?? "напр. 50-5,5,5 или 50-5 52-5";
  showSessionError("");

  $("session-same").disabled = vm.sameDisabled;

  const recWrap = $("session-recorded");
  if (vm.recordedText != null) {
    $("session-recorded-value").textContent = vm.recordedText;
    recWrap.hidden = false;
  } else {
    recWrap.hidden = true;
  }
  $("session-back").disabled = false;
  $("session-back").textContent = vm.backLabel ?? "← назад";
  $("session-forward").disabled = !!vm.forwardDisabled;
  // Шаг 8: режимы «просмотр»/«предпросмотр» удалены — запись доступна на любом
  // упражнении, поэтому ввод и действия больше никогда не прячутся.
  $("session-same").hidden = false;
  $("session-input-row").hidden = false;
  $("session-actions").hidden = false;

  renderFlash($("session-flash"), vm.flash);
}

function fillList(list, items) {
  list.textContent = "";
  for (const text of items ?? []) {
    const row = document.createElement("li");
    row.textContent = text;
    list.appendChild(row);
  }
}

function renderSessionTechnique(vm) {
  const img = $("session-technique-img");
  if (vm.techniqueImg) {
    img.src = vm.techniqueImg;
    img.alt = `Техника: ${vm.exercise}`;
    img.hidden = false;
  } else {
    img.removeAttribute("src");
    img.alt = "";
    img.hidden = true;
  }

  const guide = vm.techniqueGuide;
  const copy = $("session-technique-copy");
  copy.hidden = !guide;
  if (guide) {
    fillList($("session-technique-steps"), guide.steps);
    $("session-technique-focus").textContent = guide.focus ?? "";
    fillList($("session-technique-mistakes"), guide.mistakes);

    const safety = $("session-technique-safety");
    safety.hidden = !guide.safety;
    safety.textContent = guide.safety ? `Безопасность: ${guide.safety}` : "";

    const link = $("session-technique-link");
    link.hidden = !guide.link;
    if (guide.link) {
      link.href = guide.link.url;
      link.textContent = `${guide.link.label} ↗`;
    } else {
      link.removeAttribute("href");
      link.textContent = "";
    }
  }

  $("session-technique-title").textContent = `Техника: ${vm.exercise}`;
  $("session-technique-open").hidden = !vm.techniqueImg && !guide;
  $("session-technique").hidden = true;
}

export function showSessionTechnique(open) {
  const overlay = $("session-technique");
  const trigger = $("session-technique-open");
  if (open && trigger.hidden) return;
  overlay.hidden = !open;
  if (open) $("session-technique-sheet").focus();
  else trigger.focus();
}

let sessionEffortSelection = null;

export function initSessionEffortGrid() {
  const grid = $("session-effort-grid");
  grid.textContent = "";
  for (let n = 1; n <= 10; n++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "effort-button";
    btn.textContent = String(n);
    btn.setAttribute("aria-label", `Фактическое усилие ${n} из 10`);
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => {
      sessionEffortSelection = n;
      for (const item of grid.children) {
        const selected = item === btn;
        item.classList.toggle("selected", selected);
        item.setAttribute("aria-pressed", String(selected));
      }
      $("session-effort-save").disabled = false;
    });
    grid.appendChild(btn);
  }
}

export function showSessionEffort(vm) {
  const overlay = $("session-effort");
  if (!vm) {
    // Снимаем фокус до скрытия textarea: iOS Safari иначе иногда
    // сохраняет увеличенный visual viewport на следующем упражнении.
    if (document.activeElement instanceof HTMLElement && overlay.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    overlay.hidden = true;
    return;
  }
  $("session-effort-exercise").textContent = vm.exercise;
  $("session-effort-comment").value = vm.comment ?? "";
  sessionEffortSelection = null;
  for (const item of $("session-effort-grid").children) {
    item.classList.remove("selected");
    item.setAttribute("aria-pressed", "false");
  }
  $("session-effort-save").disabled = true;
  overlay.hidden = false;
  $("session-effort-sheet").focus();
}

export function getSessionEffortComment() {
  return $("session-effort-comment").value;
}

export function getSessionEffortSelection() {
  return sessionEffortSelection;
}

function renderStrip(strip, onStripTap) {
  const wrap = $("session-strip");
  const items = strip ?? [];
  wrap.textContent = "";
  wrap.hidden = items.length === 0;
  items.forEach((it, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = it.here ? "dot here" : `dot st-${it.status}`;
    b.setAttribute("aria-label", `${it.label}: ${it.here ? "текущее" : STRIP_STATUS_LABEL[it.status]}`);
    const icon = document.createElement("span");
    icon.className = "dot-icon";
    icon.textContent = it.here ? "●" : STRIP_ICON[it.status];
    const name = document.createElement("span");
    name.className = "dot-name";
    name.textContent = it.label;
    b.appendChild(icon);
    b.appendChild(name);
    if (onStripTap) b.addEventListener("click", () => onStripTap(i));
    wrap.appendChild(b);
  });
}

const STRIP_ICON = { done: "✓", skipped: "⏭", pain: "🚑", todo: "○" };
const STRIP_STATUS_LABEL = { done: "выполнено", skipped: "пропущено", pain: "боль", todo: "не выполнено" };

export function renderTimer(state) {
  const tile = $("session-timer");
  if (!state) return;
  tile.classList.toggle("done", state.done);
  $("session-timer-label").textContent = state.label;
  $("session-timer-value").textContent = state.text;
  tile.setAttribute("aria-label", state.ariaLabel);

  const presetButtons = [$("btn-rest-a"), $("btn-rest-b"), $("btn-rest-c")];
  for (const [index, durationSec] of (state.presetDurations ?? []).entries()) {
    const button = presetButtons[index];
    if (!button) break;
    const text = `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, "0")}`;
    button.textContent = text;
    button.dataset.duration = String(durationSec);
    button.setAttribute("aria-label", `Запустить таймер отдыха на ${text}`);
  }

  // Один новый CSS-импульс на каждый порог. На 5→4→3→2→1 класс формально
  // остаётся тем же, поэтому принудительно перезапускаем animation только при
  // смене секунды; повторный тик внутри той же секунды ничего не делает.
  const alertKey = state.alertSecond == null ? "" : String(state.alertSecond);
  if (tile.dataset.alertSecond !== alertKey) {
    tile.classList.remove("alerting");
    if (alertKey) {
      void tile.offsetWidth;
      tile.classList.add("alerting");
    }
    tile.dataset.alertSecond = alertKey;
  }
}

export function showSessionError(msg) {
  const el = $("session-error");
  if (msg) {
    el.textContent = msg;
    el.hidden = false;
  } else {
    el.hidden = true;
    el.textContent = "";
  }
}

// ---------- Итоги силовой ----------

export function renderDone(vm) {
  $("done-eyebrow").textContent = vm.eyebrow;
  $("done-summary").textContent = vm.summary;
  const list = $("done-list");
  list.textContent = "";
  for (const item of vm.items) {
    const row = document.createElement("div");
    row.className = `done-row done-${item.status}`;
    const copy = document.createElement("div");
    copy.className = "done-row-copy";
    const name = document.createElement("strong");
    name.textContent = item.exercise;
    const result = document.createElement("span");
    result.textContent = item.result;
    copy.appendChild(name);
    copy.appendChild(result);
    row.appendChild(copy);
    if (item.note) {
      const note = document.createElement("div");
      note.className = "done-row-note";
      note.textContent = `На следующий раз: ${item.note}`;
      row.appendChild(note);
    }
    list.appendChild(row);
  }
}

// ---------- Бег ----------

export function renderRun({ title, guidance, placeholder } = {}) {
  $("run-title").textContent = title ?? "Пробежка записана 🏃";
  $("run-guidance").textContent = guidance ?? "";
  $("run-guidance").hidden = !guidance;
  $("run-input").placeholder = placeholder ?? "напр. 5 км, 30 мин";
  $("run-input").value = "";
}

// ---------- Еда ----------

export function renderFoodTile(label) {
  $("food-tile").textContent = label;
}

export function renderFood(vm, handlers) {
  const t = vm.totals;
  $("food-totals-kcal").textContent = `${t.kcal} / ${t.kcalGoal} ккал`;
  $("food-totals-protein").textContent = `белок ${t.protein} / ${t.proteinGoal} г`;
  const pct = (v, goal) => `${Math.min(100, Math.round((v / goal) * 100))}%`;
  $("food-bar-kcal").style.width = pct(t.kcal, t.kcalGoal);
  $("food-bar-kcal").classList.toggle("over", t.kcal > t.kcalGoal);
  $("food-bar-protein").style.width = pct(t.protein, t.proteinGoal);

  const pending = $("food-pending-tile");
  pending.hidden = vm.pendingCount === 0;
  if (vm.pendingCount > 0) pending.textContent = `⏳ Ждут сети: ${vm.pendingCount} — распознать`;

  $("food-busy").hidden = !vm.busy;

  const draft = $("food-draft");
  draft.hidden = !vm.draft;
  if (vm.draft) {
    $("food-draft-name").value = vm.draft.name;
    $("food-draft-kcal").value = vm.draft.kcal;
    $("food-draft-protein").value = vm.draft.protein;
    $("food-portion-row").hidden = !!vm.draft.isEdit;
    $("food-draft-delete").hidden = !vm.draft.isEdit;
    for (const [id, f] of [["food-portion-half", 0.5], ["food-portion-one", 1], ["food-portion-big", 1.5]])
      $(id).classList.toggle("btn-accent", vm.draft.portion === f);
  }

  const list = $("food-list");
  list.textContent = "";
  for (const e of vm.entries) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "card card-btn history-tile";
    const title = document.createElement("div");
    title.className = "history-title";
    title.textContent = e.label;
    tile.appendChild(title);
    const sub = document.createElement("div");
    sub.className = "history-sub";
    sub.textContent = e.sub;
    tile.appendChild(sub);
    if (!e.pending) tile.addEventListener("click", () => handlers.onEntryTap(e.id));
    list.appendChild(tile);
  }

  $("food-text-row").hidden = !vm.textOpen;
  const st = $("food-settings");
  st.hidden = !vm.settings;
  if (vm.settings) {
    $("food-key-input").value = "";
    $("food-key-input").placeholder = vm.settings.hasKey ? "Ключ сохранён — ввести новый?" : "Ключ API (sk-ant-…)";
    $("food-goal-kcal").value = vm.settings.kcalGoal;
    $("food-goal-protein").value = vm.settings.proteinGoal;
  }

  renderFlash($("food-flash"), vm.flash);
}

export function getFoodTextInput() { return $("food-text-input").value; }

export function getFoodDraftFields() {
  return { name: $("food-draft-name").value, kcal: $("food-draft-kcal").value, protein: $("food-draft-protein").value };
}

export function getFoodSettings() {
  return { apiKey: $("food-key-input").value.trim(), kcalGoal: $("food-goal-kcal").value, proteinGoal: $("food-goal-protein").value };
}

export function showFoodError(msg) {
  const el = $("food-error");
  el.textContent = msg || "";
  el.hidden = !msg;
}

// ---------- Версия приложения ----------

export function renderVersion(text) {
  const el = $("app-version");
  if (text) {
    el.textContent = text;
    el.hidden = false;
  } else {
    el.hidden = true;
    el.textContent = "";
  }
}

export function openFoodFilePicker() { $("food-file-input").click(); }
export function onFoodFilePicked(handler) {
  $("food-file-input").addEventListener("change", (e) => handler(e.target.files[0] || null));
}
export function resetFoodFileInput() { $("food-file-input").value = ""; }

// ---------- Взвешивание (дизайн_v7_хаб_и_взвешивание.md, раздел 2) ----------

export function renderWeights(vm, handlers) {
  const latestVal = $("weights-latest-value");
  const latestSub = $("weights-latest-sub");
  if (vm.latest) {
    latestVal.textContent = vm.latest.value;
    latestSub.textContent = vm.latest.sub;
  } else {
    latestVal.textContent = "—";
    latestSub.textContent = "Замеров ещё нет";
  }

  const tile = $("weights-bodycomp-tile");
  tile.hidden = !vm.bodycomp;
  if (vm.bodycomp) $("weights-bodycomp-sub").textContent = vm.bodycomp.sub;

  $("weights-busy").hidden = !vm.busy;

  const draft = $("weights-draft");
  draft.hidden = !vm.draft;
  if (vm.draft) {
    for (const m of METRICS) $(`wd-${m.key}`).value = vm.draft.values[m.key] ?? "";
    $("weights-draft-delete").hidden = !vm.draft.isEdit;
  }

  const list = $("weights-list");
  list.textContent = "";
  for (const e of vm.entries) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "card card-btn history-tile";
    const title = document.createElement("div");
    title.className = "history-title";
    title.textContent = e.label;
    tile.appendChild(title);
    const sub = document.createElement("div");
    sub.className = "history-sub";
    sub.textContent = e.sub;
    tile.appendChild(sub);
    tile.addEventListener("click", () => handlers.onEntryTap(e.id));
    list.appendChild(tile);
  }

  renderFlash($("weights-flash"), vm.flash);
}

export function getWeightsDraft() {
  return Object.fromEntries(METRICS.map((m) => [m.key, $(`wd-${m.key}`).value]));
}

export function showWeightsError(msg) {
  const el = $("weights-error");
  el.textContent = msg || "";
  el.hidden = !msg;
}

export function openWeightsFilePicker() { $("weights-file-input").click(); }
export function onWeightsFilePicked(handler) {
  $("weights-file-input").addEventListener("change", (e) => handler(Array.from(e.target.files || [])));
}
export function resetWeightsFileInput() { $("weights-file-input").value = ""; }

// Экран «Состав тела» (шаг 9): 13 строк-показателей с мини-историей и тоном
// изменения. vm.rows = [{ label, hist, value, delta, tone }].
export function renderBodycomp(vm) {
  const card = $("bodycomp-card");
  card.textContent = "";
  for (const r of vm.rows) {
    const row = document.createElement("div");
    row.className = "m-row";
    const name = document.createElement("div");
    name.className = "m-name";
    name.textContent = r.label;
    if (r.hist) {
      const h = document.createElement("span");
      h.className = "m-hist";
      h.textContent = r.hist;
      name.appendChild(h);
    }
    row.appendChild(name);
    const val = document.createElement("div");
    val.className = "m-val";
    val.textContent = r.value;
    row.appendChild(val);
    if (r.delta != null) {
      const d = document.createElement("div");
      d.className = `m-delta ${r.tone}`;
      d.textContent = r.delta;
      row.appendChild(d);
    }
    card.appendChild(row);
  }
}
