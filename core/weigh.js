// Ядро модуля «Взвешивание»: промпт для распознавания скрина умных весов,
// разбор ответа, сортировка/дельты. Чистые функции; арифметику считает код.

// Описатель показателей состава тела — единый источник для промпта, разбора,
// карточки-черновика и экрана «Состав тела». decimals 1 = округление до 0,1;
// 0 = целое. direction — куда «хорошо» двигаться; neutral — метка всегда серая.
// Порядок BODYCOMP_METRICS = порядок строк экрана (спека, раздел 4).
export const METRICS = [
  { key: "weight",      jsonKey: "weight_kg",    label: "Вес",                   unit: "кг",   decimals: 1, direction: "down" },
  { key: "fatPct",      jsonKey: "fat_pct",      label: "Жир",                   unit: "%",    decimals: 1, direction: "down" },
  { key: "subFatPct",   jsonKey: "sub_fat_pct",  label: "Подкожный жир",         unit: "%",    decimals: 1, direction: "down" },
  { key: "visceral",    jsonKey: "visceral",     label: "Висцеральный жир",      unit: "",     decimals: 1, direction: "down" },
  { key: "waterPct",    jsonKey: "water_pct",    label: "Вода",                  unit: "%",    decimals: 1, direction: "up" },
  { key: "musclePct",   jsonKey: "muscle_pct",   label: "Доля мышц",             unit: "%",    decimals: 1, direction: "up" },
  { key: "muscleKg",    jsonKey: "muscle_kg",    label: "Мышечная масса",        unit: "кг",   decimals: 1, direction: "up" },
  { key: "skeletalPct", jsonKey: "skeletal_pct", label: "Скелетные мышцы",       unit: "%",    decimals: 1, direction: "up" },
  { key: "proteinPct",  jsonKey: "protein_pct",  label: "Белок",                 unit: "%",    decimals: 1, direction: "up" },
  { key: "boneKg",      jsonKey: "bone_kg",      label: "Костная масса",         unit: "кг",   decimals: 1, direction: "neutral" },
  { key: "leanKg",      jsonKey: "lean_kg",      label: "Масса без жира",        unit: "кг",   decimals: 1, direction: "up" },
  { key: "bmrKcal",     jsonKey: "bmr_kcal",     label: "Базовый расход",        unit: "ккал", decimals: 0, direction: "neutral" },
  { key: "bmi",         jsonKey: "bmi",          label: "ИМТ",                   unit: "",     decimals: 1, direction: "down" },
  { key: "bioAge",      jsonKey: "bio_age",      label: "Биологический возраст", unit: "",     decimals: 0, direction: "down" },
];
export const BODYCOMP_METRICS = METRICS.filter((m) => m.key !== "weight");

export function buildWeighPrompt() {
  return `На изображениях — экраны приложения умных весов (вес и состав тела).
Верни СТРОГО один JSON-объект без пояснений до и после, со всеми ключами:
{"weight_kg":число,"bmi":число или null,"fat_pct":число или null,"sub_fat_pct":число или null,"visceral":число или null,"water_pct":число или null,"muscle_pct":число или null,"muscle_kg":число или null,"skeletal_pct":число или null,"bone_kg":число или null,"lean_kg":число или null,"protein_pct":число или null,"bmr_kcal":число или null,"bio_age":число или null}
Соответствие ключей подписям на экране: weight_kg — «Вес» (кг); bmi — «ИМТ»; fat_pct — «Процент жира» (%); sub_fat_pct — «Подкожный жир» (%); visceral — «Висцеральный жир»; water_pct — «Вода в организме» (%); muscle_pct — «Доля мышц в теле» (%); muscle_kg — «Мышечная масса» (кг); skeletal_pct — «Доля скелетных мышц» (%); bone_kg — «Костная масса» (кг); lean_kg — «Масса тела без жира» (кг); protein_pct — «Уровень белка» (%); bmr_kcal — «Базовый расход калорий» (ккал); bio_age — «Биологический возраст».
Не путай три «мышечных» показателя: muscle_pct — процент мышц в теле, muscle_kg — масса в килограммах, skeletal_pct — отдельный процент СКЕЛЕТНЫХ мышц.
Если значения нет на изображениях — null. Если это не экран весов, верни {"weight_kg":null}.`;
}

// Округление под точность показателя; не-число → null.
export function roundTo(v, decimals) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const k = decimals === 0 ? 1 : 10;
  return Math.round(n * k) / k;
}

export function parseWeighResponse(text) {
  const m = String(text ?? "").match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Не удалось разобрать ответ распознавания. Попробуй ещё раз.");
  let obj;
  try { obj = JSON.parse(m[0]); } catch { throw new Error("Не удалось разобрать ответ распознавания. Попробуй ещё раз."); }
  if (obj && obj.weight_kg === null) throw new Error("Не похоже на экран весов — попробуй другой скрин или введи вручную.");
  const out = {};
  for (const mm of METRICS) out[mm.key] = obj[mm.jsonKey] == null ? null : roundTo(obj[mm.jsonKey], mm.decimals);
  if (out.weight == null || out.weight <= 0) throw new Error("Не удалось разобрать ответ распознавания. Попробуй ещё раз.");
  if (out.weight < 20 || out.weight > 400) throw new Error("Распознанный вес выглядит неправдоподобно — проверь скрин или введи вручную.");
  return out;
}

export function sortedByDateDesc(entries) {
  return entries.slice().sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.id - a.id));
}

export function latestWeigh(entries) {
  return sortedByDateDesc(entries)[0] ?? null;
}

export function weighDeltas(entries) {
  const s = sortedByDateDesc(entries);
  if (s.length < 2) return null;
  const [last, prev] = s;
  const d = (a, b) => (a == null || b == null ? null : Math.round((a - b) * 10) / 10);
  return { weight: d(last.weight, prev.weight), fatPct: d(last.fatPct, prev.fatPct) };
}

export function daysSince(dateISO, todayISO) {
  return Math.round((Date.parse(todayISO) - Date.parse(dateISO)) / 86400000);
}

// Последние n НЕПУСТЫХ значений показателя по датам, старое → новое.
export function metricHistory(entries, key, n = 3) {
  const vals = sortedByDateDesc(entries).map((e) => e[key]).filter((v) => v != null);
  return vals.slice(0, n).reverse();
}

// Последнее непустое минус предыдущее непустое; null, если значений меньше двух.
export function metricDelta(entries, key) {
  const vals = sortedByDateDesc(entries).map((e) => e[key]).filter((v) => v != null);
  if (vals.length < 2) return null;
  const metric = METRICS.find((m) => m.key === key);
  return roundTo(vals[0] - vals[1], metric ? metric.decimals : 1);
}

// Тон метки изменения: движение в нужную сторону — good, в плохую — bad;
// нейтральные показатели, ноль и отсутствие дельты — neutral (серая).
export function deltaTone(key, delta) {
  const metric = METRICS.find((m) => m.key === key);
  if (delta == null || delta === 0 || !metric || metric.direction === "neutral") return "neutral";
  return (delta < 0) === (metric.direction === "down") ? "good" : "bad";
}

// Разбор полей карточки-черновика (значения — строки из инпутов, ключи из METRICS).
// Пробел не должен молча стать нулём через Number(" ") === 0 — сначала trim.
export function parseWeighDraft(raw) {
  if (String(raw.weight ?? "").trim() === "") return { ok: false, error: "Введи вес." };
  const weight = roundTo(raw.weight, 1);
  if (weight == null || weight <= 0 || weight > 400) return { ok: false, error: "Вес должен быть числом больше 0 и не больше 400 кг." };
  const values = { weight };
  for (const m of METRICS) {
    if (m.key === "weight") continue;
    const s = String(raw[m.key] ?? "").trim();
    if (s === "") { values[m.key] = null; continue; }
    const v = roundTo(s, m.decimals);
    if (v == null) return { ok: false, error: `«${m.label}» — должно быть числом.` };
    values[m.key] = v;
  }
  return { ok: true, values };
}
