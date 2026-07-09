// Ядро модуля «Взвешивание»: промпт для распознавания скрина умных весов,
// разбор ответа, сортировка/дельты. Чистые функции; арифметику считает код.

export function buildWeighPrompt() {
  return `На изображении — экран приложения умных весов (вес, проценты жира/мышц и т.п.).
Верни СТРОГО один JSON-объект без пояснений до и после, вида:
{"weight_kg":число,"fat_pct":число или null,"muscle_kg":число или null}
weight_kg — вес тела в килограммах; fat_pct — процент жира; muscle_kg — мышечная масса в кг.
Если значения нет на экране — null. Если это не экран весов, верни {"weight_kg":null}.`;
}

function num01(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

export function parseWeighResponse(text) {
  const m = String(text ?? "").match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Не удалось разобрать ответ распознавания. Попробуй ещё раз.");
  let obj;
  try { obj = JSON.parse(m[0]); } catch { throw new Error("Не удалось разобрать ответ распознавания. Попробуй ещё раз."); }
  if (obj && obj.weight_kg === null) throw new Error("Не похоже на экран весов — попробуй другой скрин или введи вручную.");
  const weight = num01(obj.weight_kg);
  if (weight == null || weight <= 0) throw new Error("Не удалось разобрать ответ распознавания. Попробуй ещё раз.");
  if (weight < 20 || weight > 400) throw new Error("Распознанный вес выглядит неправдоподобно — проверь скрин или введи вручную.");
  const fatPct = obj.fat_pct == null ? null : num01(obj.fat_pct);
  const muscleKg = obj.muscle_kg == null ? null : num01(obj.muscle_kg);
  return { weight, fatPct, muscleKg };
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
