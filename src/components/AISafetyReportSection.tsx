import React, { useState, useMemo } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  RotateCw,
  FileText,
  Building2,
  MapPin,
  Tag,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Filter,
  AlertCircle,
} from "lucide-react";
import { SchoolReport, AIAnalysisReportData, AIPriorityLevel } from "../types";
import { PDFReportModal } from "./PDFReportModal";
import { generateFallbackAnalysis } from "../utils/aiAnalysisHelper";

interface AISafetyReportSectionProps {
  reports: SchoolReport[];
  analysisData: AIAnalysisReportData | null;
  isAnalyzing: boolean;
  analysisError: string | null;
  onReanalyze: () => void;
  onSelectReport?: (report: SchoolReport) => void;
}

export function AISafetyReportSection({
  reports,
  analysisData: rawAnalysisData,
  isAnalyzing,
  analysisError,
  onReanalyze,
  onSelectReport,
}: AISafetyReportSectionProps) {
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");

  // Guaranteed populated data with real-data fallback
  const reportData = useMemo(() => {
    const fallback = generateFallbackAnalysis(reports);
    if (!rawAnalysisData) return fallback;
    return {
      ...fallback,
      ...rawAnalysisData,
      safetyTrends: rawAnalysisData.safetyTrends || fallback.safetyTrends,
      locationSummaries:
        rawAnalysisData.locationSummaries && rawAnalysisData.locationSummaries.length > 0
          ? rawAnalysisData.locationSummaries
          : fallback.locationSummaries,
      categorySummaries:
        rawAnalysisData.categorySummaries && rawAnalysisData.categorySummaries.length > 0
          ? rawAnalysisData.categorySummaries
          : fallback.categorySummaries,
      priorityItems:
        rawAnalysisData.priorityItems && rawAnalysisData.priorityItems.length > 0
          ? rawAnalysisData.priorityItems
          : fallback.priorityItems,
      priorityStats: rawAnalysisData.priorityStats || fallback.priorityStats,
      recurringIssues:
        rawAnalysisData.recurringIssues && rawAnalysisData.recurringIssues.length > 0
          ? rawAnalysisData.recurringIssues
          : fallback.recurringIssues,
      recommendations:
        rawAnalysisData.recommendations && rawAnalysisData.recommendations.length > 0
          ? rawAnalysisData.recommendations
          : fallback.recommendations,
      overallSummary: rawAnalysisData.overallSummary || fallback.overallSummary,
    };
  }, [rawAnalysisData, reports]);

  const safety = reportData.safetyTrends;

  // Filter priority items
  const filteredPriorityItems = useMemo(() => {
    if (priorityFilter === "ALL") return reportData.priorityItems;
    return reportData.priorityItems.filter((item) => item.priority === priorityFilter);
  }, [reportData.priorityItems, priorityFilter]);

  const priorityBadgeStyle = (priority: AIPriorityLevel | string) => {
    switch (priority) {
      case "긴급":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "높음":
        return "bg-amber-50 text-amber-800 border-amber-200";
      case "보통":
        return "bg-blue-50 text-blue-700 border-blue-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch {
      return iso;
    }
  };

  return (
    <div id="ai-safety-report-section" className="space-y-6">
      {/* Top Banner & Action Header */}
      <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-5 sm:p-6 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5 text-blue-300 animate-pulse" />
              <span>GPT 기반 실시간 시설 안전 진단</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              AI 시설 안전 리포트 & 트렌드 분석
            </h2>
            <p className="text-xs sm:text-sm text-blue-100/85 leading-relaxed">
              등록된 모든 학교 신고({reports.length}건)를 실시간 분석하여 위험 우선순위, 집중 취약 구역 및 안전 트렌드를 요약 제공합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onReanalyze}
              disabled={isAnalyzing || reports.length === 0}
              id="btn-trigger-ai-analysis"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs sm:text-sm font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              <RotateCw
                className={`h-4 w-4 ${isAnalyzing ? "animate-spin text-blue-300" : ""}`}
              />
              <span>{isAnalyzing ? "GPT 분석 중…" : "AI 재분석"}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPdfModalOpen(true)}
              disabled={reports.length === 0}
              id="btn-open-safety-pdf"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold transition cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              <FileText className="h-4 w-4" />
              <span>PDF 상세 보고서</span>
            </button>
          </div>
        </div>

        {/* Status Meta */}
        <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-blue-200/80 font-mono">
          <span>분석 대상 신고: 총 {reports.length}건</span>
          <span>마지막 분석 일시: {formatDateTime(reportData.analyzedAt)}</span>
        </div>
      </div>

      {/* Error Alert if any */}
      {analysisError && (
        <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs sm:text-sm text-rose-800 shadow-xs">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-rose-900">AI 분석 안내</p>
            <p className="mt-0.5 text-rose-800">{analysisError}</p>
          </div>
          <button
            type="button"
            onClick={onReanalyze}
            className="px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-900 rounded font-semibold text-xs transition cursor-pointer"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* Empty Reports Guard */}
      {reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-xs">
          <Building2 className="h-12 w-12 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">
            분석할 접수 신고 데이터가 없습니다.
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
            학생들이 신고를 등록하면 GPT가 위험도, 취약 장소 및 안전 트렌드를 전수 분석하여 이 영역에 즉시 리포트를 생성합니다.
          </p>
        </div>
      ) : (
        <>
          {/* 1. Overall Safety Diagnostic & Trends Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Overall Risk Level Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">
                    종합 안전 위험도 지수
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      safety?.overallRiskLevel === "dangerous"
                        ? "bg-rose-100 text-rose-800 border-rose-200"
                        : safety?.overallRiskLevel === "warning"
                        ? "bg-amber-100 text-amber-800 border-amber-200"
                        : safety?.overallRiskLevel === "caution"
                        ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                        : "bg-emerald-100 text-emerald-800 border-emerald-200"
                    }`}
                  >
                    {safety?.overallRiskLevel === "dangerous" ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : (
                      <ShieldCheck className="h-3 w-3" />
                    )}
                    <span>{safety?.overallRiskLevelLabel || "관찰 필요(주의)"}</span>
                  </span>
                </div>
                <h4 className="mt-3 text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  {safety?.trendHeadline || "학교 시설 안전 점검 및 위험 요소 관리 필요"}
                </h4>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                  {safety?.trendSummary || reportData.overallSummary}
                </p>
              </div>

              {safety?.urgentActionNeeded && (
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>학생 부상 위험 가능성으로 즉시 현장 점검 권고</span>
                </div>
              )}
            </div>

            {/* Priority Distribution Breakdown */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 block">
                우선 대응 안전 등급 현황
              </span>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-2.5">
                  <span className="text-xs font-bold text-rose-800 block">긴급 (Urgent)</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl font-bold font-mono text-rose-900">
                      {reportData.priorityStats.urgent}
                    </span>
                    <span className="text-xs text-rose-700">건</span>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5">
                  <span className="text-xs font-bold text-amber-800 block">높음 (High)</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl font-bold font-mono text-amber-900">
                      {reportData.priorityStats.high}
                    </span>
                    <span className="text-xs text-amber-700">건</span>
                  </div>
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-2.5">
                  <span className="text-xs font-bold text-blue-800 block">보통 (Medium)</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl font-bold font-mono text-blue-900">
                      {reportData.priorityStats.medium}
                    </span>
                    <span className="text-xs text-blue-700">건</span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <span className="text-xs font-bold text-slate-700 block">낮음 (Low)</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl font-bold font-mono text-slate-800">
                      {reportData.priorityStats.low}
                    </span>
                    <span className="text-xs text-slate-500">건</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Core Action KPI & Quick Stats */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 block">
                  처리 진행 추이 및 관리 현황
                </span>
                <div className="mt-3 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">미처리 (접수 대기)</span>
                    <span className="font-bold font-mono text-slate-900">
                      {reportData.stats.pending}건
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full"
                      style={{
                        width: `${
                          reportData.stats.total > 0
                            ? ((reportData.stats.total - reportData.stats.pending) /
                                reportData.stats.total) *
                              100
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-600">처리 중</span>
                    <span className="font-bold font-mono text-amber-700">
                      {reportData.stats.inProgress}건
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">조치 완료</span>
                    <span className="font-bold font-mono text-emerald-700">
                      {reportData.stats.completed}건
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                조치 완료율:{" "}
                <span className="font-bold text-slate-800">
                  {reportData.stats.total > 0
                    ? Math.round(
                        (reportData.stats.completed / reportData.stats.total) * 100
                      )
                    : 0}
                  %
                </span>
              </div>
            </div>
          </div>

          {/* 2. Hotspots & Frequent Risk Trends Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Hotspots Section */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-blue-700" />
                  <span>취약 구역 및 다발 발생 지역 트렌드</span>
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  {reportData.locationSummaries.length}개 구역 식별
                </span>
              </div>

              <div className="space-y-2.5">
                {reportData.locationSummaries.slice(0, 4).map((loc) => (
                  <div
                    key={loc.location}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-blue-600" />
                        <span>{loc.location}</span>
                      </span>
                      <span className="font-mono text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                        {loc.count}건 접수
                      </span>
                    </div>
                    <p className="text-slate-600 leading-relaxed pl-3.5">
                      {loc.summary}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Frequent Danger Categories Section */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Tag className="h-4 w-4 text-amber-700" />
                  <span>주요 위험 유형 및 사고 추이</span>
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  {reportData.categorySummaries.length}개 유형 분석
                </span>
              </div>

              <div className="space-y-2.5">
                {reportData.categorySummaries.slice(0, 4).map((cat) => (
                  <div
                    key={cat.category}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        <span>{cat.category}</span>
                      </span>
                      <span className="font-mono text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                        {cat.count}건 접수
                      </span>
                    </div>
                    <p className="text-slate-600 leading-relaxed pl-3.5">
                      {cat.summary}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Recurring Issues Alert Bar if any */}
          {reportData.recurringIssues.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <h3 className="text-sm font-bold text-amber-950">
                  반복 및 누적 발생 안전 이슈 (주의 요망)
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {reportData.recurringIssues.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-lg p-3 border border-amber-200 text-xs space-y-1 shadow-2xs"
                  >
                    <span className="font-bold text-amber-900 block">
                      ⚠️ {item.issue}
                    </span>
                    <p className="text-slate-700 leading-relaxed">
                      {item.evidence}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Priority Items Table Matrix */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  신고별 AI 안전 위험도 및 우선순위 분석 목록
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  각 신고의 안전사고 직결성 및 학생 영향도를 평가한 우선 조치 매트릭스입니다.
                </p>
              </div>

              {/* Priority Filter Buttons */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {(["ALL", "긴급", "높음", "보통", "낮음"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setPriorityFilter(lvl)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                      priorityFilter === lvl
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {lvl === "ALL" ? "전체" : lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-4 w-28">신고번호</th>
                    <th className="py-3 px-3 w-20">위치</th>
                    <th className="py-3 px-3 w-24">유형</th>
                    <th className="py-3 px-4">신고 내용 요약</th>
                    <th className="py-3 px-3 w-20 text-center">처리상태</th>
                    <th className="py-3 px-3 w-20 text-center">우선순위</th>
                    <th className="py-3 px-4 w-64">AI 안전 위험 판단 근거</th>
                    <th className="py-3 px-3 w-16 text-center">상세</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {filteredPriorityItems.map((item) => {
                    const original = reports.find((r) => r.id === item.reportId);
                    return (
                      <tr key={item.reportId} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 font-mono font-bold text-blue-700 whitespace-nowrap">
                          {item.reportId}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-800 whitespace-nowrap">
                          {item.location}
                        </td>
                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-medium">
                            {item.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-800 leading-snug">
                          {item.contentSummary}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap font-medium text-[11px] text-slate-600">
                          {item.currentStatus}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${priorityBadgeStyle(
                              item.priority
                            )}`}
                          >
                            {item.priority}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 text-[11px] leading-snug">
                          {item.rationale}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {original && onSelectReport && (
                            <button
                              type="button"
                              onClick={() => onSelectReport(original)}
                              className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
                            >
                              보기
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. Recommendations for School Administrators */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-blue-950 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-700" />
              <span>시설 관리자 우선 조치 권고사항 & 예방 가이드</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {reportData.recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className="bg-white p-3 rounded-lg border border-blue-200/80 text-slate-800 leading-relaxed shadow-2xs"
                >
                  <span className="font-bold text-blue-800 block mb-1">
                    권고 #{idx + 1}
                  </span>
                  <p>{rec}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Full PDF Report Modal */}
      <PDFReportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        reportData={reportData}
        rawReports={reports}
      />
    </div>
  );
}
