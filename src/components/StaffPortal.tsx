import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Loader2, LockKeyhole, LogOut, Save, ShieldCheck } from "lucide-react";
import { STATUS_MAP, type SchoolReport } from "../types";

interface StaffPortalProps {
  reports: SchoolReport[];
  onRefresh: () => void;
}

export function StaffPortal({ reports, onRefresh }: StaffPortalProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/staff/session").then((res) => res.json()).then((json) => {
      setAuthenticated(Boolean(json.authenticated));
    }).catch(() => setError("로그인 상태를 확인하지 못했습니다.")).finally(() => setChecking(false));
  }, []);

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
      const res = await fetch(`/api/staff/reports/${encodeURIComponent(report.id)}`, {
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
    <section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
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
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:p-5">
        <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-blue-700" /><div><h1 className="font-bold text-slate-900">운영진 신고 관리</h1><p className="text-sm text-slate-600">신고 상태, 담당자, 처리 메모를 관리합니다.</p></div></div>
        <button type="button" onClick={logout} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><LogOut className="h-4 w-4" /> 로그아웃</button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {reports.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">접수된 신고가 없습니다.</p> : reports.map((report) => (
        <article key={report.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-slate-500">{report.id}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{report.location} · {report.category}</span></div><h2 className="mt-2 font-bold text-slate-900">{report.title || "시설 문제 신고"}</h2><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{report.description}</p></div>
          <form onSubmit={(event) => saveReport(event, report)} className="grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">처리 상태<select name="status" defaultValue={report.status} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{Object.entries(STATUS_MAP).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">담당자<input name="assignee" defaultValue={report.assignee || ""} maxLength={100} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="담당 부서 또는 담당자" /></label>
            <label className="text-xs font-semibold text-slate-600 md:col-span-2">처리 메모<textarea name="resolutionNote" defaultValue={report.resolutionNote || ""} maxLength={1000} rows={2} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="확인 및 조치 내용을 입력하세요" /></label>
            <div className="md:col-span-2"><button disabled={busyId === report.id} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"><Save className="h-4 w-4" />{busyId === report.id ? "저장 중…" : "처리 내용 저장"}</button></div>
          </form>
        </article>
      ))}
    </section>
  );
}

