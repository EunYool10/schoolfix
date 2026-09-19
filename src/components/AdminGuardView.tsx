import React from "react";
import { UserProfile, ADMIN_EMAIL, isUserAdmin } from "../types";
import { ShieldAlert, LogIn, ArrowLeft, CheckCircle2 } from "lucide-react";

interface AdminGuardViewProps {
  currentUser: UserProfile | null;
  onOpenAuthModal: () => void;
  onSwitchToStudent: () => void;
}

export function AdminGuardView({
  currentUser,
  onOpenAuthModal,
  onSwitchToStudent,
}: AdminGuardViewProps) {
  // 관리자 계정으로 로그인했는데도 이 화면이 보이는 경우는 세션 만료이므로 "다른 계정"으로 안내하지 않는다.
  const isWrongAccount = Boolean(currentUser && !isUserAdmin(currentUser.email));

  return (
    <div className="max-w-xl mx-auto my-12 p-6 sm:p-8 bg-white rounded-2xl border border-slate-200 shadow-xl text-center space-y-6">
      <div className="h-16 w-16 mx-auto rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
        <ShieldAlert className="h-8 w-8" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          관리자 권한이 필요합니다
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed break-keep">
          SchoolFix의 시설 처리 상태 변경, 관리자 비고 등록, 우선순위 조정 및 AI 안전 진단 종합 리포트는
          공인된 시설 안전 책임자 계정만 접근할 수 있습니다.
        </p>
      </div>

      {/* Account Status Box */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-left space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-slate-500 font-medium">허가된 관리자 계정</span>
          <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            {ADMIN_EMAIL}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200/70 pt-2">
          <span className="text-slate-500 font-medium">현재 로그인 상태</span>
          {currentUser ? (
            <span className="font-mono text-slate-800">
              {currentUser.email} ({currentUser.role === "ADMIN" ? "관리자" : "일반 사용자"})
            </span>
          ) : (
            <span className="text-amber-700 font-medium">로그인되지 않음</span>
          )}
        </div>
      </div>

      {isWrongAccount && (
        <p className="text-xs text-rose-600 font-medium bg-rose-50 p-2.5 rounded-lg border border-rose-100">
          현재 로그인된 계정은 일반 사용자 권한입니다. 관리자 계정으로 전환하여 로그인해주세요.
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={onOpenAuthModal}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold shadow-md shadow-blue-700/20 active:scale-[0.98] transition cursor-pointer"
        >
          <LogIn className="h-4 w-4" />
          <span>관리자 계정으로 로그인</span>
        </button>

        <button
          type="button"
          onClick={onSwitchToStudent}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs sm:text-sm font-semibold active:scale-[0.98] transition cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>일반 사용자 화면으로 돌아가기</span>
        </button>
      </div>
    </div>
  );
}
