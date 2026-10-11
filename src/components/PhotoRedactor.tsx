import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Loader2, Undo2, X } from "lucide-react";
import type { PreparedPhoto } from "../utils/imageCompress";
import { redactPhoto, type RedactBox } from "../utils/redact";

interface Props {
  photo: PreparedPhoto;
  onApply: (photo: PreparedPhoto) => void;
  onClose: () => void;
}

/**
 * 사진 가리기 — 얼굴·이름표·화면 속 개인정보처럼 보이면 안 되는 곳을 손가락이나 마우스로 끌어 네모를 그리면
 * 그 자리를 모자이크한다. "가리기 적용" 을 누르면 사진 자체가 바뀌어 원본은 올라가지 않는다.
 */
export function PhotoRedactor({ photo, onApply, onClose }: Props) {
  const [boxes, setBoxes] = useState<RedactBox[]>([]);
  const [draft, setDraft] = useState<RedactBox | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const areaRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    document.body.classList.add("modal-open");
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("modal-open"); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const point = (event: ReactPointerEvent) => {
    const rect = areaRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) };
  };
  const boxFrom = (a: { x: number; y: number }, b: { x: number; y: number }): RedactBox => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

  const apply = async () => {
    if (boxes.length === 0) { onClose(); return; }
    setBusy(true); setError("");
    try {
      onApply(await redactPhoto(photo, boxes));
    } catch (err) {
      setError(err instanceof Error ? err.message : "사진을 가리지 못했어요.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-3" role="dialog" aria-modal="true" aria-label="사진 가리기">
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">사진 가리기</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">얼굴, 이름표, 화면 속 이름처럼 보이면 안 되는 곳을 끌어서 네모를 그리세요. 그린 곳은 모자이크돼요.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-900 p-3">
          <div
            ref={areaRef}
            data-testid="redact-area"
            className="relative mx-auto w-fit cursor-crosshair select-none"
            style={{ touchAction: "none" }}
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); startRef.current = point(event); setDraft(null); }}
            onPointerMove={(event) => { if (startRef.current) setDraft(boxFrom(startRef.current, point(event))); }}
            onPointerUp={(event) => {
              const start = startRef.current;
              startRef.current = null;
              setDraft(null);
              if (!start) return;
              const box = boxFrom(start, point(event));
              if (box.w > 0.02 && box.h > 0.02) setBoxes((current) => [...current, box]);
            }}
          >
            <img src={photo.dataUrl} alt="가릴 사진" draggable={false} className="block max-h-[60vh] max-w-full" />
            {[...boxes, ...(draft ? [draft] : [])].map((box, index) => (
              <div
                key={index}
                className={`absolute border-2 ${index < boxes.length ? "border-rose-400 bg-slate-500/40 backdrop-blur-md" : "border-dashed border-white bg-white/10"}`}
                style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-4">
          <span className="text-xs text-slate-500">가릴 곳 {boxes.length}개</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setBoxes((current) => current.slice(0, -1))} disabled={boxes.length === 0 || busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40"><Undo2 className="h-3.5 w-3.5" />마지막 네모 지우기</button>
            <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">취소</button>
            <button type="button" onClick={() => void apply()} disabled={busy || boxes.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}가리기 적용</button>
          </div>
        </div>
        {error && <p role="alert" className="px-4 pb-3 text-xs text-rose-700">{error}</p>}
      </div>
    </div>
  );
}
