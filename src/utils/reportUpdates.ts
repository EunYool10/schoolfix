/**
 * "내 신고" 새 소식 표시 — 순수 로직 + 브라우저 저장
 *
 * 내 신고마다 마지막으로 확인한 상태(처리 상태 · 학교 답변 시각 · 공개 여부)를 이 브라우저에 기억해 두고,
 * 그 뒤로 바뀐 신고에 'NEW' 를 붙인다. 로그인이 없으므로 서버는 누가 무엇을 봤는지 모른다.
 *
 * 처음 보는 신고는 지금 상태를 기준으로 기억만 하고 NEW 를 붙이지 않는다(방금 접수한 신고 등).
 */

export interface UpdateSource {
  id: string;
  status: string;
  moderationStatus?: string | null;
  reporterReplyAt?: string | null;
}

export interface SeenSnapshot {
  status: string;
  moderation: string;
  replyAt: string;
}

export type UpdateKind = "status" | "reply" | "published";

const STORAGE_KEY = "schoolfix_seen_reports_v1";
/** 기억해 둘 신고 수. 오래된 것부터 지운다. */
const MAX_ENTRIES = 300;

export function snapshotOf(r: UpdateSource): SeenSnapshot {
  return { status: r.status, moderation: r.moderationStatus ?? "approved", replyAt: r.reporterReplyAt ?? "" };
}

/** 마지막으로 본 뒤 무엇이 바뀌었는지. 바뀐 게 없거나 처음 보는 신고면 빈 배열 */
export function changesSince(seen: SeenSnapshot | undefined, r: UpdateSource): UpdateKind[] {
  if (!seen) return [];
  const now = snapshotOf(r);
  const kinds: UpdateKind[] = [];
  if (now.replyAt && now.replyAt !== seen.replyAt) kinds.push("reply");
  if (now.status !== seen.status) kinds.push("status");
  if (seen.moderation === "held" && now.moderation !== "held") kinds.push("published");
  return kinds;
}

export const UPDATE_LABEL: Record<UpdateKind, string> = {
  reply: "학교 답변",
  status: "상태 변경",
  published: "공개됨",
};

export function loadSeen(): Record<string, SeenSnapshot> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveSeen(seen: Record<string, SeenSnapshot>) {
  try {
    const entries = Object.entries(seen);
    const trimmed = entries.length > MAX_ENTRIES ? Object.fromEntries(entries.slice(-MAX_ENTRIES)) : seen;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // 저장이 막힌 브라우저에서는 NEW 표시만 유지되지 않는다.
  }
}

/** 처음 보는 신고를 지금 상태로 기억한다. 바뀐 것이 있으면 true */
export function rememberNew(reports: UpdateSource[]): boolean {
  const seen = loadSeen();
  let changed = false;
  for (const r of reports) {
    if (!seen[r.id]) {
      seen[r.id] = snapshotOf(r);
      changed = true;
    }
  }
  if (changed) saveSeen(seen);
  return changed;
}

/** 신고를 열어 봤으면 지금 상태를 확인한 것으로 기억한다. */
export function markSeen(r: UpdateSource) {
  const seen = loadSeen();
  delete seen[r.id];
  seen[r.id] = snapshotOf(r);
  saveSeen(seen);
}
