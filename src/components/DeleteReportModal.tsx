import React, { useEffect, useState } from "react";
import { X, Lock, AlertTriangle, Loader2 } from "lucide-react";

interface DeleteReportModalProps {
  isOpen: boolean;
  reportId: string | null;
  onClose: () => void;
  /** 삭제 성공 시 호출 */
  onDeleted: (reportId: string) => void;
}

/**
 * 신고 삭제 — 2단계 확인 (§10, §32).
 *
 *   1단계: 관리자 비밀번호 입력 -> 서버가 bcrypt 로 검증
 *   2단계: 최종 삭제 확인
 *
 * 비밀번호는 서버로만 전송하며 localStorage/sessionStorage/쿠키에 저장하지 않는다.
 * 검증에 성공하면 서버가 해당 신고에만 쓸 수 있는 1회용 삭제 토큰을 내려준다.
 * 클라이언트에는 비밀번호 원문도, 비교 로직도 존재하지 않는다.
 */
export function DeleteReportModal({
  isOpen,
  reportId,
  onClose,
  onDeleted,
}: DeleteReportModalProps) {
  const [step, setStep] = useState<"PASSWORD" | "CONFIRM">("PASSWORD");
  const [password, setPassword] = useState("");
  const [deleteToken, setDeleteToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // 모달이 열릴 때마다 상태를 초기화한다. 비밀번호가 메모리에 남지 않도록 닫을 때도 비운다.
  useEffect(() => {
    if (isOpen) {
      setStep("PASSWORD");
      setPassword("");
      setDeleteToken(null);
      setError(null);
      setIsBusy(false);
    }
  }, [isOpen]);

  if (!isOpen || !reportId) return null;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isBusy) return;

    setIsBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/verify-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, password }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "관리자 비밀번호가 올바르지 않습니다.");
      }

      setDeleteToken(json.deleteToken);
      setPassword(""); // 검증 후 즉시 폐기
      setStep("CONFIRM");
    } catch (err: any) {
      setError(err.message || "관리자 비밀번호가 올바르지 않습니다.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteToken || isBusy) return;

    setIsBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}`, {
        method: "DELETE",
        headers: { "X-Delete-Token": deleteToken },
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "신고를 삭제하지 못했습니다.");
      }

      onDeleted(reportId);
      onClose();
    } catch (err: any) {
      setError(err.message || "신고를 삭제하지 못했습니다.");
      setIsBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="신고 삭제"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">
            {step === "PASSWORD" ? "신고 삭제" : "신고 삭제 확인"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "PASSWORD" ? (
          <form onSubmit={handleVerify} className="p-5 space-y-4">
            <div className="flex items-start gap-2.5">
              <Lock className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600 leading-relaxed">
                신고를 삭제하려면 관리자 비밀번호가 필요합니다.
              </p>
            </div>

            <div>
              <label htmlFor="admin-pw" className="sr-only">
                관리자 비밀번호
              </label>
              <input
                id="admin-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                autoFocus
                placeholder="관리자 비밀번호"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 transition"
              />
            </div>

            {error && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!password.trim() || isBusy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
              >
                {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>확인</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-50 border border-rose-200">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-900 leading-relaxed">
                이 신고를 정말 삭제하시겠습니까?
                <br />
                삭제한 신고는 목록·통계·AI 요약·PDF에서 더 이상 표시되지 않습니다.
              </p>
            </div>

            <p className="text-[11px] font-mono text-slate-500">{reportId}</p>

            {error && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isBusy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 transition cursor-pointer disabled:opacity-50"
              >
                {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>삭제</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
