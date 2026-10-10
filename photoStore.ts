/**
 * 신고 사진 저장소
 *
 * 사진을 신고 JSON 안에 data URL 로 넣으면, 신고 하나만 바뀌어도 모든 사진이 담긴
 * 신고 목록 전체를 Supabase 에 다시 올리게 된다. 사진이 쌓일수록 저장이 느려지고 실패한다.
 * 그래서 사진은 따로 저장하고 신고에는 사진 id 만 남긴다.
 *
 *  - Supabase 를 쓰면 비공개 Storage 버킷 (없으면 서버가 시작할 때 만든다)
 *  - 아니면 DATA_DIR/photos 아래 파일
 *
 * 사진은 /api/photos/... 로만 내보내며, 공개 여부는 server.ts 가 신고 상태를 보고 정한다.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

export const PHOTO_RULES = {
  /** 신고 하나에 붙일 수 있는 사진 수 */
  maxPhotos: 6,
  /** 서버가 받는 사진 한 장의 최대 크기 (브라우저가 줄여서 보낸 뒤 기준) */
  maxBytes: 5 * 1024 * 1024,
};

export interface StoredPhoto {
  /** 저장소 안의 경로. 예: 202610/9f…(32자).jpg */
  id: string;
  name: string | null;
  size: number;
  type: string;
}

export interface IncomingPhoto {
  buffer: Buffer;
  type: string;
  name: string | null;
}

const EXT_BY_TYPE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const TYPE_BY_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

/** 라우트에서 받은 id 가 저장소 경로를 벗어나지 못하게 형식을 고정한다. */
export const PHOTO_ID_PATTERN = /^\d{6}\/[a-f0-9]{32}\.(jpg|png|webp|gif)$/;

/**
 * data:image/...;base64,... → 이미지 바이트. 형식이 틀리거나 너무 크면 이유를 돌려준다.
 * 확장자만 믿지 않고 파일 앞부분(매직 넘버)으로 실제 이미지인지 확인한다.
 */
export function decodePhotoDataUrl(dataUrl: unknown): { ok: true; buffer: Buffer; type: string } | { ok: false; error: string } {
  if (typeof dataUrl !== "string") return { ok: false, error: "첨부 사진 형식이 올바르지 않습니다." };
  const match = /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) return { ok: false, error: "사진은 PNG, JPG, GIF, WEBP 형식만 첨부할 수 있습니다." };
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) return { ok: false, error: "첨부 사진이 비어 있습니다." };
  if (buffer.length > PHOTO_RULES.maxBytes) return { ok: false, error: `사진 한 장은 ${PHOTO_RULES.maxBytes / 1024 / 1024}MB를 넘을 수 없습니다.` };
  const sniffed = sniffImageType(buffer);
  if (!sniffed) return { ok: false, error: "이미지 파일이 아니거나 손상되었습니다." };
  return { ok: true, buffer, type: sniffed };
}

export function sniffImageType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString("latin1"))) return "image/gif";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

export function newPhotoId(type: string, now = new Date()): string {
  const month = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${month}/${crypto.randomBytes(16).toString("hex")}.${EXT_BY_TYPE[type] ?? "jpg"}`;
}

export function photoTypeFromId(id: string): string {
  return TYPE_BY_EXT[id.split(".").pop() ?? ""] ?? "application/octet-stream";
}

// ---------------------------------------------------------------------------

export interface PhotoBackend {
  kind: "supabase" | "local";
  init(): Promise<void>;
  put(id: string, buffer: Buffer, type: string): Promise<void>;
  get(id: string): Promise<Buffer | null>;
  remove(ids: string[]): Promise<void>;
}

export function supabasePhotoBackend(baseUrl: string, apiKey: string, useBearer: boolean, bucket: string): PhotoBackend {
  const headers = (extra: Record<string, string> = {}) => ({
    apikey: apiKey,
    // sb_secret 키는 JWT 가 아니라서 Bearer 로 보내면 안 된다(server.ts 의 저장소 요청과 같은 규칙).
    ...(useBearer ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...extra,
  });
  const objectUrl = (id: string) => `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${id.split("/").map(encodeURIComponent).join("/")}`;

  return {
    kind: "supabase",
    async init() {
      const response = await fetch(`${baseUrl}/storage/v1/bucket`, {
        method: "POST",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: PHOTO_RULES.maxBytes, allowed_mime_types: Object.keys(EXT_BY_TYPE) }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) {
        console.log(`[photos] Supabase Storage 버킷 ${bucket} 을 만들었습니다.`);
        return;
      }
      const detail = await response.text().catch(() => "");
      // 이미 있으면 그대로 쓴다. Storage 는 상태 코드를 409 또는 400(+Duplicate) 으로 준다.
      if (response.status === 409 || /already exists|duplicate/i.test(detail)) return;
      throw new Error(`Supabase Storage 버킷 준비 실패 (${response.status}): ${detail.slice(0, 200)}`);
    },
    async put(id, buffer, type) {
      const response = await fetch(objectUrl(id), {
        method: "POST",
        headers: headers({ "Content-Type": type, "x-upsert": "false", "cache-control": "31536000" }),
        body: new Uint8Array(buffer),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`사진 업로드 실패 (${response.status}): ${(await response.text().catch(() => "")).slice(0, 200)}`);
    },
    async get(id) {
      const response = await fetch(objectUrl(id), { headers: headers(), signal: AbortSignal.timeout(20000) });
      if (response.status === 404 || response.status === 400) return null;
      if (!response.ok) throw new Error(`사진 읽기 실패 (${response.status})`);
      return Buffer.from(await response.arrayBuffer());
    },
    async remove(ids) {
      if (ids.length === 0) return;
      const response = await fetch(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`, {
        method: "DELETE",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ prefixes: ids }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`사진 삭제 실패 (${response.status})`);
    },
  };
}

export function localPhotoBackend(dir: string): PhotoBackend {
  const filePath = (id: string) => path.join(dir, ...id.split("/"));
  return {
    kind: "local",
    async init() {
      fs.mkdirSync(dir, { recursive: true });
    },
    async put(id, buffer) {
      const file = filePath(id);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buffer);
    },
    async get(id) {
      const file = filePath(id);
      return fs.existsSync(file) ? fs.readFileSync(file) : null;
    },
    async remove(ids) {
      for (const id of ids) fs.rmSync(filePath(id), { force: true });
    },
  };
}

/**
 * 같은 사진을 여러 사람이 연달아 열 때 매번 저장소에서 내려받지 않도록 최근 사진을 메모리에 둔다.
 * 무료 서버 메모리를 넘지 않게 전체 크기로 제한한다.
 */
export class PhotoCache {
  private entries = new Map<string, Buffer>();
  private bytes = 0;
  constructor(private readonly maxBytes = 48 * 1024 * 1024) {}

  get(id: string): Buffer | undefined {
    const hit = this.entries.get(id);
    if (hit) {
      this.entries.delete(id);
      this.entries.set(id, hit);
    }
    return hit;
  }

  set(id: string, buffer: Buffer) {
    if (buffer.length > this.maxBytes / 4) return;
    const old = this.entries.get(id);
    if (old) this.bytes -= old.length;
    this.entries.delete(id);
    this.entries.set(id, buffer);
    this.bytes += buffer.length;
    for (const [key, value] of this.entries) {
      if (this.bytes <= this.maxBytes) break;
      this.entries.delete(key);
      this.bytes -= value.length;
    }
  }

  delete(id: string) {
    const old = this.entries.get(id);
    if (old) this.bytes -= old.length;
    this.entries.delete(id);
  }
}
