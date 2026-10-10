/**
 * 신고를 쓰는 중에 같은 문제로 보이는 기존 신고를 찾는다 — 순수 로직
 *
 * 같은 위치 유형은 꼭 같아야 하고, 그 위에서
 *  - 같은 세부 장소(공식 위치)를 골랐으면 +3
 *  - 같은 문제 종류면 +2
 *  - 세부 위치·건물·층·반·호실 글자가 겹치면 단어당 +1 (최대 2)
 * 를 더해 2점 이상인 처리 중 신고만 보여 준다. 처리 완료·공개 보류 신고는 뺀다.
 */

export interface SimilarDraft {
  locationType: string;
  locationId?: string | null;
  category?: string | null;
  /** 세부 위치·건물·층·반·호실을 합친 글 */
  placeText?: string | null;
}

export interface SimilarCandidate {
  id: string;
  status: string;
  moderationStatus?: string | null;
  locationType?: string | null;
  location: string;
  locationId?: string | null;
  category: string;
  locationDetail?: string | null;
  buildingName?: string | null;
  floor?: string | null;
  className?: string | null;
  roomName?: string | null;
  meTooCount?: number;
  createdAt: string;
}

const STOP_WORDS = new Set(["앞", "옆", "뒤", "안", "쪽", "근처", "있는", "에서", "the"]);

export function placeTokens(text: string | null | undefined): Set<string> {
  return new Set(
    (text ?? "")
      .toLowerCase()
      .split(/[\s·,./()\-_~]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
  );
}

export function candidatePlaceText(r: SimilarCandidate): string {
  return [r.locationDetail, r.buildingName, r.floor, r.className, r.roomName].filter(Boolean).join(" ");
}

export function similarityScore(draft: SimilarDraft, r: SimilarCandidate): number {
  if ((r.locationType || r.location) !== draft.locationType) return 0;
  let score = 0;
  if (draft.locationId && r.locationId === draft.locationId) score += 3;
  if (draft.category && r.category === draft.category) score += 2;
  const mine = placeTokens(draft.placeText);
  if (mine.size) {
    let shared = 0;
    for (const token of placeTokens(candidatePlaceText(r))) if (mine.has(token)) shared += 1;
    score += Math.min(shared, 2);
  }
  return score;
}

export function findSimilarReports<T extends SimilarCandidate>(draft: SimilarDraft, reports: T[], limit = 3): T[] {
  if (!draft.locationType) return [];
  return reports
    .filter((r) => r.status !== "completed" && r.moderationStatus !== "held")
    .map((r) => ({ r, score: similarityScore(draft, r) }))
    .filter(({ score }) => score >= 2)
    .sort((a, b) => b.score - a.score || (b.r.meTooCount ?? 0) - (a.r.meTooCount ?? 0) || b.r.createdAt.localeCompare(a.r.createdAt))
    .slice(0, limit)
    .map(({ r }) => r);
}
