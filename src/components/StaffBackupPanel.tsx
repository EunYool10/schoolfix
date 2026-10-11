import { useCallback, useEffect, useRef, useState } from "react";
import { DatabaseBackup, Download, History, Loader2, RotateCcw, Upload } from "lucide-react";
import type { BackupFileInfo } from "../types";

interface Props {
  /** 되돌리기는 총괄만 할 수 있다. */
  isOwner: boolean;
  onRestored: () => void;
}

const KIND_LABEL: Record<string, string> = { auto: "매일 자동", manual: "직접 만든 백업", beforeRestore: "되돌리기 직전 상태" };

function formatSize(bytes: number | null) {
  if (bytes === null) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

function labelOf(name: string) {
  const [, file] = name.split("/");
  const stamp = file.replace(/\.json$/, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return stamp;
  const date = new Date(stamp.replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, "T$1:$2:$3Z"));
  return Number.isNaN(date.getTime()) ? stamp : date.toLocaleString("ko-KR");
}

/**
 * 관리자 전용 — 백업.
 *  - 매일 자동 백업(최근 30일)과 직접 만든 백업을 보관소에서 내려받는다.
 *  - 총괄은 보관 중인 백업이나 내려받아 둔 파일로 되돌릴 수 있다. 되돌리기 직전 상태도 자동으로 남는다.
 */
export function StaffBackupPanel({ isOwner, onRestored }: Props) {
  const [groups, setGroups] = useState<Record<string, BackupFileInfo[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/backups");
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "백업 목록을 불러오지 못했습니다.");
      setGroups(json.data ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "백업 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const createNow = async () => {
    setBusy("create"); setError(""); setNotice("");
    try {
      const res = await fetch("/api/staff/backups", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "백업을 만들지 못했습니다.");
      setNotice("지금 상태를 백업했습니다.");
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "백업을 만들지 못했습니다."); }
    finally { setBusy(null); }
  };

  const restore = async (body: Record<string, unknown>, label: string) => {
    if (!window.confirm(`${label} 시점으로 되돌릴까요?\n\n신고·학교 신청·등록 학교·검토 대상 기기·알림 설정이 그때 상태로 바뀝니다. 그 뒤에 들어온 신고와 처리 내용은 목록에서 사라집니다(되돌리기 직전 상태는 따로 백업되어 다시 되돌릴 수 있습니다).\n계정·로그인·학생 알림 구독은 바뀌지 않습니다.`)) return;
    setBusy("restore"); setError(""); setNotice("");
    try {
      const res = await fetch("/api/staff/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "되돌리지 못했습니다.");
      setNotice(`${label} 시점으로 되돌렸습니다 (신고 ${json.restored?.reports ?? 0}건). 되돌리기 직전 상태는 '되돌리기 직전 상태'에 남았습니다.`);
      await refresh();
      onRestored();
    } catch (err) { setError(err instanceof Error ? err.message : "되돌리지 못했습니다."); }
    finally { setBusy(null); }
  };

  const restoreFromFile = async (file: File) => {
    setError(""); setNotice("");
    try {
      const data = JSON.parse(await file.text());
      // 사진이 들어 있는 백업이면 사진 부분은 보내지 않는다(사진은 사진 저장소에 따로 있다).
      delete data.photos;
      delete data.missingPhotos;
      await restore({ data }, `파일 ${file.name}`);
    } catch {
      setError("백업 파일을 읽지 못했습니다. SchoolFix 에서 내려받은 JSON 파일인지 확인해주세요.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="flex items-center gap-2 font-bold text-slate-900"><DatabaseBackup className="h-5 w-5 text-blue-700" /> 백업</h2>
        <p className="text-sm leading-relaxed text-slate-600">
          매일 한 번 자동으로 모든 학교의 신고(처리 이력 포함)·학교 신청함·등록 학교·검토 대상 기기·알림 설정·계정 목록을 백업해 <strong>최근 30일치</strong>를 보관합니다.
          비밀번호·로그인 세션·학생 알림 구독은 넣지 않습니다. 파일에는 학교 신청자의 회신 이메일이 들어 있으니 내려받은 파일은 안전한 곳에 보관하세요.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void createNow()} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}지금 백업 만들기</button>
          <a href="/api/staff/backup" download className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700"><Download className="h-4 w-4" />지금 상태 내려받기</a>
          <a href="/api/staff/backup?photos=1" download className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700"><Download className="h-4 w-4" />사진까지 포함해 내려받기</a>
        </div>
        {isOwner && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-900">
            <p className="font-bold">총괄 전용 — 백업으로 되돌리기</p>
            <p className="mt-1 text-xs leading-relaxed">아래 목록의 '되돌리기'나, 내려받아 둔 백업 파일로 되돌릴 수 있습니다. 되돌리기 직전 상태는 자동으로 백업됩니다.</p>
            <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restoreFromFile(file); }} />
            <button type="button" disabled={busy !== null} onClick={() => fileInput.current?.click()} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-800 disabled:opacity-60"><Upload className="h-3.5 w-3.5" />백업 파일로 되돌리기</button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {busy === "restore" && <p className="text-sm text-slate-600"><Loader2 className="inline h-4 w-4 animate-spin" /> 되돌리는 중…</p>}

      {loading ? <p className="py-6 text-center text-sm text-slate-500"><Loader2 className="inline h-4 w-4 animate-spin" /> 불러오는 중</p> : (
        (["auto", "manual", "beforeRestore"] as const).map((group) => (
          <section key={group} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><History className="h-4 w-4" />{KIND_LABEL[group]} <span className="font-normal text-slate-500">{(groups[group] ?? []).length}개</span></h3>
            {(groups[group] ?? []).length === 0 ? <p className="mt-2 text-xs text-slate-500">{group === "auto" ? "아직 없습니다. 서버가 깨어 있을 때 하루 한 번 만들어집니다." : "없습니다."}</p> : (
              <ul className="mt-2 divide-y divide-slate-100">
                {(groups[group] ?? []).map((item) => (
                  <li key={item.name} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span><span className="font-semibold text-slate-800">{labelOf(item.name)}</span> <span className="text-xs text-slate-500">{formatSize(item.size)}</span></span>
                    <span className="flex gap-2">
                      <a href={`/api/staff/backups/file?name=${encodeURIComponent(item.name)}`} download className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700">내려받기</a>
                      {isOwner && <button type="button" disabled={busy !== null} onClick={() => void restore({ name: item.name }, labelOf(item.name))} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-60"><RotateCcw className="h-3.5 w-3.5" />되돌리기</button>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}
