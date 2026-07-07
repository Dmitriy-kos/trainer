// Единственное место в приложении, которое ходит в сеть (кроме SW).
// Прямой вызов Claude API из браузера: официальный CORS-режим включается
// заголовком anthropic-dangerous-direct-browser-access (приложение личное,
// ключ хранится только на устройстве — см. дизайн_питание_фото_еды.md).

import { FOOD_MODEL, buildFoodPrompt, parseFoodResponse } from "./food.js";

const API_URL = "https://api.anthropic.com/v1/messages";

export async function recognizeFood({ apiKey, image = null, text = null, fetchFn = globalThis.fetch }) {
  if (!apiKey) throw new Error("Сначала укажи ключ API в настройках еды.");
  const content = [];
  if (image) content.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } });
  content.push({ type: "text", text: buildFoodPrompt(image ? null : text) });

  let res;
  try {
    res = await fetchFn(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model: FOOD_MODEL, max_tokens: 500, messages: [{ role: "user", content }] }),
    });
  } catch {
    const err = new Error("Нет связи.");
    err.offline = true;
    throw err;
  }
  if (res.status === 401 || res.status === 403) throw new Error("Ключ API не подошёл — проверь его в настройках еды.");
  if (!res.ok) throw new Error("Сервис распознавания ответил ошибкой. Попробуй ещё раз.");
  const data = await res.json();
  const block = (data.content || []).find((b) => b.type === "text");
  return parseFoodResponse(block ? block.text : "");
}
