import { AlertTriangle, X } from "lucide-react";

interface UnsavedChangesModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
}

export function UnsavedChangesModal({
  isOpen,
  onConfirm,
  onCancel,
  title = "작성 중인 내용 유실 주의",
  message = "작성 중인 신고 내용이 있습니다. 페이지를 벗어나거나 새로고침할 경우 입력한 내용이 유실될 수 있습니다. 계속 진행하시겠습니까?",
  confirmText = "벗어나기",
  cancelText = "계속 작성하기",
}: UnsavedChangesModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 border border-amber-200">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3
                  id="unsaved-modal-title"
                  className="text-base sm:text-lg font-bold text-slate-900"
                >
                  {title}
                </h3>
                <button
                  type="button"
                  onClick={onCancel}
                  aria-label="닫기"
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                {message}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-xs active:scale-[0.98]"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-xs sm:text-sm font-semibold text-white transition cursor-pointer shadow-xs active:scale-[0.98]"
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
