import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Sparkles } from "lucide-react";
import { preparePhoto, type PreparedPhoto } from "../utils/imageCompress";
import type { RedactBox } from "../utils/redact";

/** 서버(photoDraft.ts)가 돌려주는 초안 */
export interface PhotoDraftResult {
  isFacilityIssue: boolean;
  title: string | null;
  location: string | null;
  category: string | null;
  description: string | null;
  hasPeople: boolean;
  faces: RedactBox[];
  message: string | null;
}

interface Props {
  schoolId: string;
  /** 사진 칸이 다 찼으면 쓸 수 없다 */
  disabled: boolean;
  onDraft: (draft: PhotoDraftResult, photo: PreparedPhoto) => void | Promise<void>;
  onAttachOnly: (photo: PreparedPhoto) => void;
}

let featuresPromise: Promise<{ photoDraft: boolean }> | null = null;
function loadFeatures() {
  featuresPromise ??= fetch("/api/features")
    .then((res) => res.json())
    .then((json) => ({ photoDraft: Boolean(json?.photoDraft) }))
    .catch(() => ({ photoDraft: false }));
  return featuresPromise;
}

/**
 * 사진 한 장으로 시작하기 — 사진을 찍거나 고르면 AI 가 장소·문제 종류·설명 초안을 채운다.
 * 서버에 AI 키가 없으면 보이지 않는다.
 */
export function PhotoStartCard({ schoolId, disabled, onDraft, onAttachOnly }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [notIssue, setNotIssue] = useState<{ photo: PreparedPhoto; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void loadFeatures().then((features) => { if (!cancelled) setEnabled(features.photoDraft); });
    return () => { cancelled = true; };
  }, []);

  if (!enabled) return null;

  const run = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    setError(""); setNotIssue(null); setState("busy");
    try {
      setStage("사진을 줄이는 중…");
      const photo = await preparePhoto(file);
      setStage("AI가 사진을 보고 있어요…");
      const res = await fetch("/api/reports/photo-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId, photo: photo.dataUrl }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "사진을 분석하지 못했어요. 직접 작성해 주세요.");
      const draft = json.draft as PhotoDraftResult;
      if (!draft.isFacilityIssue) {
        setNotIssue({ photo, message: draft.message || "사진에서 고칠 곳을 찾지 못했어요." });
        return;
      }
      await onDraft(draft, photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "사진을 분석하지 못했어요. 직접 작성해 주세요.");
    } finally {
      setState("idle");
      setStage("");
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-white p-3" data-testid="photo-start">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void run(event.target.files?.[0])} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white"><Camera className="h-4 w-4" /></span>
        <div className="min-w-[11rem] flex-1">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-slate-900">사진 한 장으로 시작하기 <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700"><Sparkles className="h-3 w-3" />AI</span></p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{state === "busy" ? stage : "찍으면 AI가 내용을 채워요. 얼굴은 가려요."}</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || state === "busy"}
          className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 sm:w-auto"
        >
          {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {state === "busy" ? "분석 중" : "사진 고르기"}
        </button>
      </div>
      {disabled && state !== "busy" && <p className="mt-2 text-[11px] text-slate-500">사진을 더 붙일 수 없어요. 아래 사진 칸에서 하나를 빼면 쓸 수 있어요.</p>}
      {notIssue && (
        <div role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          <p className="font-semibold">{notIssue.message}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => { onAttachOnly(notIssue.photo); setNotIssue(null); }} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-bold text-amber-900"><ImagePlus className="h-3.5 w-3.5" />이 사진만 붙이기</button>
            <button type="button" onClick={() => { setNotIssue(null); inputRef.current?.click(); }} className="rounded-lg px-3 py-1.5 font-bold text-amber-900 hover:bg-amber-100">다른 사진으로</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
