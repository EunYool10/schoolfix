/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import { Header } from "./components/Header";
import { UserHomeLandingView } from "./components/UserHomeLandingView";
import { StudentReportView } from "./components/StudentReportView";
import { StudentMyReportsView } from "./components/StudentMyReportsView";
import { AdminReportView } from "./components/AdminReportView";
import { AdminGuardView } from "./components/AdminGuardView";
import { GoogleAuthModal } from "./components/GoogleAuthModal";
import { ReportDetailModal } from "./components/ReportDetailModal";
import { UnsavedChangesModal } from "./components/UnsavedChangesModal";
import { OverallProgressView } from "./components/OverallProgressView";
import {
  SchoolReport,
  ReportStatus,
  ReportPriority,
  PRIORITY_MAP,
  UserProfile,
  isUserAdmin,
} from "./types";
import {
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  ListFilter,
  Home,
  ShieldCheck,
  Eye,
} from "lucide-react";

const STORAGE_KEY = "schoolfix_actual_reports_v3";
const MY_REPORTS_KEY = "schoolfix_my_report_ids_v1";
const AUTH_STORAGE_KEY = "schoolfix_auth_user_v1";
const AUTH_TOKEN_KEY = "schoolfix_session_token";

interface ToastState {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

export default function App() {
  const [reports, setReports] = useState<SchoolReport[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Local storage read error", e);
    }
    return [];
  });

  // User Authentication State & Token
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.email) return parsed;
      }
    } catch (e) {
      console.error("Auth storage read error", e);
    }
    return null;
  });

  const [authToken, setAuthToken] = useState<string | null>(() => {
    try {
      return (
        localStorage.getItem(AUTH_TOKEN_KEY) ||
        localStorage.getItem("schoolfix_session_token_v1")
      );
    } catch {
      return null;
    }
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [detailModalReport, setDetailModalReport] = useState<SchoolReport | null>(null);

  const [currentView, setCurrentView] = useState<"STUDENT" | "ADMIN">("STUDENT");
  const [studentTab, setStudentTab] = useState<
    "HOME" | "NEW_REPORT" | "MY_REPORTS" | "OVERALL_PROGRESS"
  >("HOME");
  const [isFormDirty, setIsFormDirty] = useState<boolean>(false);
  const [pendingNavigation, setPendingNavigation] = useState<{
    type: "VIEW" | "STUDENT_TAB";
    target: "STUDENT" | "ADMIN" | "HOME" | "NEW_REPORT" | "MY_REPORTS" | "OVERALL_PROGRESS";
  } | null>(null);

  const [myReportIds, setMyReportIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(MY_REPORTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error("Error reading my report ids", e);
    }
    return [];
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [updatingReportId, setUpdatingReportId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastState[]>([]);

  // Verify stored session token on startup
  useEffect(() => {
    const verifySession = async () => {
      const token =
        authToken ||
        localStorage.getItem(AUTH_TOKEN_KEY) ||
        localStorage.getItem("schoolfix_session_token_v1");
      if (!token) return;

      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.user) {
            setCurrentUser(data.user);
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data.user));
          } else {
            // Invalid session
            localStorage.removeItem(AUTH_TOKEN_KEY);
            localStorage.removeItem("schoolfix_session_token_v1");
            setAuthToken(null);
          }
        }
      } catch (err) {
        console.warn("Session verification check error:", err);
      }
    };
    verifySession();
  }, []);

  // Show auto-dismissing toast
  const showToast = useCallback((type: "success" | "error" | "info", message: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Sync to local storage for durable backup
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
    } catch (err) {
      console.error("Local storage write error", err);
    }
  }, [reports]);

  // Sync my report ids
  useEffect(() => {
    try {
      localStorage.setItem(MY_REPORTS_KEY, JSON.stringify(myReportIds));
    } catch (err) {
      console.error("Local storage write error for my reports", err);
    }
  }, [myReportIds]);

  // Handle Login & Logout
  const handleLogin = (user: UserProfile, token?: string) => {
    setCurrentUser(user);
    if (token) {
      setAuthToken(token);
      try {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
      } catch (err) {
        console.error("Token storage error", err);
      }
    }
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    } catch (err) {
      console.error("Auth storage save error", err);
    }
    showToast(
      "success",
      `${user.name} (${user.role === "ADMIN" ? "최고 관리자" : "일반 사용자"}) 계정으로 로그인되었습니다.`
    );
    // Silent refresh to fetch linked reports
    fetchReports(true);
  };

  const handleLogout = async () => {
    const token = authToken || localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        console.warn("Logout request failed:", e);
      }
    }

    setCurrentUser(null);
    setAuthToken(null);
    // 로그아웃 시 권한에 따라 받아둔 캐시(관리자 열람 기록 등)를 남기지 않는다.
    // authToken 변경으로 fetchReports가 다시 실행되어 비로그인 범위로 재조회된다.
    setReports([]);
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem("schoolfix_session_token_v1");
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error("Auth storage remove error", err);
    }
    showToast("info", "로그아웃되었습니다.");
    if (currentView === "ADMIN") {
      setCurrentView("STUDENT");
      setStudentTab("HOME");
    }
  };

  // Fetch actual reports from backend database
  const fetchReports = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    setIsRefreshing(true);
    setLoadError(null);

    try {
      // 서버는 세션 토큰을 기준으로 응답 범위를 결정한다.
      // (관리자: 전체 원본 / 본인 신고: 원본 / 그 외: 개인정보 제거본)
      const headers: Record<string, string> = {};
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const res = await fetch("/api/reports", { headers });
      if (!res.ok) {
        throw new Error("서버 데이터베이스에서 신고 목록을 불러올 수 없습니다.");
      }
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setReports((prev) => {
          const map = new Map<string, SchoolReport>();
          // Server data is primary
          json.data.forEach((r: SchoolReport) => map.set(r.id, r));
          // Local storage data as client-side backup
          prev.forEach((r) => {
            if (!map.has(r.id)) map.set(r.id, r);
          });
          return Array.from(map.values()).sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });
      }
    } catch (err: any) {
      console.error("Fetch reports error:", err);
      if (reports.length === 0) {
        setLoadError(err.message || "데이터를 불러오지 못했습니다.");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [reports.length, authToken]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Submit report to actual backend DB
  const handleSubmitReport = async (data: {
    title?: string;
    location: string;
    category: string;
    description: string;
    isAnonymous: boolean;
    userEmail?: string | null;
    userName?: string | null;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    attachmentSize?: number | null;
  }) => {
    setIsSubmitting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const res = await fetch("/api/reports", {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(
          json.error || "신고를 저장하지 못했습니다. 잠시 후 다시 시도해주세요."
        );
      }

      const createdReport: SchoolReport = json.data;

      // Update actual reports list immediately
      setReports((prev) => [createdReport, ...prev.filter((r) => r.id !== createdReport.id)]);

      // Save to my reported items
      setMyReportIds((prev) => [createdReport.id, ...prev.filter((id) => id !== createdReport.id)]);

      showToast("success", `신고 접수가 완료되었습니다 (접수번호: ${createdReport.id})`);

      return { success: true, report: createdReport };
    } catch (err: any) {
      console.error("Report submit error:", err);
      showToast("error", err.message || "신고를 저장하지 못했습니다.");
      return {
        success: false,
        error: err.message || "신고를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.",
      };
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Status Update (with Admin Auth header)
  const handleUpdateStatus = async (reportId: string, status: ReportStatus) => {
    setUpdatingReportId(reportId);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}/status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "상태를 변경하지 못했습니다.");
      }

      const updatedReport: SchoolReport = json.data;
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? updatedReport : r))
      );
      showToast("success", `[${reportId}] 상태가 성공적으로 변경되었습니다.`);
    } catch (err: any) {
      console.error("Status update error:", err);
      showToast("error", err.message || "상태 변경을 데이터베이스에 반영하지 못했습니다.");
    } finally {
      setUpdatingReportId(null);
    }
  };

  // Quick Priority Update (with Admin Auth header)
  const handleUpdatePriority = async (reportId: string, priority: ReportPriority) => {
    setUpdatingReportId(reportId);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}/priority`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ priority }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "우선순위를 변경하지 못했습니다.");
      }

      const updatedReport: SchoolReport = json.data;
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? updatedReport : r))
      );
      const priLabel = PRIORITY_MAP[priority]?.label || priority;
      showToast("success", `[${reportId}] 우선순위가 '${priLabel}'(으)로 설정되었습니다.`);
    } catch (err: any) {
      console.error("Priority update error:", err);
      showToast("error", err.message || "우선순위 변경을 데이터베이스에 반영하지 못했습니다.");
    } finally {
      setUpdatingReportId(null);
    }
  };

  // Process Report by Admin (Assignee, Resolution Note, Admin Note)
  const handleProcessReport = async (
    reportId: string,
    data: {
      status?: ReportStatus;
      assignee?: string | null;
      resolutionNote?: string | null;
      adminNote?: string;
    }
  ) => {
    setUpdatingReportId(reportId);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}/process`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(data),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "조치 사항을 저장하지 못했습니다.");
      }

      const updatedReport: SchoolReport = json.data;
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? updatedReport : r))
      );
      showToast("success", `[${reportId}] 처리 정보가 정상 반영되었습니다.`);
    } catch (err: any) {
      console.error("Process report error:", err);
      showToast("error", err.message || "조치 정보 저장에 실패했습니다.");
      throw err;
    } finally {
      setUpdatingReportId(null);
    }
  };

  // Edit Report content
  const handleUpdateReport = async (
    reportId: string,
    data: {
      title: string;
      location: string;
      category: string;
      description: string;
      isAnonymous: boolean;
    }
  ) => {
    setUpdatingReportId(reportId);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(data),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "신고 내용을 수정하지 못했습니다.");
      }

      const updatedReport: SchoolReport = json.data;
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? updatedReport : r))
      );
      showToast("success", `[${reportId}] 신고 내용이 수정되었습니다.`);
    } catch (err: any) {
      console.error("Update report error:", err);
      showToast("error", err.message || "신고 내용 수정에 실패했습니다.");
      throw err;
    } finally {
      setUpdatingReportId(null);
    }
  };

  // Delete Report (Admin Auth protected)
  const handleDeleteReport = async (reportId: string) => {
    setUpdatingReportId(reportId);
    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}`, {
        method: "DELETE",
        headers,
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "신고를 삭제하지 못했습니다.");
      }

      setReports((prev) => prev.filter((r) => r.id !== reportId));
      setMyReportIds((prev) => prev.filter((id) => id !== reportId));
      showToast("info", `[${reportId}] 신고 건이 데이터베이스에서 삭제되었습니다.`);
    } catch (err: any) {
      console.error("Delete report error:", err);
      showToast("error", err.message || "신고 삭제에 실패했습니다.");
      throw err;
    } finally {
      setUpdatingReportId(null);
    }
  };

  // 위험도 재분석 (관리자 전용). 서버가 재계산 후 저장한 결과로 목록을 갱신한다.
  const handleReanalyzeRisk = async (reportId: string) => {
    setUpdatingReportId(reportId);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const res = await fetch(
        `/api/reports/${encodeURIComponent(reportId)}/analyze-risk`,
        { method: "POST", headers }
      );

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "위험도 분석에 실패했습니다.");
      }

      const updatedReport: SchoolReport = json.data;
      setReports((prev) => prev.map((r) => (r.id === reportId ? updatedReport : r)));
      showToast(
        "success",
        `[${reportId}] 위험도: ${updatedReport.riskAnalysis?.risk_level ?? "-"} (${updatedReport.riskAnalysis?.risk_score ?? "-"}점)`
      );
    } catch (err: any) {
      console.error("Risk reanalysis error:", err);
      showToast("error", err.message || "위험도 분석에 실패했습니다.");
    } finally {
      setUpdatingReportId(null);
    }
  };

  const handleRequestChangeView = (newView: "STUDENT" | "ADMIN") => {
    if (currentView === newView) return;
    if (currentView === "STUDENT" && studentTab === "NEW_REPORT" && isFormDirty) {
      setPendingNavigation({ type: "VIEW", target: newView });
      return;
    }
    setCurrentView(newView);
  };

  const handleRequestChangeStudentTab = (
    newTab: "HOME" | "NEW_REPORT" | "MY_REPORTS" | "OVERALL_PROGRESS"
  ) => {
    if (studentTab === newTab) return;
    if (studentTab === "NEW_REPORT" && isFormDirty) {
      setPendingNavigation({ type: "STUDENT_TAB", target: newTab });
      return;
    }
    setStudentTab(newTab);
  };

  const handleConfirmNavigation = () => {
    if (!pendingNavigation) return;
    setIsFormDirty(false);
    if (pendingNavigation.type === "VIEW") {
      setCurrentView(pendingNavigation.target as "STUDENT" | "ADMIN");
    } else {
      setStudentTab(
        pendingNavigation.target as
          | "HOME"
          | "NEW_REPORT"
          | "MY_REPORTS"
          | "OVERALL_PROGRESS"
      );
    }
    setPendingNavigation(null);
  };

  // 서버와 동일한 관리자 목록(isUserAdmin)을 사용하고, 유효한 세션 토큰까지 있어야 관리자 화면을 연다.
  // 토큰 없이 열면 서버가 데이터를 가리고 모든 조작이 401이 되어 화면만 깨진 상태가 된다.
  const isAdminAuthorized = Boolean(authToken && isUserAdmin(currentUser?.email));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased text-slate-900">
      {/* Toast Notification Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none print:hidden">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2.5 p-3.5 rounded-xl shadow-lg border text-xs sm:text-sm transition animate-in fade-in slide-in-from-top-2 ${
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

      {/* Navigation Header */}
      <Header
        currentView={currentView}
        onChangeView={handleRequestChangeView}
        reportCount={reports.length}
        onRefresh={() => fetchReports(true)}
        isRefreshing={isRefreshing}
        currentUser={currentUser}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {currentView === "ADMIN" ? (
            /* Admin Dashboard or Admin Guard */
            isAdminAuthorized ? (
              <section aria-label="신고 현황 및 AI 분석 관리자 영역">
                <AdminReportView
                  reports={reports}
                  isLoading={isLoading}
                  loadError={loadError}
                  onRefresh={() => fetchReports(true)}
                  isRefreshing={isRefreshing}
                  onUpdateStatus={handleUpdateStatus}
                  updatingReportId={updatingReportId}
                  onUpdatePriority={handleUpdatePriority}
                  onProcessReport={handleProcessReport}
                  onUpdateReport={handleUpdateReport}
                  onDeleteReport={handleDeleteReport}
                  onReanalyzeRisk={handleReanalyzeRisk}
                  authToken={authToken}
                />
              </section>
            ) : (
              <AdminGuardView
                currentUser={currentUser}
                onOpenAuthModal={() => setIsAuthModalOpen(true)}
                onSwitchToStudent={() => setCurrentView("STUDENT")}
              />
            )
          ) : (
            /* General User (Student & Staff) View */
            <div className="space-y-6">
              {/* User Sub-Tabs Navigation */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto p-0.5">
                  <button
                    type="button"
                    onClick={() => handleRequestChangeStudentTab("HOME")}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer min-h-[40px] shrink-0 ${
                      studentTab === "HOME"
                        ? "bg-slate-900 text-white shadow-xs"
                        : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <Home className="h-4 w-4" />
                    <span>메인 홈</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRequestChangeStudentTab("NEW_REPORT")}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer min-h-[40px] shrink-0 ${
                      studentTab === "NEW_REPORT"
                        ? "bg-blue-700 text-white shadow-xs"
                        : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>불편사항 신고 접수</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRequestChangeStudentTab("MY_REPORTS")}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer min-h-[40px] shrink-0 ${
                      studentTab === "MY_REPORTS"
                        ? "bg-blue-700 text-white shadow-xs"
                        : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <ListFilter className="h-4 w-4" />
                    <span>내 신고 내역 & 진행 현황</span>
                    {myReportIds.length > 0 && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                          studentTab === "MY_REPORTS"
                            ? "bg-white/20 text-white"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {myReportIds.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRequestChangeStudentTab("OVERALL_PROGRESS")}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer min-h-[40px] shrink-0 ${
                      studentTab === "OVERALL_PROGRESS"
                        ? "bg-indigo-700 text-white shadow-xs"
                        : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <Eye className="h-4 w-4" />
                    <span>전체 진행상황</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                        studentTab === "OVERALL_PROGRESS"
                          ? "bg-white/20 text-white"
                          : "bg-indigo-100 text-indigo-700"
                      }`}
                    >
                      {reports.length}
                    </span>
                  </button>
                </div>

                <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>학교 시설안전 관리본부 연동 시스템</span>
                </div>
              </div>

              {/* User Tab Content */}
              {studentTab === "HOME" ? (
                /* 1. Main Home Landing View */
                <UserHomeLandingView
                  reports={reports}
                  currentUser={currentUser}
                  onNavigateNewReport={() => setStudentTab("NEW_REPORT")}
                  onNavigateMyReports={() => setStudentTab("MY_REPORTS")}
                  onNavigateOverallProgress={() => setStudentTab("OVERALL_PROGRESS")}
                  onOpenReportDetail={(rep) => setDetailModalReport(rep)}
                  onOpenAuthModal={() => setIsAuthModalOpen(true)}
                />
              ) : studentTab === "NEW_REPORT" ? (
                /* 2. Report Submission Form with Side Guide */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
                  <section
                    className="lg:col-span-7 xl:col-span-8"
                    aria-label="신고 작성 영역"
                  >
                    <StudentReportView
                      onSubmitReport={handleSubmitReport}
                      isSubmitting={isSubmitting}
                      currentUser={currentUser}
                      onSuccessNavToMyReports={() => setStudentTab("MY_REPORTS")}
                      onDirtyChange={setIsFormDirty}
                      onOpenAuthModal={() => setIsAuthModalOpen(true)}
                    />
                  </section>

                  {/* Student Side Helper Card */}
                  <aside className="lg:col-span-5 xl:col-span-4 space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                      <h3 className="text-sm font-bold text-slate-900 mb-2">
                        💡 신고 접수 안내
                      </h3>
                      <ul className="space-y-2 text-xs text-slate-600 leading-relaxed list-disc list-inside">
                        <li>
                          사진을 함께 첨부해 주시면 시설 담당 부서에서 더 신속하게 상태를 파악할 수 있습니다.
                        </li>
                        <li>
                          위급하거나 학생 안전에 직결된 사항(유리 파손, 누전 등)은 즉시 교무실 또는 행정실로 구두 연락 바랍니다.
                        </li>
                        <li>
                          접수된 신고는 담당 교직원에게 전달되며 실시간으로 처리 진행 상태가 업데이트됩니다.
                        </li>
                        <li>
                          익명 신고 시에도 내 신고 목록에서 처리 결과를 안전하게 확인하실 수 있습니다.
                        </li>
                      </ul>
                    </div>

                    {/* Quick My Reports preview widget */}
                    {myReportIds.length > 0 && (
                      <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-blue-900">
                            최근 내가 접수한 신고
                          </span>
                          <button
                            type="button"
                            onClick={() => setStudentTab("MY_REPORTS")}
                            className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
                          >
                            전체 보기 →
                          </button>
                        </div>
                        <p className="text-xs text-blue-800">
                          총 <strong className="font-mono font-bold">{myReportIds.length}</strong>건의 접수 내역이 기록되어 있습니다.
                        </p>
                      </div>
                    )}
                  </aside>
                </div>
              ) : studentTab === "MY_REPORTS" ? (
                /* 3. My Reports Tracking View */
                <StudentMyReportsView
                  reports={reports}
                  myReportIds={myReportIds}
                  currentUser={currentUser}
                  onNavigateToNewReport={() => setStudentTab("NEW_REPORT")}
                  onOpenAuthModal={() => setIsAuthModalOpen(true)}
                />
              ) : (
                /* 4. Overall Progress Tracking View */
                <OverallProgressView
                  onRefreshParent={() => fetchReports(true)}
                  onNavigateNewReport={() => setStudentTab("NEW_REPORT")}
                  onNavigateMyProgress={() => setStudentTab("MY_REPORTS")}
                />
              )}
            </div>
          )}
        </div>
      </main>

      {/* Google Authentication Modal */}
      <GoogleAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        onLogin={handleLogin}
        onLogout={handleLogout}
      />

      {/* Direct Report Detail Modal from Home / Search */}
      {detailModalReport && (
        <ReportDetailModal
          report={detailModalReport}
          isOpen={!!detailModalReport}
          onClose={() => setDetailModalReport(null)}
          isAdmin={isAdminAuthorized}
          onUpdateStatus={handleUpdateStatus}
          onProcessReport={handleProcessReport}
          onUpdateReport={handleUpdateReport}
          onDeleteReport={handleDeleteReport}
          onReanalyzeRisk={isAdminAuthorized ? handleReanalyzeRisk : undefined}
          isReanalyzingRisk={updatingReportId === detailModalReport.id}
        />
      )}

      {/* Unsaved Changes Confirmation Modal */}
      <UnsavedChangesModal
        isOpen={Boolean(pendingNavigation)}
        title="작성 중인 내용 유실 주의"
        message="작성 중인 신고 내용이 있습니다. 다른 화면으로 이동하면 입력한 내용이 유실될 수 있습니다. 이동하시겠습니까?"
        confirmText="이동하기"
        cancelText="계속 작성하기"
        onConfirm={handleConfirmNavigation}
        onCancel={() => setPendingNavigation(null)}
      />

      {/* School Service Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="font-semibold text-slate-700">
            SchoolFix — 학교 문제 해결 및 시설 안전 관리 서비스
          </p>
          <p className="mt-1 text-slate-400">
            안전하고 쾌적한 교육 환경을 위해 학생과 시설 관리 부서가 함께합니다.
          </p>
        </div>
      </footer>
    </div>
  );
}
