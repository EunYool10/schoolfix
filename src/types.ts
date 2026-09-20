export type ReportStatus = "pending" | "reviewing" | "in_progress" | "completed";

/**
 * 서버가 실제 DB 에서 계산한 통계 (§20).
 * 클라이언트는 이 값을 표시만 하고 다시 계산하거나 만들어내지 않는다.
 */
export interface ReportStatsResponse {
  total: number;
  byRisk: Record<string, number>;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  byLocation: Record<string, number>;
  unanalyzed: number;
}

/**
 * 위치 1곳의 집계 결과.
 * 모든 값은 서버가 실제 DB 의 신고에서 계산한다. 클라이언트는 표시만 한다 (§23).
 */
export interface LocationStatistic {
  name: string;
  baseLocation: string;
  reportCount: number;
  mainCategory: string | null;
  mainCategoryCount: number;
  highRiskCount: number;
  urgentCount: number;
  latestReportAt: string;
  /** 하나로 묶인 원본 표기들 (표기가 하나뿐이면 길이 1) */
  mergedFrom: string[];
}

/** GET /api/reports/location-statistics 응답 */
export interface LocationStatsResponse {
  ok: boolean;
  /** 필터를 적용한 뒤 집계 대상이 된 신고 수 */
  total: number;
  locations: LocationStatistic[];
  /** 서버가 실제로 적용한 필터 (화면이 보낸 값이 그대로 반영됐는지 확인용) */
  appliedFilters: {
    search: string;
    category: string;
    risk: string;
    status: string;
    dateRange: string;
  };
}

/** POST /api/reports/analyze 응답 — AI 사전 확인 (§13, §14) */
export interface ClarifyResponse {
  ok: boolean;
  status: "ready" | "needs_more_information";
  /** 추가 정보가 필요할 때만 값이 있다. 항상 질문 1개 (§12) */
  question: string | null;
  missingField: "location" | "problem" | "situation" | null;
  /** 대화 상태를 잇는 서버 세션 id (§15) */
  sessionId: string;
  /** 지금까지 주고받은 추가 확인 */
  turns: { question: string; answer: string }[];
  /** 학생 문장에서 실제로 확인된 상세 위치. 없으면 null (§17 — 지어내지 않는다) */
  locationDetail: string | null;
  /** 질문 한도에 도달해 추가 확인 없이 접수로 넘어가는 경우 true */
  maxTurnsReached?: boolean;
  /** AI 확인을 사용할 수 없어 그대로 접수하는 경우 true */
  skipped?: boolean;
}

/** POST /api/ai/summary 응답 */
export interface AiSummaryResponse {
  ok: boolean;
  empty?: boolean;
  cached?: boolean;
  message?: string;
  stats: ReportStatsResponse;
  summary: {
    headline: string;
    keyIssues: string[];
    recommendation: string;
    generatedAt: string;
    model: string;
  } | null;
}

// ==========================================
// 위험도 분석 (서버 riskAnalysis.ts 가 유일한 산출 주체)
// 클라이언트는 이 값을 표시만 하고 다시 계산하지 않는다.
// ==========================================
export type RiskLevel = "긴급" | "높음" | "중간" | "낮음";

export interface RiskFactors {
  immediacy: number;
  accident_probability: number;
  severity: number;
  affected_people: number;
  persistence: number;
}

export const RISK_FACTOR_LABELS: Record<keyof RiskFactors, string> = {
  immediacy: "즉시성",
  accident_probability: "사고 가능성",
  severity: "피해 정도",
  affected_people: "영향 범위",
  persistence: "지속성",
};

export interface RiskAnalysis {
  risk_level: RiskLevel;
  risk_score: number;
  base_risk_score: number;
  repeat_report_bonus: number;
  reason: string;
  risk_factors: RiskFactors;
  repeat_report_score: number;
  emergency_override: boolean;
  needs_more_info: boolean;
  needs_human_review: boolean;
  follow_up_question: string | null;
  analyzed_at: string;
  model: string;
}

export interface RiskLevelBadgeConfig {
  label: RiskLevel;
  badgeClass: string;
  dotClass: string;
  textColor: string;
}

export const RISK_LEVEL_MAP: Record<RiskLevel, RiskLevelBadgeConfig> = {
  긴급: {
    label: "긴급",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200 font-bold",
    dotClass: "bg-rose-500",
    textColor: "text-rose-700",
  },
  높음: {
    label: "높음",
    badgeClass: "bg-orange-50 text-orange-700 border-orange-200 font-bold",
    dotClass: "bg-orange-500",
    textColor: "text-orange-700",
  },
  중간: {
    label: "중간",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200 font-medium",
    dotClass: "bg-amber-500",
    textColor: "text-amber-800",
  },
  낮음: {
    label: "낮음",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200 font-medium",
    dotClass: "bg-slate-400",
    textColor: "text-slate-600",
  },
};

/**
 * 화면에서 다루는 신고 객체.
 * 서버의 공개 DTO(toPublicReport)와 1:1로 대응하며, 개인정보 필드는 존재하지 않는다.
 * 로그인을 제거했으므로 신고자 이름·이메일·계정 식별자는 수집하지도, 전달하지도 않는다.
 */
export interface SchoolReport {
  /** 접수번호 (예: REP-20260919-0001). 내부 DB 식별자가 아니라 사용자에게 안내되는 번호다. */
  id: string;
  title?: string;
  location: string;
  /**
   * 상세 위치 — 학생이 직접 적었거나 AI 사전 확인이 학생 문장에서 그대로 발췌한 값.
   * 위치 통계는 location 과 이 값을 합쳐 집계한다. 없으면 null 이며 만들어내지 않는다.
   */
  locationDetail?: string | null;
  category: string;
  description: string;
  attachmentUrl?: string | null;
  status: ReportStatus;
  /** 서버가 산출한 위험도 등급 — 분석 전이면 null */
  riskLevel?: RiskLevel | null;
  riskScore?: number | null;
  riskAnalysis?: RiskAnalysis | null;
  /** 본인이 등록한 신고인지 (익명 소유 토큰으로 판별) */
  isMine?: boolean;
  assignee?: string | null;
  resolutionNote?: string | null;
  reviewedAt?: string | null;
  inProgressAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// 학교에서 실제 사용하는 위치 목록 (기본값: 교실)
export const SCHOOL_LOCATIONS = [
  "교실",
  "복도",
  "화장실",
  "계단",
  "급식실",
  "체육관",
  "운동장",
  "도서관",
  "특별실",
  "기타",
] as const;

// 학생이 이해하기 쉬운 문제 종류 목록
export const ISSUE_CATEGORIES = [
  "시설 고장",
  "안전 위험",
  "위생 문제",
  "환경 문제",
  "소음 문제",
  "불편 사항",
  "기타",
] as const;

export interface StatusBadgeConfig {
  label: string;
  badgeClass: string;
  dotClass: string;
  textColor: string;
}

export const STATUS_MAP: Record<ReportStatus, StatusBadgeConfig> = {
  pending: {
    label: "접수 대기",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    dotClass: "bg-slate-400",
    textColor: "text-slate-700",
  },
  reviewing: {
    label: "확인 중",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    dotClass: "bg-blue-500",
    textColor: "text-blue-700",
  },
  in_progress: {
    label: "처리 중",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
    dotClass: "bg-amber-500",
    textColor: "text-amber-800",
  },
  completed: {
    label: "처리 완료",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    dotClass: "bg-emerald-500",
    textColor: "text-emerald-800",
  },
};
