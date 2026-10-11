import { useEffect, useRef, useState } from "react";
import { BellRing, HandHeart, ImagePlus, Loader2, MessageSquarePlus, MessageSquareReply, ThumbsDown, ThumbsUp, X } from "lucide-react";
import type { SchoolReport } from "../types";
import { getDeviceToken, loadMeTooIds, loadOwnerTokens, loadVerifyVotes, saveVerifyVote, setMeToo } from "../utils/clientTokens";
import { enablePush, getPushConfig, isIosBrowserTab, pushIsOn, pushSupported, syncPush } from "../utils/push";
import { feedbackPending } from "../utils/feedback";
import { formatBytes, preparePhoto, type PreparedPhoto } from "../utils/imageCompress";

/** 추가 설명 하나에 붙일 수 있는 사진 수 (서버 MAX_FOLLOWUP_PHOTOS 와 같아야 한다) */
const FOLLOWUP_MAX_PHOTOS = 3;
/** 신고 하나에 남길 수 있는 추가 설명 수 (서버 MAX_FOLLOWUPS 와 같아야 한다) */
const FOLLOWUP_MAX_COUNT = 10;

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
  // 확인 표로 신고가 다시 열리면 상태가 바뀌어 확인 상자가 사라진다. 안내는 여기서 이어서 보여 준다.
  const [reopened, setReopened] = useState(false);
  return (
    <div className="space-y-3">
      {reopened && (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm font-semibold text-amber-950">
          알려 줘서 고마워요. 아직 그대로라는 학생이 많아서 신고가 다시 ‘확인 중’으로 바뀌었어요.
        </p>
      )}
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
      {report.isMine && <FollowupBox report={report} schoolId={schoolId} onReportUpdated={onReportUpdated} />}
      {!report.isMine && report.status === "completed" && loadMeTooIds().has(report.id) && (
        <VerifyBox report={report} schoolId={schoolId} onReportUpdated={onReportUpdated} onReopened={() => setReopened(true)} />
      )}
      {report.status === "completed" && !(!report.isMine && loadMeTooIds().has(report.id)) && report.verification && report.verification.fixed + report.verification.notFixed > 0 && (
        <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
          같은 문제를 겪은 학생들의 확인 · 👍 고쳐졌어요 {report.verification.fixed} · 👎 아직 그대로예요 {report.verification.notFixed}
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
      // 알림이 켜져 있는 기기면 이 공감도 알림에 묶는다(처리 완료되면 "진짜 고쳐졌나요?" 를 묻는다).
      if (json.joined) void syncPush();
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
      {!compact && joined && <FixAlertOffer />}
      {error && <p role="alert" className="w-full text-xs text-rose-700">{error}</p>}
    </div>
  );
}

/** 공감한 뒤 — 알림이 꺼져 있으면 "고쳐지면 알려 드릴까요?" 를 묻는다. */
function FixAlertOffer() {
  const [state, setState] = useState<"hidden" | "offer" | "busy" | "on">("hidden");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const config = await getPushConfig();
      if (cancelled || !config.enabled || !pushSupported() || isIosBrowserTab()) return;
      setState((await pushIsOn()) ? "on" : "offer");
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === "hidden") return null;
  if (state === "on") return <p className="w-full text-[11px] font-semibold text-emerald-700">처리되면 이 기기로 알려 드릴게요. 정말 고쳐졌는지 확인해 주세요.</p>;
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy"); setMessage("");
          try { await enablePush(); setState("on"); } catch (err) { setState("offer"); setMessage(err instanceof Error ? err.message : "알림을 켜지 못했어요."); }
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 disabled:opacity-60"
      >
        {state === "busy" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />} 고쳐지면 알림 받기
      </button>
      {message && <span role="alert" className="text-[11px] text-rose-700">{message}</span>}
    </div>
  );
}

/**
 * "진짜 고쳐졌나요?" — 공감했던 신고가 처리 완료되면, 정말 고쳐졌는지 알려 준다.
 * 아직 그대로라는 학생이 충분히 모이면 서버가 신고를 다시 연다(reportVerify.ts).
 */
function VerifyBox({ report, schoolId, onReportUpdated, onReopened }: Props & { onReopened: () => void }) {
  const saved = loadVerifyVotes()[report.id];
  const [vote, setVote] = useState<boolean | null>(saved && saved.completedAt === (report.completedAt ?? null) ? saved.fixed : null);
  const [counts, setCounts] = useState(report.verification ?? { fixed: 0, notFixed: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (fixed: boolean) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(report.id)}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId, deviceToken: getDeviceToken(), fixed }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "응답을 저장하지 못했어요.");
      setVote(fixed);
      setCounts(json.verification);
      saveVerifyVote(report.id, { fixed, completedAt: report.completedAt ?? null, at: new Date().toISOString() });
      if (json.reopened) {
        onReopened();
        onReportUpdated?.({ ...report, status: "reviewing", completedAt: null, verification: null });
      } else {
        onReportUpdated?.({ ...report, verification: json.verification });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "응답을 저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div>
        <p className="text-sm font-bold text-emerald-950">같이 겪은 문제가 처리됐대요. 정말 고쳐졌나요?</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-emerald-900/80">‘나도 겪었어요’를 눌렀던 학생만 답할 수 있어요. ‘아직 그대로예요’가 2명 이상이고 ‘고쳐졌어요’보다 많으면 신고가 다시 열려요.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void send(true)} disabled={busy} aria-pressed={vote === true} className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold disabled:opacity-60 ${vote === true ? "bg-emerald-700 text-white" : "border border-emerald-300 bg-white text-emerald-800"}`}>
          <ThumbsUp className="h-4 w-4" /> 고쳐졌어요
        </button>
        <button type="button" onClick={() => void send(false)} disabled={busy} aria-pressed={vote === false} className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold disabled:opacity-60 ${vote === false ? "bg-amber-600 text-white" : "border border-amber-300 bg-white text-amber-800"}`}>
          <ThumbsDown className="h-4 w-4" /> 아직 그대로예요
        </button>
        {busy && <Loader2 className="h-4 w-4 self-center animate-spin text-emerald-700" />}
      </div>
      <p className="text-xs text-emerald-900">
        {vote === null ? "지금까지" : vote ? "고쳐졌다고 알려 줬어요. 바꾸려면 다른 쪽을 누르세요." : "아직 그대로라고 알려 줬어요. 바꾸려면 다른 쪽을 누르세요."} · 👍 {counts.fixed} · 👎 {counts.notFixed}
      </p>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}

/**
 * 추가 설명 — 신고한 학생이 접수 뒤에 설명이나 사진을 덧붙인다.
 * 학교 답변에 이어 "아직 그대로예요" 같은 내용을 사진과 함께 보낼 수 있다. 신고한 나와 학교만 본다.
 */
function FollowupBox({ report, schoolId, onReportUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const followups = report.followups ?? [];
  const full = followups.length >= FOLLOWUP_MAX_COUNT;

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    const room = FOLLOWUP_MAX_PHOTOS - photos.length;
    if (room <= 0) { setError(`사진은 ${FOLLOWUP_MAX_PHOTOS}장까지 붙일 수 있어요.`); return; }
    setPreparing(true);
    try {
      const prepared: PreparedPhoto[] = [];
      for (const file of Array.from(files).slice(0, room)) prepared.push(await preparePhoto(file));
      setPhotos((current) => [...current, ...prepared].slice(0, FOLLOWUP_MAX_PHOTOS));
      if (files.length > room) setError(`사진은 ${FOLLOWUP_MAX_PHOTOS}장까지 붙일 수 있어 앞의 ${room}장만 넣었어요.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "사진을 준비하지 못했어요.");
    } finally {
      setPreparing(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const submit = async () => {
    if (busy) return;
    if (text.trim().length < 2) { setError("설명을 2자 이상 적어 주세요."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(report.id)}/followups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId, tokens: loadOwnerTokens(), text: text.trim(), photos: photos.map((photo) => ({ dataUrl: photo.dataUrl, name: photo.name })) }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "추가 설명을 보내지 못했어요.");
      setText(""); setPhotos([]); setOpen(false);
      setNotice("추가 설명을 보냈어요. 학교에서 확인할게요.");
      onReportUpdated?.(json.data as SchoolReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "추가 설명을 보내지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {followups.length > 0 && (
        <div className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><MessageSquarePlus className="h-3.5 w-3.5 text-violet-600" /> 내가 덧붙인 설명 <span className="font-normal text-slate-400">· 나와 학교만 보여요</span></span>
          {followups.map((followup) => (
            <div key={followup.id} className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950">
              <p className="text-[11px] text-violet-700">{new Date(followup.at).toLocaleString("ko-KR")}{followup.photoCount ? ` · 사진 ${followup.photoCount}장` : ""}</p>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed">{followup.text}</p>
            </div>
          ))}
        </div>
      )}
      {notice && <p role="status" className="text-xs font-semibold text-emerald-700">{notice}</p>}
      {!open ? (
        !full && (
          <button type="button" onClick={() => { setOpen(true); setNotice(""); }} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-800 hover:bg-violet-50">
            <MessageSquarePlus className="h-4 w-4" /> 설명·사진 덧붙이기
          </button>
        )
      ) : (
        <div className="space-y-2 rounded-xl border border-violet-200 bg-white p-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={3} placeholder="예: 답변 고마워요. 아직 물이 새고 있어서 사진을 더 보내요." className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
          {photos.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {photos.map((photo) => (
                <li key={photo.key} className="relative">
                  <img src={photo.dataUrl} alt={photo.name} className="h-16 w-16 rounded-lg object-cover" />
                  <button type="button" onClick={() => setPhotos((current) => current.filter((item) => item.key !== photo.key))} aria-label={`${photo.name} 빼기`} className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-900 p-0.5 text-white"><X className="h-3 w-3" /></button>
                  <span className="mt-0.5 block text-center text-[10px] text-slate-500">{formatBytes(photo.size)}</span>
                </li>
              ))}
            </ul>
          )}
          <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void addFiles(event.target.files)} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fileInput.current?.click()} disabled={preparing || photos.length >= FOLLOWUP_MAX_PHOTOS} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
              {preparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} 사진 ({photos.length}/{FOLLOWUP_MAX_PHOTOS})
            </button>
            <button type="button" onClick={() => void submit()} disabled={busy || preparing} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} 보내기
            </button>
            <button type="button" onClick={() => { setOpen(false); setError(""); }} className="text-xs font-semibold text-slate-500">취소</button>
          </div>
          <p className="text-[11px] text-slate-500">이름·연락처 같은 개인정보는 적지 마세요. 부적절한 내용은 학교가 확인한 뒤 처리합니다.</p>
        </div>
      )}
      {full && <p className="text-[11px] text-slate-500">추가 설명은 신고 하나에 {FOLLOWUP_MAX_COUNT}번까지 남길 수 있어요.</p>}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
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
