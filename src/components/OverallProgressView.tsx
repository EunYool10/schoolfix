import React, { useState, useEffect, useMemo } from "react";
import { PublicReportItem, ReportStatus, STATUS_MAP } from "../types";
import {
  Globe,
  Clock,
  MapPin,
  Tag,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  Shield,
  Layers,
  ChevronRight,
  TrendingUp,
} from "lucide-react";

interface OverallProgressViewProps {
  onRefreshParent?: () => void;
  onNavigateNewReport?: () => void;
  onNavigateMyProgress?: () => void;
}

interface OverallStats {
  total: number;
  pending: number;
  reviewing: number;
  inProgress: number;
  completed: number;
}

export function OverallProgressView({
  onRefreshParent,
  onNavigateNewReport,
  onNavigateMyProgress,
}: OverallProgressViewProps) {
  const [reports, setReports] = useState<PublicReportItem[]>([]);
  const [stats, setStats] = useState<OverallStats>({
    total: 0,
    pending: 0,
    reviewing: 0,
    inProgress: 0,
    completed: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedReport, setSelectedReport] = useState<PublicReportItem | null>(null);

  const fetchOverallData = async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    setIsRefreshing(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/reports/overall");
      if (!res.ok) {
        throw new Error("전체 신고 진행상황 데이터를 불러오지 못했습니다.");
      }
      const json = await res.json();
      if (json.ok) {
        setStats(json.stats || { total: 0, pending: 0, reviewing: 0, inProgress: 0, completed: 0 });
        setReports(Array.isArray(json.data) ? json.data : []);
      }
    } catch (err: any) {
      console.error("Fetch overall progress error:", err);
      setErrorMsg(err.message || "서버에서 진행상황을 불러올 수 없습니다.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOverallData();
  }, []);

  const handleRefresh = () => {
    fetchOverallData(true);
    if (onRefreshParent) onRefreshParent();
  };

  const filteredReports = useMemo(() => {
    let result = reports;
    if (statusFilter !== "ALL") {
      result = result.filter((r) => r.status === statusFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return result;
    return result.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.title && r.title.toLowerCase().includes(q))
    );
  }, [reports, statusFilter, searchQuery]);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hours = String(d.getHours()).padStart(2, "0");
      const mins = String(d.getMinutes()).padStart(2, "0");
      return `${year}.${month}.${day} ${hours}:${mins}`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-7 shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-semibold backdrop-blur-xs">
              <Globe className="h-3.5 w-3.5" />
              <span>교내 시설 실시간 공개 모니터링</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              전체 신고 진행상황
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              교내에 접수된 모든 시설 불편 및 안전 개선 요청의 접수, 검토, 수리 진행, 완료 현황을 투명하게 공개합니다.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition cursor-pointer backdrop-blur-xs disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              <span>새로고침</span>
            </button>
            {onNavigateNewReport && (
              <button
                type="button"
                onClick={onNavigateNewReport}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-md cursor-pointer"
              >
                + 새 신고 접수
              </button>
            )}
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* 2. Privacy Guarantee Banner (Strict Requirement 11) */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 text-emerald-950 text-xs leading-relaxed">
        <Shield className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-bold text-emerald-900">
            🛡️ 개인정보 보호 원칙 준수 안내
          </p>
          <p className="text-emerald-800 text-[11.5px]">
            「전체 진행상황」에서는 모든 신고자의 <strong>이름, 이메일, Google 계정 정보, 연락처 및 관리자 내부 비공개 메모</strong>가 시스템에서 원천 차단됩니다. 
            위치, 문제 종류, 상태 및 공익적 처리 결과만 안전하게 열람할 수 있습니다.
          </p>
        </div>
      </div>

      {/* 3. Overall Statistics Dashboard (Requirement 10) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>전체 신고</span>
            <Layers className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
            {stats.total}
            <span className="text-xs font-normal text-slate-500 ml-1">건</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">교내 누적 접수</p>
        </div>

        {/* Pending */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex items-center justify-between text-slate-600 text-xs font-semibold mb-1">
            <span>접수 대기</span>
            <span className="h-2 w-2 rounded-full bg-slate-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-700 font-mono">
            {stats.pending}
            <span className="text-xs font-normal text-slate-500 ml-1">건</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">담당 부서 확인 전</p>
        </div>

        {/* Reviewing */}
        <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 shadow-2xs">
          <div className="flex items-center justify-between text-blue-700 text-xs font-semibold mb-1">
            <span>검토(확인) 중</span>
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-800 font-mono">
            {stats.reviewing}
            <span className="text-xs font-normal text-blue-600 ml-1">건</span>
          </div>
          <p className="text-[11px] text-blue-600 mt-1">현장 확인 및 배정</p>
        </div>

        {/* In Progress */}
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 shadow-2xs">
          <div className="flex items-center justify-between text-amber-800 text-xs font-semibold mb-1">
            <span>처리 중</span>
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-800 font-mono">
            {stats.inProgress}
            <span className="text-xs font-normal text-amber-700 ml-1">건</span>
          </div>
          <p className="text-[11px] text-amber-700 mt-1">보수 및 조치 작업</p>
        </div>

        {/* Completed */}
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 shadow-2xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-emerald-800 text-xs font-semibold mb-1">
            <span>처리 완료</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-800 font-mono">
            {stats.completed}
            <span className="text-xs font-normal text-emerald-700 ml-1">건</span>
          </div>
          <p className="text-[11px] text-emerald-700 mt-1">수리 및 점검 완료</p>
        </div>
      </div>

      {/* 4. Progress Ratio Bar */}
      {stats.total > 0 && (
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
            <span>전체 해결 처리율</span>
            <span className="font-bold text-slate-900 font-mono">
              {Math.round((stats.completed / stats.total) * 100)}% 완료
            </span>
          </div>
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
            {stats.completed > 0 && (
              <div
                style={{ width: `${(stats.completed / stats.total) * 100}%` }}
                className="bg-emerald-500 transition-all duration-500"
                title={`처리 완료: ${stats.completed}건`}
              />
            )}
            {stats.inProgress > 0 && (
              <div
                style={{ width: `${(stats.inProgress / stats.total) * 100}%` }}
                className="bg-amber-500 transition-all duration-500"
                title={`처리 중: ${stats.inProgress}건`}
              />
            )}
            {stats.reviewing > 0 && (
              <div
                style={{ width: `${(stats.reviewing / stats.total) * 100}%` }}
                className="bg-blue-500 transition-all duration-500"
                title={`검토 중: ${stats.reviewing}건`}
              />
            )}
            {stats.pending > 0 && (
              <div
                style={{ width: `${(stats.pending / stats.total) * 100}%` }}
                className="bg-slate-300 transition-all duration-500"
                title={`접수 대기: ${stats.pending}건`}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-1">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> 처리 완료 ({stats.completed})
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> 처리 중 ({stats.inProgress})
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> 검토 중 ({stats.reviewing})
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-slate-400" /> 접수 대기 ({stats.pending})
            </span>
          </div>
        </div>
      )}

      {/* 5. Filter & Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto p-0.5">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer min-h-[36px] ${
              statusFilter === "ALL"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            전체 ({reports.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("pending")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer min-h-[36px] ${
              statusFilter === "pending"
                ? "bg-slate-700 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            접수 대기 ({stats.pending})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("reviewing")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer min-h-[36px] ${
              statusFilter === "reviewing"
                ? "bg-blue-700 text-white"
                : "bg-blue-50 text-blue-700 hover:bg-blue-100"
            }`}
          >
            검토 중 ({stats.reviewing})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("in_progress")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer min-h-[36px] ${
              statusFilter === "in_progress"
                ? "bg-amber-600 text-white"
                : "bg-amber-50 text-amber-800 hover:bg-amber-100"
            }`}
          >
            처리 중 ({stats.inProgress})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("completed")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer min-h-[36px] ${
              statusFilter === "completed"
                ? "bg-emerald-600 text-white"
                : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            }`}
          >
            처리 완료 ({stats.completed})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[200px] sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="장소, 문제 유형, 내용 검색..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-300 text-xs outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* 6. Overall Reports Feed (Requirement 10 & 11) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span>실시간 신고 진행 현황 목록</span>
            <span className="text-xs text-slate-500 font-normal">
              ({filteredReports.length}건)
            </span>
          </h2>
          {onNavigateMyProgress && (
            <button
              type="button"
              onClick={onNavigateMyProgress}
              className="text-xs font-bold text-blue-700 hover:underline cursor-pointer"
            >
              내 신고 진행상황 바로가기 →
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
            <RefreshCw className="h-6 w-6 text-blue-600 animate-spin mx-auto" />
            <p className="text-xs text-slate-600">
              전체 시설 신고 데이터를 실시간으로 불러오는 중입니다...
            </p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
            <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              해당하는 신고 내역이 없습니다.
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              검색어나 필터를 변경하시거나, 불편사항이 발생한 경우 새롭게 접수해주세요.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredReports.map((report) => {
              const statusCfg = STATUS_MAP[report.status] || STATUS_MAP.pending;
              return (
                <div
                  key={report.id}
                  onClick={() => setSelectedReport(report)}
                  className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-xs transition cursor-pointer space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                        {report.id}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-700 font-semibold bg-slate-100 px-2 py-0.5 rounded">
                        <MapPin className="h-3 w-3 text-slate-500" />
                        {report.location}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        <Tag className="h-3 w-3 text-slate-400" />
                        {report.category}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${statusCfg.badgeClass}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dotClass}`} />
                        {statusCfg.label}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                        {formatDate(report.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Title & Sanitized Content */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-snug">
                      {report.title || `${report.location} ${report.category} 신고`}
                    </h3>
                    <p className="text-xs text-slate-600 line-clamp-2 mt-1 leading-relaxed">
                      {report.description}
                    </p>
                  </div>

                  {/* Visual Status Pipeline */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          report.status === "pending"
                            ? "bg-slate-200 text-slate-800 font-bold"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        1. 접수 대기
                      </span>
                      <ChevronRight className="h-3 w-3 text-slate-300" />
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          report.status === "reviewing"
                            ? "bg-blue-100 text-blue-800 font-bold"
                            : report.status === "in_progress" || report.status === "completed"
                            ? "text-blue-600 font-medium"
                            : "text-slate-400"
                        }`}
                      >
                        2. 검토 중
                      </span>
                      <ChevronRight className="h-3 w-3 text-slate-300" />
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          report.status === "in_progress"
                            ? "bg-amber-100 text-amber-900 font-bold"
                            : report.status === "completed"
                            ? "text-amber-700 font-medium"
                            : "text-slate-400"
                        }`}
                      >
                        3. 처리 중
                      </span>
                      <ChevronRight className="h-3 w-3 text-slate-300" />
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          report.status === "completed"
                            ? "bg-emerald-100 text-emerald-900 font-bold"
                            : "text-slate-400"
                        }`}
                      >
                        4. 처리 완료
                      </span>
                    </div>

                    {report.assignee && (
                      <span className="text-[11px] font-semibold text-slate-600 hidden md:inline">
                        담당: {report.assignee}
                      </span>
                    )}
                  </div>

                  {/* Resolution Note Preview if Completed */}
                  {report.status === "completed" && report.resolutionNote && (
                    <div className="p-2.5 rounded-lg bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold mr-1.5">[조치 완료 내용]:</span>
                        <span>{report.resolutionNote}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 7. Public Report Readonly Detail Modal */}
      {selectedReport && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none"
          onClick={() => setSelectedReport(null)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs bg-blue-100 text-blue-900 px-2 py-0.5 rounded">
                  {selectedReport.id}
                </span>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  신고 진행상황 상세 조회
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer p-1"
              >
                닫기
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Status Banner */}
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between ${
                  STATUS_MAP[selectedReport.status]?.badgeClass || ""
                }`}
              >
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    현재 처리 단계
                  </span>
                  <span className="text-sm font-bold">
                    {STATUS_MAP[selectedReport.status]?.label || selectedReport.status}
                  </span>
                </div>
                {selectedReport.assignee && (
                  <div className="text-right">
                    <span className="text-[11px] font-semibold text-slate-500 block">
                      담당 부서
                    </span>
                    <span className="text-xs font-bold text-slate-800">
                      {selectedReport.assignee}
                    </span>
                  </div>
                )}
              </div>

              {/* Location & Category */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                  <span className="text-slate-500 block text-[11px]">위치</span>
                  <span className="font-bold text-slate-900">{selectedReport.location}</span>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                  <span className="text-slate-500 block text-[11px]">문제 유형</span>
                  <span className="font-bold text-slate-900">{selectedReport.category}</span>
                </div>
              </div>

              {/* Public Description */}
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-700 block">
                  신고 내용 요약
                </span>
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {selectedReport.description}
                </div>
              </div>

              {/* Resolution Note if available */}
              {selectedReport.resolutionNote && (
                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/80 space-y-1">
                  <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    담당 부서 조치 완료 내역
                  </span>
                  <p className="text-xs text-emerald-950 leading-relaxed">
                    {selectedReport.resolutionNote}
                  </p>
                  {selectedReport.completedAt && (
                    <p className="text-[10px] text-emerald-700 font-mono pt-1">
                      완료 일시: {formatDate(selectedReport.completedAt)}
                    </p>
                  )}
                </div>
              )}

              {/* Privacy protection notice footer */}
              <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
                <span>신고자 개인정보 비공개 처리됨</span>
                <span>접수일: {formatDate(selectedReport.createdAt)}</span>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition cursor-pointer"
              >
                확인 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
