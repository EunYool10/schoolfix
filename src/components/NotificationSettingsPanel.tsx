import { useEffect, useState } from "react";
import { BellRing, Loader2, Send } from "lucide-react";
import { monthKey, shiftMonth } from "../utils/monthlyStats";

interface NotificationState {
  channel: "discord" | "slack" | "webhook" | null;
  minRisk: string;
  linkConfigured: boolean;
  urgent: boolean;
  applications: boolean;
  monthly: boolean;
  lastMonthlyReport: string | null;
}

const CHANNEL_LABEL: Record<NonNullable<NotificationState["channel"]>, string> = {
  discord: "Discord",
  slack: "Slack",
  webhook: "일반 웹훅",
};

function monthLabel(month: string) {
  const [y, m] = month.split("-");
  return `${y}년 ${Number(m)}월`;
}

interface Props {
  schoolId: string;
  schoolName: string;
}

/**
 * 운영진 화면 "알림" 탭.
 * 웹훅 주소는 서버 환경변수(NOTIFY_WEBHOOK_URL)에만 두고, 여기서는 연결 상태 확인·알림 종류 선택·테스트만 한다.
 */
export function NotificationSettingsPanel({ schoolId, schoolName }: Props) {
  const [state, setState] = useState<NotificationState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const previousMonth = shiftMonth(monthKey(new Date().toISOString()) as string, -1);
  const [month, setMonth] = useState(previousMonth);
  const [scope, setScope] = useState<"school" | "all">("school");
  const monthOptions = Array.from({ length: 12 }, (_, i) => shiftMonth(previousMonth, 1 - i));

  const load = async () => {
    try {
      const res = await fetch("/api/staff/notifications");
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "알림 설정을 불러오지 못했습니다.");
      setState(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알림 설정을 불러오지 못했습니다.");
    }
  };

  useEffect(() => { void load(); }, []);

  const run = async (key: string, request: () => Promise<Response>, success: string) => {
    setBusy(key); setError(""); setNotice("");
    try {
      const res = await request();
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "요청을 처리하지 못했습니다.");
      setNotice(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청을 처리하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (key: "urgent" | "applications" | "monthly", value: boolean) => {
    if (!state) return;
    const previous = state;
    setState({ ...state, [key]: value });
    setBusy(key); setError(""); setNotice("");
    try {
      const res = await fetch("/api/staff/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: value }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "설정을 저장하지 못했습니다.");
    } catch (err) {
      setState(previous);
      setError(err instanceof Error ? err.message : "설정을 저장하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  if (!state) {
    return error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : <p className="py-10 text-center text-sm text-slate-500"><Loader2 className="inline h-4 w-4 animate-spin" /> 불러오는 중</p>;
  }

  const connected = state.channel !== null;
  const items: { key: "urgent" | "applications" | "monthly"; title: string; description: string }[] = [
    { key: "urgent", title: "긴급 신고 알림", description: `위험도 "${state.minRisk}" 이상인 신고가 접수되면 바로 알립니다. 기준은 NOTIFY_MIN_RISK 환경변수로 바꿀 수 있습니다.` },
    { key: "applications", title: "학교 신청 메일함 알림", description: "새 학교 추가 신청이 들어오면 알립니다. 회신 이메일은 개인정보라 메시지에 넣지 않습니다." },
    { key: "monthly", title: "월간 보고 자동 발송", description: "매달 1일 오전 9시 이후(한국 시간) 지난달 학교별 통계를 한 번 보냅니다. 서버가 잠들어 있었다면 깨어날 때 보냅니다." },
  ];

  return (
    <div className="space-y-4">
      <section className={`rounded-2xl border p-5 ${connected ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BellRing className={`h-6 w-6 ${connected ? "text-emerald-700" : "text-amber-700"}`} />
            <div>
              <h2 className="font-bold text-slate-900">{connected ? `${CHANNEL_LABEL[state.channel!]}에 연결됨` : "알림 채널이 연결되지 않았습니다"}</h2>
              <p className="text-sm text-slate-600">
                {connected ? "웹훅 주소는 서버 환경변수에만 저장되며 이 화면에는 표시하지 않습니다." : "Render → Environment 에 NOTIFY_WEBHOOK_URL(디스코드 웹훅 주소)을 추가하고 다시 배포하세요."}
              </p>
            </div>
          </div>
          <button type="button" disabled={!connected || busy !== null} onClick={() => run("test", () => fetch("/api/staff/notifications/test", { method: "POST" }), "테스트 알림을 보냈습니다. 디스코드 채널을 확인해 보세요.")} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} 테스트 알림 보내기
          </button>
        </div>
        {connected && !state.linkConfigured && <p className="mt-3 text-xs text-slate-600">PUBLIC_BASE_URL 을 설정하면 알림 메시지에 사이트 주소가 함께 붙습니다.</p>}
      </section>

      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

      <section className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {items.map((item) => (
          <label key={item.key} className="flex cursor-pointer items-start justify-between gap-4 p-4">
            <span>
              <span className="block text-sm font-bold text-slate-900">{item.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{item.description}</span>
              {item.key === "monthly" && state.lastMonthlyReport && <span className="mt-1 block text-xs text-slate-500">마지막 자동 발송: {monthLabel(state.lastMonthlyReport)} 보고</span>}
            </span>
            <input type="checkbox" role="switch" checked={state[item.key]} disabled={busy === item.key} onChange={(e) => void toggle(item.key, e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-blue-700" />
          </label>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-900">월간 보고 지금 보내기</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" aria-label="보낼 달">
            {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <select value={scope} onChange={(e) => setScope(e.target.value as "school" | "all")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" aria-label="대상 학교">
            <option value="school">{schoolName}만</option>
            <option value="all">전체 학교</option>
          </select>
          <button type="button" disabled={!connected || busy !== null} onClick={() => run("monthly-send", () => fetch("/api/staff/notifications/monthly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, schoolId: scope === "school" ? schoolId : undefined }) }), `${monthLabel(month)} 월간 보고를 보냈습니다.`)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
            {busy === "monthly-send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} 디스코드로 보내기
          </button>
        </div>
      </section>
    </div>
  );
}
