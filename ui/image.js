// Сжатие фото на устройстве перед отправкой в распознавание: длинная сторона
// до maxSide, JPEG 0.8 — токены и трафик. DOM-модуль (canvas), в Node не тестируется.

export function compressImage(file, maxSide = 1024) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * k));
      canvas.height = Math.max(1, Math.round(img.height * k));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      resolve({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Не получилось прочитать фото.")); };
    img.src = url;
  });
}
