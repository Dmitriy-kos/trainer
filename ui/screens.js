// DOM-рендеринг. Никакой бизнес-логики, никаких вызовов core/* или store.js —
// только готовые данные (view-model) на входе и манипуляции с DOM внутри.
// Вся работа с document живёт здесь; app.js эту функцию (screens.on/…) не обходит.

const $ = (id) => document.getElementById(id);

const SCREEN_IDS = ["today", "history", "session", "wellbeing", "done", "run"];

export function showScreen(name) {
  for (const s of SCREEN_IDS) $(`screen-${s}`).hidden = s !== name;
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

// ---------- Сегодня ----------

export function renderToday({ hint, weekLabel, todayDay, resumeLabel }) {
  $("today-title").textContent = hint;
  $("today-week").textContent = weekLabel;

  const resumeTile = $("resume-tile");
  if (resumeLabel) {
    resumeTile.textContent = resumeLabel;
    resumeTile.hidden = false;
  } else {
    resumeTile.hidden = true;
    resumeTile.textContent = "";
  }

  for (const day of ["A", "B", "C"]) {
    $(`btn-day-${day.toLowerCase()}`).classList.toggle("btn-accent", todayDay === day);
  }
  $("btn-run").classList.toggle("btn-accent", todayDay === null);
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
    } else {
      for (const line of item.lines) {
        const row = document.createElement("div");
        row.className = "history-line";
        row.classList.toggle("pain", !!line.pain);
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

export function renderSession(vm) {
  $("session-step").textContent = vm.stepLabel;
  $("session-pill").textContent = vm.pillLabel;

  const img = $("session-technique-img");
  const techniqueWrap = $("session-technique");
  if (vm.techniqueImg) {
    img.src = vm.techniqueImg;
    img.alt = vm.exercise;
    techniqueWrap.hidden = false;
  } else {
    techniqueWrap.hidden = true;
  }

  $("session-exercise").textContent = vm.exercise;
  $("session-scheme").textContent = vm.schemeLine;

  const noteEl = $("session-note");
  if (vm.note) {
    noteEl.textContent = vm.note;
    noteEl.hidden = false;
  } else {
    noteEl.hidden = true;
    noteEl.textContent = "";
  }

  $("session-last-value").textContent = vm.lastSetsText;

  $("session-input").value = "";
  showSessionError("");

  $("session-same").disabled = vm.sameDisabled;

  const recWrap = $("session-recorded");
  if (vm.recordedText != null) {
    $("session-recorded-value").textContent = vm.recordedText;
    recWrap.hidden = false;
  } else {
    recWrap.hidden = true;
  }
  $("session-back").disabled = !vm.canBack;
  $("session-forward").hidden = !vm.isReview;
  $("session-same").hidden = !!vm.isReview;

  renderFlash($("session-flash"), vm.flash);
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

// ---------- Самочувствие ----------

export function initWellbeingGrid(onPick) {
  const grid = $("wellbeing-grid");
  for (let n = 1; n <= 10; n++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.textContent = String(n);
    btn.addEventListener("click", () => onPick(n));
    grid.appendChild(btn);
  }
}

export function renderWellbeing({ flash }) {
  renderFlash($("wellbeing-flash"), flash);
}

// ---------- Сессия закрыта (предупреждение о перетрене) ----------

export function renderDone({ alert }) {
  renderFlash($("done-alert"), alert ? { icon: "⚠️", text: alert, danger: true } : null);
}

// ---------- Бег ----------

export function renderRun() {
  $("run-input").value = "";
}
