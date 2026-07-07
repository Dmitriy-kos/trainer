// Ядро модуля «Еда»: промпт, разбор ответа модели, порции, итоги дня.
// Чистые функции без DOM и сети. Правило проекта: модель возвращает строгий
// JSON за одну порцию, ВСЮ арифметику (порции, суммы, проценты) считает код.

export const FOOD_MODEL = "claude-haiku-4-5-20251001";
export const DEFAULT_GOALS = { kcal: 2250, protein: 160 };

export function buildFoodPrompt(description = null) {
  const what = description
    ? `Оцени еду по описанию: «${description}».`
    : "Оцени еду на фото. Если на фото несколько блюд — просуммируй всё как один приём пищи.";
  return `${what}
Верни СТРОГО один JSON-объект без пояснений до и после, вида:
{"name":"короткое название по-русски","kcal":число,"protein_g":число,"fat_g":число,"carbs_g":число,"comment":"одна короткая фраза о допущениях"}
Числа — за порцию как на фото/в описании, целые. Если это не еда, верни {"name":null}.`;
}

function nonNegInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function parseFoodResponse(text) {
  const m = String(text ?? "").match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Не удалось разобрать ответ распознавания. Попробуй ещё раз.");
  let obj;
  try { obj = JSON.parse(m[0]); } catch { throw new Error("Не удалось разобрать ответ распознавания. Попробуй ещё раз."); }
  if (obj && obj.name === null) throw new Error("Не похоже на еду — попробуй другое фото или опиши текстом.");
  const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : null;
  const kcal = nonNegInt(obj.kcal);
  const protein = nonNegInt(obj.protein_g);
  if (name == null || kcal == null || protein == null)
    throw new Error("В ответе распознавания нет названия или калорий. Попробуй ещё раз.");
  return {
    name, kcal, protein,
    fat: nonNegInt(obj.fat_g) ?? 0,
    carbs: nonNegInt(obj.carbs_g) ?? 0,
    comment: typeof obj.comment === "string" ? obj.comment : "",
  };
}

export function scalePortion(values, factor) {
  return {
    kcal: Math.round(values.kcal * factor),
    protein: Math.round(values.protein * factor),
    fat: Math.round(values.fat * factor),
    carbs: Math.round(values.carbs * factor),
  };
}

export function dayTotals(entries, date) {
  const done = entries.filter((e) => e.date === date && e.status === "done");
  return {
    kcal: done.reduce((s, e) => s + e.kcal, 0),
    protein: done.reduce((s, e) => s + e.protein, 0),
    count: done.length,
  };
}
