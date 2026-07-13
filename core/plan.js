// Данные исходно портированы из bot/plan.py; паритет разорван 08.07.2026 (порядок дня B), источник истины — PWA.
// 13.07.2026 (Шаг 8): подтягивания подняты перед тягами на спину в днях 1/A, 1/C, 2/C —
// подтягивания это цель (10 строгих), делаем их свежими; тяги — добивка. Румынская и
// становая тяги под правило не подпадают.

const _WEEKDAY_TO_DAY = { 0: "A", 2: "B", 4: "C" };

const _WEEKDAY_NAMES = [
  "понедельник", "вторник", "среда", "четверг",
  "пятница", "суббота", "воскресенье",
];

// Программа 1 = данные месяца 1 (бывший DAY_PLANS). 08.07.2026 порядок дня B изменён
// решением CEO (подтягивания перед тягой блока) — паритет с bot/plan.py больше не
// поддерживается, бот в архиве, источник истины — PWA.
const PROGRAM_1 = {
  number: 1,
  title: "Месяц 1 — втягивание",
  weeks: 4,
  weekdayToDay: { 0: "A", 2: "B", 4: "C" },
  weekLabels: {
    1: "Неделя 1 — усилие 6/10, втягивание, чуть меньше подходов",
    2: "Неделя 2 — усилие 7/10, полный объём, +вес/повтор",
    3: "Неделя 3 — усилие 7-8/10, пик объёма (не до отказа)",
    4: "Неделя 4 — разгрузка −20%, перетесты",
  },
  dayPlans: {
    A: [
      { exercise: "Присед со штангой", orderIdx: 1, scheme: "4×8", targetRpe: 7, note: "глубина в комфорте, спина прямая" },
      { exercise: "Жим лёжа", orderIdx: 2, scheme: "4×8", targetRpe: 7, note: "лопатки сведены" },
      { exercise: "Румынская тяга (RDL)", orderIdx: 3, scheme: "3×10", targetRpe: 7, note: "таз назад, ноги почти прямые" },
      { exercise: "Подтягивания", orderIdx: 4, scheme: "по прогрессии", targetRpe: 8, note: "делаем свежим, до тяг — качество > количество" },
      { exercise: "Тяга гантели в наклоне", orderIdx: 5, scheme: "3×10 / рука", targetRpe: 7, note: "добивка после подтягиваний; спина параллельно полу" },
    ],
    B: [
      { exercise: "Становая тяга", orderIdx: 1, scheme: "4×5", targetRpe: 7, note: "техника, умеренный вес" },
      { exercise: "Жим стоя (OHP)", orderIdx: 2, scheme: "3×8", targetRpe: 7, note: "корпус жёсткий, без прогиба" },
      { exercise: "Выпады с гантелями", orderIdx: 3, scheme: "3×10 / нога", targetRpe: 7, note: "колено не заваливается внутрь" },
      { exercise: "Подтягивания (объёмный день)", orderIdx: 4, scheme: "по прогрессии", targetRpe: 8, note: "главный день для цели 10 раз — делаем свежим" },
      { exercise: "Тяга верхнего блока", orderIdx: 5, scheme: "3×12", targetRpe: 7, note: "добивка после подтягиваний" },
    ],
    C: [
      { exercise: "Фронтальный присед", orderIdx: 1, scheme: "4×6", targetRpe: 7, note: "или жим ногами, если ноги устали" },
      { exercise: "Жим гантелей на наклонной", orderIdx: 2, scheme: "3×10", targetRpe: 7, note: "верх груди" },
      { exercise: "Подтягивания", orderIdx: 3, scheme: "по прогрессии", targetRpe: 8, note: "делаем свежим, до тяг — макс качественных" },
      { exercise: "Тяга штанги в наклоне", orderIdx: 4, scheme: "4×8", targetRpe: 7, note: "добивка после подтягиваний" },
      { exercise: "Аксессуары (суперсет)", orderIdx: 5, scheme: "планка 3×40с + подъём ног 3×12 + бицепс/трицепс 3×12", targetRpe: 7, note: "" },
    ],
  },
};

// Программа 2 — «Сила и масса» (спека 2026-07-07). Тяжёлый ТА-день — пятница (решение CEO).
const PROGRAM_2 = {
  number: 2,
  title: "Месяц 2 — сила и масса",
  weeks: 4,
  weekdayToDay: { 0: "A", 2: "C", 4: "B" },
  weekLabels: {
    1: "Неделя 1 — усилие 7/10, найти рабочие веса в новых схемах",
    2: "Неделя 2 — +2,5 кг там, где сделаны все повторы",
    3: "Неделя 3 — пик, усилие 8/10, всегда 1-2 в запасе",
    4: "Неделя 4 — разгрузка −20%, в пятницу — день замеров",
  },
  dayPlans: {
    A: [
      { exercise: "Присед со штангой", orderIdx: 1, scheme: "5×5", targetRpe: 8, note: "старт ≈ вес 4×8 месяца 1 + 5-7%" },
      { exercise: "Жим лёжа", orderIdx: 2, scheme: "5×5", targetRpe: 8, note: "лопатки сведены" },
      { exercise: "Румынская тяга (RDL)", orderIdx: 3, scheme: "3×8", targetRpe: 7, note: "тяжелее месяца 1" },
      { exercise: "Подтягивания", orderIdx: 4, scheme: "по прогрессии", targetRpe: 8, note: "день прямых подходов" },
      { exercise: "Пресс: подъём ног в висе", orderIdx: 5, scheme: "3×10-12", targetRpe: 7, note: "заодно хват" },
    ],
    B: [
      { exercise: "Взятие на грудь (power clean)", orderIdx: 1, scheme: "5×3", targetRpe: 7, note: "техника и взрыв, не максимумы" },
      { exercise: "Становая тяга", orderIdx: 2, scheme: "4×4", targetRpe: 8, note: "тяжелее месяца 1" },
      { exercise: "Швунг жимовой (push press)", orderIdx: 3, scheme: "4×5", targetRpe: 8, note: "корпус жёсткий, ноги помогают" },
      { exercise: "Подтягивания (объёмный день)", orderIdx: 4, scheme: "по прогрессии", targetRpe: 8, note: "главный день для цели 10 раз — делаем свежим" },
      { exercise: "Тяга верхнего блока", orderIdx: 5, scheme: "3×10", targetRpe: 7, note: "добивка после подтягиваний" },
      { exercise: "Пресс: hollow hold", orderIdx: 6, scheme: "3×30-45 с", targetRpe: 7, note: "кор под штангу" },
    ],
    C: [
      { exercise: "Фронтальный присед", orderIdx: 1, scheme: "4×5", targetRpe: 8, note: "связка с power clean" },
      { exercise: "Жим гантелей на наклонной", orderIdx: 2, scheme: "4×8", targetRpe: 7, note: "верх груди" },
      { exercise: "Подтягивания", orderIdx: 3, scheme: "по прогрессии", targetRpe: 8, note: "делаем свежим, до тяг — качество, можно с паузами" },
      { exercise: "Тяга штанги в наклоне", orderIdx: 4, scheme: "4×6", targetRpe: 8, note: "добивка после подтягиваний; тяжелее месяца 1" },
      { exercise: "Аксессуары (пресс + руки)", orderIdx: 5, scheme: "русские повороты 3×20 + бицепс 3×12 + трицепс 3×12", targetRpe: 7, note: "пресса ровно 3 подхода" },
    ],
    T: [
      { exercise: "Присед со штангой", orderIdx: 1, scheme: "5ПМ", targetRpe: 9, note: "разминка → тяжёлые 5, не отказ" },
      { exercise: "Жим лёжа", orderIdx: 2, scheme: "5ПМ", targetRpe: 9, note: "" },
      { exercise: "Становая тяга", orderIdx: 3, scheme: "3ПМ", targetRpe: 9, note: "" },
      { exercise: "Подтягивания", orderIdx: 4, scheme: "максимум строгих", targetRpe: 10, note: "цель — 10. Вес и талию запиши в заметку" },
    ],
  },
};

export const PROGRAMS = [PROGRAM_1, PROGRAM_2];
export const DAY_PLANS = PROGRAM_1.dayPlans; // обратная совместимость (тесты, демо)

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
  "Взятие на грудь (power clean)": "power_clean",
  "Швунг жимовой (push press)": "push_press",
  "Пресс: подъём ног в висе": "hanging_leg_raise",
  "Пресс: hollow hold": "hollow_hold",
  "Аксессуары (пресс + руки)": "russian_twist",
};

export function programByNumber(n) {
  return PROGRAMS.find((p) => p.number === n) ?? PROGRAMS[0];
}

export function planForSession(session) {
  return programByNumber(session.program ?? 1).dayPlans[session.day] ?? null;
}

export function programDayForWeekday(program, weekday) {
  return program.weekdayToDay[weekday] ?? null;
}

export function programWeekdayHint(program, weekday) {
  const name = _WEEKDAY_NAMES[weekday];
  const day = programDayForWeekday(program, weekday);
  if (day === null) return `Сегодня ${name} — по плану отдых или бег.`;
  return `Сегодня ${name} — по плану силовая ${day}.`;
}

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
