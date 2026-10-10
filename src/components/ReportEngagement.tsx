import { useState } from "react";
import { HandHeart, Loader2, MessageSquareReply, ThumbsDown, ThumbsUp } from "lucide-react";
import type { SchoolReport } from "../types";
import { getDeviceToken, loadMeTooIds, loadOwnerTokens, setMeToo } from "../utils/clientTokens";
import { feedbackPending } from "../utils/feedback";

interface Props {
  report: SchoolReport;
  schoolId: string;
  onReportUpdated?: (report: SchoolReport) => void;
}

/**
 * 신고 상세 창의 학생 참여 영역.
 *  - "나도 겪었어요": 같은 문제를 겪은 학생이 새 신고 대신 공감한다.
 *  - 학교의 답변: 신고한 학생에게만 보이는 답변 (서버가 "내 신고" 에만 내려준다)
 *  - 만족도 확인: 처리 완료된 내 신고가 정말 해결됐는지 묻는다. 아니면 다시 확인 중으로 돌아간다.
 */
export function ReportEngagement({ report, schoolId, onReportUpdated }: Props) {
  return (
    <div className="space-y-3">
      {report.reporterReply && (
        <div className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <MessageSquareReply className="h-3.5 w-3.5 text-blue-600" /> 학교의 답변
            <span className="font-normal text-slate-400">· 신고한 나에게만 보여요</span>
          </span>
          <div className="whitespace-pre-wrap rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-sm leading-relaxed text-blue-950">
            {report.reporterReply}
          </div>
        </div>
      )}
      {report.isMine && feedbackPending(report) && (
        <FeedbackBox report={report} schoolId={schoolId} onReportUpdated={onReportUpdated} />
      )}
      {report.feedback && report.isMine && !feedbackPending(report) && (
        <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
          {report.feedback.resolved ? "👍 해결됐다고 응답했어요. 알려주셔서 고마워요." : "다시 확인해 달라고 응답했어요. 담당자가 다시 살펴봅니다."}
        </p>
      )}
      {!report.isMine && report.moderationStatus !== "held" && report.status !== "completed" && (
        <MeTooButton report={report} schoolId={schoolId} onReportUpdated={onReportUpdated} />
      )}
    </div>
  );
}

export function MeTooButton({ report, schoolId, onReportUpdated, compact = false }: Props & { compact?: boolean }) {
  const [joined, setJoined] = useState(() => loadMeTooIds().has(report.id));
  const [count, setCount] = useState(report.meTooCount ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(report.id)}/me-too`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId, deviceToken: getDeviceToken(), action: joined ? "remove" : "add" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "공감을 저장하지 못했습니다.");
      setJoined(json.joined);
      setCount(json.meTooCount);
      setMeToo(report.id, json.joined);
      onReportUpdated?.({ ...report, meTooCount: json.meTooCount });
    } catch (err) {
      setError(err instanceof Error ? err.message : "공감을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3"}>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={joined}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold transition disabled:opacity-60 ${joined ? "bg-rose-600 text-white hover:bg-rose-700" : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"}`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandHeart className="h-4 w-4" />}
        {joined ? "나도 겪었어요 ✓" : "나도 겪었어요"}
        <span className="tabular-nums">{count}</span>
      </button>
      {!compact && (
        <p className="text-[11px] leading-relaxed text-slate-500">
          같은 문제를 겪었다면 새로 신고하지 말고 눌러 주세요. 많은 학생이 겪는 문제를 먼저 확인할 수 있어요.
        </p>
      )}
      {error && <p role="alert" className="w-full text-xs text-rose-700">{error}</p>}
    </div>
  );
}

function FeedbackBox({ report, schoolId, onReportUpdated }: Props) {
  const [choice, setChoice] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (resolved: boolean) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(report.id)}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId, tokens: loadOwnerTokens(), resolved, comment: comment.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "응답을 저장하지 못했습니다.");
      onReportUpdated?.(json.data as SchoolReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "응답을 저장하지 못했습니다.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <p className="text-sm font-bold text-emerald-950">처리 완료된 내 신고예요. 문제가 정말 해결됐나요?</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setChoice(true)}
          aria-pressed={choice === true}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold ${choice === true ? "bg-emerald-700 text-white" : "border border-emerald-300 bg-white text-emerald-800"}`}
        >
          <ThumbsUp className="h-4 w-4" /> 해결됐어요
        </button>
        <button
          type="button"
          onClick={() => setChoice(false)}
          aria-pressed={choice === false}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold ${choice === false ? "bg-amber-600 text-white" : "border border-amber-300 bg-white text-amber-800"}`}
        >
          <ThumbsDown className="h-4 w-4" /> 아직 그대로예요
        </button>
      </div>
      {choice !== null && (
        <>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder={choice ? "남기고 싶은 말이 있다면 적어 주세요 (선택)" : "어떤 점이 아직 그대로인지 알려 주세요 (선택)"}
            className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => submit(choice)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} 응답 보내기
            </button>
            {choice === false && <span className="text-[11px] text-amber-800">보내면 신고가 다시 "확인 중" 상태가 돼요.</span>}
          </div>
        </>
      )}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
