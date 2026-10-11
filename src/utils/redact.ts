/**
 * 사진 일부를 모자이크로 가린다 — 얼굴·이름표처럼 신고에 필요 없는 개인 정보를 지우는 데 쓴다.
 *
 * 화면에서 보이는 흐림이 아니라 픽셀 자체를 바꿔 다시 저장하므로 원본으로 되돌릴 수 없다.
 * 칸은 사진 크기에 대한 비율(0~1)로 받는다.
 */

import type { PreparedPhoto } from "./imageCompress";

export interface RedactBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("사진을 열지 못했습니다."));
    image.src = dataUrl;
  });
}

function toDataUrl(canvas: HTMLCanvasElement, quality: number): Promise<{ dataUrl: string; size: number }> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error("사진을 저장하지 못했습니다.")); return; }
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: String(reader.result), size: blob.size });
      reader.onerror = () => reject(reader.error ?? new Error("사진을 저장하지 못했습니다."));
      reader.readAsDataURL(blob);
    }, "image/jpeg", quality);
  });
}

/** 칸을 사방으로 padding 비율만큼 넓힌다. 얼굴 위치가 조금 어긋나도 가려지게 한다. */
export function expandBox(box: RedactBox, padding: number): RedactBox {
  const x = Math.max(0, box.x - box.w * padding);
  const y = Math.max(0, box.y - box.h * padding);
  return { x, y, w: Math.min(1 - x, box.w * (1 + padding * 2)), h: Math.min(1 - y, box.h * (1 + padding * 2)) };
}

/** 칸마다 모자이크를 씌운 새 사진을 만든다. */
export async function redactPhoto(photo: PreparedPhoto, boxes: RedactBox[], padding = 0): Promise<PreparedPhoto> {
  if (boxes.length === 0) return photo;
  const image = await loadImage(photo.dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("사진을 가리지 못했습니다.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);

  for (const raw of boxes) {
    const box = expandBox(raw, padding);
    const sx = Math.round(box.x * canvas.width);
    const sy = Math.round(box.y * canvas.height);
    const sw = Math.max(1, Math.round(box.w * canvas.width));
    const sh = Math.max(1, Math.round(box.h * canvas.height));
    // 칸의 짧은 변을 5칸 정도로 나누는 굵은 모자이크. 얼굴을 알아볼 수 없을 만큼 거칠게 한다.
    const block = Math.max(8, Math.round(Math.min(sw, sh) / 5));
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(sw / block));
    small.height = Math.max(1, Math.round(sh / block));
    const smallCtx = small.getContext("2d");
    if (!smallCtx) continue;
    smallCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, small.width, small.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, small.width, small.height, sx, sy, sw, sh);
    ctx.imageSmoothingEnabled = true;
  }

  let saved = await toDataUrl(canvas, 0.85);
  if (saved.size > 1.5 * 1024 * 1024) saved = await toDataUrl(canvas, 0.7);
  return {
    key: `${photo.key}-redacted-${Math.random().toString(36).slice(2, 6)}`,
    dataUrl: saved.dataUrl,
    name: photo.name.replace(/\.[^.]+$/, "") + ".jpg",
    size: saved.size,
    originalSize: photo.originalSize,
  };
}
