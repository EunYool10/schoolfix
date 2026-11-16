/**
 * 백업 보관소
 *
 * 매일 한 번 자동으로, 또 관리자가 원할 때 저장소 전체를 JSON 파일 하나로 떠서 보관한다.
 *  - Supabase 를 쓰면 비공개 Storage 버킷(기본 schoolfix-backups. 없으면 서버가 만든다)
 *  - 아니면 DATA_DIR/backups 아래 파일
 *
 * 파일 이름
 *  - auto/2026-10-11.json                     매일 자동 (한국 날짜). 최근 30개 보관
 *  - manual/2026-10-11T03-00-00Z.json         관리자가 "지금 백업"
 *  - before-restore/2026-10-11T03-00-00Z.json 백업으로 되돌리기 직전의 상태 (되돌린 것을 다시 되돌릴 수 있게)
 * 사진은 넣지 않는다. 사진은 사진 저장소에 따로 남아 있다.
 */

import fs from "fs";
import path from "path";

export type BackupKind = "auto" | "manual" | "before-restore";
export const BACKUP_KINDS: BackupKind[] = ["auto", "manual", "before-restore"];
/** 종류별로 남겨 둘 파일 수. 넘으면 오래된 것부터 지운다. */
export const BACKUP_KEEP: Record<BackupKind, number> = { auto: 30, manual: 20, "before-restore": 20 };

export const BACKUP_NAME_PATTERN = /^(auto|manual|before-restore)\/\d{4}-\d{2}-\d{2}(T\d{2}-\d{2}-\d{2}Z)?\.json$/;

export interface BackupInfo {
  name: string;
  size: number | null;
  createdAt: string | null;
}

export interface BackupStore {
  kind: "supabase" | "local";
  init(): Promise<void>;
  put(name: string, body: string): Promise<void>;
  get(name: string): Promise<string | null>;
  list(kind: BackupKind): Promise<BackupInfo[]>;
  remove(names: string[]): Promise<void>;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 한국 날짜 "YYYY-MM-DD" */
export function kstDate(now = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function backupName(kind: BackupKind, now = new Date()): string {
  if (kind === "auto") return `auto/${kstDate(now)}.json`;
  return `${kind}/${now.toISOString().slice(0, 19).replace(/:/g, "-")}Z.json`;
}

/** 남겨 둘 개수를 넘는 오래된 백업 이름들 (이름이 날짜 순서라 이름으로 정렬한다) */
export function expiredBackups(list: BackupInfo[], keep: number): string[] {
  return [...list].sort((a, b) => b.name.localeCompare(a.name)).slice(keep).map((item) => item.name);
}

export function supabaseBackupStore(baseUrl: string, apiKey: string, useBearer: boolean, bucket: string): BackupStore {
  const headers = (extra: Record<string, string> = {}) => ({
    apikey: apiKey,
    ...(useBearer ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...extra,
  });
  const objectUrl = (name: string) => `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${name.split("/").map(encodeURIComponent).join("/")}`;
  return {
    kind: "supabase",
    async init() {
      const response = await fetch(`${baseUrl}/storage/v1/bucket`, {
        method: "POST",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 50 * 1024 * 1024, allowed_mime_types: ["application/json"] }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) return;
      const detail = await response.text().catch(() => "");
      if (response.status === 409 || /already exists|duplicate/i.test(detail)) return;
      throw new Error(`백업 버킷 준비 실패 (${response.status}): ${detail.slice(0, 200)}`);
    },
    async put(name, body) {
      const response = await fetch(objectUrl(name), {
        method: "POST",
        headers: headers({ "Content-Type": "application/json", "x-upsert": "true" }),
        body,
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`백업 저장 실패 (${response.status}): ${(await response.text().catch(() => "")).slice(0, 200)}`);
    },
    async get(name) {
      const response = await fetch(objectUrl(name), { headers: headers(), signal: AbortSignal.timeout(60000) });
      if (response.status === 404 || response.status === 400) return null;
      if (!response.ok) throw new Error(`백업 읽기 실패 (${response.status})`);
      return response.text();
    },
    async list(kind) {
      const response = await fetch(`${baseUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
        method: "POST",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ prefix: kind, limit: 200, offset: 0, sortBy: { column: "name", order: "desc" } }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`백업 목록 읽기 실패 (${response.status})`);
      const items = await response.json() as Array<{ name?: string; created_at?: string; metadata?: { size?: number } | null }>;
      return items
        .filter((item) => typeof item.name === "string" && item.name.endsWith(".json"))
        .map((item) => ({ name: `${kind}/${item.name}`, size: item.metadata?.size ?? null, createdAt: item.created_at ?? null }))
        .filter((item) => BACKUP_NAME_PATTERN.test(item.name));
    },
    async remove(names) {
      if (names.length === 0) return;
      const response = await fetch(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`, {
        method: "DELETE",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ prefixes: names }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`백업 삭제 실패 (${response.status})`);
    },
  };
}

export function localBackupStore(dir: string): BackupStore {
  const filePath = (name: string) => path.join(dir, ...name.split("/"));
  return {
    kind: "local",
    async init() {
      for (const kind of BACKUP_KINDS) fs.mkdirSync(path.join(dir, kind), { recursive: true });
    },
    async put(name, body) {
      const file = filePath(name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(`${file}.tmp`, body, "utf-8");
      fs.renameSync(`${file}.tmp`, file);
    },
    async get(name) {
      const file = filePath(name);
      return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null;
    },
    async list(kind) {
      const folder = path.join(dir, kind);
      if (!fs.existsSync(folder)) return [];
      return fs.readdirSync(folder)
        .filter((file) => file.endsWith(".json"))
        .map((file) => {
          const stat = fs.statSync(path.join(folder, file));
          return { name: `${kind}/${file}`, size: stat.size, createdAt: stat.mtime.toISOString() };
        })
        .filter((item) => BACKUP_NAME_PATTERN.test(item.name))
        .sort((a, b) => b.name.localeCompare(a.name));
    },
    async remove(names) {
      for (const name of names) fs.rmSync(filePath(name), { force: true });
    },
  };
}
