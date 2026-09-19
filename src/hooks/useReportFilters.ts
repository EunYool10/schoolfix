import { useMemo, useState } from "react";
import { SchoolReport, ReportStatus, RiskLevel } from "../types";

/**
 * 신고 목록 필터 공통 로직 (§16).
 *
 * 같은 필터 코드를 여러 컴포넌트에 복사하지 않기 위해 한 곳에 모았다.
 * 탭(내 신고 / 전체 신고)은 필터보다 상위 개념이므로 이 훅 바깥에서 목록을 먼저 고른 뒤
 * 그 결과를 이 훅에 넘긴다.
 *
 *   탭 선택 -> 검색 -> 카테고리 -> 위험도 -> 처리 상태 -> 날짜 -> 최종 목록
 */

export type DateRange = "ALL" | "TODAY" | "WEEK" | "MONTH";

export interface ReportFilterState {
  search: string;
  category: string;
  risk: string;
  status: string;
  dateRange: DateRange;
}

export const INITIAL_FILTERS: ReportFilterState = {
  search: "",
  category: "ALL",
  risk: "ALL",
  status: "ALL",
  dateRange: "ALL",
};

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  ALL: "전체 기간",
  TODAY: "오늘",
  WEEK: "최근 7일",
  MONTH: "최근 30일",
};

function withinRange(createdAt: string, range: DateRange): boolean {
  if (range === "ALL") return true;

  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return true;

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  if (range === "TODAY") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return created >= start.getTime();
  }
  if (range === "WEEK") return created >= now - 7 * day;
  if (range === "MONTH") return created >= now - 30 * day;
  return true;
}

/** 필터 적용 — 순수 함수라 테스트하기 쉽고 PDF·인쇄에서도 그대로 쓸 수 있다. */
export function filterReports(
  reports: SchoolReport[],
  filters: ReportFilterState
): SchoolReport[] {
  const q = filters.search.trim().toLowerCase();

  return reports.filter((r) => {
    if (q) {
      const haystack = [r.id, r.title, r.location, r.category, r.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    if (filters.category !== "ALL" && r.category !== filters.category) return false;

    if (filters.risk !== "ALL") {
      // 아직 분석되지 않은 신고는 위험도 필터에서 제외한다(없는 값을 만들어내지 않는다).
      if ((r.riskLevel ?? null) !== (filters.risk as RiskLevel)) return false;
    }

    if (filters.status !== "ALL" && r.status !== (filters.status as ReportStatus)) return false;

    if (!withinRange(r.createdAt, filters.dateRange)) return false;

    return true;
  });
}

export function useReportFilters(reports: SchoolReport[]) {
  const [filters, setFilters] = useState<ReportFilterState>(INITIAL_FILTERS);

  const filtered = useMemo(() => filterReports(reports, filters), [reports, filters]);

  const setField = <K extends keyof ReportFilterState>(
    key: K,
    value: ReportFilterState[K]
  ) => setFilters((prev) => ({ ...prev, [key]: value }));

  const reset = () => setFilters(INITIAL_FILTERS);

  const activeCount =
    (filters.search.trim() ? 1 : 0) +
    (filters.category !== "ALL" ? 1 : 0) +
    (filters.risk !== "ALL" ? 1 : 0) +
    (filters.status !== "ALL" ? 1 : 0) +
    (filters.dateRange !== "ALL" ? 1 : 0);

  return { filters, setField, reset, filtered, activeCount };
}
