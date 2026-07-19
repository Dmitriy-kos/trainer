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

// Программа 2 v3 — «Сила при удержании мышц» (согласована CEO 20.07.2026 после двух
// внешних рецензий; полное обоснование — «План_тренировок_месяц_2.md»). Ноги — только
// Пн/Пт; среда — верх без поясницы; clean в Пн на свежую ЦНС. Отдельного дня T нет:
// контрольные подходы недели 8 разнесены по обычным дням (см. weekLabels), тест
// подтягиваний один — Ср недели 8, замеры тела — утром натощак, не после тренировки.
const PROGRAM_2 = {
  number: 2,
  title: "Месяц 2 — сила при удержании мышц",
  weeks: 4,
  weekdayToDay: { 0: "A", 2: "B", 4: "C" },
  weekLabels: {
    1: "Неделя 5 — вход, усилие 7: clean 4×3, присед 4×5, RDL 2×8, фронталка 2×5; без подкачек",
    2: "Неделя 6 — полный объём, усилие 7-8: +2,5 кг где все повторы (жим — после 2 чистых занятий)",
    3: "Неделя 7 — пик, усилие 8, всегда 1-2 в запасе; первыми режутся подкачки",
    4: "Неделя 8 — разгрузка + контрольные: Пн присед 1×5, Ср тест подтягиваний + жим 1×5, Пт становая 1×3 (усилие 9, не отказ); замеры утром натощак",
  },
  dayPlans: {
    A: [
      { exercise: "Взятие на грудь (power clean)", orderIdx: 1, scheme: "5×3 (нед. 5: 4×3)", targetRpe: 7, note: "первым — техника и взрыв; вес растёт только при сохранении скорости" },
      { exercise: "Присед со штангой", orderIdx: 2, scheme: "5×5 (нед. 5: 4×5)", targetRpe: 8, note: "усилие 7→8 по неделям; старт ≈ вес 4×8 месяца 1 + 5%, судья — усилие" },
      { exercise: "Румынская тяга (RDL)", orderIdx: 3, scheme: "3×8 (нед. 5: 2×8)", targetRpe: 7, note: "тяжелее месяца 1" },
      { exercise: "Подтягивания (объёмный день)", orderIdx: 4, scheme: "по прогрессии", targetRpe: 8, note: "лесенка 2 круга — главный день цели 10" },
      { exercise: "Пресс: подъём ног в висе", orderIdx: 5, scheme: "3×10-12", targetRpe: 7, note: "заодно хват" },
    ],
    B: [
      { exercise: "Жим лёжа", orderIdx: 1, scheme: "5×5", targetRpe: 8, note: "усилие 7→8; +2,5 кг после двух чистых занятий подряд" },
      { exercise: "Подтягивания", orderIdx: 2, scheme: "по прогрессии", targetRpe: 8, note: "вторыми, свежим; пока тянет спина — жимовые мышцы отдыхают" },
      { exercise: "Жим стоя (OHP)", orderIdx: 3, scheme: "3×6", targetRpe: 8, note: "строгий, без подседа; прогрессия повторами 6→7→8, потом +2,5 кг" },
      { exercise: "Тяга гантели одной рукой с опорой на лавку", orderIdx: 4, scheme: "3×8 / рука", targetRpe: 7, note: "грудь/рука на лавке — поясница выключена" },
      { exercise: "Жим гантелей на наклонной", orderIdx: 5, scheme: "3×10", targetRpe: 7, note: "добивка на верх груди" },
      { exercise: "Пресс: hollow hold", orderIdx: 6, scheme: "3×30-45 с", targetRpe: 7, note: "кор под штангу" },
    ],
    C: [
      { exercise: "Становая тяга", orderIdx: 1, scheme: "4×4", targetRpe: 8, note: "усилие 7→8; накануне был только лёгкий бег" },
      { exercise: "Фронтальный присед", orderIdx: 2, scheme: "3×5 (нед. 5: 2×5)", targetRpe: 8, note: "умеренно, связка с clean" },
      { exercise: "Подтягивания", orderIdx: 3, scheme: "по прогрессии", targetRpe: 8, note: "качество: с паузой 2 с вверху, без гонки" },
      { exercise: "Пресс: русские повороты", orderIdx: 4, scheme: "3×20", targetRpe: 7, note: "" },
    ],
    // Подкачки после бега (решение CEO 20.07.2026): опция, не план — недели 6-7,
    // 15-20 минут, усилие 6-7. P1 = Вт (руки+пресс), P2 = Чт (плечи+пресс).
    // Ноги не работают никогда; в Чт нет спины/хвата (нужны для становой в Пт).
    P1: [
      { exercise: "Бицепс с гантелями", orderIdx: 1, scheme: "2×12", targetRpe: 7, note: "легко, памп; без раскачки корпуса" },
      { exercise: "Трицепс: разгибания из-за головы", orderIdx: 2, scheme: "2×12", targetRpe: 7, note: "локти смотрят вперёд" },
      { exercise: "Пресс: скручивания", orderIdx: 3, scheme: "2-3×15-20", targetRpe: 7, note: "поясница прижата" },
    ],
    P2: [
      { exercise: "Махи гантелями в стороны", orderIdx: 1, scheme: "2×15", targetRpe: 7, note: "лёгкие гантели, без рывка" },
      { exercise: "Задняя дельта: махи в наклоне", orderIdx: 2, scheme: "2×15", targetRpe: 7, note: "грудь на лавке — поясница не работает" },
      { exercise: "Пресс: подъёмы ног лёжа", orderIdx: 3, scheme: "2×12", targetRpe: 7, note: "поясница прижата к полу" },
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
  "Тяга гантели одной рукой с опорой на лавку": "db_row_bench",
  "Пресс: русские повороты": "russian_twist",
  "Бицепс с гантелями": "biceps_curl",
  "Трицепс: разгибания из-за головы": "triceps_ext",
  "Пресс: скручивания": "crunch",
  "Махи гантелями в стороны": "lateral_raise",
  "Задняя дельта: махи в наклоне": "rear_delt",
  "Пресс: подъёмы ног лёжа": "leg_raise_floor",
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
