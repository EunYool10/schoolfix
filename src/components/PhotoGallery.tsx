import { useState } from "react";
import { ImageOff, Paperclip } from "lucide-react";
import type { ReportPhoto } from "../types";
import { ImageLightboxModal } from "./ImageLightboxModal";

interface Props {
  photos: ReportPhoto[];
  /** 공개 보류 신고의 사진은 운영진만 열 수 있어, 그 외에는 안내 문구만 보여 준다. */
  locked?: boolean;
  title?: string;
  /** 크게 보기 창이 열리고 닫힐 때. 바깥 창이 ESC 를 같이 처리하지 않도록 알려 준다. */
  onViewerChange?: (open: boolean) => void;
}

/** 신고 사진 모음. 한 장이면 크게, 여러 장이면 격자로 보여 주고 누르면 크게 넘겨 볼 수 있다. */
export function PhotoGallery({ photos, locked = false, title = "현장 첨부 사진", onViewerChange }: Props) {
  const [openIndex, setOpenIndexState] = useState<number | null>(null);
  const setOpenIndex = (next: number | null) => {
    setOpenIndexState(next);
    onViewerChange?.(next !== null);
  };
  const [broken, setBroken] = useState<Set<number>>(() => new Set());
  if (photos.length === 0) return null;

  const heading = (
    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
      <Paperclip className="h-3.5 w-3.5 text-slate-400" />
      {title}
      {photos.length > 1 && <span className="font-normal text-slate-400">· {photos.length}장</span>}
    </span>
  );

  if (locked) {
    return (
      <div className="space-y-1.5">
        {heading}
        <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <ImageOff className="h-4 w-4 shrink-0" /> 사진 {photos.length}장은 운영진 검토가 끝나면 공개됩니다.
        </p>
      </div>
    );
  }

  const single = photos.length === 1;
  return (
    <div className="space-y-1.5">
      {heading}
      <div className={single ? "" : "grid grid-cols-2 gap-2 sm:grid-cols-3"}>
        {photos.map((photo, index) => (
          <button
            key={photo.url}
            type="button"
            onClick={() => setOpenIndex(index)}
            aria-label={`사진 ${index + 1} 크게 보기`}
            className="block w-full cursor-zoom-in overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
          >
            {broken.has(index) ? (
              <span className="flex h-28 items-center justify-center gap-1.5 text-xs text-slate-500"><ImageOff className="h-4 w-4" /> 불러오지 못함</span>
            ) : (
              <img
                src={photo.url}
                alt={`신고 현장 사진 ${index + 1}`}
                loading="lazy"
                onError={() => setBroken((prev) => new Set(prev).add(index))}
                className={single ? "max-h-72 w-full object-contain" : "aspect-square w-full object-cover"}
              />
            )}
          </button>
        ))}
      </div>
      <ImageLightboxModal isOpen={openIndex !== null} onClose={() => setOpenIndex(null)} images={photos} startIndex={openIndex ?? 0} />
    </div>
  );
}
