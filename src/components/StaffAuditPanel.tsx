import { useCallback, useEffect, useState } from "react";
import { Loader2, ScrollText } from "lucide-react";
import type { AuditEntryInfo } from "../types";

/** 서버(auditLog.ts)와 같은 표시 이름. 모르는 항목은 원래 이름을 보여 준다. */
const ACTION_LABEL: Record<string, string> = {
  login: "로그인",
  "account.create": "계정 만듦",
  "account.update": "계정 바꿈",
  "account.disable": "계정 사용 중지",
  "account.enable": "계정 다시 켬",
  "account.password_reset": "비밀번호 재설정",
  "account.delete": "계정 삭제",
  "account.password_change": "내 비밀번호 변경",
  "owner.designate": "총괄 지정",
  "owner.transfer": "총괄 넘김",
  "owner.reset": "총괄 비상 복구",
  "report.delete": "신고 삭제",
  "report.spam": "장난 신고 처리",
  "report.reject": "검토 대기 신고 삭제",
  "report.approve": "검토 대기 신고 공개",
  "report.restore": "삭제한 신고 되살림",
  "report.purge": "신고 영구 삭제",
  "backup.create": "백업 만듦",
  "backup.auto": "자동 백업",
  "backup.download": "백업 내려받음",
  "backup.restore": "백업으로 되돌림",
  "school.register": "학교 등록",
  "school.stop": "학교 지원 중지",
  "device.unblock": "검토 대상 기기 해제",
  "settings.notifications": "알림 설정 변경",
};
const ROLE_LABEL: Record<string, string> = { owner: "총괄", admin: "관리자", staff: "운영진", teacher: "교사" };
const CATEGORIES: Array<[string, string]> = [["all", "전체"], ["report", "신고 삭제·복구"], ["account", "계정·총괄"], ["backup", "백업"], ["login", "로그인"], ["etc", "기타"]];

function tone(action: string) {
  if (action === "report.purge" || action === "backup.restore" || action.startsWith("owner.")) return "bg-rose-100 text-rose-800";
  if (action.startsWith("report.")) return "bg-amber-100 text-amber-900";
  if (action.startsWith("account.")) return "bg-violet-100 text-violet-800";
  if (action.startsWith("backup.")) return "bg-blue-100 text-blue-800";
  return "bg-slate-100 text-slate-700";
}

/** 관리자 전용 — 운영 기록. 누가 언제 무엇을 했는지 최근 것부터 보여 준다. */
export function StaffAuditPanel() {
  const [category, setCategory] = useState("all");
  const [entries, setEntries] = useState<AuditEntryInfo[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (before: string | null) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ category, limit: "100" });
      if (before) params.set("before", before);
      const res = await fetch(`/api/staff/audit?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "운영 기록을 불러오지 못했습니다.");
      const page: AuditEntryInfo[] = Array.isArray(json.data) ? json.data : [];
      setEntries((current) => (before ? [...current, ...page] : page));
      setHasMore(Boolean(json.hasMore));
    } catch (err) {
      setError(err instanceof Error ? err.message : "운영 기록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => { void load(null); }, [load]);

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600">
        <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <span>운영진·교사가 한 중요한 일(로그인, 계정 변경, 총괄 지정, 신고 삭제·복구, 백업 등)을 최근 1,000건까지 남깁니다. 학생 정보는 기록하지 않습니다. 이 기능이 생기기 전의 일은 남아 있지 않습니다.</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(([value, label]) => (
          <button key={value} type="button" onClick={() => setCategory(value)} aria-pressed={category === value} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${category === value ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{label}</button>
        ))}
      </div>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {entries.length === 0 && !loading ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">기록이 없습니다.</p> : (
        <ol className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 text-sm">
              <span className="w-36 shrink-0 font-mono text-xs text-slate-500">{new Date(entry.at).toLocaleString("ko-KR")}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone(entry.action)}`}>{ACTION_LABEL[entry.action] ?? entry.action}</span>
              <span className="font-semibold text-slate-800">{entry.actor ? `${entry.actor.name} (${ROLE_LABEL[entry.actor.role] ?? entry.actor.role})` : "시스템"}</span>
              {entry.target && <span className="font-mono text-xs text-slate-600">{entry.target}</span>}
              {entry.detail && <span className="w-full text-xs text-slate-500 sm:w-auto">{entry.detail}</span>}
            </li>
          ))}
        </ol>
      )}
      {loading && <p className="py-4 text-center text-sm text-slate-500"><Loader2 className="inline h-4 w-4 animate-spin" /> 불러오는 중</p>}
      {hasMore && !loading && <button type="button" onClick={() => void load(entries[entries.length - 1]?.at ?? null)} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-700">더 보기</button>}
    </div>
  );
}
