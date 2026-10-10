/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Header } from "./components/Header";
import { UserHomeLandingView } from "./components/UserHomeLandingView";
import {
  StudentReportView,
  type SubmitReportPayload,
  type SubmitReportResult,
} from "./components/StudentReportView";
import { ReportListView } from "./components/ReportListView";
import { ReportDetailModal } from "./components/ReportDetailModal";
import { DeleteReportModal } from "./components/DeleteReportModal";
import { StaffPortal } from "./components/StaffPortal";
import { SchoolSelectionView } from "./components/SchoolSelectionView";
import { ServicePolicyDialog, type PolicySection } from "./components/ServicePolicyDialog";
import { UnsavedChangesModal } from "./components/UnsavedChangesModal";
import { School, SchoolLocation, SchoolLocationType, SchoolReport } from "./types";
import { CheckCircle2, AlertCircle, PlusCircle, Home, ListFilter, UsersRound, ShieldCheck } from "lucide-react";
/**
 * 익명 소유 토큰·기기 토큰 저장소.
 *
 * 로그인이 없으므로 "내 신고"는 신고 등록 시 서버가 발급한 토큰으로 식별한다.
 * userId 를 임의로 만들지 않으며(§9), 브라우저에는 원본 토큰만, 서버 DB 에는 해시만 존재한다.
 */
import { getDeviceToken, loadOwnerTokens, saveOwnerToken } from "./utils/clientTokens";
import { changesSince, loadSeen, markSeen, rememberNew, type UpdateKind } from "./utils/reportUpdates";

type View = "SCHOOL_SELECT" | "HOME" | "NEW_REPORT" | "REPORTS" | "STAFF";

interface ToastState {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

export default function App() {
  const [view, setView] = useState<View>("HOME");
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [policySection, setPolicySection] = useState<PolicySection | null>(null);
  const [schoolLocations, setSchoolLocations] = useState<SchoolLocation[]>([]);
  const [schoolLocationTypes, setSchoolLocationTypes] = useState<SchoolLocationType[]>([]);
  const [schoolLocationsLoading, setSchoolLocationsLoading] = useState(false);
  const [schoolLocationsError, setSchoolLocationsError] = useState("");
  const [schoolLoading, setSchoolLoading] = useState(true);
  const [schoolError, setSchoolError] = useState("");
  const [reportsTab, setReportsTab] = useState<"MINE" | "ALL">("ALL");
  const riskRefreshAttempts = useRef(0);
  const riskRefreshSchoolId = useRef("");

  const [reports, setReports] = useState<SchoolReport[]>([]);
  const [myReports, setMyReports] = useState<SchoolReport[]>([]);

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

  // 학교를 바꾼 뒤 늦게 도착한 이전 학교의 응답이 새 학교 목록을 덮어쓰지 않도록,
  // 응답을 반영하기 전에 지금 선택된 학교와 같은지 확인한다.
  const currentSchoolIdRef = useRef<string | null>(null);
  currentSchoolIdRef.current = selectedSchool?.id ?? null;

  /** 전체 신고 + 서버 계산 통계 */
  const fetchReports = useCallback(async (silent = false) => {
    if (!selectedSchool) { setIsLoading(false); return; }
    const schoolId = selectedSchool.id;
    if (!silent) setIsLoading(true);
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/reports?schoolId=${encodeURIComponent(schoolId)}`);
      if (!res.ok) throw new Error("신고 목록을 불러오지 못했습니다.");
      const json = await res.json();
      if (currentSchoolIdRef.current !== schoolId) return;
      if (json.ok) {
        setReports(json.data || []);
      }
    } catch (err) {
      if (currentSchoolIdRef.current !== schoolId) return;
      console.error(err);
      showToast("error", "신고 목록을 불러오지 못했습니다.");
    } finally {
      if (currentSchoolIdRef.current === schoolId) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [showToast, selectedSchool]);

  /** 내 신고 — 브라우저에 보관된 토큰으로 조회 */
  const fetchMyReports = useCallback(async () => {
    if (!selectedSchool) { setMyReports([]); return; }
    const tokens = loadOwnerTokens();
    if (tokens.length === 0) {
      setMyReports([]);
      return;
    }
    try {
      const res = await fetch("/api/reports/mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens, schoolId: selectedSchool.id }),
      });
      const json = await res.json();
      if (currentSchoolIdRef.current !== selectedSchool.id) return;
      if (json.ok) setMyReports(json.data || []);
    } catch (err) {
      console.error("내 신고를 불러오지 못했습니다.", err);
    }
  }, [selectedSchool]);

  const loadSchoolCatalog = useCallback(async () => {
    setSchoolLoading(true); setSchoolError("");
    try {
      const response = await fetch("/api/schools");
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error("지원 학교 목록을 불러오지 못했습니다.");
      const available = (Array.isArray(json.data) ? json.data : []) as School[];
      setSchools(available);
      // 매번 먼저 학교 선택 화면에서 선택을 확인한 뒤 서비스에 입장합니다.
      // 마지막 학교는 선택 화면에서 미리 선택해 두어 재방문도 빠르게 합니다.
      let savedId = "";
      try { savedId = localStorage.getItem("schoolfix_selected_school_v1") || ""; } catch { /* selection can still be made for this session */ }
      if (!available.some((school) => school.id === savedId)) {
        try { localStorage.removeItem("schoolfix_selected_school_v1"); } catch { /* selection starts fresh */ }
      }
      setSelectedSchool(null);
      setView("SCHOOL_SELECT");
    } catch (error) { setSchoolError(error instanceof Error ? error.message : "지원 학교 목록을 불러오지 못했습니다."); }
    finally { setSchoolLoading(false); }
  }, []);

  useEffect(() => { void loadSchoolCatalog(); }, [loadSchoolCatalog]);

  useEffect(() => {
    if (!selectedSchool) { setSchoolLocations([]); setSchoolLocationTypes([]); return; }
    let cancelled = false;
    setSchoolLocationsLoading(true); setSchoolLocationsError(""); setSchoolLocations([]);
    fetch(`/api/schools/${encodeURIComponent(selectedSchool.id)}/locations`).then(async (response) => {
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error("학교 위치 정보를 불러오지 못했습니다.");
      if (!cancelled) { setSchoolLocations(Array.isArray(json.data) ? json.data : []); setSchoolLocationTypes(Array.isArray(json.locationTypes) ? json.locationTypes : []); }
    }).catch((error) => { if (!cancelled) { setSchoolLocations([]); setSchoolLocationTypes([]); setSchoolLocationsError(error instanceof Error ? error.message : "학교 위치 정보를 불러오지 못했습니다."); } }).finally(() => { if (!cancelled) setSchoolLocationsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedSchool]);

  useEffect(() => {
    fetchReports();
    fetchMyReports();
  }, [fetchReports, fetchMyReports]);

  /**
   * 위험도 채점은 서버가 백그라운드로 돌린다.
   * 접수 직후나 서버 재시작 직후에는 아직 등급이 없는 신고가 남아 있는데,
   * 사용자가 새로고침을 눌러야만 등급이 나타나면 기능이 동작하지 않는 것처럼 보인다.
   * 그래서 미채점 건이 있는 동안만 주기적으로 다시 받아온다.
   * 무한히 돌지 않도록 시도 횟수를 제한한다.
   */
  useEffect(() => {
    const pending = reports.filter((r) => !r.riskLevel).length;
    

    if (!selectedSchool || pending === 0) { riskRefreshAttempts.current = 0; riskRefreshSchoolId.current = selectedSchool?.id || ""; return; } if (riskRefreshSchoolId.current !== selectedSchool.id) { riskRefreshSchoolId.current = selectedSchool.id; riskRefreshAttempts.current = 0; } if (riskRefreshAttempts.current >= 10) return;
    const timer = setInterval(() => {
      riskRefreshAttempts.current += 1;
      if (riskRefreshAttempts.current > 10) {
        clearInterval(timer);
        return;
      }
      fetchReports(true);
      fetchMyReports();
    }, 6000);

    return () => clearInterval(timer);
  }, [reports, fetchReports, fetchMyReports, selectedSchool]);

  const refreshAll = useCallback(() => {
    fetchReports(true);
    fetchMyReports();
  }, [fetchReports, fetchMyReports]);

  /** 신고 등록 */
  const handleSubmitReport = async (data: SubmitReportPayload): Promise<SubmitReportResult> => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, schoolId: selectedSchool?.id, deviceToken: getDeviceToken() }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        /*
         * 서버가 "조금 더 알려달라"고 답한 경우(422).
         * 오류가 아니라 대화의 한 단계이므로 토스트로 실패를 알리지 않고
         * 질문을 그대로 신고 폼에 돌려준다 (§8, §19).
         */
        if (res.status === 422 && json.status === "needs_more_information" && json.question) {
          return {
            success: false as const,
            needsMoreInfo: true as const,
            question: json.question as string,
            sessionId: json.sessionId as string,
          };
        }
        return { success: false as const, error: json.error || "신고를 저장하지 못했습니다." };
      }

      // 서버가 발급한 소유 토큰을 저장해야 "내 신고"에서 다시 찾을 수 있다.
      if (json.ownerToken) saveOwnerToken(json.ownerToken);

      showToast(json.heldForReview ? "info" : "success", json.heldForReview ? `신고가 운영진 검토 대기 상태입니다 (접수번호: ${json.data.id})` : `신고가 접수되었습니다 (접수번호: ${json.data.id})`);
      if (json.masked) {
        // 사용자가 모르게 내용이 바뀌면 안 되므로 반드시 알린다.
        showToast(
          "info",
          `부적절한 표현 ${json.maskedCount}곳이 자동으로 가려졌습니다.`
        );
      }
      refreshAll();
      return { success: true as const, report: json.data as SchoolReport, heldForReview: Boolean(json.heldForReview) };
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

  const selectSchool = (school: School) => {
    setSelectedSchool(school);
    setSchoolLocationsLoading(true);
    setSchoolLocationsError("");
    setSchoolLocations([]); setSchoolLocationTypes([]);
    setReports([]); setMyReports([]); setIsLoading(true);
    try { localStorage.setItem("schoolfix_selected_school_v1", school.id); } catch { /* school remains selected in memory */ }
    setView("HOME");
    setIsFormDirty(false);
  };

  const myReportsById = useMemo(() => new Map(myReports.map((r) => [r.id, r])), [myReports]);

  /**
   * 내 신고 새 소식 — 마지막으로 열어 본 뒤 상태가 바뀌었거나 학교 답변이 달린 신고.
   * 무엇을 봤는지는 이 브라우저에만 기억한다(utils/reportUpdates).
   */
  const [seenVersion, setSeenVersion] = useState(0);
  useEffect(() => {
    if (rememberNew(myReports)) setSeenVersion((v) => v + 1);
  }, [myReports]);
  const myUpdates = useMemo(() => {
    void seenVersion;
    const seen = loadSeen();
    const updates = new Map<string, UpdateKind[]>();
    for (const r of myReports) {
      const kinds = changesSince(seen[r.id], r);
      if (kinds.length) updates.set(r.id, kinds);
    }
    return updates;
  }, [myReports, seenVersion]);

  /** 신고 상세 열기. 내 신고라면 새 소식을 확인한 것으로 기억한다. */
  const openReport = (report: SchoolReport) => {
    setDetailReport(report);
    const mine = myReportsById.get(report.id);
    if (mine) {
      markSeen(mine);
      setSeenVersion((v) => v + 1);
    }
  };

  // 전체 목록에도 "내 신고" 표시를 붙여 준다.
  // 내 신고에만 있는 정보(학교 답변·만족도 응답)도 함께 보이도록 내 신고 쪽 데이터로 바꿔 끼운다.
  const allReportsMarked = useMemo(
    () => reports.map((r) => {
      const mine = myReportsById.get(r.id);
      return mine ? { ...r, ...mine, isMine: true } : r;
    }),
    [reports, myReportsById]
  );

  /** 상세 창에서 공감·만족도 응답으로 신고가 바뀌었을 때 */
  const handleReportUpdated = (updated: SchoolReport) => {
    setDetailReport(updated);
    // 내가 보낸 만족도 응답으로 상태가 바뀐 것은 새 소식이 아니다.
    if (updated.isMine) {
      markSeen(updated);
      setSeenVersion((v) => v + 1);
    }
    refreshAll();
  };

  const navButton = (target: View, label: string, Icon: typeof Home, badge = 0) => {
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
        {badge > 0 && (
          <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-white" aria-label={`내 신고 새 소식 ${badge}건`}>
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="sf-app min-h-screen flex flex-col font-sans antialiased text-slate-900">
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

      {selectedSchool && view !== "SCHOOL_SELECT" && <Header onGoHome={goHome} reportCount={reports.length} schoolName={selectedSchool.schoolName} onChangeSchool={() => requestView("SCHOOL_SELECT")} />}

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="sf-app-content space-y-6">
            {view === "SCHOOL_SELECT" || !selectedSchool ? <SchoolSelectionView schools={schools} loading={schoolLoading} error={schoolError} initialSchoolId={selectedSchool?.id || (() => { try { return localStorage.getItem("schoolfix_selected_school_v1") || ""; } catch { return ""; } })()} onRetry={() => void loadSchoolCatalog()} onSelect={selectSchool} /> : <>
            <nav aria-label="주요 메뉴" className="sf-main-nav flex flex-wrap items-center gap-2 p-0.5 print:hidden">
              {navButton("HOME", "메인 홈", Home)}
              {navButton("NEW_REPORT", "신고하기", PlusCircle)}
              {navButton("REPORTS", "신고 목록", ListFilter, myUpdates.size)}
              {navButton("STAFF", "운영진", UsersRound)}
            </nav>

            {view === "HOME" && (
              <UserHomeLandingView
                reports={allReportsMarked}
                onNavigateNewReport={() => setView("NEW_REPORT")}
                onNavigateReports={(tab) => { setReportsTab(tab ?? "ALL"); setView("REPORTS"); }}
                onOpenReportDetail={openReport}
              />
            )}

            {view === "NEW_REPORT" && (
              <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12 lg:gap-7">
                <section className="min-w-0 lg:col-span-8">
                <StudentReportView
                    school={selectedSchool}
                    locations={schoolLocations}
                    locationTypes={schoolLocationTypes}
                    locationsLoading={schoolLocationsLoading}
                    locationsError={schoolLocationsError}
                    onSubmitReport={handleSubmitReport}
                    isSubmitting={isSubmitting}
                    onSuccessNavToMyReports={() => setView("REPORTS")}
                    onDirtyChange={setIsFormDirty}
                    existingReports={allReportsMarked}
                    onOpenReport={openReport}
                    onReportsChanged={refreshAll}
                  />
                </section>

                <aside className="sf-report-sidepanel space-y-4 lg:sticky lg:top-24 lg:col-span-4">
                  <div className="overflow-hidden rounded-[1.6rem] bg-gradient-to-br from-slate-950 via-blue-950 to-blue-900 p-5 text-white shadow-[0_20px_50px_rgba(18,40,88,0.18)] sm:p-6">
                    <div className="flex items-center gap-2 text-blue-200"><ShieldCheck className="h-4 w-4" /><span className="text-[11px] font-extrabold uppercase tracking-[0.16em]">안심 제보</span></div>
                    <h2 className="mt-3 text-lg font-extrabold leading-snug">제보자의 정보는<br />수집하지 않아요</h2>
                    <p className="mt-2 text-xs leading-relaxed text-blue-100/80">로그인·이름·학번 없이 접수합니다. 내용은 학교 시설과 안전 문제를 처리하는 데 사용됩니다.</p>
                    <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/15 pt-4 text-center">
                      {["로그인 없음", "익명 접수", "상태 공개"].map((label) => <span key={label} className="rounded-lg bg-white/10 px-2 py-2 text-[10px] font-bold text-blue-50">{label}</span>)}
                    </div>
                  </div>
                  <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/85 p-5 shadow-sm">
                    <h3 className="text-sm font-extrabold text-slate-900">빠르게 처리되는 제보</h3>
                    <ol className="mt-4 space-y-4">
                      {[
                        ["01", "장소를 자세히", "건물·층·주변 시설까지 적어주세요."],
                        ["02", "상황을 구체적으로", "언제부터, 어떤 문제가 있는지 알려주세요."],
                        ["03", "사진은 선택", "현장 사진이 있으면 판단에 도움이 됩니다."],
                      ].map(([number, title, description]) => <li key={number} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[10px] font-extrabold text-blue-700">{number}</span><div><p className="text-xs font-bold text-slate-800">{title}</p><p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{description}</p></div></li>)}
                    </ol>
                    <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900">🚨 즉시 조치가 필요한 위험은 신고와 함께 교무실 또는 행정실에도 바로 알려주세요.</p>
                  </div>
                </aside>
              </div>
            )}

            {view === "REPORTS" && (
                <ReportListView
                schoolId={selectedSchool.id}
                allReports={allReportsMarked}
                myReports={myReports}
                isLoading={isLoading}
                onRefresh={refreshAll}
                isRefreshing={isRefreshing}
                onOpenReport={openReport}
                onNavigateNewReport={() => setView("NEW_REPORT")}
                initialTab={reportsTab}
                updates={myUpdates}
              />
            )}
            {view === "STAFF" && (
              <StaffPortal schoolId={selectedSchool.id} schoolName={selectedSchool.schoolName} reports={allReportsMarked} onRefresh={refreshAll} />
            )}
            </>}
          </div>
        </div>
      </main>

      {detailReport && (
        <ReportDetailModal
          report={detailReport}
          schoolId={selectedSchool?.id || ""}
          isOpen={Boolean(detailReport)}
          onClose={() => setDetailReport(null)}
          onRequestDelete={(id) => setDeleteTargetId(id)}
          onReportUpdated={handleReportUpdated}
        />
      )}

      <DeleteReportModal
        schoolId={selectedSchool?.id || ""}
        isOpen={Boolean(deleteTargetId)}
        reportId={deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onDeleted={handleDeleted}
      />

      <UnsavedChangesModal
        isOpen={Boolean(pendingView)}
        title="작성 중인 내용 유실 주의"
        message="작성 내용은 현재 탭에 임시 저장되어 신고 화면으로 돌아오면 복구됩니다. 다만 첨부 사진과 AI 추가 질문 답변은 보관되지 않습니다. 이동하시겠습니까?"
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

      <footer className="sf-footer border-t border-slate-200 py-7 text-center text-xs text-slate-500 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="font-semibold text-slate-700">
            SchoolFix AI — 학교 불편사항 신고 및 시설 안전 관리
          </p>
          <p className="mt-1 text-slate-400">
            익명 신고를 이용할 수 있습니다. 학교 추가 신청의 개인정보 처리 안내를 확인해 주세요.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2"><button type="button" onClick={() => setPolicySection("guide")} className="underline underline-offset-2 hover:text-blue-700">이용 방법</button><button type="button" onClick={() => setPolicySection("terms")} className="underline underline-offset-2 hover:text-blue-700">서비스 이용약관</button><button type="button" onClick={() => setPolicySection("privacy")} className="underline underline-offset-2 hover:text-blue-700">개인정보 안내</button></div>
        </div>
      </footer>
      {policySection && <ServicePolicyDialog section={policySection} onClose={() => setPolicySection(null)} />}
    </div>
  );
}
