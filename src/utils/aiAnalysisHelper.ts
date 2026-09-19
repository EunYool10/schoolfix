import { AIAnalysisReportData, SchoolReport } from "../types";

/**
 * 위험도 계산은 이 파일에서 하지 않는다.
 *
 * 이전 버전은 여기서 키워드 목록("화재", "감전" 등)으로 위험도를 직접 판정했다.
 * 그 방식은 문맥을 보지 않아 "화재 대피 훈련을 했어요" 같은 신고도 긴급으로 올렸고,
 * 서버의 판정과 서로 다른 결과를 만들어 화면마다 위험도가 달라지는 원인이었다.
 *
 * 현재 위험도는 신고 접수 시점에 서버(riskAnalysis.ts)가 산출해 DB에 저장하며,
 * 종합 리포트는 POST /api/ai/analyze 가 저장된 값을 집계해서 내려준다.
 * 클라이언트는 받은 값을 표시만 한다.
 *
 * 이 함수는 서버 응답이 아직 없을 때 화면이 깨지지 않도록 하는
 * "빈 리포트" 골격만 만든다. 위험도나 통계를 임의로 만들어내지 않는다(§25).
 */
export function createEmptyAnalysis(reports: SchoolReport[]): AIAnalysisReportData {
  const total = reports.length;
  const pending = reports.filter((r) => r.status === "pending").length;
  const inProgress = reports.filter(
    (r) => r.status === "reviewing" || r.status === "in_progress"
  ).length;
  const completed = reports.filter((r) => r.status === "completed").length;

  return {
    analyzedAt: new Date().toISOString(),
    targetCount: total,
    analyzedCount: 0,
    unanalyzedCount: total,
    stats: { total, pending, inProgress, completed },
    overallSummary:
      total === 0
        ? "등록된 신고가 없습니다."
        : "위험도 분석 결과를 불러오는 중입니다. 결과가 표시되지 않으면 [AI 재분석]을 실행하세요.",
    safetyTrends: undefined,
    locationSummaries: [],
    categorySummaries: [],
    priorityStats: { urgent: 0, high: 0, medium: 0, low: 0 },
    priorityItems: [],
    flagStats: { emergencyOverride: 0, needsMoreInfo: 0, needsHumanReview: 0 },
    recurringIssues: [],
    recommendations: [],
  };
}
