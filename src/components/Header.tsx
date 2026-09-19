import React from "react";
import { Building2, ClipboardList, ShieldCheck, RefreshCw, User, LogIn, Lock } from "lucide-react";
import { UserProfile, isUserAdmin } from "../types";

interface HeaderProps {
  currentView: "STUDENT" | "ADMIN";
  onChangeView: (view: "STUDENT" | "ADMIN") => void;
  reportCount: number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  currentUser: UserProfile | null;
  onOpenAuthModal: () => void;
}

export function Header({
  currentView,
  onChangeView,
  reportCount,
  onRefresh,
  isRefreshing = false,
  currentUser,
  onOpenAuthModal,
}: HeaderProps) {
  const isAdmin = isUserAdmin(currentUser?.email);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          {/* Brand & Service Title */}
          <div
            onClick={() => onChangeView("STUDENT")}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer group"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg overflow-hidden shadow-xs border border-blue-800/20 group-hover:scale-105 transition">
              <img
                src="/favicon.svg"
                alt="SchoolFix Logo"
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 group-hover:text-blue-700 transition">
                  SchoolFix
                </span>
                <span className="text-xs text-slate-500 font-normal hidden md:inline truncate">
                  학교 시설 불편 접수 & 안전 모니터링
                </span>
              </div>
            </div>
          </div>

          {/* Navigation & User Profile */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* View Switcher */}
            <nav className="flex items-center gap-1 border border-slate-200 rounded-lg p-0.5 bg-slate-100/70">
              <button
                type="button"
                onClick={() => onChangeView("STUDENT")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer min-h-[36px] ${
                  currentView === "STUDENT"
                    ? "bg-white text-blue-700 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                <span>일반 사용자</span>
              </button>

              <button
                type="button"
                onClick={() => onChangeView("ADMIN")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer min-h-[36px] ${
                  currentView === "ADMIN"
                    ? "bg-white text-blue-700 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {isAdmin ? (
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                )}
                <span>관리자 대시보드</span>
                {reportCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] font-mono text-slate-700">
                    {reportCount}
                  </span>
                )}
              </button>
            </nav>

            {/* Refresh button */}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                title="데이터 새로고침"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition active:scale-[0.98] disabled:opacity-50 cursor-pointer min-h-[36px]"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 text-slate-500 ${
                    isRefreshing ? "animate-spin text-blue-700" : ""
                  }`}
                />
              </button>
            )}

            {/* Google Authentication Profile Control */}
            {currentUser ? (
              <button
                type="button"
                onClick={onOpenAuthModal}
                className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 transition cursor-pointer min-h-[36px]"
                title={`${currentUser.name} (${currentUser.email})`}
              >
                {currentUser.picture || currentUser.profile_image || currentUser.avatar ? (
                  <img
                    src={currentUser.picture || currentUser.profile_image || currentUser.avatar}
                    alt={currentUser.name}
                    referrerPolicy="no-referrer"
                    className="h-6 w-6 rounded-full object-cover shrink-0 border border-slate-200"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                    {currentUser.name ? currentUser.name.charAt(0) : "U"}
                  </div>
                )}
                <div className="text-left hidden sm:block max-w-[110px]">
                  <p className="text-xs font-bold text-slate-900 truncate leading-tight">
                    {currentUser.name}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate leading-tight">
                    {currentUser.role === "ADMIN" ? "관리자" : "일반 사용자"}
                  </p>
                </div>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${
                    currentUser.role === "ADMIN"
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-blue-50 text-blue-700 border-blue-200"
                  }`}
                >
                  {currentUser.role === "ADMIN" ? "ADMIN" : "USER"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenAuthModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-2xs transition active:scale-[0.98] cursor-pointer min-h-[36px]"
              >
                <LogIn className="h-3.5 w-3.5 text-blue-600" />
                <span>Google 로그인</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
