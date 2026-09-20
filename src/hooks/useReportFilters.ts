import { useMemo, useState } from "react";
import { SchoolReport } from "../types";
import {
  filterReports,
  INITIAL_FILTERS,
  type ReportFilterState,
} from "../utils/reportFilter";

/**
 * 신고 목록 필터 공통 로직 (§16).
 *
 * 판정 규칙 자체는 src/utils/reportFilter.ts 에 있다.
 * 서버의 위치 통계 API 가 같은 규칙을 그대로 쓰기 위해서다 — 규칙이 두 벌이면
 * 목록과 통계가 서로 다른 신고를 세게 된다.
 * 이 파일은 그 규칙에 React 상태를 붙이는 얇은 껍데기다.
 *
 * 탭(내 신고 / 전체 신고)은 필터보다 상위 개념이므로 이 훅 바깥에서 목록을 먼저 고른 뒤
 * 그 결과를 이 훅에 넘긴다.
 *
 *   탭 선택 -> 검색 -> 카테고리 -> 위험도 -> 처리 상태 -> 날짜 -> 최종 목록
 */

// 기존 import 경로를 유지하기 위해 그대로 다시 내보낸다.
export {
  filterReports,
  INITIAL_FILTERS,
  DATE_RANGE_LABELS,
  filtersToQuery,
  type DateRange,
  type ReportFilterState,
} from "../utils/reportFilter";

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
