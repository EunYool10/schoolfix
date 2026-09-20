import { useState } from "react";
import { MapPin, Loader2, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { LocationStatistic } from "../types";
import { LocationStatsState } from "../hooks/useLocationStats";

/**
 * 위치별 신고 현황 (§2, §4).
 *
 * 표시되는 모든 숫자와 날짜는 서버가 실제 DB 에서 계산한 값이다.
 * 이 컴포넌트는 계산하지 않고 받은 값을 그리기만 한다 (§23).
 *
 * 목록 위의 "AI 위험도" 칩 줄과 같은 결로 맞춰, 새 디자인 시스템을 들이지 않는다.
 */

const VISIBLE_COUNT = 5;

interface LocationStatsPanelProps {
  stats: LocationStatsState;
  /** 필터가 걸려 있는지 — 빈 결과의 안내 문구가 달라진다 (§7) */
  hasFilters: boolean;
  /** 현재 적용된 기간 라벨 (예: "최근 7일") */
  rangeLabel: string;
}

export function LocationStatsPanel({ stats, hasFilters, rangeLabel }: LocationStatsPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const { locations, total, isLoading, error } = stats;
  const shown = expanded ? locations : locations.slice(0, VISIBLE_COUNT);
  const topCount = locations[0]?.reportCount ?? 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-900">
          <MapPin className="h-4 w-4 text-blue-700" />
          <span>위치별 신고 현황</span>
          <span className="text-[11px] font-medium text-slate-400">{rangeLabel}</span>
        </h2>

        {!isLoading && !error && locations.length > 0 && (
          <span className="text-[11px] text-slate-500">
            집계 대상 <span className="font-mono tabular-nums font-semibold">{total}</span>건 ·
            장소 <span className="font-mono tabular-nums font-semibold">{locations.length}</span>곳
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>위치별 신고를 집계하는 중…</span>
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : locations.length === 0 ? (
        /* 빈 그래프나 0 을 그리지 않는다. 없는 데이터를 만들어 채우지도 않는다 (§7, §23). */
        <div className="rounded-lg bg-slate-50 border border-slate-200 py-8 text-center">
          <MapPin className="h-6 w-6 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-600">
            {hasFilters
              ? "선택한 조건에 해당하는 신고가 없습니다."
              : "아직 집계할 신고 데이터가 없습니다."}
          </p>
          {!hasFilters && (
            <p className="mt-1 text-[11px] text-slate-400">
              신고가 접수되면 장소별로 자동 집계됩니다.
            </p>
          )}
        </div>
      ) : (
        <>
          <ol className="space-y-2">
            {shown.map((item, index) => (
              <LocationRow key={item.name} rank={index + 1} item={item} topCount={topCount} />
            ))}
          </ol>

          {locations.length > VISIBLE_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  <span>접기</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  <span>나머지 {locations.length - VISIBLE_COUNT}곳 더 보기</span>
                </>
              )}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function LocationRow({
  rank,
  item,
  topCount,
}: {
  rank: number;
  item: LocationStatistic;
  topCount: number;
}) {
  // 막대 길이는 1위 대비 비율이다. 실제 건수를 가리지 않도록 숫자를 항상 함께 적는다.
  const ratio = topCount > 0 ? Math.max(6, Math.round((item.reportCount / topCount) * 100)) : 0;

  return (
    <li className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${
            rank === 1 ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-600"
          }`}
        >
          {rank}
        </span>

        <span className="text-xs font-bold text-slate-900 truncate">{item.name}</span>

        <span className="ml-auto shrink-0 text-xs font-bold font-mono tabular-nums text-slate-900">
          {item.reportCount}
          <span className="text-[10px] font-normal text-slate-500 ml-0.5">건</span>
        </span>
      </div>

      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
        <div
          className={`h-full rounded-full ${item.urgentCount > 0 ? "bg-rose-500" : item.highRiskCount > 0 ? "bg-orange-500" : "bg-blue-600"}`}
          style={{ width: `${ratio}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {item.mainCategory && (
          <span>
            주요 문제{" "}
            <span className="font-semibold text-slate-700">
              {item.mainCategory}
            </span>{" "}
            <span className="font-mono tabular-nums">{item.mainCategoryCount}건</span>
          </span>
        )}

        {item.highRiskCount > 0 && (
          <span className="text-orange-700">
            높음 이상 <span className="font-mono tabular-nums font-semibold">{item.highRiskCount}건</span>
            {item.urgentCount > 0 && (
              <span className="text-rose-700">
                {" "}
                (긴급 <span className="font-mono tabular-nums font-semibold">{item.urgentCount}</span>)
              </span>
            )}
          </span>
        )}

        {item.latestReportAt && (
          <span>
            최근 신고{" "}
            <span className="font-mono tabular-nums">
              {new Date(item.latestReportAt).toLocaleDateString("ko-KR")}
            </span>
          </span>
        )}

        {/* 서로 다른 표기를 하나로 묶었다면 무엇이 묶였는지 밝힌다. 임의 통합이 아님을 보이기 위함이다. */}
        {item.mergedFrom.length > 1 && (
          <span className="text-slate-400" title={item.mergedFrom.join(" / ")}>
            표기 {item.mergedFrom.length}가지 통합
          </span>
        )}
      </div>
    </li>
  );
}
