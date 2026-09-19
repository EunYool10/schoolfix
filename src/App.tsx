/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Header } from "./components/Header";
import { UserHomeLandingView } from "./components/UserHomeLandingView";
import { StudentReportView } from "./components/StudentReportView";
import { ReportListView } from "./components/ReportListView";
import { ReportDetailModal } from "./components/ReportDetailModal";
import { DeleteReportModal } from "./components/DeleteReportModal";
import { UnsavedChangesModal } from "./components/UnsavedChangesModal";
import { SchoolReport, ReportStatsResponse } from "./types";
import { CheckCircle2, AlertCircle, PlusCircle, Home, ListFilter } from "lucide-react";

/**
 * 익명 소유 토큰 저장소.
 *
 * 로그인이 없으므로 "내 신고"는 신고 등록 시 서버가 발급한 토큰으로 식별한다.
 * userId 를 임의로 만들지 않으며(§9), 토큰은 서버가 crypto 난수로 생성한다.
 * 브라우저에는 원본 토큰만, 서버 DB 에는 해시만 존재한다.
 */
const OWNER_TOKENS_KEY = "schoolfix_owner_tokens_v1";

function loadOwnerTokens(): string[] {
  try {
    const raw = localStorage.getItem(OWNER_TOKENS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function saveOwnerToken(token: string) {
  try {
    const tokens = loadOwnerTokens();
    if (!tokens.includes(token)) {
      localStorage.setItem(OWNER_TOKENS_KEY, JSON.stringify([token, ...tokens].slice(0, 200)));
    }
  } catch (err) {
    console.warn("소유 토큰을 저장하지 못했습니다.", err);
  }
}

type View = "HOME" | "NEW_REPORT" | "REPORTS";

interface ToastState {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

export default function App() {
  const [view, setView] = useState<View>("HOME");
  const [reportsTab, setReportsTab] = useState<"MINE" | "ALL">("ALL");

  const [reports, setReports] = useState<SchoolReport[]>([]);
  const [myReports, setMyReports] = useState<SchoolReport[]>([]);
  const [stats, setStats] = useState<ReportStatsResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [detailReport, setDetailReport] = useState<SchoolReport | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const [isFormDirty, setIsFormDirty] = useState(false);
  const [pendingView, setPendingView] = useState<View | null>(null);

  const [toasts, setToasts] = useState<ToastState[]>([]);

  const showToast = useCallback((type: ToastState["type"], message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  /** 전체 신고 + 서버 계산 통계 */
  const fetchReports = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/reports");
      if (!res.ok) throw new Error("신고 목록을 불러오지 못했습니다.");
      const json = await res.json();
      if (json.ok) {
        setReports(json.data || []);
        setStats(json.stats || null);
      }
    } catch (err) {
      console.error(err);
      showToast("error", "신고 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [showToast]);

  /** 내 신고 — 브라우저에 보관된 토큰으로 조회 */
  const fetchMyReports = useCallback(async () => {
    const tokens = loadOwnerTokens();
    if (tokens.length === 0) {
      setMyReports([]);
      return;
    }
    try {
      const res = await fetch("/api/reports/mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens }),
      });
      const json = await res.json();
      if (json.ok) setMyReports(json.data || []);
    } catch (err) {
      console.error("내 신고를 불러오지 못했습니다.", err);
    }
  }, []);

  useEffect(() => {
    fetchReports();
    fetchMyReports();
  }, [fetchReports, fetchMyReports]);

  const refreshAll = useCallback(() => {
    fetchReports(true);
    fetchMyReports();
  }, [fetchReports, fetchMyReports]);

  /** 신고 등록 */
  const handleSubmitReport = async (data: {
    title?: string;
    location: string;
    category: string;
    description: string;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    attachmentSize?: number | null;
  }) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        return { success: false as const, error: json.error || "신고를 저장하지 못했습니다." };
      }

      // 서버가 발급한 소유 토큰을 저장해야 "내 신고"에서 다시 찾을 수 있다.
      if (json.ownerToken) saveOwnerToken(json.ownerToken);

      showToast("success", `신고가 접수되었습니다 (접수번호: ${json.data.id})`);
      if (json.masked) {
        // 사용자가 모르게 내용이 바뀌면 안 되므로 반드시 알린다.
        showToast(
          "info",
          `부적절한 표현 ${json.maskedCount}곳이 자동으로 가려졌습니다.`
        );
      }
      refreshAll();
      return { success: true as const, report: json.data as SchoolReport };
    } catch (err: any) {
      const message = err?.message || "신고를 저장하지 못했습니다.";
      showToast("error", message);
      return { success: false as const, error: message };
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleted = (reportId: string) => {
    setReports((prev) => prev.filter((r) => r.id !== reportId));
    setMyReports((prev) => prev.filter((r) => r.id !== reportId));
    setDetailReport(null);
    showToast("info", `신고 [${reportId}]가 삭제되었습니다.`);
    // 삭제로 통계가 바뀌므로 서버에서 다시 받아온다.
    refreshAll();
  };

  /** 작성 중 이탈 경고 */
  const requestView = (next: View) => {
    if (view === next) return;
    if (view === "NEW_REPORT" && isFormDirty) {
      setPendingView(next);
      return;
    }
    setView(next);
  };

  const goHome = () => requestView("HOME");

  const myReportIds = useMemo(() => new Set(myReports.map((r) => r.id)), [myReports]);

  // 전체 목록에도 "내 신고" 표시를 붙여 준다.
  const allReportsMarked = useMemo(
    () => reports.map((r) => (myReportIds.has(r.id) ? { ...r, isMine: true } : r)),
    [reports, myReportIds]
  );

  const navButton = (target: View, label: string, Icon: typeof Home) => {
    const active = view === target;
    return (
      <button
        type="button"
        onClick={() => requestView(target)}
        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer min-h-[40px] shrink-0 ${
          active
            ? "bg-slate-900 text-white shadow-xs"
            : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
        }`}
      >
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased text-slate-900">
      {/* 토스트 */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none print:hidden">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2.5 p-3.5 rounded-xl shadow-lg border text-xs sm:text-sm ${
              toast.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : toast.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-900"
                : "bg-blue-50 border-blue-200 text-blue-900"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <span className="font-medium leading-snug">{toast.message}</span>
          </div>
        ))}
      </div>

      <Header onGoHome={goHome} reportCount={reports.length} />

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="space-y-6">
            <nav className="flex items-center gap-1.5 overflow-x-auto p-0.5 print:hidden">
              {navButton("HOME", "메인 홈", Home)}
              {navButton("NEW_REPORT", "신고하기", PlusCircle)}
              {navButton("REPORTS", "신고 목록", ListFilter)}
            </nav>

            {view === "HOME" && (
              <UserHomeLandingView
                reports={allReportsMarked}
                onNavigateNewReport={() => setView("NEW_REPORT")}
                onNavigateReports={(tab) => { setReportsTab(tab ?? "ALL"); setView("REPORTS"); }}
                onOpenReportDetail={(r) => setDetailReport(r)}
              />
            )}

            {view === "NEW_REPORT" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
                <section className="lg:col-span-7 xl:col-span-8">
                  <StudentReportView
                    onSubmitReport={handleSubmitReport}
                    isSubmitting={isSubmitting}
                    onSuccessNavToMyReports={() => setView("REPORTS")}
                    onDirtyChange={setIsFormDirty}
                  />
                </section>

                <aside className="lg:col-span-5 xl:col-span-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                    <h3 className="text-sm font-bold text-slate-900 mb-2">💡 신고 접수 안내</h3>
                    <ul className="space-y-2 text-xs text-slate-600 leading-relaxed list-disc list-inside">
                      <li>사진을 함께 첨부하면 담당 부서가 상태를 더 빠르게 파악할 수 있습니다.</li>
                      <li>
                        위급하거나 학생 안전에 직결된 사항(유리 파손, 누전 등)은 즉시 교무실 또는
                        행정실로 구두 연락 바랍니다.
                      </li>
                      <li>로그인 없이 접수되며, 신고자 이름·연락처는 수집하지 않습니다.</li>
                      <li>
                        접수한 신고는 이 브라우저의 [내 신고] 탭에서 다시 확인할 수 있습니다.
                      </li>
                    </ul>
                  </div>
                </aside>
              </div>
            )}

            {view === "REPORTS" && (
              <ReportListView
                allReports={allReportsMarked}
                myReports={myReports}
                isLoading={isLoading}
                onRefresh={refreshAll}
                isRefreshing={isRefreshing}
                onOpenReport={(r) => setDetailReport(r)}
                onNavigateNewReport={() => setView("NEW_REPORT")}
                initialTab={reportsTab}
              />
            )}
          </div>
        </div>
      </main>

      {detailReport && (
        <ReportDetailModal
          report={detailReport}
          isOpen={Boolean(detailReport)}
          onClose={() => setDetailReport(null)}
          onRequestDelete={(id) => setDeleteTargetId(id)}
        />
      )}

      <DeleteReportModal
        isOpen={Boolean(deleteTargetId)}
        reportId={deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onDeleted={handleDeleted}
      />

      <UnsavedChangesModal
        isOpen={Boolean(pendingView)}
        title="작성 중인 내용 유실 주의"
        message="작성 중인 신고 내용이 있습니다. 다른 화면으로 이동하면 입력한 내용이 유실될 수 있습니다. 이동하시겠습니까?"
        confirmText="이동하기"
        cancelText="계속 작성하기"
        onConfirm={() => {
          if (pendingView) {
            setIsFormDirty(false);
            setView(pendingView);
            setPendingView(null);
          }
        }}
        onCancel={() => setPendingView(null)}
      />

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="font-semibold text-slate-700">
            SchoolFix AI — 학교 불편사항 신고 및 시설 안전 관리
          </p>
          <p className="mt-1 text-slate-400">
            로그인 없이 누구나 이용할 수 있으며, 신고자 개인정보는 수집하지 않습니다.
          </p>
        </div>
      </footer>
    </div>
  );
}
