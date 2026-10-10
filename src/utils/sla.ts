/**
 * 처리 기한(SLA) — 순수 로직
 *
 * 위험도마다 처리 기한을 두고, 넘기면 운영진 화면에 지연으로 표시한다.
 * 기한은 접수 시각부터 센다. 위험도가 아직 없으면 기본 기한을 쓴다.
 * React 를 import 하지 않는다. 운영진 화면과 월별 통계가 같은 규칙을 쓴다.
 */

export const SLA_DAYS: Record<string, number> = {
  긴급: 1,
  높음: 3,
  중간: 7,
  낮음: 14,
};

/** 위험도 분석 전인 신고의 기한 */
export const DEFAULT_SLA_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SlaInput {
  riskLevel?: string | null;
  status: string;
  createdAt: string;
  completedAt?: string | null;
}

export interface SlaState {
  /** 처리 기한 (ISO) */
  dueAt: string;
  /** 아직 처리되지 않았고 기한이 지났는지 */
  overdue: boolean;
  /** 남은 일수(올림). 기한이 지났으면 0 — 처리 완료 건은 null */
  daysLeft: number | null;
  /** 기한을 넘긴 일수(올림). 넘기지 않았으면 0 */
  overdueDays: number;
  /** 처리 완료 건이 기한을 넘겨 완료됐는지. 미완료 건은 null */
  completedLate: boolean | null;
}

export function slaDays(riskLevel?: string | null): number {
  return (riskLevel && SLA_DAYS[riskLevel]) || DEFAULT_SLA_DAYS;
}

export function computeSla(report: SlaInput, now = Date.now()): SlaState {
  const created = new Date(report.createdAt).getTime();
  const base = Number.isFinite(created) ? created : now;
  const due = base + slaDays(report.riskLevel) * DAY_MS;
  const dueAt = new Date(due).toISOString();

  if (report.status === "completed") {
    const completed = report.completedAt ? new Date(report.completedAt).getTime() : NaN;
    return {
      dueAt,
      overdue: false,
      daysLeft: null,
      overdueDays: 0,
      completedLate: Number.isFinite(completed) ? completed > due : null,
    };
  }

  const overdue = now > due;
  return {
    dueAt,
    overdue,
    daysLeft: overdue ? 0 : Math.ceil((due - now) / DAY_MS),
    overdueDays: overdue ? Math.ceil((now - due) / DAY_MS) : 0,
    completedLate: null,
  };
}

/** 화면에 보여줄 짧은 문구 */
export function slaLabel(state: SlaState): string {
  if (state.daysLeft === null) {
    return state.completedLate ? "기한 넘겨 완료" : "기한 내 완료";
  }
  if (state.overdue) return `기한 ${state.overdueDays}일 초과`;
  return `D-${state.daysLeft}`;
}
