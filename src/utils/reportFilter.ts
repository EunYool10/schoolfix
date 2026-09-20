/**
 * 신고 필터 — 순수 로직 (§16, §25)
 *
 * 목록 화면(useReportFilters)과 서버의 위치 통계 API 가 **같은 규칙**으로 걸러야 한다.
 * 규칙이 두 벌이면 "최근 7일 · 시설 고장" 으로 좁힌 목록과 그 아래 통계가 서로 다른
 * 신고 집합을 보게 된다. 그래서 판정 로직은 여기 한 곳에만 둔다.
 *
 * React 를 import 하지 않는다. 서버(server.ts)에서도 그대로 가져다 쓰기 때문이다.
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

const DATE_RANGES: DateRange[] = ["ALL", "TODAY", "WEEK", "MONTH"];

/**
 * 필터가 판단에 쓰는 필드만 요구한다.
 * 화면의 SchoolReport 와 서버의 공개 DTO 가 모두 이 모양을 만족한다.
 */
export interface FilterableReport {
  id: string;
  title?: string | null;
  location: string;
  category: string;
  description: string;
  riskLevel?: string | null;
  status: string;
  createdAt: string;
}

export function withinRange(createdAt: string, range: DateRange, now = Date.now()): boolean {
  if (range === "ALL") return true;

  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return true;

  const day = 24 * 60 * 60 * 1000;

  if (range === "TODAY") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return created >= start.getTime();
  }
  if (range === "WEEK") return created >= now - 7 * day;
  if (range === "MONTH") return created >= now - 30 * day;
  return true;
}

/** 필터 적용 — 순수 함수라 테스트하기 쉽고 PDF·인쇄·서버 통계에서도 그대로 쓸 수 있다. */
export function filterReports<T extends FilterableReport>(
  reports: T[],
  filters: ReportFilterState
): T[] {
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
      if ((r.riskLevel ?? null) !== filters.risk) return false;
    }

    if (filters.status !== "ALL" && r.status !== filters.status) return false;

    if (!withinRange(r.createdAt, filters.dateRange)) return false;

    return true;
  });
}

// ---------------------------------------------------------------------------
// 쿼리 문자열 변환 — 화면의 필터 상태를 그대로 서버로 보낸다
// ---------------------------------------------------------------------------

/** 화면 → 서버. 기본값(ALL·빈 문자열)은 보내지 않아 URL 을 짧게 유지한다. */
export function filtersToQuery(filters: ReportFilterState): string {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.category !== "ALL") params.set("category", filters.category);
  if (filters.risk !== "ALL") params.set("risk", filters.risk);
  if (filters.status !== "ALL") params.set("status", filters.status);
  if (filters.dateRange !== "ALL") params.set("range", filters.dateRange);
  return params.toString();
}

/**
 * 서버 ← 화면. 쿼리 문자열은 신뢰할 수 없는 입력이므로
 * 허용된 값만 통과시키고 나머지는 기본값으로 되돌린다 (§22).
 */
export function parseFilterQuery(
  query: Record<string, unknown>,
  allowedCategories: readonly string[],
  allowedRisks: readonly string[],
  allowedStatuses: readonly string[]
): ReportFilterState {
  const pick = (value: unknown, allowed: readonly string[]): string => {
    if (typeof value !== "string") return "ALL";
    const trimmed = value.trim();
    return allowed.includes(trimmed) ? trimmed : "ALL";
  };

  const rawRange = typeof query.range === "string" ? query.range.trim() : "";
  const dateRange = (DATE_RANGES as string[]).includes(rawRange)
    ? (rawRange as DateRange)
    : "ALL";

  return {
    // 검색어는 자유 입력이라 길이만 제한한다. 값 자체는 문자열 포함 비교에만 쓰인다.
    search: typeof query.search === "string" ? query.search.slice(0, 100) : "",
    category: pick(query.category, allowedCategories),
    risk: pick(query.risk, allowedRisks),
    status: pick(query.status, allowedStatuses),
    dateRange,
  };
}
