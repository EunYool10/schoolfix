import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  FileText,
  RotateCw,
  AlertCircle,
  ShieldAlert,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { SchoolReport, AIAnalysisReportData } from "../types";
import { PDFReportModal } from "./PDFReportModal";
import { createEmptyAnalysis } from "../utils/aiAnalysisHelper";

interface AIAnalysisReportPanelProps {
  reports: SchoolReport[];
  analysisData: AIAnalysisReportData | null;
  isAnalyzing: boolean;
  analysisError: string | null;
  onReanalyze: () => void;
  onSelectReport?: (reportId: string) => void;
  onViewFullReport?: () => void;
}

export function AIAnalysisReportPanel({
  reports,
  analysisData: serverAnalysisData,
  isAnalyzing,
  analysisError,
  onReanalyze,
  onViewFullReport,
}: AIAnalysisReportPanelProps) {
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);

  // Guaranteed populated data with fallback
  // 서버(POST /api/ai/analyze)가 DB의 저장된 위험도 분석을 집계해 내려준 값을 그대로 쓴다.
  // 빈 항목을 클라이언트가 만들어 채우지 않는다 — 화면 숫자는 모두 실제 DB 집계값이어야 한다.
  const reportData = useMemo(
    () => serverAnalysisData ?? createEmptyAnalysis(reports),
    [serverAnalysisData, reports]
  );

  // Extract concise primary categories (1-line)
  const primaryCategories = useMemo(() => {
    if (reportData.categorySummaries && reportData.categorySummaries.length > 0) {
      return reportData.categorySummaries
        .slice(0, 3)
        .map((c) => c.category)
        .join(" · ");
    }
    return "집계 중";
  }, [reportData]);

  // Extract concise primary locations (1-line)
  const primaryLocations = useMemo(() => {
    if (reportData.locationSummaries && reportData.locationSummaries.length > 0) {
      return reportData.locationSummaries
        .slice(0, 3)
        .map((l) => l.location)
        .join(" · ");
    }
    return "집계 중";
  }, [reportData]);

  const safety = reportData.safetyTrends;

  return (
    <div
      id="ai-analysis-report-panel"
      className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-5 flex flex-col justify-between"
    >
      <div>
        {/* Panel Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-blue-700" />
            <h3 className="text-sm font-bold text-slate-900">
              AI 시설 안전 분석
            </h3>
          </div>

          <button
            type="button"
            onClick={onReanalyze}
            disabled={isAnalyzing || reports.length === 0}
            id="btn-reanalyze-side-panel"
            title="GPT 재분석"
            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-slate-100 transition cursor-pointer disabled:opacity-40"
          >
            <RotateCw
              className={`h-4 w-4 ${isAnalyzing ? "animate-spin text-blue-700" : ""}`}
            />
          </button>
        </div>

        {/* Error message */}
        {analysisError && (
          <div className="my-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-1.5">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{analysisError}</span>
          </div>
        )}

        {/* Empty state */}
        {reports.length === 0 ? (
          <div className="py-8 text-center px-2">
            <p className="text-xs font-semibold text-slate-700">
              등록된 신고가 없습니다.
            </p>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              신고가 접수되면 GPT가 시설 안전 트렌드와 우선순위를 분석합니다.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Safety Risk Indicator */}
            {safety && (
              <div className="p-3 rounded-lg bg-blue-50/60 border border-blue-100 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-600">안전 위험도</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[11px] border ${
                      safety.overallRiskLevel === "dangerous"
                        ? "bg-rose-100 text-rose-800 border-rose-300"
                        : safety.overallRiskLevel === "warning"
                        ? "bg-amber-100 text-amber-800 border-amber-300"
                        : safety.overallRiskLevel === "caution"
                        ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                        : "bg-emerald-100 text-emerald-800 border-emerald-300"
                    }`}
                  >
                    {safety.overallRiskLevelLabel}
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-900 line-clamp-1">
                  {safety.trendHeadline}
                </p>
              </div>
            )}

            {/* Priority stats grid */}
            <div>
              <span className="text-xs font-semibold text-slate-500 block mb-2">
                우선 대응 필요 신고 ({reports.length}건 중)
              </span>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <div className="rounded border border-rose-200 bg-rose-50/50 p-2">
                  <span className="text-[11px] font-bold text-rose-800 block">긴급</span>
                  <span className="text-sm font-bold font-mono text-rose-900 block mt-0.5">
                    {reportData.priorityStats.urgent}건
                  </span>
                </div>
                <div className="rounded border border-amber-200 bg-amber-50/50 p-2">
                  <span className="text-[11px] font-bold text-amber-800 block">높음</span>
                  <span className="text-sm font-bold font-mono text-amber-900 block mt-0.5">
                    {reportData.priorityStats.high}건
                  </span>
                </div>
                <div className="rounded border border-blue-200 bg-blue-50/50 p-2">
                  <span className="text-[11px] font-bold text-blue-800 block">보통</span>
                  <span className="text-sm font-bold font-mono text-blue-900 block mt-0.5">
                    {reportData.priorityStats.medium}건
                  </span>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <span className="text-[11px] font-bold text-slate-700 block">낮음</span>
                  <span className="text-sm font-bold font-mono text-slate-800 block mt-0.5">
                    {reportData.priorityStats.low}건
                  </span>
                </div>
              </div>
            </div>

            {/* Quick summaries */}
            <div className="space-y-1.5 text-xs border-t border-slate-100 pt-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-slate-500 font-medium shrink-0">주요 문제:</span>
                <span className="text-slate-900 font-semibold truncate text-right">
                  {primaryCategories}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-slate-500 font-medium shrink-0">주요 장소:</span>
                <span className="text-slate-900 font-semibold truncate text-right">
                  {primaryLocations}
                </span>
              </div>
            </div>

            {/* Short trend note */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed">
              <p className="line-clamp-3">"{reportData.overallSummary}"</p>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-5 pt-3.5 border-t border-slate-200 space-y-2">
        {onViewFullReport && (
          <button
            type="button"
            onClick={onViewFullReport}
            className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-600 bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
            <span>AI 안전 리포트 전체 보기</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => setIsPdfModalOpen(true)}
          disabled={reports.length === 0}
          id="btn-open-pdf-report"
          className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 text-white text-xs sm:text-sm font-semibold hover:bg-blue-800 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:scale-[0.98]"
        >
          <FileText className="h-4 w-4" />
          <span>PDF 상세 보고서 (인쇄 / 다운로드)</span>
        </button>
      </div>

      {/* PDF Modal */}
      <PDFReportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        reportData={reportData}
        rawReports={reports}
      />
    </div>
  );
}
