import { useMemo } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { STATUS_MAP, type SchoolReport } from "../types";
import { findSimilarReports, type SimilarDraft } from "../utils/similarReports";
import { MeTooButton } from "./ReportEngagement";

interface Props {
  draft: SimilarDraft;
  reports: SchoolReport[];
  schoolId: string;
  onOpenReport?: (report: SchoolReport) => void;
  /** 공감을 누른 뒤 목록을 새로 받아오게 한다. */
  onReportsChanged?: () => void;
}

/**
 * 신고를 쓰는 중에 같은 문제로 보이는 처리 중 신고를 보여 준다.
 * 같은 문제라면 새로 신고하는 대신 "나도 겪었어요" 를 누르도록 이끈다. 접수를 막지는 않는다.
 */
export function SimilarReportsPanel({ draft, reports, schoolId, onOpenReport, onReportsChanged }: Props) {
  const similar = useMemo(() => findSimilarReports(draft, reports), [draft, reports]);
  if (similar.length === 0) return null;

  return (
    <section aria-label="비슷한 신고" className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <p className="flex items-center gap-1.5 text-sm font-extrabold text-amber-950">
        <Copy className="h-4 w-4" /> 같은 문제가 이미 신고되어 있을 수 있어요
      </p>
      <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
        아래 신고와 같은 문제라면 새로 신고하지 말고 <strong>‘나도 겪었어요’</strong>를 눌러 주세요. 공감이 많을수록 담당자가 먼저 확인합니다. 다른 문제라면 그대로 계속 작성하면 됩니다.
      </p>
      <ul className="mt-3 space-y-2">
        {similar.map((report) => {
          const status = STATUS_MAP[report.status] ?? STATUS_MAP.pending;
          const place = [report.locationType || report.location, report.locationDetail, report.buildingName, report.floor, report.roomName].filter(Boolean).join(" · ");
          return (
            <li key={report.id} className="rounded-xl border border-amber-100 bg-white p-3">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-700">{status.label}</span>
                <span className="text-slate-500">{report.category}</span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-500">{new Date(report.createdAt).toLocaleDateString("ko-KR")}</span>
                {report.isMine && <span className="rounded-full bg-blue-50 px-2 py-0.5 font-bold text-blue-700">내가 접수한 신고</span>}
              </div>
              <p className="mt-1 truncate text-sm font-bold text-slate-900">{report.title || `${report.location} ${report.category}`}</p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-600">{report.description}</p>
              {place && <p className="mt-1 truncate text-[11px] text-slate-500">{place}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!report.isMine && (
                  <MeTooButton report={report} schoolId={schoolId} compact onReportUpdated={() => onReportsChanged?.()} />
                )}
                {onOpenReport && (
                  <button type="button" onClick={() => onOpenReport(report)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    <ExternalLink className="h-3.5 w-3.5" /> 자세히 보기
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
