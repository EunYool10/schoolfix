import React from "react";
import { Building2, ClipboardList, ShieldCheck } from "lucide-react";

interface HeaderProps {
  /** 로고 클릭 시 홈으로 이동 (§5, §42) */
  onGoHome: () => void;
  reportCount: number;
}

export function Header({ onGoHome, reportCount }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          {/*
            브랜드 영역 전체가 홈 이동 버튼이다.
            SPA 이므로 location.href 로 전체 새로고침을 일으키지 않고 상위 상태만 바꾼다.
          */}
          <button
            type="button"
            onClick={onGoHome}
            aria-label="SchoolFix AI 홈으로 이동"
            className="flex items-center gap-2.5 min-w-0 rounded-xl px-2 py-1.5 -ml-2 cursor-pointer transition hover:bg-slate-100 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <span className="h-9 w-9 rounded-xl bg-blue-700 text-white flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5" />
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
                SchoolFix AI
              </span>
              <span className="hidden sm:block text-[11px] text-slate-500 truncate">
                학교 불편사항 신고 및 시설 안전 관리
              </span>
            </span>
          </button>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>로그인 없이 이용</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700">
              <ClipboardList className="h-3.5 w-3.5 text-slate-500" />
              <span className="font-mono tabular-nums">{reportCount}</span>
              <span className="hidden sm:inline">건</span>
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
