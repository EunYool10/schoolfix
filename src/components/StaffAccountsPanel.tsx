import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { DatabaseBackup, KeyRound, Loader2, Power, Trash2, UserPlus } from "lucide-react";
import type { StaffAccountInfo } from "../types";

const ROLE_LABEL: Record<StaffAccountInfo["role"], string> = { admin: "관리자", staff: "운영진", teacher: "교사" };

interface SchoolOption {
  id: string;
  schoolName: string;
}

async function requestJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error || "요청을 처리하지 못했습니다.");
  return json;
}

/**
 * 관리자 전용 — 운영진·교사 개인 계정 관리.
 * 개인 계정으로 처리하면 처리 이력에 이름이 남고, 사람이 바뀌면 그 계정만 끄면 된다.
 */
export function StaffAccountsPanel() {
  const [accounts, setAccounts] = useState<StaffAccountInfo[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [masterConfigured, setMasterConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newRole, setNewRole] = useState<StaffAccountInfo["role"]>("staff");
  const [resetTarget, setResetTarget] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const json = await requestJson("/api/staff/accounts");
      setAccounts(Array.isArray(json.data) ? json.data : []);
      setSchools(Array.isArray(json.schools) ? json.schools : []);
      setMasterConfigured(Boolean(json.masterConfigured));
    } catch (err) {
      setError(err instanceof Error ? err.message : "계정 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const schoolName = (id: string | null) => schools.find((school) => school.id === id)?.schoolName ?? id ?? "";

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setError(""); setNotice(""); setBusyId("new");
    try {
      const json = await requestJson("/api/staff/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          displayName: form.get("displayName"),
          role: form.get("role"),
          schoolId: form.get("schoolId") || null,
          password: form.get("password"),
        }),
      });
      setNotice(`${json.data.displayName}(${json.data.username}) 계정을 만들었습니다. 아이디와 처음 비밀번호를 본인에게 직접 전달하고, 로그인 후 비밀번호를 바꾸도록 안내하세요.`);
      formElement.reset();
      setNewRole("staff");
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "계정을 만들지 못했습니다."); }
    finally { setBusyId(null); }
  };

  const patchAccount = async (account: StaffAccountInfo, body: Record<string, unknown>, message: string) => {
    setError(""); setNotice(""); setBusyId(account.id);
    try {
      await requestJson(`/api/staff/accounts/${encodeURIComponent(account.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      setNotice(message);
      await refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "계정을 바꾸지 못했습니다.");
      return false;
    } finally { setBusyId(null); }
  };

  const resetPassword = async (event: FormEvent<HTMLFormElement>, account: StaffAccountInfo) => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    if (await patchAccount(account, { password }, `${account.displayName} 계정의 비밀번호를 바꿨습니다. 열려 있던 로그인은 모두 끝났습니다.`)) setResetTarget(null);
  };

  const deleteAccount = async (account: StaffAccountInfo) => {
    if (!window.confirm(`${account.displayName}(${account.username}) 계정을 삭제할까요?\n처리 이력에 남은 이름은 그대로 남습니다.`)) return;
    setError(""); setNotice(""); setBusyId(account.id);
    try {
      await requestJson(`/api/staff/accounts/${encodeURIComponent(account.id)}`, { method: "DELETE" });
      setNotice(`${account.displayName} 계정을 삭제했습니다.`);
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "계정을 삭제하지 못했습니다."); }
    finally { setBusyId(null); }
  };

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600">
        사람마다 개인 계정을 만들면 처리 이력에 <strong>누가 바꿨는지 이름</strong>이 남고, 담당자가 바뀌면 그 계정만 끄면 됩니다.
        <strong> 관리자</strong>는 계정 관리와 전체 백업까지, <strong>운영진</strong>은 모든 학교의 신고 처리를, <strong>교사</strong>는 소속 학교 신고만 처리합니다.
        {masterConfigured && " 공용 비밀번호(아이디 admin)는 처음 설정용입니다. 개인 관리자 계정을 만든 뒤에는 Render 환경변수에서 STAFF_PASSWORD_HASH 를 지워도 됩니다."}
      </p>

      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

      <form onSubmit={createAccount} className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 sm:col-span-2 lg:col-span-3"><UserPlus className="h-4 w-4" /> 새 계정 만들기</h2>
        <label className="text-xs font-semibold text-slate-700">아이디 (영문 소문자·숫자)<input name="username" required pattern="[a-z0-9][a-z0-9._\-]{2,31}" autoComplete="off" placeholder="예: kim.teacher" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm" /></label>
        <label className="text-xs font-semibold text-slate-700">이름 (처리 이력에 표시)<input name="displayName" required maxLength={40} placeholder="예: 김선생 (행정실)" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-700">처음 비밀번호 (8자 이상)<input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-700">역할<select name="role" value={newRole} onChange={(e) => setNewRole(e.target.value as StaffAccountInfo["role"])} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="staff">운영진</option><option value="teacher">교사</option><option value="admin">관리자</option></select></label>
        {newRole === "teacher" && <label className="text-xs font-semibold text-slate-700">소속 학교<select name="schoolId" required defaultValue="" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="" disabled>학교 선택</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.schoolName}</option>)}</select></label>}
        <div className="flex items-end"><button disabled={busyId === "new"} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{busyId === "new" && <Loader2 className="h-4 w-4 animate-spin" />}계정 만들기</button></div>
      </form>

      {loading ? <p className="py-8 text-center text-sm text-slate-500"><Loader2 className="inline h-4 w-4 animate-spin" /> 불러오는 중</p>
        : accounts.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">아직 만든 개인 계정이 없습니다.</p>
        : <ul className="space-y-2">{accounts.map((account) => (
          <li key={account.id} className={`rounded-xl border bg-white p-4 ${account.disabled ? "border-slate-200 opacity-70" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="text-sm">
                <p className="flex flex-wrap items-center gap-2"><strong className="text-slate-900">{account.displayName}</strong><span className="font-mono text-xs text-slate-500">{account.username}</span><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${account.role === "admin" ? "bg-violet-100 text-violet-800" : account.role === "teacher" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"}`}>{ROLE_LABEL[account.role]}{account.role === "teacher" ? ` · ${schoolName(account.schoolId)}` : ""}</span>{account.disabled && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">사용 중지</span>}</p>
                <p className="mt-1 text-xs text-slate-500">마지막 로그인 {account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString("ko-KR") : "없음"} · 만든 날 {new Date(account.createdAt).toLocaleDateString("ko-KR")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busyId === account.id} onClick={() => setResetTarget(resetTarget === account.id ? null : account.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700"><KeyRound className="h-3.5 w-3.5" />비밀번호 재설정</button>
                <button type="button" disabled={busyId === account.id} onClick={() => void patchAccount(account, { disabled: !account.disabled }, account.disabled ? `${account.displayName} 계정을 다시 켰습니다.` : `${account.displayName} 계정을 껐습니다. 열려 있던 로그인도 끝났습니다.`)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700"><Power className="h-3.5 w-3.5" />{account.disabled ? "다시 켜기" : "사용 중지"}</button>
                <button type="button" disabled={busyId === account.id} onClick={() => void deleteAccount(account)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-700"><Trash2 className="h-3.5 w-3.5" />삭제</button>
              </div>
            </div>
            {resetTarget === account.id && (
              <form onSubmit={(event) => resetPassword(event, account)} className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
                <label className="text-xs font-semibold text-slate-700">새 비밀번호 (8자 이상)<input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="mt-1 block w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
                <button disabled={busyId === account.id} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">바꾸기</button>
              </form>
            )}
          </li>
        ))}</ul>}
    </div>
  );
}

/** 관리자 전용 — 전체 데이터 백업 내려받기 */
export function StaffBackupPanel() {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-bold text-slate-900"><DatabaseBackup className="h-5 w-5 text-blue-700" /> 전체 데이터 백업</h2>
      <p className="text-sm leading-relaxed text-slate-600">
        모든 학교의 신고(처리 이력 포함), 학교 신청함, 화면에서 등록한 학교, 검토 대상 기기, 알림 설정, 계정 목록을 JSON 파일 하나로 내려받습니다.
        비밀번호·로그인 세션·학생 알림 구독은 넣지 않습니다. 파일에는 학교 신청자의 회신 이메일이 들어 있으니 안전한 곳에 보관하세요.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href="/api/staff/backup" download className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">기록만 내려받기</a>
        <a href="/api/staff/backup?photos=1" download className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700">사진까지 포함해 내려받기</a>
      </div>
      <p className="text-xs text-slate-500">사진을 포함하면 파일이 커지고 시간이 걸립니다. 정기적으로(예: 매달 1일) 내려받아 두는 것을 권합니다.</p>
    </div>
  );
}

/** 개인 계정 사용자가 자기 비밀번호를 바꾼다. */
export function MyPasswordForm({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (form.get("newPassword") !== form.get("confirmPassword")) { setError("새 비밀번호가 서로 다릅니다."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await requestJson("/api/staff/me/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") }),
      });
      formElement.reset();
      setNotice("비밀번호를 바꿨습니다. 다른 기기의 로그인은 끝났습니다.");
      window.setTimeout(onDone, 1500);
    } catch (err) { setError(err instanceof Error ? err.message : "비밀번호를 바꾸지 못했습니다."); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 sm:col-span-4"><KeyRound className="h-4 w-4" /> 내 비밀번호 바꾸기</h2>
      <label className="text-xs font-semibold text-slate-700">현재 비밀번호<input name="currentPassword" type="password" required autoComplete="current-password" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
      <label className="text-xs font-semibold text-slate-700">새 비밀번호 (8자 이상)<input name="newPassword" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
      <label className="text-xs font-semibold text-slate-700">새 비밀번호 확인<input name="confirmPassword" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
      <div className="flex items-end"><button disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />}바꾸기</button></div>
      {error && <p role="alert" className="text-sm text-rose-700 sm:col-span-4">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-700 sm:col-span-4">{notice}</p>}
    </form>
  );
}
