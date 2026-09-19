import React, { useState, useEffect } from "react";
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink,
  Download,
  Image as ImageIcon,
} from "lucide-react";

interface ImageLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageName?: string | null;
  imageSize?: number | null;
}

export function ImageLightboxModal({
  isOpen,
  onClose,
  imageUrl,
  imageName,
  imageSize,
}: ImageLightboxModalProps) {
  const [zoom, setZoom] = useState<number>(1);

  // Reset zoom on open/close
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="새 탭에서 원본 보기"
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            <ExternalLink className="h-4 w-4" />
          </a>

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
      <div className="flex-1 w-full overflow-auto p-4 sm:p-8 flex items-center justify-center select-none">
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
        <span> 키를 누르면 뷰어가 닫힙니다.</span>
      </div>
    </div>
  );
}
