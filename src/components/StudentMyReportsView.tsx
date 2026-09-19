import React, { useState, useMemo, useEffect } from "react";
import { SchoolReport, STATUS_MAP, UserProfile } from "../types";
import { ReportDetailModal } from "./ReportDetailModal";
import {
  Search,
  MapPin,
  Tag,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  AlertCircle,
  LogIn,
  Layers,
  Clock,
  ArrowRight,
  RefreshCw,
  FileText,
} from "lucide-react";

interface StudentMyReportsViewProps {
  reports: SchoolReport[];
  myReportIds: string[];
  currentUser?: UserProfile | null;
  onSelectReport?: (report: SchoolReport) => void;
  onGoToReportForm?: () => void;
  onNavigateToNewReport?: () => void;
  onOpenAuthModal?: () => void;
  onRefresh?: () => void;
}

export function StudentMyReportsView({
  reports,
  myReportIds,
  currentUser,
  onSelectReport,
  onGoToReportForm,
  onNavigateToNewReport,
  onOpenAuthModal,
  onRefresh,
}: StudentMyReportsViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedReport, setSelectedReport] = useState<SchoolReport | null>(null);
  const [serverMyReports, setServerMyReports] = useState<SchoolReport[] | null>(null);
  const [isLoadingServer, setIsLoadingServer] = useState<boolean>(false);

  const handleGoToNew = onNavigateToNewReport || onGoToReportForm;

  // If user is logged in, fetch authoritative list from /api/reports/my
  const fetchMyReportsFromServer = async () => {
    const token =
      localStorage.getItem("schoolfix_session_token") ||
      localStorage.getItem("schoolfix_session_token_v1");
    if (!token && !currentUser) return;

    setIsLoadingServer(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/reports/my", { headers });
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) {
          setServerMyReports(json.data);
        }
      }
    } catch (e) {
      console.error("Failed to fetch my reports from server", e);
    } finally {
      setIsLoadingServer(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchMyReportsFromServer();
    } else {
      setServerMyReports(null);
    }
  }, [currentUser]);

  // Combine server authoritative my-reports with locally tracked IDs for anonymous submissions
  const myReports = useMemo(() => {
    const map = new Map<string, SchoolReport>();

    // 1. From server API if available
    if (serverMyReports && serverMyReports.length > 0) {
      serverMyReports.forEach((r) => map.set(r.id, r));
    }

    // 2. From all reports matching current user profile
    reports.forEach((r) => {
      let isMine = false;
      if (myReportIds.includes(r.id)) isMine = true;
      if (currentUser?.id && r.user_id === currentUser.id) isMine = true;
      if (currentUser?.google_sub && r.google_sub === currentUser.google_sub) isMine = true;
      if (currentUser?.email && r.userEmail?.toLowerCase() === currentUser.email.toLowerCase()) {
        isMine = true;
      }
      if (isMine && !map.has(r.id)) {
        map.set(r.id, r);
      }
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [reports, serverMyReports, myReportIds, currentUser]);

  // Stats calculation (Requirement 8)
  const stats = useMemo(() => {
    const total = myReports.length;
    const pending = myReports.filter((r) => r.status === "pending").length;
    const reviewing = myReports.filter((r) => r.status === "reviewing").length;
    const inProgress = myReports.filter((r) => r.status === "in_progress").length;
    const completed = myReports.filter((r) => r.status === "completed").length;
    return { total, pending, reviewing, inProgress, completed };
  }, [myReports]);

  // Search & Filter
  const searchedReports = useMemo(() => {
    let result = myReports;

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
  }, [myReports, searchQuery, statusFilter]);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}.${month}.${day}`;
    } catch {
      return iso;
    }
  };

  const handleOpenReport = (report: SchoolReport) => {
    if (onSelectReport) {
      onSelectReport(report);
    } else {
      setSelectedReport(report);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-white p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold">
              <span>개인 맞춤형 알림 서비스</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-blue-700" />
              <span>내 신고 진행상황</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              내가 접수한 시설 불편 및 안전 요청의 실시간 부서 배정, 검토 상태 및 수리 완료 내역입니다.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                fetchMyReportsFromServer();
                if (onRefresh) onRefresh();
              }}
              disabled={isLoadingServer}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingServer ? "animate-spin" : ""}`} />
              <span>새로고침</span>
            </button>
            {handleGoToNew && (
              <button
                type="button"
                onClick={handleGoToNew}
                className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-[0.98]"
              >
                + 새 불편사항 신고하기
              </button>
            )}
          </div>
        </div>

        {/* Account Sync Status Banner */}
        <div className="mt-4 pt-4 border-t border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          {currentUser ? (
            <div className="flex items-center gap-2 text-slate-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <span>
                <strong>{currentUser.name}</strong> ({currentUser.email}) Google 계정으로 연동된 접수 내역을 표시 중입니다.
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full gap-2 flex-wrap">
              <span className="text-slate-600">
                현재 이 기기/브라우저에서 제출한 접수 내역을 표시 중입니다.
              </span>
              {onOpenAuthModal && (
                <button
                  type="button"
                  onClick={onOpenAuthModal}
                  className="inline-flex items-center gap-1.5 font-bold text-blue-700 hover:text-blue-900 cursor-pointer bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>Google 로그인하여 내 접수내역 모두 불러오기</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Statistical Cards (Strict Requirement 8: 전체 신고, 접수 대기, 처리 중, 처리 완료) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
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
          <p className="text-[11px] text-slate-400 mt-1">내가 작성한 신고</p>
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
          <p className="text-[11px] text-slate-500 mt-1">담당자 배정 대기</p>
        </div>

        {/* In Progress (including reviewing) */}
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 shadow-2xs">
          <div className="flex items-center justify-between text-amber-800 text-xs font-semibold mb-1">
            <span>처리 중 (검토 포함)</span>
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-800 font-mono">
            {stats.inProgress + stats.reviewing}
            <span className="text-xs font-normal text-amber-700 ml-1">건</span>
          </div>
          <p className="text-[11px] text-amber-700 mt-1">
            검토 {stats.reviewing}건 · 작업 {stats.inProgress}건
          </p>
        </div>

        {/* Completed */}
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-800 text-xs font-semibold mb-1">
            <span>처리 완료</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-800 font-mono">
            {stats.completed}
            <span className="text-xs font-normal text-emerald-700 ml-1">건</span>
          </div>
          <p className="text-[11px] text-emerald-700 mt-1">조치 완료 및 확인</p>
        </div>
      </div>

      {/* 3. Search and Filter Bar */}
      <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="내 접수번호(REP-...), 제목, 위치 검색"
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto shrink-0 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                statusFilter === "ALL" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              전체 ({myReports.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("pending")}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                statusFilter === "pending" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              접수 대기 ({stats.pending})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("in_progress")}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                statusFilter === "in_progress" ? "bg-white text-amber-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              처리 중 ({stats.inProgress})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("completed")}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                statusFilter === "completed" ? "bg-white text-emerald-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              처리 완료 ({stats.completed})
            </button>
          </div>
        </div>
      </div>

      {/* 4. Detailed Table / Card List (Strict Requirement 8: 신고번호 / 신고 내용 / 장소 / 접수일 / 상태) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">
            신고 상세 목록 ({searchedReports.length}건)
          </h2>
          <span className="text-xs text-slate-400">카드를 누르면 상세 내용과 사진을 확인합니다</span>
        </div>

        {searchedReports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 sm:p-12 text-center space-y-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-700">
                {searchQuery || statusFilter !== "ALL"
                  ? "조건에 일치하는 신고 내역이 없습니다."
                  : "접수된 내역이 없습니다."}
              </p>
              <p className="text-xs text-slate-500">
                학교 시설에 불편하거나 위험한 점이 있다면 언제든 신고해주세요.
              </p>
            </div>
            {handleGoToNew && (
              <button
                type="button"
                onClick={handleGoToNew}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-700 text-white text-xs font-bold hover:bg-blue-800 transition cursor-pointer"
              >
                + 첫 불편사항 신고하기
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {searchedReports.map((report) => {
              const statusCfg = STATUS_MAP[report.status] || STATUS_MAP.pending;

              return (
                <div
                  key={report.id}
                  onClick={() => handleOpenReport(report)}
                  className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 hover:border-blue-400 hover:shadow-xs transition cursor-pointer space-y-3.5"
                >
                  {/* Top Bar: Number, Location, Date, Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {report.id}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-700 font-bold bg-slate-100 px-2 py-0.5 rounded">
                        <MapPin className="h-3 w-3 text-slate-500" />
                        {report.location}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        <Tag className="h-3 w-3 text-slate-400" />
                        {report.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-mono">
                        접수일: {formatDate(report.createdAt)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${statusCfg.badgeClass}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dotClass}`} />
                        {statusCfg.label}
                      </span>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-snug">
                      {report.title || `${report.location} ${report.category} 신고`}
                    </h3>
                    <p className="text-xs text-slate-600 line-clamp-2 mt-1 leading-relaxed">
                      {report.description}
                    </p>
                  </div>

                  {/* 5. Requirement 9: Visual Processing Timeline ([접수 대기] -> [검토 중] -> [처리 중] -> [처리 완료]) */}
                  <div className="pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-[11px] font-bold text-slate-500">
                        처리 흐름 단계
                      </span>
                      {report.assignee && (
                        <span className="text-[11px] font-semibold text-slate-600">
                          담당 부서: <strong>{report.assignee}</strong>
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-1 sm:gap-2">
                      {/* Step 1: 접수 대기 */}
                      <div
                        className={`p-2 rounded-lg text-center text-xs transition border ${
                          report.status === "pending"
                            ? "bg-slate-900 text-white font-bold border-slate-900 ring-2 ring-slate-900/20 shadow-xs"
                            : "bg-slate-50 text-slate-700 border-slate-200"
                        }`}
                      >
                        <span className="block text-[10px] opacity-75">STEP 1</span>
                        <span className="text-[11px] font-semibold">접수 대기</span>
                      </div>

                      {/* Step 2: 검토 중 */}
                      <div
                        className={`p-2 rounded-lg text-center text-xs transition border ${
                          report.status === "reviewing"
                            ? "bg-blue-700 text-white font-bold border-blue-700 ring-2 ring-blue-700/20 shadow-xs"
                            : report.status === "in_progress" || report.status === "completed"
                            ? "bg-blue-50 text-blue-800 border-blue-200 font-medium"
                            : "bg-slate-50 text-slate-400 border-slate-100"
                        }`}
                      >
                        <span className="block text-[10px] opacity-75">STEP 2</span>
                        <span className="text-[11px] font-semibold">검토 중</span>
                      </div>

                      {/* Step 3: 처리 중 */}
                      <div
                        className={`p-2 rounded-lg text-center text-xs transition border ${
                          report.status === "in_progress"
                            ? "bg-amber-600 text-white font-bold border-amber-600 ring-2 ring-amber-600/20 shadow-xs"
                            : report.status === "completed"
                            ? "bg-amber-50 text-amber-800 border-amber-200 font-medium"
                            : "bg-slate-50 text-slate-400 border-slate-100"
                        }`}
                      >
                        <span className="block text-[10px] opacity-75">STEP 3</span>
                        <span className="text-[11px] font-semibold">처리 중</span>
                      </div>

                      {/* Step 4: 처리 완료 */}
                      <div
                        className={`p-2 rounded-lg text-center text-xs transition border ${
                          report.status === "completed"
                            ? "bg-emerald-600 text-white font-bold border-emerald-600 ring-2 ring-emerald-600/20 shadow-xs"
                            : "bg-slate-50 text-slate-400 border-slate-100"
                        }`}
                      >
                        <span className="block text-[10px] opacity-75">STEP 4</span>
                        <span className="text-[11px] font-semibold">처리 완료</span>
                      </div>
                    </div>
                  </div>

                  {/* Resolution Note if completed */}
                  {report.status === "completed" && report.resolutionNote && (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold mr-1">[학교 시설팀 조치 결과]:</span>
                        <span>{report.resolutionNote}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span>
                      {report.isAnonymous ? "익명 접수됨" : `작성자: ${report.userName || "신고자"}`}
                    </span>
                    <span className="flex items-center gap-1 text-blue-700 font-bold hover:underline">
                      상세 보기 <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Modal fallback if local */}
      {selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          isOpen={!!selectedReport}
          onClose={() => setSelectedReport(null)}
          isAdmin={currentUser?.role === "ADMIN"}
        />
      )}
    </div>
  );
}
