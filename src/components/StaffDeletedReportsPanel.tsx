import { useCallback, useEffect, useState } from "react";
import { ArchiveRestore, Loader2, Trash2 } from "lucide-react";
import type { DeletedReportInfo } from "../types";

const ROLE_LABEL: Record<string, string> = { owner: "총괄", admin: "관리자", staff: "운영진", teacher: "교사" };

interface Props {
  schoolId: string;
  schoolName: string;
  /** 영구 삭제는 개인 계정으로만 할 수 있다. */
  canPurge: boolean;
  onRestored: () => void;
}

/**
 * 관리자 전용 — 삭제된 신고(휴지통).
 * 누가 언제 왜 지웠는지 보여 주고, 되살리거나(사진은 30일 안에만) 완전히 지울 수 있다.
 */
export function StaffDeletedReportsPanel({ schoolId, schoolName, canPurge, onRestored }: Props) {
  const [items, setItems] = useState<DeletedReportInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/staff/deleted-reports?schoolId=${encodeURIComponent(schoolId)}`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "삭제된 신고를 불러오지 못했습니다.");
      setItems(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제된 신고를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const act = async (item: DeletedReportInfo, kind: "restore" | "purge") => {
    if (kind === "restore" && !window.confirm(`${item.id} 신고를 되살릴까요? 공개 목록에 다시 나타납니다.`)) return;
    if (kind === "purge" && !window.confirm(`${item.id} 신고를 영구 삭제할까요?\n\n저장소에서 글과 사진을 완전히 지우며 되돌릴 수 없습니다. 개인정보 삭제 요청을 처리할 때만 쓰세요.`)) return;
    setBusyId(item.id); setError(""); setNotice("");
    try {
      const url = kind === "restore"
        ? `/api/staff/reports/${encodeURIComponent(item.id)}/restore?schoolId=${encodeURIComponent(schoolId)}`
        : `/api/staff/deleted-reports/${encodeURIComponent(item.id)}?schoolId=${encodeURIComponent(schoolId)}`;
      const res = await fetch(url, { method: kind === "restore" ? "POST" : "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "처리하지 못했습니다.");
      setNotice(kind === "restore" ? `${item.id} 신고를 되살렸습니다.` : `${item.id} 신고를 영구 삭제했습니다.`);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (kind === "restore") onRestored();
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600">
        <strong>{schoolName}</strong>에서 삭제한 신고입니다. 삭제·장난 신고 처리·검토 후 삭제한 신고가 모두 여기 남습니다.
        <strong> 되살리면</strong> 공개 목록에 다시 나타나고, 사진은 삭제 후 30일 안에 되살려야 함께 돌아옵니다.
        <strong> 영구 삭제</strong>는 글과 사진을 저장소에서 완전히 지우며 되돌릴 수 없습니다.
      </p>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {loading ? <p className="py-8 text-center text-sm text-slate-500"><Loader2 className="inline h-4 w-4 animate-spin" /> 불러오는 중</p>
        : items.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">삭제된 신고가 없습니다.</p>
        : items.map((item) => (
          <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 text-sm">
                <p className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-slate-500">{item.id}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{item.location} · {item.category}</span></p>
                <p className="mt-1 font-bold text-slate-900">{item.title || "시설 문제 신고"}</p>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-slate-700">{item.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busyId === item.id} onClick={() => void act(item, "restore")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"><ArchiveRestore className="h-3.5 w-3.5" />되살리기</button>
                <button type="button" disabled={busyId === item.id || !canPurge} title={canPurge ? undefined : "영구 삭제는 개인 계정으로 로그인해야 할 수 있습니다"} onClick={() => void act(item, "purge")} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-60"><Trash2 className="h-3.5 w-3.5" />영구 삭제</button>
              </div>
            </div>
            <dl className="mt-3 grid gap-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
              <div><dt className="inline font-semibold text-slate-700">삭제한 사람 </dt><dd className="inline">{item.deletedBy ? `${item.deletedBy.name} (${ROLE_LABEL[item.deletedBy.role] ?? item.deletedBy.role})` : "기록 없음 (이 기능 전에 삭제)"}</dd></div>
              <div><dt className="inline font-semibold text-slate-700">삭제한 때 </dt><dd className="inline">{new Date(item.deletedAt).toLocaleString("ko-KR")}</dd></div>
              <div className="sm:col-span-2"><dt className="inline font-semibold text-slate-700">사유 </dt><dd className="inline">{item.deleteReason ?? "기록 없음"}</dd></div>
              <div className="sm:col-span-2"><dt className="inline font-semibold text-slate-700">사진 </dt><dd className="inline">{item.photoCount > 0 ? `${item.photoCount}장 · ${item.photosKeptUntil ? `${new Date(item.photosKeptUntil).toLocaleDateString("ko-KR")}까지 보관` : ""}` : "없음 (또는 보관 기간이 지나 지워짐)"}</dd></div>
              <div><dt className="inline font-semibold text-slate-700">접수 </dt><dd className="inline">{new Date(item.createdAt).toLocaleString("ko-KR")}</dd></div>
            </dl>
          </article>
        ))}
    </div>
  );
}
