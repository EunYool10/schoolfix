import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Search,
  CheckCircle,
  Clock,
  MapPin,
  Tag,
  Paperclip,
  Lock,
  Inbox,
  AlertCircle,
  RefreshCw,
  Eye,
  X,
  ChevronDown,
  ShieldAlert,
  Sparkles,
  ChevronRight,
  FileSpreadsheet,
} from "lucide-react";
import {
  SchoolReport,
  ReportStatus,
  ReportPriority,
  STATUS_MAP,
  PRIORITY_MAP,
  AIAnalysisReportData,
  SCHOOL_LOCATIONS,
} from "../types";
import { AIAnalysisReportPanel } from "./AIAnalysisReportPanel";
import { AISafetyReportSection } from "./AISafetyReportSection";
import { ReportDetailModal } from "./ReportDetailModal";
import { generateFallbackAnalysis } from "../utils/aiAnalysisHelper";

interface AdminReportViewProps {
  reports: SchoolReport[];
  isLoading: boolean;
  loadError: string | null;
  onRefresh: () => void;
  isRefreshing: boolean;
  onUpdateStatus: (reportId: string, status: ReportStatus) => Promise<void>;
  updatingReportId: string | null;
  onUpdatePriority?: (reportId: string, priority: ReportPriority) => Promise<void>;
  onProcessReport?: (
    reportId: string,
    data: {
      status?: ReportStatus;
      priority?: ReportPriority;
      assignee?: string | null;
      resolutionNote?: string | null;
      adminNote?: string;
    }
  ) => Promise<void>;
  onUpdateReport?: (
    reportId: string,
    data: {
      title: string;
      location: string;
      category: string;
      description: string;
      isAnonymous: boolean;
    }
  ) => Promise<void>;
  onDeleteReport?: (reportId: string) => Promise<void>;
  /** AI 분석은 관리자 전용 엔드포인트이므로 세션 토큰이 필요하다. */
  authToken?: string | null;
}

// Professional, color-coded status badge component
export function StatusBadge({
  status,
  size = "md",
}: {
  status: ReportStatus;
  size?: "sm" | "md" | "lg";
}) {
  const config = STATUS_MAP[status] || STATUS_MAP.pending;
  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[11px] gap-1"
      : size === "lg"
      ? "px-3 py-1.5 text-xs sm:text-sm gap-2"
      : "px-2.5 py-1 text-xs gap-1.5";

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border shadow-2xs whitespace-nowrap ${config.badgeClass} ${sizeClasses}`}
    >
      <span className={`rounded-full ${config.dotClass} ${size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2"}`} />
      <span>{config.label}</span>
    </span>
  );
}

// Color-coded priority badge component
export function PriorityBadge({
  priority = "medium",
  size = "md",
}: {
  priority?: ReportPriority;
  size?: "sm" | "md";
}) {
  const config = PRIORITY_MAP[priority] || PRIORITY_MAP.medium;
  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[11px] gap-1"
      : "px-2.5 py-1 text-xs gap-1.5";

  return (
    <span
      className={`inline-flex items-center font-bold rounded-full border shadow-2xs whitespace-nowrap ${config.badgeClass} ${sizeClasses}`}
    >
      <span className={`rounded-full ${config.dotClass} ${size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2"}`} />
      <span>{config.label}</span>
    </span>
  );
}

export function AdminReportView({
  reports,
  isLoading,
  loadError,
  onRefresh,
  isRefreshing,
  onUpdateStatus,
  updatingReportId,
  onUpdatePriority,
  onProcessReport,
  onUpdateReport,
  onDeleteReport,
  authToken,
}: AdminReportViewProps) {
  const [adminTab, setAdminTab] = useState<"REPORTS" | "AI_SAFETY_REPORT">("REPORTS");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [locationFilter, setLocationFilter] = useState<string>("ALL");
  const [sortOrder, setSortOrder] = useState<"latest" | "oldest" | "priority">("latest");
  const [selectedReport, setSelectedReport] = useState<SchoolReport | null>(null);

  // AI Analysis State
  const [analysisData, setAnalysisData] = useState<AIAnalysisReportData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const hasAutoRunRef = useRef<boolean>(false);

  // Execute AI analysis
  const handleStartAnalysis = async () => {
    if (reports.length === 0) {
      setAnalysisError("분석할 신고 데이터가 없습니다.");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers,
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(
          json.error || "AI 분석을 실행하지 못했습니다. 잠시 후 다시 시도해주세요."
        );
      }

      if (!json.data) {
        throw new Error("분석할 신고 데이터가 없습니다.");
      }

      setAnalysisData(json.data);
    } catch (err: any) {
      setAnalysisError(
        err.message || "AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Auto-run analysis once when actual reports exist
  useEffect(() => {
    if (!hasAutoRunRef.current && reports.length > 0 && !analysisData && !isAnalyzing) {
      hasAutoRunRef.current = true;
      handleStartAnalysis();
    }
  }, [reports.length]);

  // Real statistics strictly calculated from actual DB data
  const stats = useMemo(() => {
    const total = reports.length;
    const pending = reports.filter((r) => r.status === "pending").length;
    const processing = reports.filter(
      (r) => r.status === "reviewing" || r.status === "in_progress"
    ).length;
    const completed = reports.filter((r) => r.status === "completed").length;
    const urgent = reports.filter(
      (r) => (r.priority === "urgent") && r.status !== "completed"
    ).length;

    return { total, pending, processing, completed, urgent };
  }, [reports]);

  // Active safety summary info
  const safetyInfo = useMemo(() => {
    if (analysisData?.safetyTrends) return analysisData.safetyTrends;
    return generateFallbackAnalysis(reports).safetyTrends;
  }, [analysisData, reports]);

  // Filtered actual reports
  const filteredReports = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return reports
      .filter((r) => {
        const matchSearch =
          !q ||
          r.id.toLowerCase().includes(q) ||
          r.location.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          (r.title && r.title.toLowerCase().includes(q)) ||
          (r.assignee && r.assignee.toLowerCase().includes(q));

        const matchStatus = statusFilter === "ALL" || r.status === statusFilter;
        const matchPriority =
          priorityFilter === "ALL" || (r.priority || "medium") === priorityFilter;
        const matchLocation = locationFilter === "ALL" || r.location === locationFilter;

        return matchSearch && matchStatus && matchPriority && matchLocation;
      })
      .sort((a, b) => {
        if (sortOrder === "priority") {
          const priorityWeight = (p?: ReportPriority) => {
            if (p === "urgent") return 3;
            if (p === "medium") return 2;
            if (p === "low") return 1;
            return 2;
          };
          const weightDiff = priorityWeight(b.priority) - priorityWeight(a.priority);
          if (weightDiff !== 0) return weightDiff;
        }
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return sortOrder === "oldest" ? timeA - timeB : timeB - timeA;
      });
  }, [reports, searchTerm, statusFilter, priorityFilter, locationFilter, sortOrder]);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="w-full space-y-5">
      {/* Top Header with Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
              관리자 모드
            </span>
            <span className="text-xs text-slate-400 font-mono">
              접수 총 {reports.length}건
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-1">
            학교 시설 및 안전 신고 종합 관리
          </h2>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500 leading-relaxed">
            학생들이 접수한 교내 시설 불편사항을 실시간으로 확인하고, GPT 기반 시설 안전 트렌드 리포트를 열람합니다.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white h-10 px-3.5 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <RefreshCw
              className={`h-4 w-4 text-slate-500 ${
                isRefreshing ? "animate-spin text-blue-700" : ""
              }`}
            />
            <span>새로고침</span>
          </button>
        </div>
      </div>

      {/* Admin Sub-Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-0 overflow-x-auto">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAdminTab("REPORTS")}
            id="tab-admin-reports"
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition cursor-pointer whitespace-nowrap ${
              adminTab === "REPORTS"
                ? "border-blue-700 text-blue-700"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>신고 접수 및 처리 관리</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono ${
                adminTab === "REPORTS"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {reports.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAdminTab("AI_SAFETY_REPORT")}
            id="tab-admin-ai-safety-report"
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition cursor-pointer whitespace-nowrap ${
              adminTab === "AI_SAFETY_REPORT"
                ? "border-blue-700 text-blue-700"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
          >
            <Sparkles className="h-4 w-4 text-blue-600" />
            <span>AI 시설 안전 리포트 & 트렌드</span>
            {safetyInfo && (
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                  safetyInfo.overallRiskLevel === "dangerous"
                    ? "bg-rose-100 text-rose-800 border-rose-200"
                    : safetyInfo.overallRiskLevel === "warning"
                    ? "bg-amber-100 text-amber-800 border-amber-200"
                    : safetyInfo.overallRiskLevel === "caution"
                    ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                    : "bg-emerald-100 text-emerald-800 border-emerald-200"
                }`}
              >
                {safetyInfo.overallRiskLevelLabel}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* VIEW 1: AI SAFETY REPORT VIEW (Full Width Dedicated Area) */}
      {/* ========================================================= */}
      {adminTab === "AI_SAFETY_REPORT" && (
        <AISafetyReportSection
          reports={reports}
          analysisData={analysisData}
          isAnalyzing={isAnalyzing}
          analysisError={analysisError}
          onReanalyze={handleStartAnalysis}
          onSelectReport={(report) => setSelectedReport(report)}
        />
      )}

      {/* ========================================================= */}
      {/* VIEW 2: STANDARD REPORTS LIST & PROCESSING VIEW           */}
      {/* ========================================================= */}
      {adminTab === "REPORTS" && (
        <div className="space-y-4">
          {/* AI Safety Trend Quick Briefing Banner */}
          {safetyInfo && reports.length > 0 && (
            <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 via-indigo-50/50 to-white p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-600 text-white shrink-0 mt-0.5 shadow-xs">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-900">
                      AI 시설 안전 진단 브리핑
                    </span>
                    <span
                      className={`px-2 py-0.2 rounded text-[11px] font-bold border ${
                        safetyInfo.overallRiskLevel === "dangerous"
                          ? "bg-rose-100 text-rose-800 border-rose-300"
                          : safetyInfo.overallRiskLevel === "warning"
                          ? "bg-amber-100 text-amber-800 border-amber-300"
                          : safetyInfo.overallRiskLevel === "caution"
                          ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                          : "bg-emerald-100 text-emerald-800 border-emerald-300"
                      }`}
                    >
                      {safetyInfo.overallRiskLevelLabel}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-1">
                    {safetyInfo.trendHeadline}
                  </p>
                  <p className="text-xs text-slate-600 line-clamp-1">
                    {safetyInfo.trendSummary}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAdminTab("AI_SAFETY_REPORT")}
                id="btn-switch-to-safety-report"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 transition shrink-0 cursor-pointer shadow-xs active:scale-[0.98]"
              >
                <span>AI 안전 리포트 전체 보기</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Responsive Grid: Left (신고 현황 및 관리) + Right (AI 신고 분석 패널) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: 기존 신고 현황 카드, 검색 및 목록 (lg:col-span-7 xl:col-span-8) */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-4">
              {/* Real Statistics 5-Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-xs">
                  <span className="text-xs font-semibold text-slate-500">전체 신고</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl sm:text-2xl font-bold text-slate-900 font-mono">
                      {stats.total}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">건</span>
                  </div>
                </div>

                <div className={`rounded-lg border p-3.5 shadow-xs transition ${
                  stats.urgent > 0
                    ? "border-rose-300 bg-rose-50/70"
                    : "border-slate-200 bg-white"
                }`}>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                    <span className={`text-xs font-bold ${
                      stats.urgent > 0 ? "text-rose-800" : "text-slate-600"
                    }`}>
                      긴급 대응 필요
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className={`text-xl sm:text-2xl font-bold font-mono ${
                      stats.urgent > 0 ? "text-rose-700" : "text-slate-700"
                    }`}>
                      {stats.urgent}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">건</span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    <span className="text-xs font-semibold text-slate-600">접수 대기</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl sm:text-2xl font-bold text-slate-700 font-mono">
                      {stats.pending}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">건</span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span className="text-xs font-semibold text-amber-800">처리 중</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl sm:text-2xl font-bold text-amber-800 font-mono">
                      {stats.processing}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">건</span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-xs col-span-2 sm:col-span-1">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-semibold text-emerald-800">조치 완료</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl sm:text-2xl font-bold text-emerald-800 font-mono">
                      {stats.completed}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">건</span>
                  </div>
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                <div className="relative sm:col-span-2 lg:col-span-2">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="접수번호, 위치, 분류, 내용, 담당부서 검색…"
                    className="w-full h-11 min-h-[44px] rounded-lg border border-slate-300 bg-white pl-10 pr-3.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-xs"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold"
                    >
                      지우기
                    </button>
                  )}
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-11 min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-xs sm:text-sm text-slate-700 outline-none focus:border-blue-600 cursor-pointer shadow-xs"
                >
                  <option value="ALL">전체 진행상태</option>
                  <option value="pending">접수 대기</option>
                  <option value="reviewing">확인 및 검토</option>
                  <option value="in_progress">보수 진행 중</option>
                  <option value="completed">조치 완료</option>
                </select>

                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="h-11 min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-xs sm:text-sm text-slate-700 outline-none focus:border-blue-600 cursor-pointer shadow-xs"
                >
                  <option value="ALL">전체 우선순위</option>
                  <option value="urgent">🚨 긴급 (Urgent)</option>
                  <option value="medium">⚡ 보통 (Medium)</option>
                  <option value="low">🌱 낮음 (Low)</option>
                </select>

                <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
                  <select
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    className="flex-1 h-11 min-h-[44px] rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-600 cursor-pointer shadow-xs"
                  >
                    <option value="ALL">전체 위치</option>
                    {SCHOOL_LOCATIONS.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>

                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as "latest" | "oldest" | "priority")}
                    className="w-28 sm:w-32 h-11 min-h-[44px] rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-600 cursor-pointer shadow-xs"
                  >
                    <option value="latest">최신순</option>
                    <option value="priority">우선순위순</option>
                    <option value="oldest">오래된순</option>
                  </select>
                </div>
              </div>

              {/* Report List / Table Area */}
              <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
                {/* Loading State */}
                {isLoading && (
                  <div className="py-16 text-center">
                    <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mb-3" />
                    <p className="text-xs sm:text-sm text-slate-500">
                      신고 목록을 불러오는 중입니다…
                    </p>
                  </div>
                )}

                {/* Error State */}
                {!isLoading && loadError && (
                  <div className="py-12 text-center px-4">
                    <AlertCircle className="mx-auto h-8 w-8 text-rose-500 mb-2" />
                    <p className="text-sm font-bold text-slate-800">
                      데이터를 불러오지 못했습니다.
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{loadError}</p>
                  </div>
                )}

                {/* Empty State (Zero reports in DB) */}
                {!isLoading && !loadError && reports.length === 0 && (
                  <div className="py-16 text-center px-4">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                      <Inbox className="h-6 w-6" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">
                      아직 접수된 신고가 없습니다.
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      학생들이 [신고 접수] 탭에서 제출한 실제 신고 데이터가 이곳에 표시됩니다.
                    </p>
                  </div>
                )}

                {/* Empty Search State */}
                {!isLoading &&
                  !loadError &&
                  reports.length > 0 &&
                  filteredReports.length === 0 && (
                    <div className="py-12 text-center px-4">
                      <p className="text-sm font-bold text-slate-800">
                        검색 결과가 없습니다.
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        검색어를 확인하거나 필터를 초기화해주세요.
                      </p>
                    </div>
                  )}

                {/* Desktop Table View */}
                {!isLoading && !loadError && filteredReports.length > 0 && (
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-xs sm:text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                          <th className="py-3 px-3">접수번호</th>
                          <th className="py-3 px-3">우선순위</th>
                          <th className="py-3 px-3">위치</th>
                          <th className="py-3 px-3">분류</th>
                          <th className="py-3 px-3">내용 요약</th>
                          <th className="py-3 px-3">담당 부서</th>
                          <th className="py-3 px-2">접수일</th>
                          <th className="py-3 px-2 text-center">처리 상태</th>
                          <th className="py-3 px-2 text-center">상태 변경</th>
                          <th className="py-3 px-3 text-center">상세</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        {filteredReports.map((report) => (
                          <tr
                            key={report.id}
                            onClick={() => setSelectedReport(report)}
                            className="hover:bg-blue-50/40 transition cursor-pointer group"
                          >
                            <td className="py-3.5 px-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                              {report.id}
                            </td>
                            <td
                              className="py-3.5 px-3 whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center gap-1.5">
                                <PriorityBadge priority={report.priority || "medium"} size="sm" />
                                {onUpdatePriority && (
                                  <select
                                    value={report.priority || "medium"}
                                    disabled={updatingReportId === report.id}
                                    onChange={(e) =>
                                      onUpdatePriority(
                                        report.id,
                                        e.target.value as ReportPriority
                                      )
                                    }
                                    aria-label="우선순위 등급 변경"
                                    className="h-6.5 rounded border border-slate-300 bg-white text-[11px] font-semibold px-1 outline-none text-slate-700 hover:border-slate-400 focus:border-blue-600 transition cursor-pointer disabled:opacity-50"
                                  >
                                    <option value="urgent">긴급</option>
                                    <option value="medium">보통</option>
                                    <option value="low">낮음</option>
                                  </select>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-3 whitespace-nowrap font-medium text-slate-700">
                              {report.location}
                            </td>
                            <td className="py-3.5 px-3 whitespace-nowrap text-slate-600">
                              <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 font-medium">
                                {report.category}
                              </span>
                            </td>
                            <td className="py-3.5 px-3 max-w-xs">
                              <p className="font-semibold text-slate-900 line-clamp-1 group-hover:text-blue-700 transition">
                                {report.title || report.description}
                              </p>
                              {report.title && (
                                <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                  {report.description}
                                </p>
                              )}
                            </td>
                            <td className="py-3.5 px-3 whitespace-nowrap text-xs">
                              {report.assignee ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium border border-blue-100">
                                  {report.assignee}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono">-</span>
                              )}
                            </td>
                            <td className="py-3.5 px-2 whitespace-nowrap text-slate-400 text-xs font-mono">
                              {formatDate(report.createdAt)}
                            </td>
                            <td className="py-3.5 px-2 text-center whitespace-nowrap">
                              <StatusBadge status={report.status} size="sm" />
                            </td>
                            <td
                              className="py-3.5 px-2 text-center whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <select
                                value={report.status}
                                disabled={updatingReportId === report.id}
                                onChange={(e) =>
                                  onUpdateStatus(
                                    report.id,
                                    e.target.value as ReportStatus
                                  )
                                }
                                aria-label="진행 상태 변경"
                                className="h-7.5 rounded border border-slate-300 bg-white text-xs font-semibold px-2 outline-none text-slate-700 hover:border-slate-400 focus:border-blue-600 transition cursor-pointer disabled:opacity-50"
                              >
                                <option value="pending">접수 대기</option>
                                <option value="reviewing">확인 중</option>
                                <option value="in_progress">처리 중</option>
                                <option value="completed">처리 완료</option>
                              </select>
                            </td>
                            <td
                              className="py-3.5 px-3 text-center whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedReport(report)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 text-xs font-semibold text-slate-700 transition cursor-pointer shadow-2xs"
                              >
                                <Eye className="h-3.5 w-3.5 text-slate-500" />
                                <span>상세/관리</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Mobile Cards View */}
                {!isLoading && !loadError && filteredReports.length > 0 && (
                  <div className="md:hidden divide-y divide-slate-100">
                    {filteredReports.map((report) => (
                      <div
                        key={report.id}
                        onClick={() => setSelectedReport(report)}
                        className="p-4 space-y-2.5 hover:bg-blue-50/20 active:bg-blue-50/40 transition cursor-pointer"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-blue-700">
                              {report.id}
                            </span>
                            <PriorityBadge priority={report.priority || "medium"} size="sm" />
                            {report.assignee && (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                                {report.assignee}
                              </span>
                            )}
                          </div>
                          <StatusBadge status={report.status} size="sm" />
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <span className="font-medium text-slate-800">
                            {report.location}
                          </span>
                          <span>•</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                            {report.category}
                          </span>
                        </div>

                        {report.title && (
                          <p className="text-xs font-bold text-slate-900 line-clamp-1">
                            {report.title}
                          </p>
                        )}

                        <p className="text-xs text-slate-800 line-clamp-2 leading-relaxed">
                          {report.description}
                        </p>

                        <div
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-slate-400 font-mono text-[11px]">
                            {formatDate(report.createdAt)}
                          </span>

                          <div className="flex items-center gap-2 flex-wrap">
                            {onUpdatePriority && (
                              <select
                                value={report.priority || "medium"}
                                disabled={updatingReportId === report.id}
                                onChange={(e) =>
                                  onUpdatePriority(
                                    report.id,
                                    e.target.value as ReportPriority
                                  )
                                }
                                aria-label="우선순위 변경"
                                className="h-8 rounded-md border border-slate-300 bg-white text-xs font-semibold px-2 outline-none text-slate-700 hover:border-slate-400 focus:border-blue-600 transition cursor-pointer disabled:opacity-50"
                              >
                                <option value="urgent">우선순위: 긴급</option>
                                <option value="medium">우선순위: 보통</option>
                                <option value="low">우선순위: 낮음</option>
                              </select>
                            )}

                            <select
                              value={report.status}
                              disabled={updatingReportId === report.id}
                              onChange={(e) =>
                                onUpdateStatus(
                                  report.id,
                                  e.target.value as ReportStatus
                                )
                              }
                              aria-label="상태 변경"
                              className="h-8 rounded-md border border-slate-300 bg-white text-xs font-semibold px-2 outline-none text-slate-700 hover:border-slate-400 focus:border-blue-600 transition cursor-pointer disabled:opacity-50"
                            >
                              <option value="pending">접수 대기</option>
                              <option value="reviewing">확인 중</option>
                              <option value="in_progress">처리 중</option>
                              <option value="completed">처리 완료</option>
                            </select>

                            <button
                              type="button"
                              onClick={() => setSelectedReport(report)}
                              className="inline-flex items-center justify-center gap-1.5 h-8 rounded-md border border-slate-300 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer shadow-2xs"
                            >
                              <Eye className="h-3.5 w-3.5 text-slate-500" />
                              <span>상세</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: AI 신고 분석 요약 패널 (lg:col-span-5 xl:col-span-4, sticky) */}
            <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-6">
              <AIAnalysisReportPanel
                reports={reports}
                analysisData={analysisData}
                isAnalyzing={isAnalyzing}
                analysisError={analysisError}
                onReanalyze={handleStartAnalysis}
                onSelectReport={(reportId) => {
                  const found = reports.find((r) => r.id === reportId);
                  if (found) setSelectedReport(found);
                }}
                onViewFullReport={() => setAdminTab("AI_SAFETY_REPORT")}
              />
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Report Detail Modal (Admin Mode) */}
      <ReportDetailModal
        isOpen={Boolean(selectedReport)}
        onClose={() => setSelectedReport(null)}
        report={selectedReport}
        isAdmin={true}
        onUpdateStatus={async (reportId, status) => {
          await onUpdateStatus(reportId, status);
          setSelectedReport((prev) => (prev ? { ...prev, status } : null));
        }}
        onProcessReport={async (reportId, data) => {
          if (onProcessReport) {
            await onProcessReport(reportId, data);
            setSelectedReport((prev) => (prev ? { ...prev, ...data } : null));
          }
        }}
        onUpdateReport={async (reportId, data) => {
          if (onUpdateReport) {
            await onUpdateReport(reportId, data);
            setSelectedReport((prev) => (prev ? { ...prev, ...data } : null));
          }
        }}
        onDeleteReport={async (reportId) => {
          if (onDeleteReport) {
            await onDeleteReport(reportId);
            setSelectedReport(null);
          }
        }}
      />
    </div>
  );
}
