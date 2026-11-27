import React, { useEffect, useState } from "react";
import { X, Volume2 } from "lucide-react";
import { SchoolReport, STATUS_MAP } from "../types";
import { loadRecoveryCodes } from "../utils/clientTokens";
import { formatNoise, noiseLevelLabel } from "../utils/noise";
import { ReportTimeline } from "./ReportTimeline";
import { RiskAnalysisPanel } from "./RiskAnalysisPanel";
import { PhotoGallery } from "./PhotoGallery";
import { ReportEngagement } from "./ReportEngagement";

interface ReportDetailModalProps {
  report: SchoolReport | null;
  schoolId: string;
  isOpen: boolean;
  onClose: () => void;
  /** 공감·만족도 응답으로 신고가 바뀌었을 때 */
  onReportUpdated?: (report: SchoolReport) => void;
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
  schoolId,
  isOpen,
  onClose,
  onReportUpdated,
}: ReportDetailModalProps) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      // 사진 뷰어가 열려 있으면 ESC 는 뷰어만 닫는다. 상세 창까지 함께 닫히지 않게 한다.
      if (e.key === "Escape" && !isLightboxOpen) onClose();
    };
    document.body.classList.add("modal-open");
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose, isLightboxOpen]);

  if (!isOpen || !report) return null;

  const status = STATUS_MAP[report.status] || STATUS_MAP.pending;
  const detailedLocation = [report.locationDetail, report.buildingName, report.floor, report.department, report.grade ? `${report.grade}학년` : null, report.className, report.roomName].filter(Boolean).join(" · ");
  // 내 신고라면 이 브라우저에 적어 둔 확인 코드를 보여 준다(기기를 바꾸기 전에 옮겨 적도록).
  const recoveryCode = report.isMine ? loadRecoveryCodes()[report.id] : undefined;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4 print:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="신고 상세"
        onClick={onClose}
      >
        <div
          className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
          style={{ maxHeight: "calc(100vh - 32px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 pb-4 pt-5 sm:px-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold ${report.moderationStatus === "held" ? "text-amber-700" : status.textColor}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`} />
                  {report.moderationStatus === "held" ? "운영진 검토 대기" : status.label}
                </span>
                <span className="text-[11px] font-mono text-slate-400">{report.id}</span>
              </div>
              <h3 className="break-keep font-display text-xl leading-snug text-slate-900">
                {report.title || `${report.location} ${report.category}`}
              </h3>
            </div>

            <div className="flex items-center gap-1 shrink-0">

              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="-mr-1.5 rounded-xl p-2 text-slate-500 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* 본문 */}
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
            <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
              <InfoCell label="학교" value={report.schoolName || ""} />
              <InfoCell label="장소" value={[report.locationType || report.location, detailedLocation].filter(Boolean).join(" · ") || "직접 확인 필요"} />
              <InfoCell label="문제 종류" value={report.category} />
              <InfoCell label="접수일" value={new Date(report.createdAt).toLocaleDateString("ko-KR")} />
            </dl>

            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-500">신고 내용</span>
              <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
                {report.description}
              </div>
            </div>

            {report.noise && (
              <p className="flex items-start gap-2 text-sm leading-relaxed text-slate-700">
                <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                <span><strong>휴대폰으로 잰 소음</strong> {formatNoise(report.noise)} · {noiseLevelLabel(report.noise.avgDb)} <span className="text-indigo-700">(휴대폰마다 차이가 있는 추정치)</span></span>
              </p>
            )}

            <PhotoGallery photos={report.photos ?? []} locked={report.moderationStatus === "held"} onViewerChange={setIsLightboxOpen} />

            <ReportEngagement key={report.id} report={report} schoolId={schoolId} onReportUpdated={onReportUpdated} />

            {recoveryCode && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900">
                확인 코드 <strong className="font-mono tracking-wider">{recoveryCode}</strong> — 다른 기기에서 신고 목록 → 내 신고 → "신고 불러오기" 에 접수번호와 함께 넣으면 이 신고를 다시 볼 수 있어요. 다른 사람에게 알려 주지 마세요.
              </p>
            )}

            {/* 위험도 분석 — 모든 사용자가 확인할 수 있다(§2). */}
            <RiskAnalysisPanel analysis={report.riskAnalysis} />

            <ReportTimeline
              status={report.status}
              createdAt={report.createdAt}
              reviewedAt={report.reviewedAt}
              assignedAt={report.assignedAt}
              scheduledAt={report.scheduledAt}
              inProgressAt={report.inProgressAt}
              completedAt={report.completedAt}
            />

            {report.resolutionNote && (
              <div className="border-l-4 border-emerald-400 pl-4">
                <span className="block font-hand text-xl leading-none text-emerald-700">처리 결과</span>
                <div className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
                  {report.resolutionNote}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-keep font-semibold text-slate-900">{value}</dd>
    </>
  );
}

