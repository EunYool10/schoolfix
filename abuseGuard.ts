/**
 * 반복 신고자 걸러내기
 *
 * 학교는 학생 전체가 IP 하나를 함께 쓰는 경우가 많아, IP 로 막으면 정상 학생까지 통째로 차단된다.
 * 그래서 브라우저마다 발급하는 기기 토큰(원본은 브라우저에만, 서버에는 해시만)으로 신고자를 구분한다.
 *
 * 걸러낸다고 접수를 거부하지는 않는다. 진짜 위험 신고일 수도 있으므로
 * 접수는 받되 "공개 보류"로 돌려 운영진이 확인한 뒤에만 공개되게 한다.
 *
 * 한계: 브라우저 저장소를 지우거나 다른 기기를 쓰면 새 토큰이 발급된다.
 * 개인 식별 정보를 모으지 않는 서비스 원칙상 이 이상은 추적하지 않는다.
 */

export const ABUSE_RULES = {
  /** 짧은 시간 연속 신고 판단 구간 */
  burstWindowMs: 10 * 60 * 1000,
  /** 위 구간 안에서 허용하는 신고 수. 이보다 많으면 보류 */
  burstMax: 3,
  /** 24시간 안에서 허용하는 신고 수 */
  dailyMax: 10,
  /** 운영진이 장난 신고로 처리했을 때 기기를 보류 대상으로 두는 기간 */
  blockDays: 30,
};

export interface BlockedReporter {
  /** 기기 토큰 해시 */
  hash: string;
  /** 보류 해제 시각 (ISO) */
  until: string;
  reason: string;
  /** 차단의 계기가 된 신고 */
  reportId: string | null;
  createdAt: string;
}

export interface ReporterVerdict {
  hold: boolean;
  reason: string | null;
}

export function activeBlock(hash: string | null, blocked: BlockedReporter[], now = Date.now()): BlockedReporter | null {
  if (!hash) return null;
  return blocked.find((entry) => entry.hash === hash && new Date(entry.until).getTime() > now) ?? null;
}

/**
 * @param previousCreatedAts 같은 기기가 이전에 접수한 신고들의 접수 시각 (삭제된 신고 포함)
 */
export function evaluateReporter(
  hash: string | null,
  previousCreatedAts: string[],
  blocked: BlockedReporter[],
  now = Date.now()
): ReporterVerdict {
  if (!hash) return { hold: false, reason: null };

  if (activeBlock(hash, blocked, now)) {
    return { hold: true, reason: "장난 신고로 처리된 기기의 신고" };
  }

  const times = previousCreatedAts.map((iso) => new Date(iso).getTime()).filter(Number.isFinite);
  const inBurst = times.filter((t) => now - t < ABUSE_RULES.burstWindowMs).length;
  if (inBurst >= ABUSE_RULES.burstMax) {
    return { hold: true, reason: "짧은 시간 안에 같은 기기에서 반복 신고" };
  }
  const inDay = times.filter((t) => now - t < 24 * 60 * 60 * 1000).length;
  if (inDay >= ABUSE_RULES.dailyMax) {
    return { hold: true, reason: "하루 신고 한도를 넘긴 기기의 신고" };
  }
  return { hold: false, reason: null };
}

export function blockUntil(now = Date.now()): string {
  return new Date(now + ABUSE_RULES.blockDays * 24 * 60 * 60 * 1000).toISOString();
}
