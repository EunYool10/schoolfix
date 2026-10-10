/**
 * 월별 통계 — 순수 로직
 *
 * 운영진이 학교에 보고할 때 쓰는 월간 수치를 신고 목록에서 계산한다.
 * 월 경계는 한국 시간(UTC+9) 기준이다. 서버가 UTC 로 돌아도 같은 결과가 나온다.
 * 모든 숫자는 전달받은 신고에서만 계산한다. 추정값을 만들지 않는다.
 */

import { computeSla } from "./sla";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export interface MonthlyStatsInput {
  createdAt: string;
  completedAt?: string | null;
  status: string;
  category: string;
  /** 집계용 위치 이름 (위치 유형 또는 세부 위치를 합친 표시명) */
  location: string;
  riskLevel?: string | null;
}

export interface MonthlyReport {
  /** "YYYY-MM" */
  month: string;
  /** 그 달에 접수된 신고 수 */
  received: number;
  /** 그 달 접수분 중 처리 완료된 수 */
  completedOfReceived: number;
  /** 완료율(0~100, 정수). 접수가 없으면 null */
  completionRate: number | null;
  /** 그 달에 처리 완료된 신고 수 (접수 월과 무관) */
  completedInMonth: number;
  /** 그 달에 완료된 신고의 평균 처리 시간(시간 단위, 소수 첫째 자리). 없으면 null */
  avgResolutionHours: number | null;
  /** 그 달에 완료된 신고 중 기한을 넘겨 완료된 수 */
  completedLate: number;
  byCategory: [string, number][];
  byLocation: [string, number][];
  byRisk: [string, number][];
}

export interface TrendPoint {
  month: string;
  received: number;
  completed: number;
}

/** ISO 시각 → 한국 시간 기준 "YYYY-MM". 해석할 수 없으면 null */
export function monthKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + KST_OFFSET_MS).toISOString().slice(0, 7);
}

/** "YYYY-MM" 에서 n 달 이동 */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function countBy<T>(items: T[], key: (item: T) => string | null | undefined): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
}

export function buildMonthlyReport(reports: MonthlyStatsInput[], month: string): MonthlyReport {
  const received = reports.filter((r) => monthKey(r.createdAt) === month);
  const completedOfReceived = received.filter((r) => r.status === "completed").length;
  const completedInMonth = reports.filter(
    (r) => r.status === "completed" && monthKey(r.completedAt) === month
  );

  const durations = completedInMonth
    .map((r) => new Date(r.completedAt as string).getTime() - new Date(r.createdAt).getTime())
    .filter((ms) => Number.isFinite(ms) && ms >= 0);

  return {
    month,
    received: received.length,
    completedOfReceived,
    completionRate: received.length ? Math.round((completedOfReceived / received.length) * 100) : null,
    completedInMonth: completedInMonth.length,
    avgResolutionHours: durations.length
      ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length / HOUR_MS) * 10) / 10
      : null,
    completedLate: completedInMonth.filter((r) => computeSla(r).completedLate === true).length,
    byCategory: countBy(received, (r) => r.category),
    byLocation: countBy(received, (r) => r.location),
    byRisk: countBy(received, (r) => r.riskLevel ?? "미분석"),
  };
}

/** 최근 n 달(이번 달 포함)의 접수·완료 추이. 오래된 달이 앞에 온다. */
export function monthlyTrend(reports: MonthlyStatsInput[], months: number, now = Date.now()): TrendPoint[] {
  const current = monthKey(new Date(now).toISOString()) as string;
  const points: TrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const month = shiftMonth(current, -i);
    points.push({
      month,
      received: reports.filter((r) => monthKey(r.createdAt) === month).length,
      completed: reports.filter((r) => r.status === "completed" && monthKey(r.completedAt) === month).length,
    });
  }
  return points;
}

/** 처리 시간을 사람이 읽기 쉬운 문구로 */
export function formatHours(hours: number | null): string {
  if (hours === null) return "-";
  if (hours < 24) return `${hours}시간`;
  return `${Math.round((hours / 24) * 10) / 10}일`;
}
