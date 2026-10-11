import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { BellOff, BellRing, KeyRound, Loader2 } from "lucide-react";
import { currentSubscription, disablePush, enablePush, getPushConfig, isIosBrowserTab, pushSupported } from "../utils/push";

interface MyReportToolsProps {
  /** 접수번호와 확인 코드로 다른 기기에서 접수한 신고를 불러온다. 성공하면 null, 실패하면 오류 문구 */
  onRecover: (reportId: string, code: string) => Promise<string | null>;
  /** 이 기기에 연결된 내 신고 수. 0 이면 알림을 켜도 받을 신고가 없다. */
  myReportCount: number;
}

/**
 * "내 신고" 탭 위의 도구 두 가지.
 *  - 다른 기기에서 접수한 신고 불러오기 (접수번호 + 확인 코드)
 *  - 처리 상태가 바뀌면 알림 받기 (서버에 VAPID 키가 있을 때만 보인다)
 */
export function MyReportTools({ onRecover, myReportCount }: MyReportToolsProps) {
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [reportId, setReportId] = useState("");
  const [code, setCode] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [recoverError, setRecoverError] = useState("");
  const [recoverNotice, setRecoverNotice] = useState("");

  const [pushAvailable, setPushAvailable] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getPushConfig().then(async (config) => {
      if (cancelled || !config.enabled) return;
      setPushAvailable(true);
      if (pushSupported()) {
        const subscription = await currentSubscription().catch(() => null);
        if (!cancelled) setPushOn(Boolean(subscription) && Notification.permission === "granted");
      }
    });
    return () => { cancelled = true; };
  }, []);

  const submitRecover = async (event: FormEvent) => {
    event.preventDefault();
    setRecovering(true); setRecoverError(""); setRecoverNotice("");
    const error = await onRecover(reportId.trim(), code.trim());
    setRecovering(false);
    if (error) {
      setRecoverError(error);
      return;
    }
    setRecoverNotice(`${reportId.trim().toUpperCase()} 신고를 이 기기에 연결했어요.`);
    setReportId(""); setCode("");
  };

  const togglePush = async () => {
    setPushBusy(true); setPushMessage("");
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        setPushMessage("이 기기의 알림을 껐어요.");
      } else {
        await enablePush();
        setPushOn(true);
        setPushMessage(myReportCount > 0 ? "처리 상태가 바뀌거나 학교 답변이 오면 이 기기로 알려 드릴게요." : "알림을 켰어요. 신고를 접수하면 그 신고부터 알려 드릴게요.");
      }
    } catch (err) {
      setPushMessage(err instanceof Error ? err.message : "알림을 설정하지 못했습니다.");
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="grid gap-3 md:grid-cols-2 print:hidden">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <button type="button" onClick={() => setRecoverOpen((open) => !open)} aria-expanded={recoverOpen} className="flex w-full items-center justify-between gap-2 text-left">
          <span className="flex items-center gap-2 text-sm font-bold text-slate-900"><KeyRound className="h-4 w-4 text-blue-700" />다른 기기에서 접수한 신고 불러오기</span>
          <span className="text-xs font-semibold text-blue-700">{recoverOpen ? "닫기" : "열기"}</span>
        </button>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">접수 완료 화면에 나온 <strong>접수번호</strong>와 <strong>확인 코드</strong>를 넣으면 이 기기에서도 처리 결과와 학교 답변을 볼 수 있어요.</p>
        {recoverOpen && (
          <form onSubmit={submitRecover} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <label className="text-xs font-semibold text-slate-600">접수번호
              <input value={reportId} onChange={(e) => setReportId(e.target.value)} required placeholder="REP-20261011-0001" autoComplete="off" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase" />
            </label>
            <label className="text-xs font-semibold text-slate-600">확인 코드
              <input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="ABCDE-FGHJK" autoComplete="off" spellCheck={false} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase" />
            </label>
            <div className="flex items-end">
              <button disabled={recovering} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{recovering && <Loader2 className="h-4 w-4 animate-spin" />}불러오기</button>
            </div>
            {recoverError && <p role="alert" className="text-xs text-rose-700 sm:col-span-3">{recoverError}</p>}
          </form>
        )}
        {recoverNotice && <p role="status" className="mt-2 text-xs font-semibold text-emerald-700">{recoverNotice}</p>}
      </section>

      {pushAvailable && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900">{pushOn ? <BellRing className="h-4 w-4 text-emerald-600" /> : <BellOff className="h-4 w-4 text-slate-400" />}처리 소식 알림</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">내 신고의 처리 상태가 바뀌거나 학교 답변이 오면 이 기기로 알려 드려요. 알림에는 접수번호만 나오고 신고 내용은 나오지 않아요.</p>
            </div>
            {pushSupported() && (
              <button type="button" onClick={() => void togglePush()} disabled={pushBusy} aria-pressed={pushOn} className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-60 ${pushOn ? "border border-slate-300 bg-white text-slate-700" : "bg-emerald-600 text-white"}`}>
                {pushBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{pushOn ? "알림 끄기" : "알림 켜기"}
              </button>
            )}
          </div>
          {!pushSupported() && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              {isIosBrowserTab() ? "iPhone·iPad 에서는 Safari 공유 버튼 → '홈 화면에 추가' 로 앱을 설치한 뒤 그 앱에서 알림을 켤 수 있어요." : "이 브라우저는 알림을 지원하지 않아요. 최신 Chrome·Edge·Firefox·Safari 에서 이용해 주세요."}
            </p>
          )}
          {pushMessage && <p role="status" className="mt-2 text-xs font-semibold text-slate-700">{pushMessage}</p>}
        </section>
      )}
    </div>
  );
}
