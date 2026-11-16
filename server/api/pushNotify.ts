/**
 * 학생 알림 (Web Push)
 *
 * 신고한 학생이 "알림 받기" 를 켜면, 처리 상태가 바뀌거나 학교 답변이 달렸을 때 휴대폰·PC 로 알림을 보낸다.
 * 로그인이 없으므로 구독을 "내 신고" 소유 토큰의 해시와 묶는다. 이름·연락처는 받지 않는다.
 *
 *  - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 가 없으면 기능 전체가 꺼진다(화면에도 버튼이 나오지 않는다).
 *  - 서버가 임의 주소로 요청을 보내지 않도록 브라우저 푸시 서비스 주소만 받는다.
 *  - 만료된 구독(404/410)은 보낼 때 지운다.
 *  - iPhone·iPad 는 홈 화면에 추가한 앱에서만 웹 알림을 받을 수 있다(iOS 16.4 이상).
 */

import crypto from "crypto";
import webpush from "web-push";

export interface PushRecord {
  /** 구독 주소의 해시 앞부분. 같은 기기를 다시 등록하면 갱신한다. */
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** 이 기기가 가진 "내 신고" 소유 토큰들의 해시 */
  ownerTokenHashes: string[];
  /** 이 기기의 "나도 겪었어요" 해시. 공감한 신고가 처리 완료되면 "진짜 고쳐졌나요?" 를 묻는다. */
  meTooHash?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** 알림을 누르면 열 주소 (사이트 안 경로) */
  url: string;
  /** 같은 신고의 알림은 하나로 묶는다 */
  tag: string;
}

/** 기기 하나가 묶어 둘 수 있는 신고 수. 오래된 것부터 뺀다. */
const MAX_OWNER_HASHES = 200;

/**
 * 브라우저가 만든 구독 주소의 호스트. 이 밖의 주소는 받지 않는다(서버를 경유한 임의 요청 방지).
 * Chrome·Edge(새 버전)·삼성 인터넷·Opera = FCM, Firefox = Mozilla, Safari = Apple, 예전 Edge = WNS
 */
const PUSH_HOST_SUFFIXES = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
];

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** 브라우저의 PushSubscription.toJSON() 을 검증한다. 틀리면 null */
export function parseSubscription(value: unknown): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  if (!value || typeof value !== "object") return null;
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (!isAllowedPushEndpoint(endpoint)) return null;
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string") return null;
  if (p256dh.length < 40 || p256dh.length > 200 || auth.length < 8 || auth.length > 100) return null;
  if (!BASE64URL.test(p256dh) || !BASE64URL.test(auth)) return null;
  return { endpoint, keys: { p256dh, auth } };
}

export function pushRecordId(endpoint: string): string {
  return crypto.createHash("sha256").update(`push:${endpoint}`).digest("hex").slice(0, 32);
}

/**
 * 구독 목록에 이 기기를 넣거나 갱신한다. 바뀐 게 없으면 changed=false 로 저장을 건너뛴다.
 * 소유 토큰 해시는 새로 받은 것을 앞에 두고 합친다(기기에서 지운 토큰도 한동안 남는다. 알림만 더 갈 뿐 정보는 새지 않는다).
 */
export function upsertPushRecord(
  list: PushRecord[],
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  hashes: string[],
  now = new Date().toISOString(),
  meTooHash: string | null = null
): { list: PushRecord[]; changed: boolean } {
  const id = pushRecordId(subscription.endpoint);
  const existing = list.find((record) => record.id === id);
  const merged = [...new Set([...hashes, ...(existing?.ownerTokenHashes ?? [])])].slice(0, MAX_OWNER_HASHES);
  const nextMeToo = meTooHash ?? existing?.meTooHash ?? null;
  if (existing
    && (existing.meTooHash ?? null) === nextMeToo
    && existing.keys.p256dh === subscription.keys.p256dh
    && existing.keys.auth === subscription.keys.auth
    && merged.length === existing.ownerTokenHashes.length
    && merged.every((hash) => existing.ownerTokenHashes.includes(hash))) {
    return { list, changed: false };
  }
  const record: PushRecord = {
    id,
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    ownerTokenHashes: merged,
    ...(nextMeToo ? { meTooHash: nextMeToo } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return { list: [record, ...list.filter((item) => item.id !== id)], changed: true };
}

/** 이 신고의 주인인 기기들. 소유 토큰 해시가 하나라도 겹치면 보낸다. */
export function recipientsFor(list: PushRecord[], reportOwnerHashes: string[]): PushRecord[] {
  const owners = new Set(reportOwnerHashes.filter(Boolean));
  if (owners.size === 0) return [];
  return list.filter((record) => record.ownerTokenHashes.some((hash) => owners.has(hash)));
}

/** 이 신고에 공감한 기기들. 신고한 기기(이미 따로 알림을 받는다)는 뺀다. */
export function meTooRecipientsFor(list: PushRecord[], meTooHashes: string[], exclude: PushRecord[] = []): PushRecord[] {
  const hashes = new Set(meTooHashes.filter(Boolean));
  if (hashes.size === 0) return [];
  const skip = new Set(exclude.map((record) => record.id));
  return list.filter((record) => record.meTooHash && hashes.has(record.meTooHash) && !skip.has(record.id));
}

/** 공감한 학생에게 — 처리 완료됐으니 정말 고쳐졌는지 알려 달라고 묻는다. 신고 내용은 싣지 않는다. */
export function buildVerifyPush(report: { id: string; schoolId?: string | null }): PushMessage {
  const school = report.schoolId ? `&school=${encodeURIComponent(report.schoolId)}` : "";
  return {
    title: "같이 겪은 문제가 처리됐대요",
    body: `${report.id} · 정말 고쳐졌는지 알려 주세요.`,
    url: `/?view=report&id=${encodeURIComponent(report.id)}${school}`,
    tag: `verify-${report.id}`,
  };
}

const STATUS_LABEL: Record<string, string> = {
  pending: "접수 대기",
  reviewing: "확인 중",
  assigned: "담당자 배정",
  scheduled: "조치 예정",
  in_progress: "처리 중",
  completed: "처리 완료",
};

/**
 * 알림 문구. 신고 내용은 싣지 않는다 — 잠금 화면에 그대로 보일 수 있기 때문이다.
 * 접수번호와 무엇이 바뀌었는지만 알린다.
 */
export function buildReportPush(
  report: { id: string; schoolId?: string | null; title?: string | null },
  change: { status?: { from: string; to: string } | null; reply?: boolean; published?: boolean }
): PushMessage | null {
  const parts: string[] = [];
  let title = "";
  if (change.status && change.status.from !== change.status.to) {
    const to = STATUS_LABEL[change.status.to] ?? change.status.to;
    title = change.status.to === "completed" ? "신고한 문제가 처리됐어요" : `신고가 '${to}' 단계로 바뀌었어요`;
    parts.push(change.status.to === "completed" ? "해결됐는지 알려 주세요." : `처리 상태: ${to}`);
  }
  if (change.reply) {
    if (!title) title = "학교에서 답변을 남겼어요";
    parts.push("학교 답변이 도착했어요.");
  }
  if (change.published) {
    if (!title) title = "신고가 공개됐어요";
    parts.push("운영진 확인을 마치고 공개됐어요.");
  }
  if (!title) return null;
  const school = report.schoolId ? `&school=${encodeURIComponent(report.schoolId)}` : "";
  return {
    title,
    body: `${report.id} · ${parts.join(" ")}`,
    url: `/?view=mine${school}`,
    tag: `report-${report.id}`,
  };
}

// ---------------------------------------------------------------------------
// 발송
// ---------------------------------------------------------------------------

let configured: boolean | null = null;

/** VAPID 키가 있으면 web-push 를 설정한다. 키가 틀리면 기능을 끄고 이유를 로그에 남긴다. */
export function pushEnabled(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    configured = false;
    return configured;
  }
  const base = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  const subject = process.env.VAPID_SUBJECT?.trim() || (base && /^https:\/\//i.test(base) ? base : "mailto:schoolfix@example.com");
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (err) {
    console.error("[push] VAPID 키 설정이 올바르지 않아 학생 알림을 끕니다:", err instanceof Error ? err.message : err);
    configured = false;
  }
  return configured;
}

export function vapidPublicKey(): string | null {
  return pushEnabled() ? process.env.VAPID_PUBLIC_KEY!.trim() : null;
}

/**
 * 알림을 보낸다. 더 이상 유효하지 않은 구독의 id 목록을 돌려준다(호출한 쪽이 저장소에서 지운다).
 * 실패해도 예외를 던지지 않는다 — 알림은 부가 기능이다.
 */
export async function sendPush(records: PushRecord[], message: PushMessage): Promise<string[]> {
  if (!pushEnabled() || records.length === 0) return [];
  const expired: string[] = [];
  const payload = JSON.stringify(message);
  await Promise.all(records.map(async (record) => {
    try {
      await webpush.sendNotification({ endpoint: record.endpoint, keys: record.keys }, payload, { TTL: 24 * 60 * 60, urgency: "normal" });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) expired.push(record.id);
      else console.error("[push] 알림 발송 실패:", status ?? (err instanceof Error ? err.message : err));
    }
  }));
  return expired;
}
