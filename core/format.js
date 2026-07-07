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

export function parseSetInput(text) {
  const cleaned = text.trim().toLowerCase().replaceAll("х", "x").replaceAll("×", "x");
  const xi = cleaned.indexOf("x");
  if (xi < 0) throw new Error(`Не разобрал ввод: «${text}». Формат: 82x8 или 82x8,8,7`);
  const weight = Number(cleaned.slice(0, xi).trim().replace(",", "."));
  if (!Number.isFinite(weight)) throw new Error(`Не разобрал вес в «${text}»`);
  const tokens = cleaned.slice(xi + 1).split(",").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) throw new Error(`Нет повторов в «${text}»`);
  return tokens.map((t) => {
    if (!/^\d+$/.test(t)) throw new Error(`Повторы должны быть целыми: «${text}»`);
    return { weight, reps: parseInt(t, 10) };
  });
}

export function schemeTargetReps(scheme) {
  const s = (scheme || "").toLowerCase().replaceAll("х", "x").replaceAll("×", "x");
  const xi = s.indexOf("x");
  if (xi < 0) return null;
  const tail = (s.slice(xi + 1).trim().split(/\s+/)[0] ?? "").split("/")[0];
  return /^\d+$/.test(tail) ? parseInt(tail, 10) : null;
}
