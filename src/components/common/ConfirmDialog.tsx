import React from "react";
import { AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { Modal } from "./Modal";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "primary";
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "확인",
  cancelText = "취소",
  type = "danger",
  isLoading = false,
}: ConfirmDialogProps) {
  const iconConfig = {
    danger: {
      icon: <AlertTriangle className="h-6 w-6 text-rose-600" />,
      boxClass: "bg-rose-100 text-rose-600",
      btnClass: "bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500",
    },
    warning: {
      icon: <AlertTriangle className="h-6 w-6 text-amber-600" />,
      boxClass: "bg-amber-100 text-amber-600",
      btnClass: "bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-500",
    },
    primary: {
      icon: <Info className="h-6 w-6 text-blue-600" />,
      boxClass: "bg-blue-100 text-blue-600",
      btnClass: "bg-blue-700 hover:bg-blue-800 text-white focus:ring-blue-500",
    },
  }[type];

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="md"
      footer={
        <>
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={handleConfirm}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5 ${iconConfig.btnClass}`}
          >
            {isLoading && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            <span>{confirmText}</span>
          </button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div className={`p-2.5 rounded-full shrink-0 ${iconConfig.boxClass}`}>
          {iconConfig.icon}
        </div>
        <div className="text-sm text-slate-700 leading-relaxed pt-1">
          {message}
        </div>
      </div>
    </Modal>
  );
}
