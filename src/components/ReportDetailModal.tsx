import React, { useEffect, useState } from "react";
import {
  X,
  MapPin,
  Tag,
  Clock,
  Paperclip,
  Trash2,
  UserCog,
} from "lucide-react";
import { SchoolReport, STATUS_MAP } from "../types";
import { ReportTimeline } from "./ReportTimeline";
import { RiskAnalysisPanel } from "./RiskAnalysisPanel";
import { ImageLightboxModal } from "./ImageLightboxModal";

interface ReportDetailModalProps {
  report: SchoolReport | null;
  isOpen: boolean;
  onClose: () => void;
  /** 삭제 요청 — 관리자 비밀번호 확인은 DeleteReportModal 이 담당한다. */
  onRequestDelete?: (reportId: string) => void;
}

/**
 * 신고 상세 — 누구나 열람할 수 있다.
 *
 * 표시되는 값은 전부 서버의 공개 DTO 에서 온 것이라
 * 신고자 이름·이메일·IP·내부 식별자가 애초에 존재하지 않는다(§56).
 * 신고 내용은 JSX 텍스트로만 렌더링하므로 React 가 자동으로 escape 한다(§24).
 */
export function ReportDetailModal({
  report,
  isOpen,
  onClose,
  onRequestDelete,
}: ReportDetailModalProps) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.classList.add("modal-open");
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !report) return null;

  const status = STATUS_MAP[report.status] || STATUS_MAP.pending;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs print:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="신고 상세"
        onClick={onClose}
      >
        <div
          className="relative flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden w-full max-w-2xl"
          style={{ maxHeight: "calc(100vh - 32px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${status.badgeClass}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`} />
                  {status.label}
                </span>
                <span className="text-[11px] font-mono text-slate-400">{report.id}</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 break-keep">
                {report.title || `${report.location} ${report.category}`}
              </h3>
            </div>

            <div className="flex items-center gap-1 shrink-0">

              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/60 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* 본문 */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <InfoCell icon={MapPin} label="위치" value={report.location} />
              <InfoCell icon={Tag} label="문제 종류" value={report.category} />
              <InfoCell
                icon={Clock}
                label="접수일"
                value={new Date(report.createdAt).toLocaleDateString("ko-KR")}
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-700 block">신고 내용</span>
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                {report.description}
              </div>
            </div>

            {report.attachmentUrl && (
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                  현장 첨부 사진
                </span>
                <button
                  type="button"
                  onClick={() => setIsLightboxOpen(true)}
                  className="block w-full rounded-xl overflow-hidden border border-slate-200 cursor-zoom-in"
                >
                  <img
                    src={report.attachmentUrl}
                    alt="신고 현장 사진"
                    className="w-full max-h-72 object-contain bg-slate-100"
                  />
                </button>
              </div>
            )}

            {/* 위험도 분석 — 모든 사용자가 확인할 수 있다(§2). */}
            <RiskAnalysisPanel analysis={report.riskAnalysis} />

            <ReportTimeline
              status={report.status}
              createdAt={report.createdAt}
              reviewedAt={report.reviewedAt}
              inProgressAt={report.inProgressAt}
              completedAt={report.completedAt}
            />

            {report.resolutionNote && (
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-700 block">처리 결과</span>
                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-sm text-emerald-900 leading-relaxed whitespace-pre-wrap">
                  {report.resolutionNote}
                </div>
              </div>
            )}

            {/*
              삭제 — 관리자 비밀번호가 필요한 유일한 기능.
              더보기 메뉴에 숨겨 두었더니 있는 줄도 모르는 상태여서 밖으로 꺼냈다.
              다만 주요 동작은 아니므로 본문 맨 아래, 약한 스타일로 배치한다.
            */}
            {onRequestDelete && (
              <div className="border-t border-slate-200 pt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-slate-400 inline-flex items-center gap-1.5">
                  <UserCog className="h-3.5 w-3.5" />
                  신고 삭제에는 관리자 비밀번호가 필요합니다.
                </p>
                <button
                  type="button"
                  onClick={() => onRequestDelete(report.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>삭제하기</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {report.attachmentUrl && (
        <ImageLightboxModal
          isOpen={isLightboxOpen}
          onClose={() => setIsLightboxOpen(false)}
          imageUrl={report.attachmentUrl}
        />
      )}
    </>
  );
}

function InfoCell({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="p-3 rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-1.5 text-slate-500 text-xs">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-1 font-bold text-slate-900 text-sm break-keep">{value}</p>
    </div>
  );
}
