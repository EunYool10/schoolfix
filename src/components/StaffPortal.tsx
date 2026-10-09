import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Check, Download, Inbox, Loader2, LockKeyhole, LogOut, Save, Search, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { RISK_LEVEL_MAP, STATUS_MAP, type SchoolReport } from "../types";

interface StaffPortalProps {
  schoolId: string;
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
  createdAt: string;
}

export function StaffPortal({ schoolId, reports, onRefresh }: StaffPortalProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [heldReports, setHeldReports] = useState<SchoolReport[]>([]);
  const [schoolApplications, setSchoolApplications] = useState<SchoolApplication[]>([]);
  const [activeSection, setActiveSection] = useState<"reports" | "applications">("reports");
  const displayedReports = useMemo(() => [...heldReports, ...reports.filter((report) => report.moderationStatus !== "held")], [reports, heldReports]);

  const summary = useMemo(() => ({
    total: displayedReports.length,
    pending: displayedReports.filter((report) => report.status === "pending" && report.moderationStatus !== "held").length,
    held: displayedReports.filter((report) => report.moderationStatus === "held").length,
    active: displayedReports.filter((report) => report.status !== "pending" && report.status !== "completed").length,
    urgent: displayedReports.filter((report) => report.riskLevel === "긴급" || report.riskLevel === "높음").length,
  }), [displayedReports]);

  const visibleReports = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const riskOrder = { 긴급: 0, 높음: 1, 중간: 2, 낮음: 3 } as const;
    return displayedReports
      .filter((report) => statusFilter === "all" || (statusFilter === "moderation-held" ? report.moderationStatus === "held" : report.moderationStatus !== "held" && report.status === statusFilter))
      .filter((report) => riskFilter === "all" || report.riskLevel === riskFilter)
      .filter((report) => !query || [report.id, report.title, report.description, report.location, report.locationDetail, report.category, report.assignee]
        .some((value) => value?.toLocaleLowerCase().includes(query)))
      .sort((a, b) => {
        const riskA = a.riskLevel ? riskOrder[a.riskLevel] : 4;
        const riskB = b.riskLevel ? riskOrder[b.riskLevel] : 4;
        return riskA - riskB || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [displayedReports, search, statusFilter, riskFilter]);

  const exportCsv = () => {
    const columns = ["접수번호", "접수일시", "학교", "위치 유형", "세부 위치", "분류", "위험도", "상태", "제목", "신고 내용", "담당자", "처리 메모"];
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
      report.title, report.description, report.assignee, report.resolutionNote,
    ]);
    const csv = "\uFEFF" + [columns, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `schoolfix-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  useEffect(() => {
    fetch("/api/staff/session").then((res) => res.json()).then((json) => {
      setAuthenticated(Boolean(json.authenticated));
    }).catch(() => setError("로그인 상태를 확인하지 못했습니다.")).finally(() => setChecking(false));
  }, []);

  const refreshHeld = async () => {
    try {
      const res = await fetch(`/api/staff/moderation?schoolId=${encodeURIComponent(schoolId)}`);
      const json = await res.json();
      if (res.ok && json.ok) setHeldReports(json.data || []);
    } catch { /* keep existing queue */ }
  };

  useEffect(() => { if (authenticated) void refreshHeld(); }, [authenticated, schoolId]);

  const refreshApplications = async () => {
    try {
      const response = await fetch("/api/staff/school-applications");
      const json = await response.json();
      if (response.ok && json.ok) setSchoolApplications(Array.isArray(json.data) ? json.data : []);
    } catch { /* keep the last loaded inbox */ }
  };

  useEffect(() => { if (authenticated) void refreshApplications(); }, [authenticated]);

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

  const moderate = async (report: SchoolReport, action: "approve" | "reject") => {
    setBusyId(report.id); setError(""); setNotice("");
    try {
      const res = await fetch(`/api/staff/reports/${encodeURIComponent(report.id)}/moderation?schoolId=${encodeURIComponent(schoolId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "검토 결과를 저장하지 못했습니다.");
      setNotice(`${report.id} 신고를 ${action === "approve" ? "승인" : "삭제"}했습니다.`);
      await refreshHeld(); onRefresh();
    } catch (err) { setError(err instanceof Error ? err.message : "검토 결과를 저장하지 못했습니다."); }
    finally { setBusyId(null); }
  };

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/staff/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "로그인하지 못했습니다.");
      setPassword("");
      setAuthenticated(true);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인하지 못했습니다.");
    }
  };

  const logout = async () => {
    await fetch("/api/staff/logout", { method: "POST" });
    setAuthenticated(false);
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
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "변경 내용을 저장하지 못했습니다.");
      setNotice(`${report.id} 처리 내용을 저장했습니다.`);
      onRefresh();
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
      <h1 className="text-xl font-bold text-slate-900">운영진 로그인</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">운영진 계정으로 로그인하면 신고 처리 상태와 담당자 정보를 관리할 수 있습니다.</p>
      <form className="mt-6 space-y-4" onSubmit={login}>
        <label className="block text-sm font-semibold text-slate-700" htmlFor="staff-password">비밀번호</label>
        <input id="staff-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3.5 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <button className="w-full rounded-xl bg-blue-700 px-4 py-3 font-bold text-white hover:bg-blue-800">로그인</button>
      </form>
    </section>
  );

  return (
    <section className="sf-staff-portal space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:p-5">
        <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-blue-700" /><div><h1 className="font-bold text-slate-900">운영진 신고 관리</h1><p className="text-sm text-slate-600">신고 상태, 담당자, 처리 메모를 관리합니다.</p></div></div>
        <button type="button" onClick={logout} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><LogOut className="h-4 w-4" /> 로그아웃</button>
      </div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setActiveSection("reports")} aria-pressed={activeSection === "reports"} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${activeSection === "reports" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>신고 관리</button><button type="button" onClick={() => { setActiveSection("applications"); void refreshApplications(); }} aria-pressed={activeSection === "applications"} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${activeSection === "applications" ? "bg-blue-700 text-white" : "border border-slate-200 bg-white text-slate-700"}`}><Inbox className="h-4 w-4" />학교 신청 메일함<span className={`rounded-full px-2 py-0.5 text-xs ${activeSection === "applications" ? "bg-white/20 text-white" : "bg-blue-50 text-blue-800"}`}>{schoolApplications.filter((item) => item.status === "new").length}</span></button></div>
      {activeSection === "applications" ? <div className="space-y-3">
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {schoolApplications.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">접수된 학교 추가 신청이 없습니다.</p> : schoolApplications.map((application) => <article key={application.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-slate-900">{application.schoolName}</h2><span className={`rounded-full px-2 py-1 text-xs font-bold ${application.status === "new" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>{application.status === "new" ? "새 신청" : "확인 완료"}</span></div><p className="mt-1 text-xs text-slate-500">{application.id} · {new Date(application.createdAt).toLocaleString("ko-KR")}</p></div><div className="flex gap-2"><button type="button" onClick={() => void updateApplicationStatus(application)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">{application.status === "new" ? "확인 완료로 표시" : "새 신청으로 표시"}</button><button type="button" onClick={() => void deleteApplication(application)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">삭제</button></div></div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs font-semibold text-slate-500">주소 또는 지역</dt><dd className="mt-1 text-slate-800">{application.address}</dd></div><div><dt className="text-xs font-semibold text-slate-500">공식 홈페이지</dt><dd className="mt-1"><a href={application.website} target="_blank" rel="noreferrer" className="break-all text-blue-700 underline">{application.website}</a></dd></div><div className="sm:col-span-2"><dt className="text-xs font-semibold text-slate-500">신청 사유</dt><dd className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-800">{application.reason}</dd></div>{application.requests && <div className="sm:col-span-2"><dt className="text-xs font-semibold text-slate-500">추가 요청</dt><dd className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-800">{application.requests}</dd></div>}{application.replyEmail && <div><dt className="text-xs font-semibold text-slate-500">회신 이메일</dt><dd className="mt-1"><a href={`mailto:${application.replyEmail}`} className="text-blue-700 underline">{application.replyEmail}</a></dd></div>}</dl>
        </article>)}
      </div> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "전체 신고", value: summary.total, className: "text-slate-900" },
          { label: "접수 대기", value: summary.pending, className: "text-slate-700" },
          { label: "안전성 검토 대기", value: summary.held, className: "text-amber-700" },
          { label: "확인·처리 중", value: summary.active, className: "text-blue-700" },
          { label: "높음 이상", value: summary.urgent, className: "text-rose-700" },
        ].map((item) => <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-500">{item.label}</p><p className={`mt-1 text-2xl font-bold ${item.className}`}>{item.value}</p></div>)}
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="검색: 접수번호, 내용, 위치, 담당자" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" aria-label="신고 검색" />
        </label>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" aria-label="상태 필터">
          <option value="all">모든 상태</option><option value="moderation-held">안전성 검토 대기</option>{Object.entries(STATUS_MAP).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
        </select>
        <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" aria-label="위험도 필터">
          <option value="all">모든 위험도</option>{Object.keys(RISK_LEVEL_MAP).map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
        <button type="button" onClick={exportCsv} disabled={visibleReports.length === 0} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><Download className="h-4 w-4" /> CSV 내보내기</button>
      </div>
      <p className="text-sm text-slate-500">{visibleReports.length}건 표시 · 긴급/높음 위험도와 최근 신고 순</p>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {displayedReports.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">접수된 신고가 없습니다.</p> : visibleReports.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">조건에 맞는 신고가 없습니다.</p> : visibleReports.map((report) => (
        <article key={`${report.id}-${report.updatedAt}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          {report.moderationStatus === "held" && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center gap-2 font-bold text-amber-900"><ShieldAlert className="h-5 w-5" /> 공개 보류 · 운영진 검토 필요</div><p className="mt-1 text-sm text-amber-800">{report.moderationReason || "자동 안전성 검사에서 검토 대상으로 분류했습니다."}</p>{report.attachmentUrl && <img src={report.attachmentUrl} alt="검토 대기 첨부 이미지" className="mt-3 max-h-64 rounded-lg border border-amber-200 object-contain" />}<div className="mt-3 flex gap-2"><button type="button" disabled={busyId === report.id} onClick={() => moderate(report, "approve")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"><Check className="h-4 w-4" /> 승인하고 공개</button><button type="button" disabled={busyId === report.id} onClick={() => moderate(report, "reject")} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /> 삭제</button></div></div>}
          <div className="mb-4"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-slate-500">{report.id}</span><span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-800">{report.schoolName}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{[report.locationType || report.location, report.locationDetail, report.buildingName, report.floor, report.department, report.grade ? `${report.grade}학년` : null, report.className, report.roomName].filter(Boolean).join(" · ")} · {report.category}</span><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${report.riskLevel ? RISK_LEVEL_MAP[report.riskLevel].badgeClass : "border-slate-200 bg-slate-50 text-slate-500"}`}>{report.riskLevel || "분석 대기"}</span><span className={`rounded-full border px-2 py-1 text-xs ${STATUS_MAP[report.status].badgeClass}`}>{STATUS_MAP[report.status].label}</span></div><h2 className="mt-2 font-bold text-slate-900">{report.title || "시설 문제 신고"}</h2><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{report.description}</p><p className="mt-2 text-xs text-slate-500">접수 {new Date(report.createdAt).toLocaleString("ko-KR")}{report.assignee ? ` · 담당 ${report.assignee}` : " · 담당자 미지정"}</p></div>
          <form onSubmit={(event) => saveReport(event, report)} className="grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">처리 상태<select name="status" defaultValue={report.status} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{Object.entries(STATUS_MAP).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">담당자<input name="assignee" defaultValue={report.assignee || ""} maxLength={100} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="담당 부서 또는 담당자" /></label>
            <label className="text-xs font-semibold text-slate-600 md:col-span-2">처리 메모<textarea name="resolutionNote" defaultValue={report.resolutionNote || ""} maxLength={1000} rows={2} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="확인 및 조치 내용을 입력하세요" /></label>
            <div className="md:col-span-2"><button disabled={busyId === report.id} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"><Save className="h-4 w-4" />{busyId === report.id ? "저장 중…" : "처리 내용 저장"}</button></div>
          </form>
        </article>
      ))}
      </>}
    </section>
  );
}
