import { pullupDayScheme } from "../core/logic.js";
import { humanScheme } from "../core/format.js";
import { globalWeekNumber } from "../core/plan.js";
import { exerciseProgressionHint } from "../core/progression.js";

// Публичный шов view-model карточки: преобразует схему и решает,
// показывать ли сохранённый максимум подтягиваний.
export function buildSessionExerciseVm({ item, session, pullupMax }) {
  const isPullup = item.exercise.startsWith("Подтягивания");
  const gWeek = globalWeekNumber(session.program ?? 1, session.week);
  let schemeLine = humanScheme(item.scheme, gWeek);
  let pullupMaxLabel = null;

  if (isPullup && session.program !== 4) {
    pullupMaxLabel = (pullupMax ? `${pullupMax.value} (обновлён ${pullupMax.date}) · тап — изменить` : "не задан · тап — ввести");
  }
  if (isPullup && session.program !== 4 && !(session.program === 3 && session.venue === "gym" && session.gymReturn)) {
    const maxVal = pullupMax ? pullupMax.value : null;
    schemeLine = humanScheme(pullupDayScheme(
      session.program === 3 && session.venue === "gym" ? 2 : session.program ?? 1,
      session.week,
      session.day,
      maxVal,
      pullupMax?.date ?? null,
      session.date,
    ), gWeek);
  }

  const progressionHint = exerciseProgressionHint({ item, session, schemeLine });
  return { schemeLine, pullupMaxLabel, progressionHint };
}

