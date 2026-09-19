export type ReportStatus = "pending" | "reviewing" | "in_progress" | "completed";
export type ReportPriority = "urgent" | "medium" | "low";

export const ADMIN_EMAIL = "eunyool100208@gmail.com";
export const ADMIN_EMAILS = ["eunyool100208@gmail.com", "studioteamdeer@gmail.com"];

export function isUserAdmin(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ADMIN_EMAILS.some((a) => a.toLowerCase() === normalized);
}

export interface UserProfile {
  id: string; // SchoolFix 내부 user_id (예: usr_...)
  google_sub: string; // Google 계정 고유 식별자 (sub)
  email: string;
  name: string;
  profile_image?: string;
  picture?: string;
  avatar?: string;
  role: "USER" | "ADMIN";
  created_at?: string;
  last_login_at?: string;
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

export interface SchoolReport {
  id: string;
  user_id?: string | null; // 작성자의 SchoolFix 내부 user_id
  google_sub?: string | null;
  title?: string;
  location: string;
  category: string;
  description: string;
  isAnonymous: boolean;
  userEmail?: string | null;
  userName?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  status: ReportStatus;
  priority?: ReportPriority;
  adminNote?: string;
  /** 관리자 응답에만 포함된다. 학생/공개 응답에서는 서버가 제거한다. */
  riskAnalysis?: RiskAnalysis | null;
  riskAnalysisError?: string | null;
  /** 학생 응답에 포함되는 최소 정보 — 담당자 확인이 필요한 건인지 여부 */
  needsHumanReview?: boolean;
  assignee?: string | null;
  resolutionNote?: string | null;
  reviewedAt?: string | null;
  inProgressAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// 전체 진행상황 공개 뷰 전용 (개인정보 완벽 차단 모델)
export interface PublicReportItem {
  id: string;
  title?: string;
  location: string;
  category: string;
  description: string;
  status: ReportStatus;
  priority?: ReportPriority;
  assignee?: string | null;
  resolutionNote?: string | null;
  reviewedAt?: string | null;
  inProgressAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportStatistics {
  total: number;
  pending: number;
  reviewing: number;
  inProgress: number;
  completed: number;
}

// 학교 담당 부서 목록
export const SCHOOL_ASSIGNEES = [
  "시설관리실",
  "행정실",
  "학생안전부",
  "보건실",
  "정보통신실",
  "급식운영실",
  "기타 부서",
] as const;

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

export interface PriorityBadgeConfig {
  label: "긴급" | "보통" | "낮음";
  badgeClass: string;
  dotClass: string;
  textColor: string;
}

export const PRIORITY_MAP: Record<ReportPriority, PriorityBadgeConfig> = {
  urgent: {
    label: "긴급",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200 font-bold",
    dotClass: "bg-rose-500",
    textColor: "text-rose-700",
  },
  medium: {
    label: "보통",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200 font-medium",
    dotClass: "bg-blue-500",
    textColor: "text-blue-700",
  },
  low: {
    label: "낮음",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200 font-medium",
    dotClass: "bg-slate-400",
    textColor: "text-slate-600",
  },
};

// ==========================================
// AI 신고 분석 리포트 타입 정의
// ==========================================
/** 위험도 등급은 RiskLevel 하나만 쓴다. 별도 등급 체계를 만들지 않는다(§2). */
export type AIPriorityLevel = RiskLevel;

export interface AIPriorityItem {
  reportId: string;
  location: string;
  category: string;
  contentSummary: string;
  currentStatus: string;
  priority: AIPriorityLevel;
  rationale: string;
  /** 서버가 산출한 0~100 위험 점수 */
  riskScore?: number;
  riskFactors?: RiskFactors;
  emergencyOverride?: boolean;
  needsMoreInfo?: boolean;
  needsHumanReview?: boolean;
}

export interface AILocationSummary {
  location: string;
  count: number;
  summary: string;
}

export interface AICategorySummary {
  category: string;
  count: number;
  summary: string;
}

export interface AIRecurringIssue {
  issue: string;
  evidence: string;
}

export interface AISafetyTrend {
  overallRiskLevel: "safe" | "caution" | "warning" | "dangerous";
  overallRiskLevelLabel: string;
  trendHeadline: string;
  trendSummary: string;
  hotspots: { location: string; reason: string; riskLevel: string }[];
  frequentRisks: { category: string; description: string; riskLevel: string }[];
  urgentActionNeeded: boolean;
}

export interface AIAnalysisReportData {
  analyzedAt: string;
  targetCount: number;
  /** 위험도 분석이 완료된 신고 수 */
  analyzedCount?: number;
  /** 아직 분석되지 않은 신고 수 (재분석 필요) */
  unanalyzedCount?: number;
  flagStats?: {
    emergencyOverride: number;
    needsMoreInfo: number;
    needsHumanReview: number;
  };
  stats: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
  };
  overallSummary: string;
  safetyTrends?: AISafetyTrend;
  locationSummaries: AILocationSummary[];
  categorySummaries: AICategorySummary[];
  priorityStats: {
    urgent: number;
    high: number;
    medium: number;
    low: number;
  };
  priorityItems: AIPriorityItem[];
  recurringIssues: AIRecurringIssue[];
  recommendations: string[];
}

