// Условные правила следующего шага, а не оценка готовности по истории.
// schemeLine уже разрешён публичным швом карточки для текущей недели.
export function exerciseProgressionHint({ item, session, schemeLine }) {
  if (session.gymReturn) return `Возврат: ${schemeLine}. Работай без прибавки веса, усилие не выше 7/10. Если тяжело — снизь вес.`;
  if (session.week === 4) return `Разгрузка: ${schemeLine}. На этой неделе без прибавки веса и объёма, без отказа. Если тяжело — снизь нагрузку.`;
  const hold = "Тяжело или не добрал повторы — сохрани вес.";
  const quality = "с чистой техникой и запасом 2–3 повтора";
  const bothSides = /на каждую (руку|ногу|сторону)/.test(schemeLine) ? " на обеих сторонах" : "";
  const dumbbells = /гантел|«молот»|Задняя дельта: махи/.test(item.exercise);
  const step = `минимальную ступень веса${dumbbells ? " на каждую гантель" : ""}`;
  // Динамический план может быть лесенкой, тестом или паузами: не превращаем
  // его в фиксированную прогрессию программы 4 и не придумываем новый максимум.
  if (item.exercise.startsWith("Подтягивания") && session.program !== 4) {
    return `По текущей схеме: ${schemeLine}. Не добавляй повторы сверх схемы; если тяжело — сохрани нагрузку.`;
  }
  if (/секунд/.test(schemeLine)) return `Выполни ${schemeLine} с устойчивым положением и ровным дыханием. Сначала освой всё заданное время; при потере техники остановись раньше. Нагрузку пока не увеличивай.`;
  const oldStrength = session.program === 2 || (session.program === 3 && session.venue === "gym");
  if (oldStrength && item.exercise === "Жим лёжа") return `После двух чистых тренировок по текущей схеме (${schemeLine}) ${quality} добавь 2,5 кг. ${hold}`;
  if (oldStrength && item.exercise === "Жим стоя (OHP)") return `Во всех трёх подходах ${quality} пройди 6→7→8, затем добавь 2,5 кг и вернись к 6 повторам. ${hold}`;
  if (session.program === 4) {
    if (item.exercise === "Жим лёжа") return `Только после двух чистых тренировок 4×6 ${quality} добавь 2,5 кг. ${hold}`;
    if (item.exercise === "Жим стоя (OHP)") return `Если 35 кг выполнены 3×8 ${quality}, перейди к 37,5 кг: 3 подхода по 6, затем доведи каждый до 8. На следующих весах повторяй цикл 6→8, затем +2,5 кг. ${hold}`;
    if (item.exercise === "Подтягивания") return `После 3×7 во всех подходах ${quality} добавь минимальный дополнительный вес 2,5 кг и вернись к 5 повторам. ${hold}`;
    if (item.exercise === "Становая тяга") return `Только после чистых 3×4 во всех подходах ${quality} добавь 2,5 кг (например, 80 → 82,5 кг). Один удачный подход не повод повышать вес. ${hold}`;
  }
  const match = /^(\d+) подход\S* по (\d+)-(\d+) повтор/.exec(schemeLine);
  const home = session.program === 3 && session.venue !== "gym";
  const bodyweight = home || /Пресс:|Планка/.test(item.exercise);
  if (match) {
    const [, sets, low, high] = match;
    if (bodyweight) {
      const next = /резинк/.test(item.exercise) ? "немного увеличь натяжение резинки" : "выбери чуть более сложный вариант движения";
      return `Сначала ${sets}×${high} во всех подходах${bothSides} ${quality}. Затем ${next} и вернись к ${low} повторам. Если тяжело — сохрани сложность.`;
    }
    return `Сначала ${sets}×${high} во всех подходах${bothSides} ${quality}. Затем добавь ${step} и вернись к ${low} повторам. ${hold}`;
  }
  const fixed = /^(\d+) подход\S* по (\d+) повтор/.exec(schemeLine);
  if (fixed) {
    const target = `${fixed[1]}×${fixed[2]}`;
    if (bodyweight) return `Выполни ${target} во всех подходах${bothSides} ${quality}. Сначала закрепи технику и ровный темп; не увеличивай объём сверх схемы.`;
    const speed = item.exercise.includes("power clean") ? " без потери скорости и устойчивого приёма штанги" : "";
    return `Сначала ${target} во всех подходах${bothSides} ${quality}${speed}. Только затем добавь ${step}. ${hold}`;
  }
  return `Выполни текущую схему ${quality}. Сначала закрепи все её части; если тяжело — сохрани нагрузку.`;
}
