import React from "react";
import { X, Sparkles, AlertCircle, Loader2, Inbox } from "lucide-react";
import { AiSummaryResponse } from "../types";

interface AiSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: AiSummaryResponse | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * AI 요약 — 짧고 간결하게 유지한다 (§21).
 * 상세 분석은 PDF 로 내보낸다.
 *
 * 화면에 나오는 숫자는 전부 서버가 DB 에서 계산한 값이다.
 * 클라이언트에서 통계를 만들어내지 않는다.
 */
export function AiSummaryModal({
  isOpen,
  onClose,
  data,
  isLoading,
  error,
}: AiSummaryModalProps) {
  if (!isOpen) return null;

  const stats = data?.stats;
  const summary = data?.summary;

  // 서버가 계산한 위험도 분포에서 상위 항목만 뽑는다.
  const topCategory = stats
    ? Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])[0]
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="AI 신고 요약"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">AI 신고 요약</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/60 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {isLoading && (
            <div className="py-10 text-center space-y-3">
              <Loader2 className="h-6 w-6 text-blue-600 animate-spin mx-auto" />
              <p className="text-sm text-slate-600">AI가 신고 내용을 분석하고 있습니다...</p>
            </div>
          )}

          {!isLoading && error && (
            <div className="py-8 text-center space-y-2">
              <AlertCircle className="h-6 w-6 text-rose-500 mx-auto" />
              <p className="text-sm text-slate-700 leading-relaxed">{error}</p>
            </div>
          )}

          {!isLoading && !error && data?.empty && (
            <div className="py-8 text-center space-y-2">
              <Inbox className="h-6 w-6 text-slate-400 mx-auto" />
              <p className="text-sm text-slate-700 leading-relaxed">
                현재 분석할 신고 데이터가 없습니다.
                <br />
                신고가 등록되면 AI 요약을 생성할 수 있습니다.
              </p>
            </div>
          )}

          {!isLoading && !error && summary && stats && (
            <div className="space-y-4">
              {/* 통계 — 서버가 DB 에서 계산한 값만 표시 */}
              <dl className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-slate-600">전체 신고</dt>
                  <dd className="font-mono font-bold text-slate-900 tabular-nums">
                    {stats.total}건
                  </dd>
                </div>
                {stats.byRisk["긴급"] > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <dt className="text-slate-600">긴급</dt>
                    <dd className="font-mono font-bold text-rose-600 tabular-nums">
                      {stats.byRisk["긴급"]}건
                    </dd>
                  </div>
                )}
                {stats.byRisk["높음"] > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <dt className="text-slate-600">높음</dt>
                    <dd className="font-mono font-bold text-orange-600 tabular-nums">
                      {stats.byRisk["높음"]}건
                    </dd>
                  </div>
                )}
                {topCategory && (
                  <div className="flex items-center justify-between text-sm">
                    <dt className="text-slate-600">주요 유형</dt>
                    <dd className="font-semibold text-slate-900">{topCategory[0]}</dd>
                  </div>
                )}
              </dl>

              <div className="border-t border-slate-100 pt-3.5 space-y-2.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                  핵심 이슈
                </p>
                <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                  {summary.headline}
                </p>
                {summary.keyIssues.length > 0 && (
                  <ul className="space-y-1.5">
                    {summary.keyIssues.map((issue, i) => (
                      <li key={i} className="flex gap-2 text-xs text-slate-700 leading-relaxed">
                        <span className="text-slate-400 shrink-0">·</span>
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {summary.recommendation && (
                  <p className="text-xs text-slate-600 leading-relaxed pt-1">
                    {summary.recommendation}
                  </p>
                )}
              </div>

              <p className="text-[10px] text-slate-400 leading-relaxed border-t border-slate-100 pt-3">
                AI 분석 결과는 실제 신고 데이터를 기반으로 생성된 참고용 요약입니다. 최종 확인과
                조치는 학교 담당자가 수행합니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
