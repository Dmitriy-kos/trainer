// Фокусы дня — маленький тёмный виджет для Scriptable.
// В параметр виджета вставляется код, который показывает «Тренер».

const GIST_FILENAME = "trainer-focus.json";
const TRAINER_URL = "https://dmitriy-kos.github.io/trainer/";
const CACHE_FILENAME = "trainer-focus-widget-cache.json";

function localDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function canonicalItems() {
  return [
    { id: "fish_oil", icon: "🐟", label: "Рыбий жир", done: false },
    { id: "meditation", icon: "🧘", label: "Медитация", done: false },
    { id: "protein", icon: "🥤", label: "Протеин", done: false },
    { id: "creatine", icon: "⚡", label: "Креатин", done: false },
    { id: "audiobook", icon: "🎧", label: "Книга", done: false },
  ];
}

function shortLabel(item) {
  const found = canonicalItems().find((candidate) => candidate.id === item.id);
  return found ? found.label : item.label;
}

function normalizeSnapshot(value) {
  if (!value || !Array.isArray(value.items)) throw new Error("Повреждены данные");

  // После полуночи вчерашние галочки не переносим. Виджет сразу показывает
  // новый пустой день, даже если «Тренер» ещё не открывали.
  if (value.date !== localDate()) {
    return { date: localDate(), appUrl: value.appUrl || TRAINER_URL, items: canonicalItems() };
  }

  // Миграция v32 → v33: старый Gist содержит четыре строки. Дополняем его
  // «Книгой» как невыполненной, поэтому новый скрипт работает ещё до первого
  // открытия обновлённого PWA. Неизвестные/удалённые строки игнорируем.
  const received = new Map(
    value.items
      .filter((item) => item && typeof item.id === "string")
      .map((item) => [item.id, item]),
  );
  const items = canonicalItems()
    .map((base, order) => {
      const item = received.get(base.id);
      return {
        ...base,
        icon: item && item.icon ? item.icon : base.icon,
        label: base.label,
        done: item ? item.done === true : false,
        order,
      };
    })
    .sort((a, b) => Number(a.done) - Number(b.done) || a.order - b.order);
  return { ...value, items };
}

function cachePath() {
  const files = FileManager.local();
  return files.joinPath(files.documentsDirectory(), CACHE_FILENAME);
}

function saveCache(snapshot) {
  FileManager.local().writeString(cachePath(), JSON.stringify(snapshot));
}

function loadCache() {
  const files = FileManager.local();
  const path = cachePath();
  if (!files.fileExists(path)) return null;
  try {
    return normalizeSnapshot(JSON.parse(files.readString(path)));
  } catch {
    return null;
  }
}

async function loadSnapshot(gistId) {
  const request = new Request(`https://api.github.com/gists/${encodeURIComponent(gistId)}`);
  request.headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const gist = await request.loadJSON();
  const file = gist.files && gist.files[GIST_FILENAME];
  if (!file || typeof file.content !== "string") throw new Error("Нет данных фокусов");
  const snapshot = normalizeSnapshot(JSON.parse(file.content));
  saveCache(snapshot);
  return snapshot;
}

function addHeader(widget, done, total) {
  const header = widget.addStack();
  header.centerAlignContent();
  const title = header.addText("ФОКУС");
  title.font = Font.boldSystemFont(10);
  title.textColor = new Color("#2997FF");
  header.addSpacer();
  const count = header.addText(`${done}/${total}`);
  count.font = Font.boldSystemFont(10);
  count.textColor = done === total ? new Color("#30D158") : new Color("#8E8E93");
}

function addFocusRow(widget, item) {
  const row = widget.addStack();
  row.centerAlignContent();

  const symbol = SFSymbol.named(item.done ? "checkmark.circle.fill" : "circle");
  const check = row.addImage(symbol.image);
  check.imageSize = new Size(15, 15);
  check.tintColor = new Color(item.done ? "#30D158" : "#2997FF");

  row.addSpacer(5);
  const icon = row.addText(item.icon);
  icon.font = Font.systemFont(12);
  row.addSpacer(4);

  const label = row.addText(shortLabel(item));
  label.font = Font.semiboldSystemFont(11);
  label.lineLimit = 1;
  label.minimumScaleFactor = 0.78;
  label.textColor = new Color(item.done ? "#68D982" : "#F2F2F7");
}

function buildWidget(snapshot, note) {
  const widget = new ListWidget();
  widget.backgroundColor = new Color("#0C0D10");
  widget.setPadding(11, 11, 9, 11);
  widget.url = snapshot && snapshot.appUrl ? snapshot.appUrl : TRAINER_URL;
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  if (!snapshot) {
    const title = widget.addText("ФОКУС");
    title.font = Font.boldSystemFont(11);
    title.textColor = new Color("#2997FF");
    widget.addSpacer(10);
    const message = widget.addText(note || "Добавь код виджета");
    message.font = Font.semiboldSystemFont(13);
    message.textColor = new Color("#F2F2F7");
    message.minimumScaleFactor = 0.8;
    return widget;
  }

  const done = snapshot.items.filter((item) => item.done).length;
  addHeader(widget, done, snapshot.items.length);
  widget.addSpacer(5);
  snapshot.items.forEach((item, index) => {
    addFocusRow(widget, item);
    if (index < snapshot.items.length - 1) widget.addSpacer(3);
  });
  if (note) {
    widget.addSpacer(3);
    const status = widget.addText(note);
    status.font = Font.systemFont(7);
    status.textColor = new Color("#636366");
    status.lineLimit = 1;
  }
  return widget;
}

const gistId = String(args.widgetParameter || "").trim();
let snapshot = null;
let note = null;

if (!/^[a-f0-9]+$/i.test(gistId)) {
  note = "Вставь код в параметр";
} else {
  try {
    snapshot = await loadSnapshot(gistId);
  } catch {
    snapshot = loadCache();
    note = snapshot ? "нет сети · сохранённые данные" : "Открой Тренер и проверь код";
  }
}

const widget = buildWidget(snapshot, note);
Script.setWidget(widget);
if (!config.runsInWidget) await widget.presentSmall();
Script.complete();
