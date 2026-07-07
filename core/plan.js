// Порт bot/plan.py. Паритет: данные из DAY_PLANS, EXERCISE_IMAGE.

export const DAY_PLANS = {
  A: [
    { exercise: "Присед со штангой", orderIdx: 1, scheme: "4×8", targetRpe: 7, note: "глубина в комфорте, спина прямая" },
    { exercise: "Жим лёжа", orderIdx: 2, scheme: "4×8", targetRpe: 7, note: "лопатки сведены" },
    { exercise: "Румынская тяга (RDL)", orderIdx: 3, scheme: "3×10", targetRpe: 7, note: "таз назад, ноги почти прямые" },
    { exercise: "Тяга гантели в наклоне", orderIdx: 4, scheme: "3×10 / рука", targetRpe: 7, note: "спина параллельно полу" },
    { exercise: "Подтягивания", orderIdx: 5, scheme: "по прогрессии", targetRpe: 8, note: "качество > количество" },
  ],
  B: [
    { exercise: "Становая тяга", orderIdx: 1, scheme: "4×5", targetRpe: 7, note: "техника, умеренный вес" },
    { exercise: "Жим стоя (OHP)", orderIdx: 2, scheme: "3×8", targetRpe: 7, note: "корпус жёсткий, без прогиба" },
    { exercise: "Выпады с гантелями", orderIdx: 3, scheme: "3×10 / нога", targetRpe: 7, note: "колено не заваливается внутрь" },
    { exercise: "Тяга верхнего блока", orderIdx: 4, scheme: "3×12", targetRpe: 7, note: "доп. объём для подтягиваний" },
    { exercise: "Подтягивания (объёмный день)", orderIdx: 5, scheme: "по прогрессии", targetRpe: 8, note: "главный день для цели 10 раз" },
  ],
  C: [
    { exercise: "Фронтальный присед", orderIdx: 1, scheme: "4×6", targetRpe: 7, note: "или жим ногами, если ноги устали" },
    { exercise: "Жим гантелей на наклонной", orderIdx: 2, scheme: "3×10", targetRpe: 7, note: "верх груди" },
    { exercise: "Тяга штанги в наклоне", orderIdx: 3, scheme: "4×8", targetRpe: 7, note: "" },
    { exercise: "Подтягивания", orderIdx: 4, scheme: "по прогрессии", targetRpe: 8, note: "макс качественных" },
    { exercise: "Аксессуары (суперсет)", orderIdx: 5, scheme: "планка 3×40с + подъём ног 3×12 + бицепс/трицепс 3×12", targetRpe: 7, note: "" },
  ],
};

const _WEEKDAY_TO_DAY = { 0: "A", 2: "B", 4: "C" };

const _WEEKDAY_NAMES = [
  "понедельник", "вторник", "среда", "четверг",
  "пятница", "суббота", "воскресенье",
];

const EXERCISE_IMAGE = {
  "Присед со штангой": "squat",
  "Жим лёжа": "bench",
  "Румынская тяга (RDL)": "rdl",
  "Тяга гантели в наклоне": "db_row",
  "Подтягивания": "pullup",
  "Становая тяга": "deadlift",
  "Жим стоя (OHP)": "ohp",
  "Выпады с гантелями": "lunges",
  "Тяга верхнего блока": "lat_pulldown",
  "Подтягивания (объёмный день)": "pullup",
  "Фронтальный присед": "front_squat",
  "Жим гантелей на наклонной": "incline_db",
  "Тяга штанги в наклоне": "barbell_row",
  "Аксессуары (суперсет)": "accessory",
};

export function dayForWeekday(weekday) {
  return _WEEKDAY_TO_DAY[weekday] ?? null;
}

export function weekdayHint(weekday) {
  const name = _WEEKDAY_NAMES[weekday];
  const day = dayForWeekday(weekday);
  if (day === null) {
    return `Сегодня ${name} — по плану отдых или бег.`;
  }
  return `Сегодня ${name} — по плану силовая ${day}.`;
}

export function techniqueImage(exercise) {
  const slug = EXERCISE_IMAGE[exercise];
  if (slug === undefined) {
    return null;
  }
  return `assets/technique/${slug}.png`;
}
