import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, Loader2, Plus, Power, Trash2, UserCog } from "lucide-react";
import type { StaffAccountInfo } from "../types";

type Role = StaffAccountInfo["role"];

const ROLE_LABEL: Record<Role, string> = { owner: "총괄", admin: "관리자", staff: "운영진", teacher: "교사" };
const ROLE_ORDER: Record<Role, number> = { owner: 0, admin: 1, staff: 2, teacher: 3 };
/** 역할은 색 글자로만 구분한다 (배지 없음) */
const ROLE_TEXT: Record<Role, string> = {
  owner: "text-amber-700",
  admin: "text-indigo-700",
  staff: "text-slate-700",
  teacher: "text-blue-700",
};

const ROLE_DUTY: [Role, string][] = [
  ["owner", "모든 권한, 관리자 계정 관리, 백업 되돌리기. 한 명만 둘 수 있고 다른 사람이 바꾸거나 끌 수 없어요."],
  ["admin", "운영진·교사 계정 관리, 삭제된 신고 되살리기, 운영 기록, 전체 백업."],
  ["staff", "모든 학교의 신고 처리·삭제, 학교 신청, 알림 설정."],
  ["teacher", "소속 학교 신고만 처리 (삭제는 못 해요)."],
];

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

/*
 * 화면에 보여 줄 버튼을 고르는 규칙. 서버(staffAuth.ts)와 같은 규칙이며, 실제 권한은 서버가 다시 확인한다.
 *  - 총괄 계정은 아무도 바꾸지 못한다.
 *  - 총괄이 있으면 관리자 계정은 총괄만 다룬다.
 */
function canManage(viewerRole: Role, target: StaffAccountInfo, ownerExists: boolean) {
  if (viewerRole !== "owner" && viewerRole !== "admin") return false;
  if (target.role === "owner") return false;
  if (target.role === "admin") return viewerRole === "owner" || !ownerExists;
  return true;
}

function assignableRoles(viewerRole: Role, ownerExists: boolean): Role[] {
  if (viewerRole === "owner" || (viewerRole === "admin" && !ownerExists)) return ["staff", "teacher", "admin"];
  if (viewerRole === "admin") return ["staff", "teacher"];
  return [];
}

interface StaffAccountsPanelProps {
  /** 총괄 지정·넘기기로 내 역할이 바뀌었을 수 있을 때 로그인 정보를 다시 받는다. */
  onRolesChanged?: () => void;
}

/**
 * 관리자 전용 — 운영진·교사 개인 계정 관리.
 * 개인 계정으로 처리하면 처리 이력에 이름이 남고, 사람이 바뀌면 그 계정만 끄면 된다.
 * 총괄은 모든 계정 위에 있는 1인자로 한 명만 둔다.
 */
export function StaffAccountsPanel({ onRolesChanged }: StaffAccountsPanelProps) {
  const [accounts, setAccounts] = useState<StaffAccountInfo[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [masterConfigured, setMasterConfigured] = useState(true);
  const [ownerExists, setOwnerExists] = useState(false);
  const [viewer, setViewer] = useState<{ role: Role; accountId: string | null }>({ role: "admin", accountId: null });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newRole, setNewRole] = useState<Role>("staff");
  const [showCreate, setShowCreate] = useState(false);
  const [openForm, setOpenForm] = useState<{ id: string; kind: "password" | "role" } | null>(null);
  const [roleDraft, setRoleDraft] = useState<Role>("staff");

  const refresh = useCallback(async () => {
    try {
      const json = await requestJson("/api/staff/accounts");
      setAccounts(Array.isArray(json.data) ? json.data : []);
      setSchools(Array.isArray(json.schools) ? json.schools : []);
      setMasterConfigured(Boolean(json.masterConfigured));
      setOwnerExists(Boolean(json.ownerExists));
      if (json.viewer?.role) setViewer({ role: json.viewer.role, accountId: json.viewer.accountId ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "계정 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const sorted = useMemo(
    () => [...accounts].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.createdAt.localeCompare(b.createdAt)),
    [accounts]
  );
  const isOwnerViewer = viewer.role === "owner";
  const creatableRoles = assignableRoles(viewer.role, ownerExists);
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
      setShowCreate(false);
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
    if (await patchAccount(account, { password }, `${account.displayName} 계정의 비밀번호를 바꿨습니다. 열려 있던 로그인은 모두 끝났습니다.`)) setOpenForm(null);
  };

  const changeRole = async (event: FormEvent<HTMLFormElement>, account: StaffAccountInfo) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const role = form.get("role") as Role;
    const label = role === "teacher" ? `교사 (${schoolName(String(form.get("schoolId") || ""))})` : ROLE_LABEL[role];
    if (await patchAccount(account, { role, schoolId: form.get("schoolId") || null }, `${account.displayName} 계정을 ${label}(으)로 바꿨습니다. 열려 있던 로그인은 끝났습니다.`)) setOpenForm(null);
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

  /** 총괄로 지정(총괄이 없을 때) 또는 총괄 넘기기(총괄 본인) */
  const assignOwner = async (account: StaffAccountInfo) => {
    const message = ownerExists
      ? `${account.displayName}(${account.username})에게 총괄을 넘길까요?\n\n넘기면 나는 관리자가 되고, 다시 총괄이 되려면 새 총괄이 넘겨 줘야 합니다.`
      : `${account.displayName}(${account.username})을(를) 총괄로 지정할까요?\n\n총괄은 모든 계정 위에 있는 1인자입니다. 지정한 뒤에는 다른 누구도(공용 비밀번호 관리자 포함) 이 계정을 바꾸거나 끄거나 지울 수 없고, 관리자 계정은 총괄만 다룰 수 있습니다. 총괄 자리는 총괄 본인만 넘길 수 있습니다.`;
    if (!window.confirm(message)) return;
    setError(""); setNotice(""); setBusyId(account.id);
    try {
      await requestJson(`/api/staff/accounts/${encodeURIComponent(account.id)}/owner`, { method: "POST" });
      setNotice(ownerExists ? `${account.displayName}에게 총괄을 넘겼습니다. 나는 이제 관리자입니다.` : `${account.displayName}을(를) 총괄로 지정했습니다.`);
      await refresh();
      onRolesChanged?.();
    } catch (err) { setError(err instanceof Error ? err.message : "총괄을 지정하지 못했습니다."); }
    finally { setBusyId(null); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-snug text-slate-900">계정 관리</h1>
          <p className="mt-1 max-w-2xl break-keep text-sm leading-relaxed text-slate-600">사람마다 계정을 만들면 처리 이력에 누가 바꿨는지 이름이 남고, 담당자가 바뀌면 그 계정만 끄면 돼요.{masterConfigured && " 공용 비밀번호(아이디 admin)로 들어오면 관리자 권한이에요."}</p>
        </div>
        {creatableRoles.length > 0 && <button type="button" onClick={() => setShowCreate((open) => !open)} aria-expanded={showCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"><Plus className="h-4 w-4" />새 계정</button>}
      </div>

      {!ownerExists && (
        <p className="border-l-4 border-amber-400 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700">
          <strong className="text-slate-900">총괄이 아직 없어요.</strong> 모든 권한 위에 있는 한 사람을 정하려면 그 사람 계정의 '총괄로 지정'을 누르세요. 지정한 뒤에는 총괄 계정을 아무도 바꿀 수 없고, 총괄 자리는 총괄 본인만 넘길 수 있어요.
        </p>
      )}

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}

      {showCreate && (
        <form onSubmit={createAccount} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
          <h2 className="font-display text-lg text-slate-900 sm:col-span-2 lg:col-span-3">새 계정 만들기</h2>
          <label className="text-xs font-semibold text-slate-600">아이디 (영문 소문자·숫자)<input name="username" required pattern="[a-z0-9][a-z0-9._\-]{2,31}" autoComplete="off" placeholder="예: kim.teacher" className="mt-1 block h-10 w-full px-3 text-sm font-mono" /></label>
          <label className="text-xs font-semibold text-slate-600">이름 (처리 이력에 표시)<input name="displayName" required maxLength={40} placeholder="예: 김선생 (행정실)" className="mt-1 block h-10 w-full px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-600">처음 비밀번호 (8자 이상)<input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="mt-1 block h-10 w-full px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-600">역할<select name="role" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)} className="mt-1 block h-10 w-full px-3 text-sm">{creatableRoles.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</select></label>
          {newRole === "teacher" && <label className="text-xs font-semibold text-slate-600">소속 학교<select name="schoolId" required defaultValue="" className="mt-1 block h-10 w-full px-3 text-sm"><option value="" disabled>학교 선택</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.schoolName}</option>)}</select></label>}
          <div className="flex items-end gap-2"><button disabled={busyId === "new"} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">{busyId === "new" && <Loader2 className="h-4 w-4 animate-spin" />}만들기</button><button type="button" onClick={() => setShowCreate(false)} className="h-10 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">취소</button></div>
          {!creatableRoles.includes("admin") && <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-3">관리자 계정은 총괄만 만들 수 있어요.</p>}
        </form>
      )}

      {loading ? <p className="py-8 text-center text-sm text-slate-500"><Loader2 className="inline h-4 w-4 animate-spin" /> 불러오는 중</p>
        : accounts.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">아직 만든 개인 계정이 없어요.</p>
        : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_24rem] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-semibold text-slate-500 md:grid">
            <span>이름 · 아이디</span><span>역할</span><span>마지막 로그인</span><span className="text-right">관리</span>
          </div>
          <ul className="divide-y divide-slate-100">{sorted.map((account) => {
          const isMe = viewer.accountId === account.id;
          const manageable = canManage(viewer.role, account, ownerExists) && !isMe;
          const canAssign = account.role !== "owner" && !account.disabled && (ownerExists ? isOwnerViewer : true);
          const roleChoices = assignableRoles(viewer.role, ownerExists);
          const action = "inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50";
          return (
            <li key={account.id} className={`px-5 py-4 ${account.disabled ? "bg-slate-50" : ""}`}>
              <div className="grid gap-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_24rem] md:items-center md:gap-4">
                <div className="min-w-0">
                  <p className={`truncate text-[15px] font-bold ${account.disabled ? "text-slate-400" : "text-slate-900"}`}>{account.displayName}{isMe && <span className="ml-1.5 text-sm font-medium text-slate-400">(나)</span>}</p>
                  <p className="truncate font-mono text-xs text-slate-500">{account.username}</p>
                </div>
                <p className="text-sm">
                  <span className={`font-semibold ${ROLE_TEXT[account.role]}`}>{ROLE_LABEL[account.role]}</span>
                  {account.role === "teacher" && <span className="text-slate-500"> · {schoolName(account.schoolId)}</span>}
                  {account.disabled && <span className="text-slate-400"> · 사용 중지</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "로그인 기록 없음"}
                  <span className="block text-slate-400">만든 날 {new Date(account.createdAt).toLocaleDateString("ko-KR")}</span>
                </p>
                <div className="-ml-2 flex flex-wrap gap-0.5 md:ml-0 md:justify-end">
                  {canAssign && <button type="button" disabled={busyId === account.id} onClick={() => void assignOwner(account)} className={`${action} text-amber-700 hover:text-amber-800`}>{ownerExists ? "총괄 넘기기" : "총괄로 지정"}</button>}
                  {manageable && <>
                    <button type="button" disabled={busyId === account.id} onClick={() => { setRoleDraft(account.role); setOpenForm(openForm?.id === account.id && openForm.kind === "role" ? null : { id: account.id, kind: "role" }); }} className={action}><UserCog className="h-3.5 w-3.5" />역할</button>
                    <button type="button" disabled={busyId === account.id} onClick={() => setOpenForm(openForm?.id === account.id && openForm.kind === "password" ? null : { id: account.id, kind: "password" })} className={action}><KeyRound className="h-3.5 w-3.5" />비밀번호</button>
                    <button type="button" disabled={busyId === account.id} onClick={() => void patchAccount(account, { disabled: !account.disabled }, account.disabled ? `${account.displayName} 계정을 다시 켰습니다.` : `${account.displayName} 계정을 껐습니다. 열려 있던 로그인도 끝났습니다.`)} className={action}><Power className="h-3.5 w-3.5" />{account.disabled ? "켜기" : "끄기"}</button>
                    <button type="button" disabled={busyId === account.id} onClick={() => void deleteAccount(account)} className={`${action} text-rose-600 hover:bg-rose-50 hover:text-rose-700`}><Trash2 className="h-3.5 w-3.5" />삭제</button>
                  </>}
                  {isMe && account.role === "owner" && <span className="px-2 py-1.5 text-xs text-slate-400">내 비밀번호는 왼쪽 메뉴에서</span>}
                </div>
              </div>
              {openForm?.id === account.id && openForm.kind === "password" && (
                <form onSubmit={(event) => resetPassword(event, account)} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
                  <label className="text-xs font-semibold text-slate-600">새 비밀번호 (8자 이상)<input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="mt-1 block h-10 w-56 px-3 text-sm" /></label>
                  <button disabled={busyId === account.id} className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-60">바꾸기</button>
                </form>
              )}
              {openForm?.id === account.id && openForm.kind === "role" && (
                <form onSubmit={(event) => changeRole(event, account)} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
                  <label className="text-xs font-semibold text-slate-600">새 역할<select name="role" value={roleDraft} onChange={(e) => setRoleDraft(e.target.value as Role)} className="mt-1 block h-10 w-40 px-3 text-sm">{roleChoices.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</select></label>
                  {roleDraft === "teacher" && <label className="text-xs font-semibold text-slate-600">소속 학교<select name="schoolId" required defaultValue={account.schoolId ?? ""} className="mt-1 block h-10 w-56 px-3 text-sm"><option value="" disabled>학교 선택</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.schoolName}</option>)}</select></label>}
                  <button disabled={busyId === account.id} className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-60">바꾸기</button>
                </form>
              )}
            </li>
          );
        })}</ul>
        </div>}

      <details className="rounded-2xl border border-slate-200 bg-white px-5 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">역할별로 할 수 있는 일</summary>
        <table className="mt-3 w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {ROLE_DUTY.map(([role, duty]) => <tr key={role}><th scope="row" className={`w-20 py-2.5 pr-4 text-left align-top font-semibold ${ROLE_TEXT[role]}`}>{ROLE_LABEL[role]}</th><td className="py-2.5 leading-relaxed text-slate-600">{duty}</td></tr>)}
          </tbody>
        </table>
      </details>
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
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
      <h2 className="font-display text-lg text-slate-900 sm:col-span-4">내 비밀번호 바꾸기</h2>
      <label className="text-xs font-semibold text-slate-700">현재 비밀번호<input name="currentPassword" type="password" required autoComplete="current-password" className="mt-1 block h-10 w-full px-3 text-sm" /></label>
      <label className="text-xs font-semibold text-slate-700">새 비밀번호 (8자 이상)<input name="newPassword" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="mt-1 block h-10 w-full px-3 text-sm" /></label>
      <label className="text-xs font-semibold text-slate-700">새 비밀번호 확인<input name="confirmPassword" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="mt-1 block h-10 w-full px-3 text-sm" /></label>
      <div className="flex items-end"><button disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />}바꾸기</button></div>
      {error && <p role="alert" className="text-sm text-rose-700 sm:col-span-4">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-700 sm:col-span-4">{notice}</p>}
    </form>
  );
}
