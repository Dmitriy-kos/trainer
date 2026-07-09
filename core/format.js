// Порт bot/format.py (+ _scheme_target_reps из handlers). Паритет: tests/test_format.py.
function num(x) {
  if (x == null) return "?";
  // JS String() уже даёт "80" для целых и "82.5" для дробных — в отличие от
  // Python, где нужен был str(int(x)); отдельная ветка не требуется.
  return String(Number(x));
}

export function formatLastSets(lastSets) {
  if (!lastSets || lastSets.length === 0) return "—";
  return lastSets.map((s) => `${num(s.weight)}×${num(s.reps)}`).join(" · ");
}

function parseGroup(group, original) {
  const xi = group.indexOf("x");
  if (xi < 0) {
    throw new Error(`Не разобрал ввод: «${original}». Формат: 82x8, 82x8,8,7 или 80x8 82x6`);
  }
  const weight = Number(group.slice(0, xi).trim().replace(",", "."));
  if (!Number.isFinite(weight)) throw new Error(`Не разобрал вес в «${original}»`);
  const tokens = group.slice(xi + 1).split(",").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) throw new Error(`Нет повторов в «${original}»`);
  return tokens.map((t) => {
    if (!/^\d+$/.test(t)) throw new Error(`Повторы должны быть целыми: «${original}»`);
    return { weight, reps: parseInt(t, 10) };
  });
}

export function parseSetInput(text) {
  // «х»/«×»/«*»/«-» — все варианты разделителя вес/повторы (вес не бывает
  // отрицательным, поэтому «-» однозначно трактуется как разделитель, не минус).
  let cleaned = text.trim().toLowerCase()
    .replaceAll("х", "x").replaceAll("×", "x").replaceAll("*", "x").replaceAll("-", "x");
  // Схлопываем пробелы, ПРИМЫКАЮЩИЕ к разделителю x и к запятой, чтобы они не
  // резали группы (superset: «82x8, 8, 7» и «82 x 8» — привычный ввод). Пробелы
  // МЕЖДУ группами («80x8 82x6») остаются и делят на группы ниже.
  cleaned = cleaned.replace(/\s*x\s*/g, "x").replace(/\s*,\s*/g, ",");
  const groups = cleaned.split(/\s+/).filter(Boolean);
  if (groups.length === 0) throw new Error(`Не разобрал ввод: «${text}». Формат: 82x8, 82x8,8,7 или 80x8 82x6`);
  return groups.flatMap((g) => parseGroup(g, text));
}

// Показываем не константу из кода, а фактическую версию офлайн-кэша — так
// индикатор не может врать: он ровно тот кэш, из которого приложение живёт офлайн.
export function latestCacheVersion(keys) {
  let max = null;
  for (const key of keys ?? []) {
    const m = /^trainer-v(\d+)$/.exec(key);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (max === null || n > max) max = n;
  }
  return max === null ? null : `v ${max}`;
}

export function schemeTargetReps(scheme) {
  const s = (scheme || "").toLowerCase().replaceAll("х", "x").replaceAll("×", "x");
  const xi = s.indexOf("x");
  if (xi < 0) return null;
  const tail = (s.slice(xi + 1).trim().split(/\s+/)[0] ?? "").split("/")[0];
  return /^\d+$/.test(tail) ? parseInt(tail, 10) : null;
}
