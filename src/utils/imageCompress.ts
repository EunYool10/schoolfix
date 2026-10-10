/**
 * 첨부 사진을 브라우저에서 줄인다.
 *
 * 휴대폰 사진은 한 장에 5~15MB 라 그대로 보내면 느리고 서버 한도(장당 5MB)를 넘는다.
 * 긴 변을 1920px 로 맞추고 JPEG 로 다시 저장해 보통 300KB~1MB 로 만든다.
 * 다시 저장하면서 촬영 위치(GPS) 같은 사진 속 정보도 함께 지워진다.
 *
 * GIF 는 움직임이 사라지지 않도록 작으면 그대로 보낸다.
 */

export const PHOTO_LIMITS = {
  /** 신고 하나에 붙일 수 있는 사진 수 (서버 PHOTO_RULES.maxPhotos 와 같아야 한다) */
  maxPhotos: 6,
  /** 고를 수 있는 원본 한 장의 크기 */
  maxOriginalBytes: 30 * 1024 * 1024,
  /** 줄인 뒤 한 장의 목표 크기. 서버 한도(5MB)보다 넉넉히 작게 잡는다. */
  targetBytes: 1.5 * 1024 * 1024,
  /** 그대로 보내도 되는 GIF 크기 */
  maxGifBytes: 4 * 1024 * 1024,
};

export interface PreparedPhoto {
  /** 화면 목록에서 구분하기 위한 값 */
  key: string;
  dataUrl: string;
  name: string;
  /** 줄인 뒤 크기 */
  size: number;
  originalSize: number;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}

/** 사진 방향(세로로 찍은 사진)을 지키며 그림으로 연다. */
async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // 일부 브라우저는 옵션을 모른다. 아래 방식으로 다시 연다.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("이 사진 형식은 열 수 없습니다. JPG나 PNG로 바꿔서 올려주세요.");
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("사진을 줄이지 못했습니다."))), "image/jpeg", quality);
  });
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const key = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;
  if (!file.type.startsWith("image/")) throw new Error(`${file.name}: 사진 파일만 첨부할 수 있습니다.`);
  if (file.size > PHOTO_LIMITS.maxOriginalBytes) throw new Error(`${file.name}: 한 장에 ${PHOTO_LIMITS.maxOriginalBytes / 1024 / 1024}MB까지 고를 수 있습니다.`);

  if (file.type === "image/gif" && file.size <= PHOTO_LIMITS.maxGifBytes) {
    return { key, dataUrl: await readAsDataUrl(file), name: file.name, size: file.size, originalSize: file.size };
  }

  const decoded = await decode(file).catch((err: Error) => { throw new Error(`${file.name}: ${err.message}`); });
  try {
    // 크기를 줄여 가며 목표 용량 안에 들어올 때까지 다시 저장한다.
    const attempts: Array<[number, number]> = [[1920, 0.82], [1920, 0.7], [1600, 0.7], [1280, 0.65], [1024, 0.6]];
    let blob: Blob | null = null;
    for (const [maxSide, quality] of attempts) {
      const scale = Math.min(1, maxSide / Math.max(decoded.width, decoded.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("사진을 줄이지 못했습니다.");
      // 투명한 PNG 가 검게 나오지 않도록 흰 바탕을 깐다.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      blob = await toBlob(canvas, quality);
      if (blob.size <= PHOTO_LIMITS.targetBytes) break;
    }
    if (!blob) throw new Error("사진을 줄이지 못했습니다.");
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return { key, dataUrl: await readAsDataUrl(blob), name, size: blob.size, originalSize: file.size };
  } finally {
    decoded.close();
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
