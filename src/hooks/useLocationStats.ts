import { useEffect, useState } from "react";
import { LocationStatistic, LocationStatsResponse } from "../types";
import { filtersToQuery, type ReportFilterState } from "../utils/reportFilter";

/**
 * 위치별 신고 통계 — 서버에서 받아만 온다 (§5, §23).
 *
 * 화면에서 다시 계산하지 않는다. 계산이 두 곳에 있으면 목록과 통계가 어긋나고,
 * 무엇보다 "실제 DB 에서 나온 값"이라는 보장이 깨진다.
 *
 * 필터가 바뀌면 같은 조건을 그대로 서버에 넘겨 다시 집계한다 (§6).
 * 검색어는 한 글자마다 요청이 나가지 않도록 잠깐 기다렸다가 보낸다.
 */

const DEBOUNCE_MS = 300;

export interface LocationStatsState {
  locations: LocationStatistic[];
  /** 집계 대상이 된 신고 수 (필터 적용 후) */
  total: number;
  isLoading: boolean;
  error: string | null;
}

const EMPTY: LocationStatsState = { locations: [], total: 0, isLoading: false, error: null };

export function useLocationStats(
  filters: ReportFilterState,
  enabled: boolean,
  /** 신고가 등록·삭제되면 바뀌는 값. 통계를 다시 받아오는 계기가 된다. */
  revision: unknown
): LocationStatsState {
  const [state, setState] = useState<LocationStatsState>(EMPTY);
  const query = filtersToQuery(filters);

  useEffect(() => {
    if (!enabled) {
      setState(EMPTY);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/reports/location-statistics${query ? `?${query}` : ""}`,
          { signal: controller.signal }
        );
        const json = (await res.json()) as LocationStatsResponse;

        if (cancelled) return;
        if (!res.ok || !json.ok) throw new Error("위치 통계를 불러오지 못했습니다.");

        setState({
          locations: Array.isArray(json.locations) ? json.locations : [],
          total: typeof json.total === "number" ? json.total : 0,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        console.error("[location-stats]", err);
        setState({
          locations: [],
          total: 0,
          isLoading: false,
          error: "위치 통계를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
        });
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, enabled, revision]);

  return state;
}
