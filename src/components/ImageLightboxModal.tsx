import React, { useState, useEffect } from "react";
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink,
  Download,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ReportPhoto } from "../types";

interface ImageLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 넘겨 볼 사진들 */
  images: ReportPhoto[];
  /** 처음 보여 줄 사진 순서 */
  startIndex?: number;
}

export function ImageLightboxModal({
  isOpen,
  onClose,
  images,
  startIndex = 0,
}: ImageLightboxModalProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [index, setIndex] = useState(startIndex);
  const count = images.length;
  const current = images[Math.min(index, count - 1)] ?? images[0];
  const imageUrl = current?.url ?? "";
  const imageName = current?.name;
  const imageSize = current?.size;

  // 열 때마다 고른 사진부터, 확대 없이 보여 준다.
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setIndex(startIndex);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen, startIndex]);

  const go = (step: number) => {
    if (count < 2) return;
    setZoom(1);
    setIndex((prev) => (prev + step + count) % count);
  };

  // ESC 로 닫고, 좌우 화살표로 넘긴다.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  if (!isOpen || !current) return null;

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom(1);
  };

  // 첨부는 data: URL 이라 링크로 새 탭에 열면 크롬 등이 최상위 이동을 차단한다.
  // blob: URL 로 바꿔서 열면 원본을 그대로 보여 줄 수 있다.
  // (fetch 로 변환하면 CSP connect-src 'self' 에 막히므로 직접 디코딩한다.)
  const handleOpenOriginal = (e: React.MouseEvent) => {
    e.stopPropagation();
    const match = /^data:([^;,]+);base64,(.*)$/.exec(imageUrl);
    if (!match) {
      window.open(imageUrl, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const binary = atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: match[1] }));
      window.open(url, "_blank");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      // 손상된 이미지 데이터 — 뷰어에서 보던 그대로 두고 아무것도 하지 않는다.
    }
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="첨부 이미지 원본 확대 뷰어"
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-slate-950/90 backdrop-blur-md transition-opacity animate-in fade-in"
      onClick={onClose}
    >
      {/* Top Bar: Title & Controls */}
      <div
        className="w-full flex items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-900/80 border-b border-slate-800 text-white z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-4">
          <div className="p-1.5 rounded-lg bg-slate-800 text-blue-400 shrink-0">
            <ImageIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-semibold truncate text-slate-200">
              {count > 1 && <span className="mr-1.5 font-mono text-blue-300">{index + 1}/{count}</span>}
              {imageName || "신고 현장 첨부 사진"}
            </p>
            {imageSize && (
              <p className="text-[11px] text-slate-400 font-mono">
                {formatFileSize(imageSize)}
              </p>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Zoom controls */}
          <div className="hidden sm:flex items-center bg-slate-800/80 rounded-lg p-0.5 border border-slate-700">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
              title="축소"
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition disabled:opacity-40 cursor-pointer"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="text-[11px] font-mono px-2 text-slate-300 font-bold min-w-[45px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= 3}
              title="확대"
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition disabled:opacity-40 cursor-pointer"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              title="원본 크기 리셋 (100%)"
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Open / Download */}
          <button
            type="button"
            onClick={handleOpenOriginal}
            title="새 탭에서 원본 보기"
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            <ExternalLink className="h-4 w-4" />
          </button>

          <a
            href={imageUrl}
            download={imageName || "schoolfix-report-attachment"}
            title="이미지 다운로드"
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            <Download className="h-4 w-4" />
          </a>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            title="닫기 (ESC)"
            className="p-2 ml-1 text-slate-400 hover:text-white hover:bg-rose-900/50 rounded-lg transition cursor-pointer"
            aria-label="뷰어 닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Center Canvas with scroll & zoom */}
      <div className="relative flex-1 w-full overflow-auto p-4 sm:p-8 flex items-center justify-center select-none">
        {count > 1 && (
          <>
            <button type="button" aria-label="이전 사진" onClick={(e) => { e.stopPropagation(); go(-1); }} className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-slate-900/80 p-2.5 text-white hover:bg-slate-800 sm:left-4"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" aria-label="다음 사진" onClick={(e) => { e.stopPropagation(); go(1); }} className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-slate-900/80 p-2.5 text-white hover:bg-slate-800 sm:right-4"><ChevronRight className="h-5 w-5" /></button>
          </>
        )}
        <div
          className="transition-transform duration-150 ease-out flex items-center justify-center max-w-full max-h-full"
          style={{ transform: `scale(${zoom})` }}
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={imageUrl}
            alt={imageName || "신고 첨부 이미지 원본"}
            className="max-h-[80vh] max-w-[90vw] object-contain rounded-lg shadow-2xl border border-slate-800 bg-slate-900/50"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      {/* Bottom helper tip */}
      <div
        className="w-full py-2.5 px-4 bg-slate-900/70 border-t border-slate-800/80 text-center text-xs text-slate-400"
        onClick={(e) => e.stopPropagation()}
      >
        <span>바깥 영역을 클릭하거나 </span>
        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 font-mono text-[10px]">
          ESC
        </kbd>
        <span> 키를 누르면 뷰어가 닫힙니다.{count > 1 ? " 좌우 화살표 키로 사진을 넘길 수 있습니다." : ""}</span>
      </div>
    </div>
  );
}
