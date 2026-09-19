import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  Sparkles,
  FileDown,
  Printer,
  Inbox,
  RefreshCw,
  X,
  Loader2,
} from "lucide-react";
import {
  SchoolReport,
  AiSummaryResponse,
  STATUS_MAP,
  RISK_LEVEL_MAP,
  RiskLevel,
  ReportStatus,
  ISSUE_CATEGORIES,
} from "../types";
import {
  useReportFilters,
  DATE_RANGE_LABELS,
  DateRange,
} from "../hooks/useReportFilters";
import { AiSummaryModal } from "./AiSummaryModal";
import { buildReportHtml } from "../utils/reportDocument";

export type ReportTab = "MINE" | "ALL";

interface ReportListViewProps {
  allReports: SchoolReport[];
  myReports: SchoolReport[];
  isLoading: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenReport: (report: SchoolReport) => void;
  onNavigateNewReport: () => void;
  /** 홈 카드에서 특정 탭으로 바로 들어올 때 사용 */
  initialTab?: ReportTab;
}

const RISK_OPTIONS: RiskLevel[] = ["긴급", "높음", "중간", "낮음"];
const STATUS_OPTIONS: ReportStatus[] = ["pending", "reviewing", "in_progress", "completed"];

export function ReportListView({
  allReports,
  myReports,
  isLoading,
  onRefresh,
  isRefreshing,
  onOpenReport,
  onNavigateNewReport,
  initialTab = "ALL",
}: ReportListViewProps) {
  const [tab, setTab] = useState<ReportTab>(initialTab);

  // 홈에서 다른 카드를 눌러 다시 들어오면 그 탭으로 맞춰 준다.
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // 탭은 필터보다 상위 개념이다. 탭으로 목록을 고른 뒤 그 결과에 필터를 적용한다.
  const source = tab === "MINE" ? myReports : allReports;
  const { filters, setField, reset, filtered, activeCount } = useReportFilters(source);

  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [summaryData, setSummaryData] = useState<AiSummaryResponse | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  /**
   * PDF·인쇄에 넣을 통계는 실제로 내보내는 목록(filtered)에서 계산한다.
   * 서버가 준 전체 통계를 그대로 쓰면 필터를 건 상태에서
   * "전체 신고 8건" 이라고 적힌 문서에 1건만 나열되는 모순이 생긴다.
   */
  const exportStats = useMemo(() => {
    const byRisk: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byLocation: Record<string, number> = {};
    let unanalyzed = 0;

    for (const r of filtered) {
      if (r.riskLevel) byRisk[r.riskLevel] = (byRisk[r.riskLevel] || 0) + 1;
      else unanalyzed += 1;
      byCategory[r.category] = (byCategory[r.category] || 0) + 1;
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byLocation[r.location] = (byLocation[r.location] || 0) + 1;
    }

    return { total: filtered.length, byRisk, byCategory, byStatus, byLocation, unanalyzed };
  }, [filtered]);

  // 실제 데이터에 존재하는 값만 필터 옵션으로 노출한다.
  const availableCategories = useMemo(
    () => ISSUE_CATEGORIES.filter((c) => source.some((r) => r.category === c)),
    [source]
  );

  // 탭을 바꾸면 이전 탭에만 있던 카테고리가 선택된 채로 남는다.
  // 그러면 select 가 빈칸으로 보이고 목록도 비는데 이유를 알 수 없으므로 초기화한다.
  useEffect(() => {
    if (filters.category !== "ALL" && !availableCategories.includes(filters.category as never)) {
      setField("category", "ALL");
    }
  }, [availableCategories, filters.category, setField]);

  const handleAiSummary = async () => {
    if (isSummarizing) return; // 중복 요청 방지 (§22)

    setIsSummaryOpen(true);
    setIsSummarizing(true);
    setSummaryError(null);

    try {
      const res = await fetch("/api/ai/summary", { method: "POST" });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "AI 요약을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.");
      }
      setSummaryData(json);
    } catch (err: any) {
      setSummaryError(err.message || "AI 요약을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsSummarizing(false);
    }
  };

  /**
   * 보고서만 담은 새 창을 열어 인쇄한다.
   *
   * 메인 페이지를 인쇄하면서 CSS 로 나머지를 숨기는 방식은
   * 브라우저의 :has() 지원, 숨긴 요소가 차지하는 공간, 유틸리티 우선순위에
   * 전부 의존해서 출력이 비거나 빈 페이지가 붙기 쉬웠다.
   * 새 창에는 보고서 외에 아무것도 없으므로 그런 변수가 사라진다.
   *
   * 별도 PDF 라이브러리는 쓰지 않는다. 한글 폰트를 embed 해야 해서
   * 번들이 몇 MB 늘어나는데, 브라우저 인쇄의 "PDF로 저장"이 한글을 정확히 처리한다.
   */
  const openReportWindow = () => {
    const scopeParts = [tab === "MINE" ? "내 신고" : "전체 신고"];
    if (filters.category !== "ALL") scopeParts.push(`유형 ${filters.category}`);
    if (filters.risk !== "ALL") scopeParts.push(`위험도 ${filters.risk}`);
    if (filters.status !== "ALL") scopeParts.push(`상태 ${STATUS_MAP[filters.status as ReportStatus]?.label ?? filters.status}`);
    if (filters.dateRange !== "ALL") scopeParts.push(DATE_RANGE_LABELS[filters.dateRange]);
    if (filters.search.trim()) scopeParts.push(`검색 "${filters.search.trim()}"`);

    const html = buildReportHtml({
      reports: filtered,
      stats: exportStats,
      summary: summaryData?.summary ?? null,
      scopeLabel: scopeParts.join(" · "),
    });

    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      setExportError("팝업이 차단되어 보고서를 열 수 없습니다. 브라우저의 팝업 차단을 해제한 뒤 다시 시도해주세요.");
      return;
    }

    setExportError(null);
    win.document.open();
    win.document.write(html);
    win.document.close();

    // 문서가 다 그려진 뒤 인쇄 대화상자를 띄운다.
    win.onload = () => {
      win.focus();
      win.print();
    };
  };

  const tabButton = (value: ReportTab, label: string, count: number) => {
    const active = tab === value;
    return (
      <button
        type="button"
        onClick={() => setTab(value)}
        aria-current={active ? "page" : undefined}
        className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
          active
            ? "border-blue-700 text-blue-700"
            : "border-transparent text-slate-500 hover:text-slate-800"
        }`}
      >
        <span>{label}</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
            active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* 상단: 탭 + 액션 버튼 */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-slate-200 print:hidden">
        <div className="flex items-center overflow-x-auto">
          {tabButton("MINE", "내 신고", myReports.length)}
          {tabButton("ALL", "전체 신고", allReports.length)}
        </div>

        <div className="flex flex-wrap items-center gap-2 pb-2">
          <button
            type="button"
            onClick={handleAiSummary}
            disabled={isSummarizing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 transition cursor-pointer disabled:opacity-50"
          >
            {isSummarizing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span>AI 요약</span>
          </button>
          <button
            type="button"
            onClick={openReportWindow}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>PDF 저장</span>
          </button>
          <button
            type="button"
            onClick={openReportWindow}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>인쇄</span>
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="새로고침"
            className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setField("search", e.target.value)}
            placeholder="접수번호, 위치, 내용 검색"
            className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-xs outline-none focus:border-slate-900 transition"
          />
        </div>

        <select
          value={filters.category}
          onChange={(e) => setField("category", e.target.value)}
          aria-label="카테고리 필터"
          className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs bg-white cursor-pointer"
        >
          <option value="ALL">전체 유형</option>
          {availableCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={filters.risk}
          onChange={(e) => setField("risk", e.target.value)}
          aria-label="위험도 필터"
          className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs bg-white cursor-pointer"
        >
          <option value="ALL">전체 위험도</option>
          {RISK_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(e) => setField("status", e.target.value)}
          aria-label="처리 상태 필터"
          className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs bg-white cursor-pointer"
        >
          <option value="ALL">전체 상태</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_MAP[s].label}
            </option>
          ))}
        </select>

        <select
          value={filters.dateRange}
          onChange={(e) => setField("dateRange", e.target.value as DateRange)}
          aria-label="기간 필터"
          className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs bg-white cursor-pointer"
        >
          {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map((d) => (
            <option key={d} value={d}>
              {DATE_RANGE_LABELS[d]}
            </option>
          ))}
        </select>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            <span>필터 해제 ({activeCount})</span>
          </button>
        )}
      </div>

      {exportError && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 print:hidden">
          {exportError}
        </p>
      )}

      {/* 목록 */}
      <div className="print:hidden">
        {isLoading ? (
          <div className="py-16 text-center text-sm text-slate-500">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            tab={tab}
            hasFilters={activeCount > 0}
            onReset={reset}
            onNavigateNewReport={onNavigateNewReport}
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpenReport(r)}
                  className="w-full text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-xs transition cursor-pointer"
                >
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <StatusChip status={r.status} />
                    {r.riskLevel && <RiskChip level={r.riskLevel} score={r.riskScore} />}
                    {r.isMine && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                        내 신고
                      </span>
                    )}
                    <span className="ml-auto text-[10px] font-mono text-slate-400">{r.id}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {r.title || `${r.location} ${r.category}`}
                  </p>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                    {r.description}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
                    <span>{r.location}</span>
                    <span className="text-slate-300">·</span>
                    <span>{r.category}</span>
                    <span className="text-slate-300">·</span>
                    <span>{new Date(r.createdAt).toLocaleDateString("ko-KR")}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AiSummaryModal
        isOpen={isSummaryOpen}
        onClose={() => setIsSummaryOpen(false)}
        data={summaryData}
        isLoading={isSummarizing}
        error={summaryError}
      />

    </div>
  );
}

function StatusChip({ status }: { status: ReportStatus }) {
  const c = STATUS_MAP[status] || STATUS_MAP.pending;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${c.badgeClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dotClass}`} />
      {c.label}
    </span>
  );
}

function RiskChip({ level, score }: { level: RiskLevel; score?: number | null }) {
  const c = RISK_LEVEL_MAP[level];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] ${c.badgeClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dotClass}`} />
      {level}
      {typeof score === "number" && <span className="font-mono opacity-70">{score}</span>}
    </span>
  );
}

function EmptyState({
  tab,
  hasFilters,
  onReset,
  onNavigateNewReport,
}: {
  tab: ReportTab;
  hasFilters: boolean;
  onReset: () => void;
  onNavigateNewReport: () => void;
}) {
  if (hasFilters) {
    return (
      <div className="py-16 text-center space-y-3">
        <Inbox className="h-8 w-8 text-slate-300 mx-auto" />
        <p className="text-sm text-slate-600">조건에 맞는 신고가 없습니다.</p>
        <button
          type="button"
          onClick={onReset}
          className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
        >
          필터 초기화
        </button>
      </div>
    );
  }

  if (tab === "MINE") {
    return (
      <div className="py-16 text-center space-y-3">
        <Inbox className="h-8 w-8 text-slate-300 mx-auto" />
        <p className="text-sm font-semibold text-slate-800">아직 등록한 신고가 없습니다.</p>
        <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
          학교에서 불편하거나 개선이 필요한 문제를 발견했다면 신고를 등록해주세요.
        </p>
        <button
          type="button"
          onClick={onNavigateNewReport}
          className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-bold hover:bg-blue-800 transition cursor-pointer"
        >
          신고하기
        </button>
      </div>
    );
  }

  return (
    <div className="py-16 text-center space-y-3">
      <Inbox className="h-8 w-8 text-slate-300 mx-auto" />
      <p className="text-sm text-slate-600">아직 등록된 신고가 없습니다.</p>
      <button
        type="button"
        onClick={onNavigateNewReport}
        className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-bold hover:bg-blue-800 transition cursor-pointer"
      >
        신고하기
      </button>
    </div>
  );
}
