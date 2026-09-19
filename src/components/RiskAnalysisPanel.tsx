import React from "react";
import {
  ShieldAlert,
  AlertTriangle,
  HelpCircle,
  UserCheck,
  RotateCw,
  Info,
} from "lucide-react";
import {
  RiskAnalysis,
  RISK_LEVEL_MAP,
  RISK_FACTOR_LABELS,
  RiskFactors,
} from "../types";

interface RiskAnalysisPanelProps {
  analysis?: RiskAnalysis | null;
  analysisError?: string | null;
  onReanalyze?: () => void;
  isReanalyzing?: boolean;
}

/**
 * 관리자 전용 위험도 분석 패널 (§25).
 *
 * 표시하는 값은 모두 서버가 저장한 분석 결과다.
 * 이 컴포넌트는 점수를 계산하거나 등급을 추론하지 않는다.
 */
export function RiskAnalysisPanel({
  analysis,
  analysisError,
  onReanalyze,
  isReanalyzing = false,
}: RiskAnalysisPanelProps) {
  // 분석 결과가 없는 경우 — 없는 값을 지어내지 않고 상태만 알린다.
  if (!analysis) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start gap-2.5">
          <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-700">위험도 분석 결과 없음</p>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              {analysisError || "이 신고는 아직 위험도가 분석되지 않았습니다."}
            </p>
            {onReanalyze && (
              <button
                type="button"
                onClick={onReanalyze}
                disabled={isReanalyzing}
                className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-semibold hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
              >
                <RotateCw className={`h-3.5 w-3.5 ${isReanalyzing ? "animate-spin" : ""}`} />
                <span>{isReanalyzing ? "분석 중…" : "위험도 분석 실행"}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const levelConfig = RISK_LEVEL_MAP[analysis.risk_level];
  const factorKeys = Object.keys(RISK_FACTOR_LABELS) as (keyof RiskFactors)[];

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* 헤더: 등급 + 점수 */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert className="h-4 w-4 text-slate-500 shrink-0" />
          <span className="text-xs font-bold text-slate-900">AI 위험도 분석</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${levelConfig.badgeClass}`}
          >
            <span className={`h-2 w-2 rounded-full ${levelConfig.dotClass}`} />
            <span>{analysis.risk_level}</span>
          </span>
          <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
            {analysis.risk_score}
            <span className="text-[10px] font-normal text-slate-400">/100</span>
          </span>
        </div>
      </div>

      <div className="p-4 space-y-3.5">
        {/* 즉각 위험 경고 */}
        {analysis.emergency_override && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <p className="text-[11px] font-bold text-rose-800 leading-relaxed">
              즉각 안전 위험으로 판정되었습니다. 점수와 무관하게 긴급으로 분류되었으며 현장
              확인이 우선입니다.
            </p>
          </div>
        )}

        {/* 판단 근거 */}
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
            판단 근거
          </p>
          <p className="text-xs text-slate-700 leading-relaxed">{analysis.reason}</p>
        </div>

        {/* 위험요소 5종 */}
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">
            위험요소 (각 0~4점)
          </p>
          <div className="space-y-1.5">
            {factorKeys.map((key) => {
              const value = analysis.risk_factors[key];
              return (
                <div key={key} className="flex items-center gap-2.5">
                  <span className="text-[11px] text-slate-600 w-20 shrink-0">
                    {RISK_FACTOR_LABELS[key]}
                  </span>
                  <div className="flex items-center gap-1 flex-1">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={`h-1.5 flex-1 rounded-full ${
                          i < value
                            ? value >= 3
                              ? "bg-rose-400"
                              : value === 2
                              ? "bg-amber-400"
                              : "bg-slate-300"
                            : "bg-slate-100"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="font-mono text-[11px] font-bold text-slate-700 w-3 text-right tabular-nums">
                    {value}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 점수 구성 */}
        <div className="flex items-center gap-3 text-[10px] text-slate-500 pt-0.5">
          <span>
            기본 <strong className="font-mono text-slate-700">{analysis.base_risk_score}</strong>
          </span>
          {analysis.repeat_report_bonus > 0 && (
            <span>
              반복 보정{" "}
              <strong className="font-mono text-slate-700">
                +{analysis.repeat_report_bonus}
              </strong>
            </span>
          )}
          <span>
            반복 신고 점수{" "}
            <strong className="font-mono text-slate-700">{analysis.repeat_report_score}</strong>
          </span>
        </div>

        {/* 플래그 */}
        {(analysis.needs_more_info || analysis.needs_human_review) && (
          <div className="space-y-2 pt-1">
            {analysis.needs_human_review && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                <UserCheck className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  담당자 확인이 필요합니다. AI는 최종 안전 판정자가 아니며, 현장 확인으로
                  위험도를 재검토해야 합니다.
                </p>
              </div>
            )}
            {analysis.needs_more_info && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200">
                <HelpCircle className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-blue-900">추가 정보 필요</p>
                  {analysis.follow_up_question && (
                    <p className="text-[11px] text-blue-800 mt-1 leading-relaxed">
                      {analysis.follow_up_question}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 메타 + 재분석 */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <span className="text-[10px] text-slate-400 font-mono truncate">
            {new Date(analysis.analyzed_at).toLocaleString("ko-KR")} · {analysis.model}
          </span>
          {onReanalyze && (
            <button
              type="button"
              onClick={onReanalyze}
              disabled={isReanalyzing}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50 shrink-0"
            >
              <RotateCw className={`h-3 w-3 ${isReanalyzing ? "animate-spin" : ""}`} />
              <span>{isReanalyzing ? "분석 중…" : "재분석"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
