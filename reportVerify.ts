/**
 * "진짜 고쳐졌나요?" — 처리 완료된 신고를 같은 문제를 겪은 학생들이 확인한다.
 *
 * 처리 완료가 되면 "나도 겪었어요" 를 눌렀던 기기에 알림을 보내고, 그 학생들이 👍(고쳐졌어요) / 👎(아직 그대로예요) 를 누른다.
 * 공감했던 기기만 누를 수 있다 — 아무나 누를 수 있으면 장난으로 신고를 계속 다시 열 수 있기 때문이다.
 * 👎 가 REOPEN_MIN_VOTES 개 이상이고 👍 보다 많으면 신고를 "확인 중" 으로 되돌린다.
 * 다시 완료되면 이전 표는 세지 않고 새로 받는다.
 */

export interface VerificationVote {
  /** "나도 겪었어요" 기기 해시 (외부로 내보내지 않는다) */
  hash: string;
  fixed: boolean;
  at: string;
}

export interface VerificationCounts {
  fixed: number;
  notFixed: number;
}

/** 다시 열려면 필요한 "아직 그대로예요" 수 */
export const REOPEN_MIN_VOTES = 2;
/** 한 번의 완료에 받을 수 있는 표 수 (공감 상한과 같다) */
export const MAX_VOTES = 2000;

interface VerifiableReport {
  status: string;
  completedAt?: string | null;
  verifications?: VerificationVote[];
}

/** 이번 완료 뒤에 들어온 표만 */
export function currentVotes(report: VerifiableReport): VerificationVote[] {
  if (report.status !== "completed" || !report.completedAt) return [];
  const since = Date.parse(report.completedAt);
  return (report.verifications ?? []).filter((vote) => Date.parse(vote.at) >= since);
}

export function verificationCounts(report: VerifiableReport): VerificationCounts {
  const votes = currentVotes(report);
  const fixed = votes.filter((vote) => vote.fixed).length;
  return { fixed, notFixed: votes.length - fixed };
}

export function shouldReopen(counts: VerificationCounts): boolean {
  return counts.notFixed >= REOPEN_MIN_VOTES && counts.notFixed > counts.fixed;
}

/**
 * 표를 넣는다. 같은 기기가 다시 누르면 바꾼다. 지난 완료의 표는 버려 목록이 커지지 않게 한다.
 * 이번 완료에 처음 누른 기기인데 상한에 닿았으면 null.
 */
export function castVote(report: VerifiableReport, hash: string, fixed: boolean, now = new Date()): VerificationVote[] | null {
  const votes = currentVotes(report);
  const existing = votes.find((vote) => vote.hash === hash);
  if (!existing && votes.length >= MAX_VOTES) return null;
  const vote: VerificationVote = { hash, fixed, at: now.toISOString() };
  return [...votes.filter((item) => item.hash !== hash), vote];
}
