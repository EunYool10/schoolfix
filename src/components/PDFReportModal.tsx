import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  Printer,
  FileText,
  Download,
  CheckCircle,
} from "lucide-react";
import { AIAnalysisReportData, SchoolReport } from "../types";
import { generateFallbackAnalysis } from "../utils/aiAnalysisHelper";
import { PDFReportDocument } from "./PDFReportDocument";

interface PDFReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportData: AIAnalysisReportData;
  rawReports: SchoolReport[];
}

export function PDFReportModal({
  isOpen,
  onClose,
  reportData: initialReportData,
  rawReports,
}: PDFReportModalProps) {
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Guarantee that reportData is 100% filled and never has empty sections
  const reportData = useMemo(() => {
    const fallback = generateFallbackAnalysis(rawReports);
    return {
      ...fallback,
      ...initialReportData,
      safetyTrends: initialReportData.safetyTrends || fallback.safetyTrends,
      locationSummaries:
        initialReportData.locationSummaries && initialReportData.locationSummaries.length > 0
          ? initialReportData.locationSummaries
          : fallback.locationSummaries,
      categorySummaries:
        initialReportData.categorySummaries && initialReportData.categorySummaries.length > 0
          ? initialReportData.categorySummaries
          : fallback.categorySummaries,
      priorityItems:
        initialReportData.priorityItems && initialReportData.priorityItems.length > 0
          ? initialReportData.priorityItems
          : fallback.priorityItems,
      priorityStats:
        initialReportData.priorityStats || fallback.priorityStats,
      recurringIssues:
        initialReportData.recurringIssues && initialReportData.recurringIssues.length > 0
          ? initialReportData.recurringIssues
          : fallback.recurringIssues,
      recommendations:
        initialReportData.recommendations && initialReportData.recommendations.length > 0
          ? initialReportData.recommendations
          : fallback.recommendations,
      overallSummary: initialReportData.overallSummary || fallback.overallSummary,
    };
  }, [initialReportData, rawReports]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.classList.add("modal-open");
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Safe Print / Save to PDF:
  // Relies exclusively on dedicated #schoolfix-print-document with @media print CSS.
  // Never reloads the window, never closes the modal, never modifies active DOM.
  const handlePrint = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.print();
  };

  // Instant HTML Document Export without any page reload
  const handleDownloadHTML = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const filename = `SchoolFix_시설안전_종합분석리포트_${dateStr}.html`;

    const docContent = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>SchoolFix 시설 안전 분석 리포트 (${dateStr})</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <style>
    body { font-family: Pretendard, sans-serif; background: #ffffff; color: #0f172a; padding: 24px; }
    @page { size: A4 portrait; margin: 12mm 10mm; }
  </style>
</head>
<body class="max-w-4xl mx-auto p-6">
  <div class="border-b pb-4 mb-6">
    <h1 class="text-2xl font-bold">SchoolFix 교내 시설 안전 리포트</h1>
    <p class="text-sm text-slate-500">생성일시: ${reportData.analyzedAt} | 총 ${rawReports.length}건 분석</p>
  </div>
  <div class="space-y-4">
    <h2 class="text-lg font-bold">1. 종합 요약</h2>
    <p class="p-3 bg-slate-50 rounded border">${reportData.overallSummary}</p>
    <h2 class="text-lg font-bold mt-6">2. 우선 조치 대상</h2>
    <ul class="list-disc list-inside">
      ${reportData.priorityItems.map((p) => `<li><strong>[${p.priority}] ${p.location} - ${p.category}</strong>: ${p.contentSummary} (${p.rationale})</li>`).join("")}
    </ul>
  </div>
</body>
</html>`;

    const blob = new Blob([docContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3000);
  };

  return (
    <>
      {/* 1. Modal Dialog for Interactive Screen Viewing */}
      <div
        id="pdf-report-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="교내 시설 불편 및 안전 위험 종합 분석 리포트"
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs select-none print:hidden"
        style={{ overscrollBehavior: "contain" }}
        onClick={onClose}
      >
        <div
          id="pdf-report-modal-container"
          className="relative flex flex-col bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden select-text"
          style={{
            width: "min(960px, calc(100vw - 32px))",
            maxHeight: "calc(100vh - 32px)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header Toolbar */}
          <div
            id="pdf-report-modal-header"
            className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-slate-200 bg-slate-50 shrink-0 select-none"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 shrink-0">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                  교내 시설 안전 종합 분석 리포트
                </h3>
                <p className="text-[11px] text-slate-500 truncate hidden sm:block">
                  등록된 {rawReports.length}건 전수 분석 및 AI 위험 우선순위 진단
                </p>
              </div>
            </div>

            {/* Action Buttons: Strict no-reload behavior */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadHTML}
                title="리포트 HTML 파일 저장"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer shadow-2xs hidden sm:inline-flex"
              >
                {downloadSuccess ? (
                  <>
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-700">저장 완료</span>
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5 text-slate-500" />
                    <span>파일 저장</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handlePrint}
                id="btn-print-pdf-direct"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-700 text-white text-xs sm:text-sm font-semibold hover:bg-blue-800 active:scale-[0.98] transition cursor-pointer shadow-2xs"
              >
                <Printer className="h-4 w-4" />
                <span>인쇄 / PDF로 저장</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
                aria-label="닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Modal Document Viewer: Clean Dedicated PDF Component */}
          <div
            id="schoolfix-modal-pdf-view-body"
            className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-8 md:px-10 pt-6 pb-12 bg-white box-border custom-modal-scrollbar"
            style={{ overscrollBehavior: "contain" }}
          >
            <PDFReportDocument
              reportData={reportData}
              rawReports={rawReports}
              isPrintVersion={false}
            />
          </div>
        </div>
      </div>

      {/* 2. Dedicated Isolated Print Element (Exclusively revealed during window.print() via @media print) */}
      <div id="schoolfix-print-document" className="hidden print:block">
        <PDFReportDocument
          reportData={reportData}
          rawReports={rawReports}
          isPrintVersion={true}
        />
      </div>
    </>
  );
}
