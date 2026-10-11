import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Crown, KeyRound, Loader2, Power, Trash2, UserCog, UserPlus } from "lucide-react";
import type { StaffAccountInfo } from "../types";

type Role = StaffAccountInfo["role"];

const ROLE_LABEL: Record<Role, string> = { owner: "총괄", admin: "관리자", staff: "운영진", teacher: "교사" };
const ROLE_ORDER: Record<Role, number> = { owner: 0, admin: 1, staff: 2, teacher: 3 };
const ROLE_BADGE: Record<Role, string> = {
  owner: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
  admin: "bg-violet-100 text-violet-800",
  staff: "bg-slate-100 text-slate-700",
  teacher: "bg-blue-100 text-blue-800",
};

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
  const owner = accounts.find((account) => account.role === "owner") ?? null;
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
    <div className="space-y-4">
      {ownerExists && owner ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
          <Crown className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p>
            <strong>총괄: {owner.displayName}</strong> <span className="font-mono text-xs">({owner.username})</span> — 모든 계정 위에 있는 1인자입니다.
            총괄 계정은 다른 누구도 바꾸거나 끄거나 지울 수 없고, 관리자 계정을 만들고 바꾸는 일은 총괄만 합니다.
            {isOwnerViewer ? " 총괄을 다른 사람에게 넘기려면 그 사람 계정의 '총괄 넘기기'를 누르세요." : ""}
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm leading-relaxed text-amber-950">
          <Crown className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p>
            <strong>총괄이 아직 없습니다.</strong> 모든 권한 위에 있는 1인자를 정하려면 그 사람 계정의 <strong>'총괄로 지정'</strong>을 누르세요.
            지정한 뒤에는 총괄 계정을 아무도 바꿀 수 없고, 총괄 자리는 총괄 본인만 넘길 수 있습니다.
          </p>
        </div>
      )}

      <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600">
        사람마다 개인 계정을 만들면 처리 이력에 <strong>누가 바꿨는지 이름</strong>이 남고, 담당자가 바뀌면 그 계정만 끄면 됩니다.
        <strong> 총괄</strong>은 모든 권한과 관리자 계정 관리를, <strong>관리자</strong>는 운영진·교사 계정 관리와 전체 백업을, <strong>운영진</strong>은 모든 학교의 신고 처리를, <strong>교사</strong>는 소속 학교 신고만 처리합니다.
        {masterConfigured && " 공용 비밀번호(아이디 admin)로 들어오면 관리자 권한입니다."}
      </p>

      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

      <form onSubmit={createAccount} className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 sm:col-span-2 lg:col-span-3"><UserPlus className="h-4 w-4" /> 새 계정 만들기</h2>
        <label className="text-xs font-semibold text-slate-700">아이디 (영문 소문자·숫자)<input name="username" required pattern="[a-z0-9][a-z0-9._\-]{2,31}" autoComplete="off" placeholder="예: kim.teacher" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm" /></label>
        <label className="text-xs font-semibold text-slate-700">이름 (처리 이력에 표시)<input name="displayName" required maxLength={40} placeholder="예: 김선생 (행정실)" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-700">처음 비밀번호 (8자 이상)<input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-700">역할<select name="role" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{creatableRoles.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</select></label>
        {newRole === "teacher" && <label className="text-xs font-semibold text-slate-700">소속 학교<select name="schoolId" required defaultValue="" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="" disabled>학교 선택</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.schoolName}</option>)}</select></label>}
        <div className="flex items-end"><button disabled={busyId === "new"} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{busyId === "new" && <Loader2 className="h-4 w-4 animate-spin" />}계정 만들기</button></div>
        {!creatableRoles.includes("admin") && <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-3">관리자 계정은 총괄만 만들 수 있습니다.</p>}
      </form>

      {loading ? <p className="py-8 text-center text-sm text-slate-500"><Loader2 className="inline h-4 w-4 animate-spin" /> 불러오는 중</p>
        : accounts.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">아직 만든 개인 계정이 없습니다.</p>
        : <ul className="space-y-2">{sorted.map((account) => {
          const isMe = viewer.accountId === account.id;
          const manageable = canManage(viewer.role, account, ownerExists) && !isMe;
          const canAssign = account.role !== "owner" && !account.disabled && (ownerExists ? isOwnerViewer : true);
          const roleChoices = assignableRoles(viewer.role, ownerExists);
          return (
            <li key={account.id} className={`rounded-xl border bg-white p-4 ${account.role === "owner" ? "border-amber-300 shadow-[0_0_0_3px_rgba(251,191,36,0.15)]" : "border-slate-200"} ${account.disabled ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    {account.role === "owner" && <Crown className="h-4 w-4 text-amber-500" aria-hidden />}
                    <strong className="text-slate-900">{account.displayName}</strong>
                    <span className="font-mono text-xs text-slate-500">{account.username}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${ROLE_BADGE[account.role]}`}>{ROLE_LABEL[account.role]}{account.role === "teacher" ? ` · ${schoolName(account.schoolId)}` : ""}</span>
                    {isMe && <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">나</span>}
                    {account.disabled && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">사용 중지</span>}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">마지막 로그인 {account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString("ko-KR") : "없음"} · 만든 날 {new Date(account.createdAt).toLocaleDateString("ko-KR")}</p>
                  {account.role === "owner" && isMe && <p className="mt-1 text-xs text-amber-800">내 비밀번호는 위쪽 '내 비밀번호'에서 바꿀 수 있습니다.</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canAssign && <button type="button" disabled={busyId === account.id} onClick={() => void assignOwner(account)} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900"><Crown className="h-3.5 w-3.5" />{ownerExists ? "총괄 넘기기" : "총괄로 지정"}</button>}
                  {manageable && <>
                    <button type="button" disabled={busyId === account.id} onClick={() => { setRoleDraft(account.role); setOpenForm(openForm?.id === account.id && openForm.kind === "role" ? null : { id: account.id, kind: "role" }); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700"><UserCog className="h-3.5 w-3.5" />역할 바꾸기</button>
                    <button type="button" disabled={busyId === account.id} onClick={() => setOpenForm(openForm?.id === account.id && openForm.kind === "password" ? null : { id: account.id, kind: "password" })} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700"><KeyRound className="h-3.5 w-3.5" />비밀번호 재설정</button>
                    <button type="button" disabled={busyId === account.id} onClick={() => void patchAccount(account, { disabled: !account.disabled }, account.disabled ? `${account.displayName} 계정을 다시 켰습니다.` : `${account.displayName} 계정을 껐습니다. 열려 있던 로그인도 끝났습니다.`)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700"><Power className="h-3.5 w-3.5" />{account.disabled ? "다시 켜기" : "사용 중지"}</button>
                    <button type="button" disabled={busyId === account.id} onClick={() => void deleteAccount(account)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-700"><Trash2 className="h-3.5 w-3.5" />삭제</button>
                  </>}
                </div>
              </div>
              {openForm?.id === account.id && openForm.kind === "password" && (
                <form onSubmit={(event) => resetPassword(event, account)} className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
                  <label className="text-xs font-semibold text-slate-700">새 비밀번호 (8자 이상)<input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="mt-1 block w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
                  <button disabled={busyId === account.id} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">바꾸기</button>
                </form>
              )}
              {openForm?.id === account.id && openForm.kind === "role" && (
                <form onSubmit={(event) => changeRole(event, account)} className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
                  <label className="text-xs font-semibold text-slate-700">새 역할<select name="role" value={roleDraft} onChange={(e) => setRoleDraft(e.target.value as Role)} className="mt-1 block w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{roleChoices.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</select></label>
                  {roleDraft === "teacher" && <label className="text-xs font-semibold text-slate-700">소속 학교<select name="schoolId" required defaultValue={account.schoolId ?? ""} className="mt-1 block w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="" disabled>학교 선택</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.schoolName}</option>)}</select></label>}
                  <button disabled={busyId === account.id} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">바꾸기</button>
                </form>
              )}
            </li>
          );
        })}</ul>}
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
