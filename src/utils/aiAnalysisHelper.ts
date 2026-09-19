import { SchoolReport, AIAnalysisReportData, AIPriorityItem, AIPriorityLevel, AILocationSummary, AICategorySummary, AIRecurringIssue } from "../types";

/**
 * Generates an intelligent, deterministic, real-data-based report analysis
 * ensuring that the AI Safety Report and PDF Export NEVER have missing or empty content.
 */
export function generateFallbackAnalysis(reports: SchoolReport[]): AIAnalysisReportData {
  const total = reports.length;
  const pending = reports.filter((r) => r.status === "pending").length;
  const inProgress = reports.filter(
    (r) => r.status === "reviewing" || r.status === "in_progress"
  ).length;
  const completed = reports.filter((r) => r.status === "completed").length;

  if (total === 0) {
    return {
      analyzedAt: new Date().toISOString(),
      targetCount: 0,
      stats: { total: 0, pending: 0, inProgress: 0, completed: 0 },
      overallSummary: "현재 등록된 학교 시설 안전 신고가 없습니다.",
      safetyTrends: {
        overallRiskLevel: "safe",
        overallRiskLevelLabel: "양호(신고 없음)",
        trendHeadline: "등록된 시설 안전 위해 요소 없음",
        trendSummary: "현재 접수된 시설 불편 및 안전 위험 신고가 없어 교내 시설이 안전하게 유지되고 있습니다.",
        hotspots: [],
        frequentRisks: [],
        urgentActionNeeded: false,
      },
      locationSummaries: [],
      categorySummaries: [],
      priorityStats: { urgent: 0, high: 0, medium: 0, low: 0 },
      priorityItems: [],
      recurringIssues: [],
      recommendations: [
        "정기적인 교내 안전 점검을 지속하십시오.",
        "학생들이 위험 요소를 즉시 제보할 수 있도록 신고 채널을 상시 안내하십시오."
      ],
    };
  }

  // Location Aggregation
  const locationMap = new Map<string, { count: number; descriptions: string[] }>();
  // Category Aggregation
  const categoryMap = new Map<string, { count: number; descriptions: string[] }>();

  reports.forEach((r) => {
    // Location
    const locKey = r.location || "기타";
    const locVal = locationMap.get(locKey) || { count: 0, descriptions: [] };
    locVal.count += 1;
    locVal.descriptions.push(r.description);
    locationMap.set(locKey, locVal);

    // Category
    const catKey = r.category || "기타";
    const catVal = categoryMap.get(catKey) || { count: 0, descriptions: [] };
    catVal.count += 1;
    catVal.descriptions.push(r.description);
    categoryMap.set(catKey, catVal);
  });

  const locationSummaries: AILocationSummary[] = Array.from(locationMap.entries())
    .map(([location, data]) => ({
      location,
      count: data.count,
      summary: `${location} 구역에서 총 ${data.count}건의 신고가 접수되었으며, 주로 ${data.descriptions.slice(0, 2).map((d) => d.slice(0, 30)).join(", ")} 관련 사항이 확인되었습니다.`,
    }))
    .sort((a, b) => b.count - a.count);

  const categorySummaries: AICategorySummary[] = Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      count: data.count,
      summary: `${category} 유형으로 총 ${data.count}건의 접수가 이루어졌으며 시설 안전 및 이용 편의 조치가 검토되고 있습니다.`,
    }))
    .sort((a, b) => b.count - a.count);

  // Priority Assessment for each report
  const priorityItems: AIPriorityItem[] = reports.map((r) => {
    const text = `${r.location} ${r.category} ${r.description}`.toLowerCase();
    let priority: AIPriorityLevel = "보통";
    let rationale = "일반적인 학교 시설 이용 편의 및 환경 점검이 요구됩니다.";

    const urgentKeywords = ["감전", "화재", "유리", "누전", "낙상", "미끄럼", "붕괴", "머리", "출혈", "부상", "비상"];
    const highKeywords = ["들뜸", "고장", "파손", "소음", "누수", "악취", "계단", "문고리", "창문", "난간"];

    if (urgentKeywords.some((k) => text.includes(k))) {
      priority = "긴급";
      rationale = "학생의 직접적인 신체 부상 및 안전사고 발생 가능성이 높아 즉시 현장 차단 및 긴급 보수가 필요합니다.";
    } else if (highKeywords.some((k) => text.includes(k))) {
      priority = "높음";
      rationale = "시설 결함으로 인해 다수 학생의 수업 및 이동에 심각한 지장을 초래할 수 있어 우선적인 조치가 권고됩니다.";
    } else if (r.status === "completed") {
      priority = "낮음";
      rationale = "이미 현장 조치가 완료되었거나 경미한 환경 개선 사항입니다.";
    }

    return {
      reportId: r.id,
      location: r.location,
      category: r.category,
      contentSummary: r.description.length > 70 ? `${r.description.slice(0, 67)}…` : r.description,
      currentStatus:
        r.status === "completed"
          ? "처리 완료"
          : r.status === "pending"
          ? "접수 대기"
          : "처리 중",
      priority,
      rationale,
    };
  });

  const priorityStats = {
    urgent: priorityItems.filter((i) => i.priority === "긴급").length,
    high: priorityItems.filter((i) => i.priority === "높음").length,
    medium: priorityItems.filter((i) => i.priority === "보통").length,
    low: priorityItems.filter((i) => i.priority === "낮음").length,
  };

  // Recurring issues detection
  const recurringIssues: AIRecurringIssue[] = [];
  locationSummaries.filter((l) => l.count >= 2).forEach((l) => {
    recurringIssues.push({
      issue: `${l.location} 구역 내 반복 신고 집중`,
      evidence: `동일한 ${l.location} 구역에서 ${l.count}건의 신고가 중복 발생하여 근본적인 설비 진단이 요구됩니다.`,
    });
  });
  categorySummaries.filter((c) => c.count >= 2).forEach((c) => {
    if (!recurringIssues.some((ri) => ri.issue.includes(c.category))) {
      recurringIssues.push({
        issue: `${c.category} 관련 이상 패턴 빈발`,
        evidence: `${c.category} 항목으로 총 ${c.count}건이 누적 접수되어 정기 예방 점검 계획 수립이 필요합니다.`,
      });
    }
  });

  // Overall Risk Level
  let overallRiskLevel: "safe" | "caution" | "warning" | "dangerous" = "safe";
  let overallRiskLevelLabel = "양호(안전)";
  if (priorityStats.urgent > 0) {
    overallRiskLevel = "dangerous";
    overallRiskLevelLabel = "즉시 조치 필요(위험)";
  } else if (priorityStats.high >= 2) {
    overallRiskLevel = "warning";
    overallRiskLevelLabel = "위험 경고(경고)";
  } else if (priorityStats.high === 1 || priorityStats.medium > 1) {
    overallRiskLevel = "caution";
    overallRiskLevelLabel = "관찰 필요(주의)";
  }

  const topLocations = locationSummaries.slice(0, 3).map((l) => l.location).join(", ");
  const topCategories = categorySummaries.slice(0, 3).map((c) => c.category).join(", ");

  const hotspots = locationSummaries.slice(0, 3).map((l) => ({
    location: l.location,
    reason: `${l.count}건의 신고가 집중되어 안전 취약 구역으로 분류됨`,
    riskLevel: l.count >= 2 ? "높음" : "보통",
  }));

  const frequentRisks = categorySummaries.slice(0, 3).map((c) => ({
    category: c.category,
    description: `${c.count}건 접수된 대표 위험 유형`,
    riskLevel: c.count >= 2 ? "높음" : "보통",
  }));

  const overallSummary = `현재 학교 내 총 ${total}건(미처리 ${pending}건, 처리 중 ${inProgress}건, 완료 ${completed}건)의 신고가 등록되어 있습니다. 주요 발생 구역은 [${topLocations || "전 구역"}], 주된 문제 유형은 [${topCategories || "시설 고장"}]입니다. 안전사고 예방을 위해 긴급 ${priorityStats.urgent}건 및 높은 우선순위 ${priorityStats.high}건에 대한 집중 점검이 우선되어야 합니다.`;

  const recommendations = [
    `${topLocations ? `[${topLocations}] 구역에 대한` : "다발 발생 구역에 대한"} 현장 집중 안전 점검을 실시하십시오.`,
    priorityStats.urgent > 0
      ? "긴급 안전 위험으로 분류된 항목은 학생 접근을 통제하고 즉각적인 수리 공사를 진행하십시오."
      : "미처리된 신고 건에 대해 담당 부서 배정 및 일정 계획을 조속히 수립하십시오.",
    "정기 시설 안전 점검일지를 작성하여 처리 결과를 학생과 교직원에게 투명하게 공유하십시오.",
  ];

  return {
    analyzedAt: new Date().toISOString(),
    targetCount: total,
    stats: { total, pending, inProgress, completed },
    overallSummary,
    safetyTrends: {
      overallRiskLevel,
      overallRiskLevelLabel,
      trendHeadline: `${topLocations ? `${topLocations} 중심` : "교내 전반"} 시설 안전 점검 및 예방 정비 필요`,
      trendSummary: `접수된 ${total}건의 신고 분석 결과, ${topCategories} 유형의 안전 문제가 주를 이루고 있으며 학생 이동이 잦은 장소의 위험 관리가 핵심 과제로 나타났습니다.`,
      hotspots,
      frequentRisks,
      urgentActionNeeded: priorityStats.urgent > 0,
    },
    locationSummaries,
    categorySummaries,
    priorityStats,
    priorityItems,
    recurringIssues,
    recommendations,
  };
}
