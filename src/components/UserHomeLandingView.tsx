import React, { useState } from "react";
import { SchoolReport, UserProfile } from "../types";
import {
  AlertTriangle,
  ClipboardList,
  CheckCircle2,
  Clock,
  Search,
  ArrowRight,
  ShieldCheck,
  Building2,
  Camera,
  Eye,
  Plus,
  Lock,
} from "lucide-react";

interface UserHomeLandingViewProps {
  reports: SchoolReport[];
  currentUser: UserProfile | null;
  onNavigateNewReport: () => void;
  onNavigateMyReports: () => void;
  onNavigateOverallProgress?: () => void;
  onOpenReportDetail: (report: SchoolReport) => void;
  onOpenAuthModal: () => void;
}

export function UserHomeLandingView({
  reports,
  currentUser,
  onNavigateNewReport,
  onNavigateMyReports,
  onNavigateOverallProgress,
  onOpenReportDetail,
  onOpenAuthModal,
}: UserHomeLandingViewProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const totalReports = reports.length;
  const completedReports = reports.filter((r) => r.status === "completed").length;
  const inProgressReports = reports.filter(
    (r) => r.status === "in_progress" || r.status === "reviewing"
  ).length;

  const myReportsCount = currentUser
    ? reports.filter(
        (r) =>
          r.userEmail?.toLowerCase() === currentUser.email.toLowerCase() ||
          (!r.userEmail && !r.isAnonymous && r.userName === currentUser.name)
      ).length
    : 0;

  // Filter reports matching search query (by ID, title, location, category)
  const filteredSearchReports = searchQuery.trim()
    ? reports.filter((r) => {
        const q = searchQuery.trim().toLowerCase();
        return (
          r.id.toLowerCase().includes(q) ||
          r.location.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          (r.title && r.title.toLowerCase().includes(q)) ||
          r.description.toLowerCase().includes(q)
        );
      })
    : [];

  // Recent resolved improvements (to give social proof that the school is responsive)
  const recentResolved = reports
    .filter((r) => r.status === "completed")
    .slice(0, 3);

  return (
    <div className="space-y-8 max-w-6xl mx-auto px-4 py-4 sm:py-6">
      {/* 1. Welcoming Hero Banner */}
      <div className="relative rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white p-6 sm:p-10 shadow-xl overflow-hidden">
        {/* Subtle decorative background circles */}
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-semibold backdrop-blur-xs">
            <Building2 className="h-3.5 w-3.5" />
            <span>우리 학교 시설 안전 모니터링 플랫폼</span>
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-white leading-tight break-keep">
            학교의 불편과 위험,
            <br />
            <span className="text-blue-400">SchoolFix</span>가 함께 해결합니다
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed break-keep">
            파손된 비품, 안전 위험 요소, 냉난방 불편 등을 언제든 접수해주세요.
            접수된 모든 사항은 시설관리팀에 즉시 전달되며, 조치 과정이 투명하게 안내됩니다.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onNavigateNewReport}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-900/30 active:scale-[0.98] transition cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>불편사항 신고하기</span>
            </button>

            <button
              type="button"
              onClick={onNavigateMyReports}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs sm:text-sm font-semibold active:scale-[0.98] transition cursor-pointer"
            >
              <ClipboardList className="h-4 w-4 text-blue-300" />
              <span>내 진행상황 조회</span>
              {myReportsCount > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-blue-500 text-white text-[11px] font-mono font-bold">
                  {myReportsCount}
                </span>
              )}
            </button>

            {onNavigateOverallProgress && (
              <button
                type="button"
                onClick={onNavigateOverallProgress}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 text-indigo-100 text-xs sm:text-sm font-semibold active:scale-[0.98] transition cursor-pointer"
              >
                <Eye className="h-4 w-4 text-indigo-300" />
                <span>전체 진행상황 보기</span>
              </button>
            )}
          </div>
        </div>

        {/* Real-time School Metrics Card inside Hero */}
        <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-3 gap-2 sm:gap-4 max-w-lg">
          <div>
            <span className="block text-[11px] text-slate-400">누적 접수</span>
            <strong className="text-lg sm:text-2xl font-bold font-mono text-white">
              {totalReports}
              <span className="text-xs font-normal text-slate-400 ml-0.5">건</span>
            </strong>
          </div>
          <div>
            <span className="block text-[11px] text-amber-300">조치 진행 중</span>
            <strong className="text-lg sm:text-2xl font-bold font-mono text-amber-400">
              {inProgressReports}
              <span className="text-xs font-normal text-slate-400 ml-0.5">건</span>
            </strong>
          </div>
          <div>
            <span className="block text-[11px] text-emerald-300">조치 완료</span>
            <strong className="text-lg sm:text-2xl font-bold font-mono text-emerald-400">
              {completedReports}
              <span className="text-xs font-normal text-slate-400 ml-0.5">건</span>
            </strong>
          </div>
        </div>
      </div>

      {/* 2. Interactive Search & Track Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <label htmlFor="user-report-search" className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <Search className="h-4 w-4 text-blue-600" />
            <span>신고 번호 또는 위치로 실시간 처리 상태 조회</span>
          </label>
          <span className="text-[11px] text-slate-500">
            신고 접수증의 접수번호(예: REP-...)를 입력하세요
          </span>
        </div>

        <div className="relative">
          <input
            id="user-report-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="접수번호(REP-2026...), 시설 위치(예: 3층 복도, 급식실), 문제 내용 검색"
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-300 text-xs sm:text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition"
          />
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-3 text-xs text-slate-400 hover:text-slate-600 cursor-pointer font-semibold"
            >
              지우기
            </button>
          )}
        </div>

        {/* Search Results Display */}
        {searchQuery.trim() && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>검색 결과: {filteredSearchReports.length}건</span>
              <span className="text-[11px]">카드를 클릭하면 상세 조치 현황을 확인합니다</span>
            </div>

            {filteredSearchReports.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-lg">
                일치하는 신고 내역이 없습니다. 접수번호를 다시 확인해주세요.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {filteredSearchReports.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => onOpenReportDetail(r)}
                    className="p-3 rounded-lg border border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/30 transition cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono font-bold text-slate-700">
                          {r.id}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                            r.status === "completed"
                              ? "bg-emerald-100 text-emerald-800"
                              : r.status === "in_progress"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {r.status === "completed"
                            ? "처리 완료"
                            : r.status === "in_progress"
                            ? "처리 중"
                            : r.status === "reviewing"
                            ? "확인 중"
                            : "접수 대기"}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-900 truncate mt-0.5">
                        [{r.location}] {r.title || r.category}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Action Cards Grid (3 Columns: New Report, My Progress, Overall Progress) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Report Submission */}
        <div
          onClick={onNavigateNewReport}
          className="p-5 sm:p-6 rounded-2xl border-2 border-blue-200 bg-gradient-to-b from-blue-50/60 to-white hover:border-blue-400 transition cursor-pointer shadow-xs group space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="h-11 w-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-blue-700 group-hover:translate-x-1 transition flex items-center gap-1">
              신고서 작성 <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>

          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900 group-hover:text-blue-900 transition">
              시설 불편 및 위험 신고
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              교실 조명 불량, 파손된 시설, 계단 미끄럼 등 불편하거나 위험한 곳을 바로 제보하세요.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
            <span className="px-2 py-0.5 rounded bg-slate-100">익명 접수 가능</span>
            <span className="px-2 py-0.5 rounded bg-slate-100">현장 사진 첨부</span>
          </div>
        </div>

        {/* Card 2: My Reports (내 진행상황) */}
        <div
          onClick={onNavigateMyReports}
          className="p-5 sm:p-6 rounded-2xl border border-slate-200 bg-white hover:border-slate-400 transition cursor-pointer shadow-xs group space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="h-11 w-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md">
              <ClipboardList className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-slate-700 group-hover:translate-x-1 transition flex items-center gap-1">
              내 진행상황 <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>

          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900 group-hover:text-blue-900 transition">
              내 신고 진행상황
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              내가 작성한 제보의 진행 상태를 접수 대기부터 처리 완료까지 실시간 확인합니다.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-between text-xs">
            {currentUser ? (
              <span className="text-blue-700 font-semibold flex items-center gap-1 text-[11px]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {currentUser.name} ({myReportsCount}건)
              </span>
            ) : (
              <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                <Lock className="h-3.5 w-3.5" />
                Google 계정 연동
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Overall Progress (전체 진행상황) */}
        <div
          onClick={onNavigateOverallProgress}
          className="p-5 sm:p-6 rounded-2xl border border-indigo-200 bg-gradient-to-b from-indigo-50/50 to-white hover:border-indigo-400 transition cursor-pointer shadow-xs group space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="h-11 w-11 rounded-xl bg-indigo-700 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <Eye className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-indigo-700 group-hover:translate-x-1 transition flex items-center gap-1">
              공개 현황 <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>

          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900 group-hover:text-indigo-900 transition">
              전체 신고 진행상황
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              교내 모든 시설의 처리 현황을 개인정보 노출 없이 안전하고 투명하게 공개합니다.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-between text-[11px] text-indigo-800 font-semibold">
            <span>🛡️ 개인정보 보호</span>
            <span>누적 {totalReports}건</span>
          </div>
        </div>
      </div>

      {/* 4. Recent Resolved Facilities Showcase */}
      {recentResolved.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>최근 신속 조치 완료된 시설</span>
            </h2>
            <span className="text-xs text-slate-500">
              우리 학교 시설팀의 최근 보수 실적
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {recentResolved.map((item) => (
              <div
                key={item.id}
                onClick={() => onOpenReportDetail(item)}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:border-emerald-400 hover:shadow-xs transition cursor-pointer space-y-2 group"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono text-slate-500">{item.id}</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                    조치 완료
                  </span>
                </div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-emerald-900 transition truncate">
                  [{item.location}] {item.title || item.category}
                </h3>
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {item.resolutionNote || item.description}
                </p>
                <div className="pt-1 text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>
                    {item.completedAt
                      ? new Date(item.completedAt).toLocaleDateString()
                      : "최근 완료"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Helpful Tips for Reporting */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-2">
        <h3 className="font-bold text-slate-900 flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-blue-700" />
          <span>SchoolFix 신속 처리를 위한 꿀팁</span>
        </h3>
        <ul className="list-disc list-inside space-y-1 text-slate-600 leading-relaxed">
          <li>
            <strong>구체적인 장소 기재:</strong> 예: "본관 3층 서편 남화장실 2번째 세면대"처럼 기재하시면 즉각 출동이 가능합니다.
          </li>
          <li>
            <strong>현장 사진 촬영:</strong> 사진을 첨부해주시면 시설 관리자가 필요한 수리 공구와 부품을 미리 준비할 수 있습니다.
          </li>
          <li>
            <strong>익명성 철저 보장:</strong> 익명 체크 시 관리자 화면 및 공용 목록에서 제보자의 정보가 일체 숨겨집니다.
          </li>
        </ul>
      </div>
    </div>
  );
}
