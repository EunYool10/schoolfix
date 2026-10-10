import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { BarChart3, Ban, BellRing, Check, Clock, Download, HandHeart, History, Inbox, Loader2, LockKeyhole, LogOut, Save, School as SchoolIcon, Search, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { RISK_LEVEL_MAP, STATUS_MAP, type ReportHistoryEntry, type SchoolReport, type StaffReport } from "../types";
import { computeSla, slaLabel } from "../utils/sla";
import { StaffStatsPanel } from "./StaffStatsPanel";
import { NotificationSettingsPanel } from "./NotificationSettingsPanel";

interface StaffPortalProps {
  schoolId: string;
  schoolName: string;
  /** 공개 목록 — 운영진 목록을 받기 전까지 보여 주고, 처리 후 함께 새로고침한다. */
  reports: SchoolReport[];
  onRefresh: () => void;
}

interface SchoolApplication {
  id: string;
  schoolName: string;
  website: string;
  address: string;
  reason: string;
  requests: string;
  replyEmail: string;
  status: "new" | "reviewed";
  registeredSchoolId?: string | null;
  createdAt: string;
}

interface CustomSchool {
  id: string;
  schoolName: string;
  officialWebsite: string;
  address: string;
  highSchoolType?: string;
  supportStatus: string;
  verifiedAt: string;
}

interface BlockedDevice {
  id: string;
  until: string;
  reason: string;
  reportId: string | null;
  createdAt: string;
}

type Section = "reports" | "stats" | "applications" | "blocked" | "notifications";

const ACTOR_LABEL: Record<ReportHistoryEntry["actor"], string> = { staff: "운영진", teacher: "교사", reporter: "신고자", system: "시스템" };

function statusLabel(value?: string | null) {
  if (!value) return "-";
  return STATUS_MAP[value as keyof typeof STATUS_MAP]?.label ?? value;
}

function describeHistory(entry: ReportHistoryEntry): string {
  switch (entry.action) {
    case "status": return `상태 ${statusLabel(entry.from)} → ${statusLabel(entry.to)}`;
    case "assignee": return `담당자 ${entry.from || "미지정"} → ${entry.to || "미지정"}`;
    case "reply": return `학생 답변 ${entry.to ?? "변경"}`;
    case "moderation": return entry.to === "approved" ? "안전성 검토 승인·공개" : "안전성 검토에서 삭제";
    case "feedback": return `만족도 응답: ${entry.to}`;
    case "spam": return "장난 신고로 처리";
    default: return entry.action;
  }
}

/** 공식 홈페이지 주소에서 학교 ID 후보를 만든다. (예: https://gahs-h.goegm.kr → gahs-h) */
function suggestSchoolId(website: string): string {
  try {
    const label = new URL(website).hostname.split(".")[0].toLowerCase();
    return /^[a-z0-9][a-z0-9-]{1,39}$/.test(label) && label !== "www" ? label : "";
  } catch {
    return "";
  }
}

export function StaffPortal({ schoolId, schoolName, reports, onRefresh }: StaffPortalProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [role, setRole] = useState<"staff" | "teacher">("staff");
  const [loginRole, setLoginRole] = useState<"staff" | "teacher">("staff");
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [sortMode, setSortMode] = useState<"risk" | "deadline" | "metoo">("risk");
  const [staffReports, setStaffReports] = useState<StaffReport[] | null>(null);
  const [schoolApplications, setSchoolApplications] = useState<SchoolApplication[]>([]);
  const [customSchools, setCustomSchools] = useState<CustomSchool[]>([]);
  const [blockedDevices, setBlockedDevices] = useState<BlockedDevice[]>([]);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<Section>("reports");

  // 운영진 목록을 받기 전에는 공개 목록으로 먼저 보여 준다(이력·기기 정보만 비어 있다).
  const displayedReports: StaffReport[] = useMemo(
    () => staffReports ?? reports.map((report) => ({ ...report, history: [], reporter: { deviceReportCount: 0, blocked: false } })),
    [staffReports, reports]
  );

  const summary = useMemo(() => {
    const open = displayedReports.filter((report) => report.moderationStatus !== "held" && report.status !== "completed");
    return {
      total: displayedReports.length,
      pending: displayedReports.filter((report) => report.status === "pending" && report.moderationStatus !== "held").length,
      held: displayedReports.filter((report) => report.moderationStatus === "held").length,
      active: open.filter((report) => report.status !== "pending").length,
      urgent: displayedReports.filter((report) => report.riskLevel === "긴급" || report.riskLevel === "높음").length,
      overdue: open.filter((report) => computeSla(report).overdue).length,
    };
  }, [displayedReports]);

  const visibleReports = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const riskOrder = { 긴급: 0, 높음: 1, 중간: 2, 낮음: 3 } as const;
    return displayedReports
      .filter((report) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "moderation-held") return report.moderationStatus === "held";
        if (statusFilter === "overdue") return report.moderationStatus !== "held" && computeSla(report).overdue;
        return report.moderationStatus !== "held" && report.status === statusFilter;
      })
      .filter((report) => riskFilter === "all" || report.riskLevel === riskFilter)
      .filter((report) => !query || [report.id, report.title, report.description, report.location, report.locationDetail, report.category, report.assignee]
        .some((value) => value?.toLocaleLowerCase().includes(query)))
      .sort((a, b) => {
        if (sortMode === "deadline") {
          // 완료 건은 뒤로, 나머지는 기한이 가까운(또는 이미 지난) 순서
          const doneA = a.status === "completed" ? 1 : 0;
          const doneB = b.status === "completed" ? 1 : 0;
          return doneA - doneB || computeSla(a).dueAt.localeCompare(computeSla(b).dueAt);
        }
        if (sortMode === "metoo") return (b.meTooCount ?? 0) - (a.meTooCount ?? 0) || b.createdAt.localeCompare(a.createdAt);
        const riskA = a.riskLevel ? riskOrder[a.riskLevel] : 4;
        const riskB = b.riskLevel ? riskOrder[b.riskLevel] : 4;
        return riskA - riskB || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [displayedReports, search, statusFilter, riskFilter, sortMode]);

  const exportCsv = () => {
    const columns = ["접수번호", "접수일시", "학교", "위치 유형", "세부 위치", "분류", "위험도", "상태", "처리 기한", "나도 겪었어요", "제목", "신고 내용", "담당자", "처리 메모", "학생 답변", "만족도"];
    const escapeCell = (value: unknown) => {
      const cell = String(value ?? "");
      // 신고 내용은 사용자가 작성하므로 스프레드시트 수식 실행을 막는다.
      const safeCell = /^[\s\u0000-\u001f]*[=+\-@]/.test(cell) ? `'${cell}` : cell;
      return `"${safeCell.replace(/"/g, '""')}"`;
    };
    const rows = visibleReports.map((report) => [
      report.id, new Date(report.createdAt).toLocaleString("ko-KR"), report.schoolName, report.locationType || report.location,
      [report.locationDetail, report.buildingName, report.floor, report.department, report.grade ? `${report.grade}학년` : null, report.className, report.roomName].filter(Boolean).join(" · "),
      report.category, report.riskLevel, STATUS_MAP[report.status]?.label ?? report.status,
      slaLabel(computeSla(report)), report.meTooCount ?? 0,
      report.title, report.description, report.assignee, report.resolutionNote, report.reporterReply,
      report.feedback ? (report.feedback.resolved ? "해결됨" : "미해결") : "",
    ]);
    const csv = "﻿" + [columns, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `schoolfix-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  useEffect(() => {
    fetch("/api/staff/session").then((res) => res.json()).then((json) => {
      const sessionRole = json.role === "teacher" ? "teacher" : "staff";
      setRole(sessionRole);
      setLoginRole(sessionRole);
      setAuthenticated(Boolean(json.authenticated) && (sessionRole === "staff" || json.schoolId === schoolId));
    }).catch(() => setError("로그인 상태를 확인하지 못했습니다.")).finally(() => setChecking(false));
  }, [schoolId]);

  const refreshStaffReports = useCallback(async () => {
    try {
      const res = await fetch(`/api/staff/reports?schoolId=${encodeURIComponent(schoolId)}`);
      const json = await res.json();
      if (res.ok && json.ok) setStaffReports(Array.isArray(json.data) ? json.data : []);
    } catch { /* keep existing list */ }
  }, [schoolId]);

  useEffect(() => {
    setStaffReports(null);
    if (authenticated) void refreshStaffReports();
  }, [authenticated, role, refreshStaffReports]);

  const refreshApplications = async () => {
    try {
      const [applicationsRes, schoolsRes] = await Promise.all([fetch("/api/staff/school-applications"), fetch("/api/staff/schools")]);
      const [applicationsJson, schoolsJson] = await Promise.all([applicationsRes.json(), schoolsRes.json()]);
      if (applicationsRes.ok && applicationsJson.ok) setSchoolApplications(Array.isArray(applicationsJson.data) ? applicationsJson.data : []);
      if (schoolsRes.ok && schoolsJson.ok) setCustomSchools(Array.isArray(schoolsJson.data) ? schoolsJson.data : []);
    } catch { /* keep the last loaded inbox */ }
  };

  const refreshBlocked = async () => {
    try {
      const res = await fetch("/api/staff/blocked-reporters");
      const json = await res.json();
      if (res.ok && json.ok) setBlockedDevices(Array.isArray(json.data) ? json.data : []);
    } catch { /* keep the last list */ }
  };

  useEffect(() => {
    if (authenticated && role === "staff") {
      void refreshApplications();
      void refreshBlocked();
    }
  }, [authenticated, role]);

  const afterChange = async () => {
    await refreshStaffReports();
    onRefresh();
  };

  const updateApplicationStatus = async (application: SchoolApplication) => {
    const action = application.status === "new" ? "mark-reviewed" : "mark-new";
    setError(""); setNotice("");
    try {
      const response = await fetch(`/api/staff/school-applications/${encodeURIComponent(application.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "신청 상태를 변경하지 못했습니다.");
      setSchoolApplications((current) => current.map((item) => item.id === application.id ? { ...item, status: action === "mark-reviewed" ? "reviewed" : "new" } : item));
    } catch (err) { setError(err instanceof Error ? err.message : "신청 상태를 변경하지 못했습니다."); }
  };

  const deleteApplication = async (application: SchoolApplication) => {
    if (!window.confirm(`${application.schoolName} 신청을 메일함에서 영구 삭제할까요?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/staff/school-applications/${encodeURIComponent(application.id)}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "신청을 삭제하지 못했습니다.");
      setSchoolApplications((current) => current.filter((item) => item.id !== application.id));
    } catch (err) { setError(err instanceof Error ? err.message : "신청을 삭제하지 못했습니다."); }
  };

  const registerSchool = async (event: FormEvent<HTMLFormElement>, application: SchoolApplication) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(""); setNotice("");
    setBusyId(application.id);
    try {
      const response = await fetch("/api/staff/schools", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: application.id,
          id: form.get("id"),
          schoolName: form.get("schoolName"),
          officialWebsite: form.get("officialWebsite"),
          address: form.get("address"),
          highSchoolType: form.get("highSchoolType") || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "학교를 등록하지 못했습니다.");
      setNotice(`${json.data.schoolName}을(를) 지원 학교로 등록했습니다. 학교 선택 화면에 바로 나타납니다.`);
      setRegisteringId(null);
      await refreshApplications();
    } catch (err) { setError(err instanceof Error ? err.message : "학교를 등록하지 못했습니다."); }
    finally { setBusyId(null); }
  };

  const stopSchool = async (school: CustomSchool) => {
    if (!window.confirm(`${school.schoolName} 지원을 중지할까요? 기존 신고는 남지만 학교 선택 화면에서 사라집니다.`)) return;
    setError("");
    try {
      const response = await fetch(`/api/staff/schools/${encodeURIComponent(school.id)}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "지원을 중지하지 못했습니다.");
      await refreshApplications();
    } catch (err) { setError(err instanceof Error ? err.message : "지원을 중지하지 못했습니다."); }
  };

  const unblockDevice = async (device: BlockedDevice) => {
    setError("");
    try {
      const response = await fetch(`/api/staff/blocked-reporters/${encodeURIComponent(device.id)}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "보류를 해제하지 못했습니다.");
      setBlockedDevices((current) => current.filter((item) => item.id !== device.id));
    } catch (err) { setError(err instanceof Error ? err.message : "보류를 해제하지 못했습니다."); }
  };

  const moderate = async (report: SchoolReport, action: "approve" | "reject") => {
    setBusyId(report.id); setError(""); setNotice("");
    try {
      const res = await fetch(`/api/staff/reports/${encodeURIComponent(report.id)}/moderation?schoolId=${encodeURIComponent(schoolId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "검토 결과를 저장하지 못했습니다.");
      setNotice(`${report.id} 신고를 ${action === "approve" ? "승인" : "삭제"}했습니다.`);
      await afterChange();
    } catch (err) { setError(err instanceof Error ? err.message : "검토 결과를 저장하지 못했습니다."); }
    finally { setBusyId(null); }
  };

  const markSpam = async (report: SchoolReport) => {
    if (!window.confirm(`${report.id} 신고를 장난 신고로 처리할까요?\n신고가 삭제되고, 같은 기기에서 오는 신고는 30일 동안 공개 전에 운영진 검토를 거칩니다.`)) return;
    setBusyId(report.id); setError(""); setNotice("");
    try {
      const res = await fetch(`/api/staff/reports/${encodeURIComponent(report.id)}/spam?schoolId=${encodeURIComponent(schoolId)}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "장난 신고 처리를 하지 못했습니다.");
      setNotice(json.warning || (json.blocked ? `${report.id} 신고를 삭제하고 접수 기기를 검토 대상으로 지정했습니다.` : `${report.id} 신고를 삭제했습니다. (기기 정보가 없는 이전 신고)`));
      await afterChange();
      void refreshBlocked();
    } catch (err) { setError(err instanceof Error ? err.message : "장난 신고 처리를 하지 못했습니다."); }
    finally { setBusyId(null); }
  };

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await fetch("/api/staff/logout", { method: "POST" });
      const nextRole = loginRole;
      const res = await fetch(nextRole === "teacher" ? "/api/staff/teacher-login" : "/api/staff/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextRole === "teacher" ? { password, schoolId } : { password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "로그인하지 못했습니다.");
      setPassword("");
      setRole(nextRole);
      if (nextRole === "teacher") {
        setSchoolApplications([]);
        setBlockedDevices([]);
        setActiveSection("reports");
      }
      setAuthenticated(true);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인하지 못했습니다.");
    }
  };

  const logout = async () => {
    await fetch("/api/staff/logout", { method: "POST" });
    setAuthenticated(false);
    setLoginRole(role);
  };

  const saveReport = async (event: FormEvent<HTMLFormElement>, report: SchoolReport) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusyId(report.id);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/staff/reports/${encodeURIComponent(report.id)}?schoolId=${encodeURIComponent(schoolId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: form.get("status"),
          assignee: form.get("assignee"),
          resolutionNote: form.get("resolutionNote"),
          reporterReply: form.get("reporterReply"),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "변경 내용을 저장하지 못했습니다.");
      setNotice(`${report.id} 처리 내용을 저장했습니다.`);
      await afterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "변경 내용을 저장하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  if (checking) return <div className="py-20 text-center text-slate-500"><Loader2 className="inline h-5 w-5 animate-spin" /> 확인 중</div>;

  if (!authenticated) return (
    <section className="sf-staff-login mx-auto max-w-md rounded-[1.75rem] border border-white bg-white/95 p-6 shadow-sm sm:p-9">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><LockKeyhole /></div>
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => { setLoginRole("staff"); setError(""); }} aria-pressed={loginRole === "staff"} className={`rounded-lg px-3 py-2 text-sm font-bold ${loginRole === "staff" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}>운영진</button><button type="button" onClick={() => { setLoginRole("teacher"); setError(""); }} aria-pressed={loginRole === "teacher"} className={`rounded-lg px-3 py-2 text-sm font-bold ${loginRole === "teacher" ? "bg-white text-blue-800 shadow-sm" : "text-slate-600"}`}>교사 전용</button></div>
      <h1 className="text-xl font-bold text-slate-900">{loginRole === "teacher" ? "교사 로그인" : "운영진 로그인"}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{loginRole === "teacher" ? <><strong>{schoolName}</strong>의 학교별 비밀번호로 로그인합니다. 소속 학교 신고만 관리할 수 있습니다.</> : "운영진 계정으로 로그인하면 신고 처리 상태와 담당자 정보를 관리할 수 있습니다."}</p>
      <form className="mt-6 space-y-4" onSubmit={login}>
        <label className="block text-sm font-semibold text-slate-700" htmlFor="staff-password">비밀번호</label>
        <input id="staff-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3.5 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <button className="w-full rounded-xl bg-blue-700 px-4 py-3 font-bold text-white hover:bg-blue-800">로그인</button>
      </form>
    </section>
  );

  const sectionButton = (section: Section, label: string, Icon: typeof Inbox, badge?: number) => (
    <button type="button" onClick={() => { setActiveSection(section); if (section === "applications") void refreshApplications(); if (section === "blocked") void refreshBlocked(); }} aria-pressed={activeSection === section} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${activeSection === section ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>
      <Icon className="h-4 w-4" />{label}
      {badge !== undefined && <span className={`rounded-full px-2 py-0.5 text-xs ${activeSection === section ? "bg-white/20 text-white" : "bg-blue-50 text-blue-800"}`}>{badge}</span>}
    </button>
  );

  return (
    <section className="sf-staff-portal space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:p-5">
        <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-blue-700" /><div><h1 className="font-bold text-slate-900">{role === "teacher" ? `${schoolName} 교사 신고 관리` : "운영진 신고 관리"}</h1><p className="text-sm text-slate-600">{role === "teacher" ? "소속 학교의 신고 상태, 담당자, 처리 메모를 관리합니다." : "신고 상태, 담당자, 처리 메모를 관리합니다."}</p></div></div>
        <button type="button" onClick={logout} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><LogOut className="h-4 w-4" /> 로그아웃</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {sectionButton("reports", "신고 관리", ShieldCheck)}
        {sectionButton("stats", "월별 통계", BarChart3)}
        {role === "staff" && sectionButton("applications", "학교 신청 메일함", Inbox, schoolApplications.filter((item) => item.status === "new").length)}
        {role === "staff" && sectionButton("blocked", "검토 대상 기기", Ban, blockedDevices.length)}
        {role === "staff" && sectionButton("notifications", "알림", BellRing)}
      </div>

      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

      {activeSection === "stats" && <StaffStatsPanel schoolId={schoolId} schoolName={schoolName} reports={displayedReports} canNotify={role === "staff"} />}

      {role === "staff" && activeSection === "notifications" && <NotificationSettingsPanel schoolId={schoolId} schoolName={schoolName} />}

      {role === "staff" && activeSection === "blocked" && <div className="space-y-3">
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600">장난 신고로 처리한 신고의 접수 기기입니다. 이 기기에서 오는 신고는 막지 않고 <strong>공개 전에 운영진 검토</strong>를 거칩니다. 짧은 시간에 여러 건을 보낸 기기의 신고도 자동으로 검토 대기가 됩니다.</p>
        {blockedDevices.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">검토 대상 기기가 없습니다.</p> : blockedDevices.map((device) => (
          <article key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm"><p className="font-mono text-xs text-slate-500">기기 {device.id}…</p><p className="mt-1 font-semibold text-slate-800">{device.reason}{device.reportId ? ` · ${device.reportId}` : ""}</p><p className="mt-0.5 text-xs text-slate-500">{new Date(device.until).toLocaleDateString("ko-KR")}까지</p></div>
            <button type="button" onClick={() => void unblockDevice(device)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">검토 해제</button>
          </article>
        ))}
      </div>}

      {role === "staff" && activeSection === "applications" && <div className="space-y-3">
        {customSchools.length > 0 && <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><SchoolIcon className="h-4 w-4" /> 화면에서 등록한 학교</h2>
          <ul className="mt-3 divide-y divide-slate-100">{customSchools.map((school) => <li key={school.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span><strong className="text-slate-900">{school.schoolName}</strong> <span className="font-mono text-xs text-slate-500">{school.id}</span> · <span className={school.supportStatus === "active" ? "text-emerald-700" : "text-slate-400"}>{school.supportStatus === "active" ? "지원 중" : "지원 중지"}</span></span>{school.supportStatus === "active" && <button type="button" onClick={() => void stopSchool(school)} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-700">지원 중지</button>}</li>)}</ul>
        </div>}
        {schoolApplications.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">접수된 학교 추가 신청이 없습니다.</p> : schoolApplications.map((application) => <article key={application.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-slate-900">{application.schoolName}</h2><span className={`rounded-full px-2 py-1 text-xs font-bold ${application.status === "new" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>{application.status === "new" ? "새 신청" : "확인 완료"}</span>{application.registeredSchoolId && <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-900">등록됨 · {application.registeredSchoolId}</span>}</div><p className="mt-1 text-xs text-slate-500">{application.id} · {new Date(application.createdAt).toLocaleString("ko-KR")}</p></div><div className="flex flex-wrap gap-2">{!application.registeredSchoolId && <button type="button" onClick={() => setRegisteringId(registeringId === application.id ? null : application.id)} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white">{registeringId === application.id ? "등록 취소" : "승인하고 학교 등록"}</button>}<button type="button" onClick={() => void updateApplicationStatus(application)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">{application.status === "new" ? "확인 완료로 표시" : "새 신청으로 표시"}</button><button type="button" onClick={() => void deleteApplication(application)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">삭제</button></div></div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs font-semibold text-slate-500">주소 또는 지역</dt><dd className="mt-1 text-slate-800">{application.address}</dd></div><div><dt className="text-xs font-semibold text-slate-500">공식 홈페이지</dt><dd className="mt-1"><a href={application.website} target="_blank" rel="noreferrer" className="break-all text-blue-700 underline">{application.website}</a></dd></div><div className="sm:col-span-2"><dt className="text-xs font-semibold text-slate-500">신청 사유</dt><dd className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-800">{application.reason}</dd></div>{application.requests && <div className="sm:col-span-2"><dt className="text-xs font-semibold text-slate-500">추가 요청</dt><dd className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-800">{application.requests}</dd></div>}{application.replyEmail && <div><dt className="text-xs font-semibold text-slate-500">회신 이메일</dt><dd className="mt-1"><a href={`mailto:${application.replyEmail}`} className="text-blue-700 underline">{application.replyEmail}</a></dd></div>}</dl>
          {registeringId === application.id && <form onSubmit={(event) => registerSchool(event, application)} className="mt-4 grid gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4 sm:grid-cols-2">
            <p className="text-xs leading-relaxed text-blue-900 sm:col-span-2">공식 홈페이지에서 학교 정보를 확인한 뒤 등록하세요. 등록하면 재배포 없이 학교 선택 화면에 바로 나타나고, 위치는 기본 유형(교실·화장실 등)이 "확인 필요" 상태로 제공됩니다.</p>
            <label className="text-xs font-semibold text-slate-700">학교 ID (영문 소문자·숫자·하이픈)<input name="id" required defaultValue={suggestSchoolId(application.website)} pattern="[a-z0-9][a-z0-9\-]{1,39}" placeholder="예: gm-h" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm" /></label>
            <label className="text-xs font-semibold text-slate-700">학교 공식 명칭<input name="schoolName" required maxLength={100} defaultValue={application.schoolName} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-700">공식 홈페이지<input name="officialWebsite" type="url" required defaultValue={application.website} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-700">주소<input name="address" required maxLength={200} defaultValue={application.address} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-700">고등학교 유형 (고등학교만)<select name="highSchoolType" defaultValue="" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">해당 없음</option><option value="일반고">일반고</option><option value="특성화고">특성화고</option><option value="특목고">특목고</option></select></label>
            <div className="flex items-end"><button disabled={busyId === application.id} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{busyId === application.id && <Loader2 className="h-4 w-4 animate-spin" />}학교 등록</button></div>
          </form>}
        </article>)}
      </div>}

      {activeSection === "reports" && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          { label: "전체 신고", value: summary.total, className: "text-slate-900" },
          { label: "접수 대기", value: summary.pending, className: "text-slate-700" },
          { label: "안전성 검토 대기", value: summary.held, className: "text-amber-700" },
          { label: "확인·처리 중", value: summary.active, className: "text-blue-700" },
          { label: "높음 이상", value: summary.urgent, className: "text-rose-700" },
          { label: "기한 초과", value: summary.overdue, className: summary.overdue ? "text-rose-700" : "text-slate-700" },
        ].map((item) => <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-500">{item.label}</p><p className={`mt-1 text-2xl font-bold ${item.className}`}>{item.value}</p></div>)}
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="검색: 접수번호, 내용, 위치, 담당자" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" aria-label="신고 검색" />
        </label>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" aria-label="상태 필터">
          <option value="all">모든 상태</option><option value="overdue">기한 초과</option><option value="moderation-held">안전성 검토 대기</option>{Object.entries(STATUS_MAP).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
        </select>
        <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" aria-label="위험도 필터">
          <option value="all">모든 위험도</option>{Object.keys(RISK_LEVEL_MAP).map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
        <select value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" aria-label="정렬">
          <option value="risk">위험도·최근 순</option><option value="deadline">처리 기한 임박 순</option><option value="metoo">나도 겪었어요 많은 순</option>
        </select>
        <button type="button" onClick={exportCsv} disabled={visibleReports.length === 0} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><Download className="h-4 w-4" /> CSV 내보내기</button>
      </div>
      <p className="text-sm text-slate-500">{visibleReports.length}건 표시 · 처리 기한: 긴급 1일 · 높음 3일 · 중간 7일 · 낮음 14일 (분석 전 7일)</p>
      {displayedReports.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">접수된 신고가 없습니다.</p> : visibleReports.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">조건에 맞는 신고가 없습니다.</p> : visibleReports.map((report) => {
        const sla = computeSla(report);
        const suspicious = report.reporter.blocked || report.reporter.deviceReportCount >= 5;
        return (
        <article key={`${report.id}-${report.updatedAt}`} className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${sla.overdue && report.moderationStatus !== "held" ? "border-rose-300" : "border-slate-200"}`}>
          {report.moderationStatus === "held" && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center gap-2 font-bold text-amber-900"><ShieldAlert className="h-5 w-5" /> 공개 보류 · 운영진 검토 필요</div><p className="mt-1 text-sm text-amber-800">{report.moderationReason || "자동 안전성 검사에서 검토 대상으로 분류했습니다."}</p>{report.attachmentUrl && <img src={report.attachmentUrl} alt="검토 대기 첨부 이미지" className="mt-3 max-h-64 rounded-lg border border-amber-200 object-contain" />}<div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busyId === report.id} onClick={() => moderate(report, "approve")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"><Check className="h-4 w-4" /> 승인하고 공개</button><button type="button" disabled={busyId === report.id} onClick={() => moderate(report, "reject")} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /> 삭제</button></div></div>}
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-slate-500">{report.id}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{[report.locationType || report.location, report.locationDetail, report.buildingName, report.floor, report.department, report.grade ? `${report.grade}학년` : null, report.className, report.roomName].filter(Boolean).join(" · ")} · {report.category}</span>
              <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${report.riskLevel ? RISK_LEVEL_MAP[report.riskLevel].badgeClass : "border-slate-200 bg-slate-50 text-slate-500"}`}>{report.riskLevel || "분석 대기"}</span>
              <span className={`rounded-full border px-2 py-1 text-xs ${STATUS_MAP[report.status].badgeClass}`}>{STATUS_MAP[report.status].label}</span>
              {report.moderationStatus !== "held" && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${sla.overdue ? "bg-rose-600 text-white" : sla.daysLeft !== null && sla.daysLeft <= 1 ? "bg-amber-100 text-amber-900" : sla.completedLate ? "bg-slate-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}><Clock className="h-3 w-3" />{slaLabel(sla)}</span>}
              {(report.meTooCount ?? 0) > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700"><HandHeart className="h-3 w-3" />나도 겪었어요 {report.meTooCount}</span>}
              {report.feedback && <span className={`rounded-full px-2 py-1 text-xs font-bold ${report.feedback.resolved ? "bg-emerald-50 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{report.feedback.resolved ? "신고자: 해결됨" : "신고자: 아직 미해결"}</span>}
              {suspicious && <span className="rounded-full bg-slate-900 px-2 py-1 text-xs font-bold text-white">{report.reporter.blocked ? "검토 대상 기기" : `같은 기기 신고 ${report.reporter.deviceReportCount}건`}</span>}
            </div>
            <h2 className="mt-2 font-bold text-slate-900">{report.title || "시설 문제 신고"}</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{report.description}</p>
            {report.feedback?.comment && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">신고자 의견: {report.feedback.comment}</p>}
            <p className="mt-2 text-xs text-slate-500">접수 {new Date(report.createdAt).toLocaleString("ko-KR")} · 기한 {new Date(sla.dueAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}{report.assignee ? ` · 담당 ${report.assignee}` : " · 담당자 미지정"}</p>
          </div>
          <form onSubmit={(event) => saveReport(event, report)} className="grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">처리 상태<select name="status" defaultValue={report.status} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{Object.entries(STATUS_MAP).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">담당자<input name="assignee" defaultValue={report.assignee || ""} maxLength={100} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="담당 부서 또는 담당자" /></label>
            <label className="text-xs font-semibold text-slate-600">처리 메모 <span className="font-normal text-slate-400">(공개 — 신고 상세의 "처리 결과"에 표시)</span><textarea name="resolutionNote" defaultValue={report.resolutionNote || ""} maxLength={1000} rows={2} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="확인 및 조치 내용을 입력하세요" /></label>
            <label className="text-xs font-semibold text-slate-600">신고한 학생에게 답변 <span className="font-normal text-slate-400">(신고한 학생에게만 보임)</span><textarea name="reporterReply" defaultValue={report.reporterReply || ""} maxLength={1000} rows={2} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="예: 알려줘서 고마워요. 이번 주 금요일에 교체할 예정이에요." /></label>
            <div className="flex flex-wrap items-center gap-2 md:col-span-2">
              <button disabled={busyId === report.id} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"><Save className="h-4 w-4" />{busyId === report.id ? "저장 중…" : "처리 내용 저장"}</button>
              {role === "staff" && <button type="button" disabled={busyId === report.id} onClick={() => markSpam(report)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-700 disabled:opacity-60"><Ban className="h-4 w-4" />장난 신고로 처리</button>}
            </div>
          </form>
          {report.history.length > 0 && <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
            <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-slate-600"><History className="h-3.5 w-3.5" /> 처리 이력 {report.history.length}건</summary>
            <ol className="mt-2 space-y-1">{[...report.history].reverse().map((entry, index) => <li key={`${entry.at}-${index}`} className="text-xs text-slate-600"><span className="font-mono text-slate-400">{new Date(entry.at).toLocaleString("ko-KR")}</span> · <strong className="text-slate-700">{ACTOR_LABEL[entry.actor] ?? entry.actor}</strong> · {describeHistory(entry)}</li>)}</ol>
          </details>}
        </article>
        );
      })}
      </>}
    </section>
  );
}
