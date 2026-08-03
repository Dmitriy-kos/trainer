import { habitsViewModel } from "./habits.js";

export const FOCUS_GIST_FILENAME = "trainer-focus.json";
export const FOCUS_APP_URL = "https://dmitriy-kos.github.io/trainer/";

const GITHUB_API = "https://api.github.com";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GIST_ID_RE = /^[a-f0-9]+$/i;

export function buildFocusSnapshot(habitsByDate, date, updatedAt = new Date().toISOString()) {
  if (!DATE_RE.test(date)) throw new Error("Некорректная дата фокусов.");

  const vm = habitsViewModel(habitsByDate, date);
  const items = vm.items
    .map((item, order) => ({ ...item, order }))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.order - b.order)
    .map(({ order: _order, ...item }) => item);

  return {
    version: 1,
    date,
    updatedAt,
    appUrl: FOCUS_APP_URL,
    done: vm.done,
    total: vm.total,
    items,
  };
}

export function focusGistContent(snapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

function cleanToken(token) {
  return typeof token === "string" ? token.trim() : "";
}

function cleanGistId(gistId) {
  const value = typeof gistId === "string" ? gistId.trim() : "";
  return GIST_ID_RE.test(value) ? value : "";
}

async function githubError(response) {
  let detail = "";
  try {
    const body = await response.json();
    if (typeof body?.message === "string") detail = body.message;
  } catch {
    // GitHub иногда возвращает пустое тело — достаточно статуса ниже.
  }

  if (response.status === 401) {
    return new Error("GitHub не принял токен. Проверь токен и попробуй ещё раз.");
  }
  if (response.status === 403) {
    return new Error("Токену не хватает права Gists: Read and write.");
  }
  if (response.status === 404) {
    return new Error("Синхронизация виджета не найдена. Подключи виджет заново.");
  }
  return new Error(`GitHub вернул ошибку ${response.status}${detail ? `: ${detail}` : "."}`);
}

async function gistRequest(path, { token, method, body, fetchImpl = fetch }) {
  const auth = cleanToken(token);
  if (!auth) throw new Error("Вставь GitHub-токен.");

  let response;
  try {
    response = await fetchImpl(`${GITHUB_API}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${auth}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Не удалось связаться с GitHub. Проверь интернет.");
  }

  if (!response.ok) throw await githubError(response);
  return response.json();
}

export async function createFocusGist({ token, snapshot, fetchImpl = fetch }) {
  const result = await gistRequest("/gists", {
    token,
    method: "POST",
    fetchImpl,
    body: {
      description: "Тренер — четыре фокуса дня для iPhone-виджета",
      public: false,
      files: {
        [FOCUS_GIST_FILENAME]: { content: focusGistContent(snapshot) },
      },
    },
  });
  const gistId = cleanGistId(result?.id);
  if (!gistId) throw new Error("GitHub создал синхронизацию без идентификатора.");
  return { gistId, created: true };
}

export async function updateFocusGist({ token, gistId, snapshot, fetchImpl = fetch }) {
  const id = cleanGistId(gistId);
  if (!id) throw new Error("Некорректный идентификатор синхронизации.");

  await gistRequest(`/gists/${id}`, {
    token,
    method: "PATCH",
    fetchImpl,
    body: {
      files: {
        [FOCUS_GIST_FILENAME]: { content: focusGistContent(snapshot) },
      },
    },
  });
  return { gistId: id, created: false };
}

export function syncFocusGist({ token, gistId, snapshot, fetchImpl = fetch }) {
  return cleanGistId(gistId)
    ? updateFocusGist({ token, gistId, snapshot, fetchImpl })
    : createFocusGist({ token, snapshot, fetchImpl });
}
