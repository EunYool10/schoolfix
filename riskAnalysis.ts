/**
 * SchoolFix 위험도 분석 — 중앙화된 백엔드 로직
 *
 * 이 파일이 위험도 계산의 유일한 출처다. 프론트엔드나 다른 모듈에서
 * 위험도를 따로 계산하지 않는다.
 *
 * 핵심 원칙:
 *  1. AI는 5개 위험요소를 0~4점으로 "평가"만 한다. 점수 계산과 등급 결정은 서버가 한다.
 *  2. 서버가 공식으로 risk_score를 재계산하므로 AI의 산술 오류가 결과에 영향을 주지 않는다.
 *  3. 신고에 없는 사실은 추측하지 않는다. 정보가 부족하면 등급을 올리지 않고 플래그를 세운다.
 *  4. 즉각적 안전 위험(Emergency Override)은 점수보다 우선한다.
 *  5. 반복 신고는 보조 정보다. 신고 수만으로 위험도가 올라가지 않는다.
 */

export type RiskLevel = "긴급" | "높음" | "중간" | "낮음";

export const RISK_LEVELS: RiskLevel[] = ["긴급", "높음", "중간", "낮음"];

export interface RiskFactors {
  immediacy: number;
  accident_probability: number;
  severity: number;
  affected_people: number;
  persistence: number;
}

export const RISK_FACTOR_KEYS: (keyof RiskFactors)[] = [
  "immediacy",
  "accident_probability",
  "severity",
  "affected_people",
  "persistence",
];

/** AI가 반환하는 원본 판정 (검증 전) */
export interface RawRiskVerdict {
  risk_level: RiskLevel;
  risk_score: number;
  reason: string;
  risk_factors: RiskFactors;
  repeat_report_score: number;
  emergency_override: boolean;
  needs_more_info: boolean;
  needs_human_review: boolean;
  follow_up_question: string | null;
}

/** DB에 저장되는 최종 분석 결과 (서버 검증·재계산 완료) */
export interface RiskAnalysis extends RawRiskVerdict {
  /** 반복 신고 보정 전 기본 점수 */
  base_risk_score: number;
  /** 실제로 가산된 보조 점수 (0~5) */
  repeat_report_bonus: number;
  analyzed_at: string;
  model: string;
}

/** 백엔드가 AI에게 전달하는 입력 (DB에서 온 사실만 포함) */
export interface RiskAnalysisInput {
  report_text: string;
  location?: string | null;
  category?: string | null;
  /** 실제 DB에서 집계된 동일 위치·유형의 이전 신고 수. 추측값을 넣지 않는다. */
  repeat_report_count: number;
  /** 실제 DB에 존재하는 이전 신고 본문 (최대 3건) */
  previous_reports: string[];
}

// ---------------------------------------------------------------------------
// 점수 계산 (§10 ~ §12)
// ---------------------------------------------------------------------------

const FACTOR_WEIGHTS: Record<keyof RiskFactors, number> = {
  immediacy: 30,
  accident_probability: 30,
  severity: 25,
  persistence: 10,
  affected_people: 5,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * §10 — 가중 합계를 0~100으로 환산한다.
 * 최대값: (4*30 + 4*30 + 4*25 + 4*10 + 4*5) / 4 = 400 / 4 = 100
 */
export function computeBaseRiskScore(factors: RiskFactors): number {
  const weighted =
    factors.immediacy * FACTOR_WEIGHTS.immediacy +
    factors.accident_probability * FACTOR_WEIGHTS.accident_probability +
    factors.severity * FACTOR_WEIGHTS.severity +
    factors.persistence * FACTOR_WEIGHTS.persistence +
    factors.affected_people * FACTOR_WEIGHTS.affected_people;

  return Math.min(100, Math.max(0, Math.round(weighted / 4)));
}

/**
 * §11 — 반복 신고 보조 점수 (0~5).
 *
 * 세 조건을 모두 만족할 때만 가산한다.
 *   (1) 동일·유사 문제로 판단됨       → repeatReportScore > 0
 *   (2) 현재도 문제가 지속 중          → persistence >= 2
 *   (3) 실제 DB에 이전 신고가 존재함   → actualRepeatCount > 0
 *
 * 단순히 신고 수가 많다는 이유만으로는 가산하지 않는다.
 */
export function computeRepeatBonus(
  repeatReportScore: number,
  factors: RiskFactors,
  actualRepeatCount: number
): number {
  if (repeatReportScore <= 0) return 0;
  if (actualRepeatCount <= 0) return 0; // DB 근거 없는 반복은 무시
  if (factors.persistence < 2) return 0; // 이미 해결된 문제는 가산하지 않음

  if (repeatReportScore >= 3) return 5;
  if (repeatReportScore === 2) return 3;
  return 2;
}

/**
 * §12 — 점수 구간으로 등급을 정한다.
 *   0~24 낮음 / 25~49 중간 / 50~74 높음 / 75~100 긴급
 */
export function scoreToLevel(score: number): RiskLevel {
  if (score >= 75) return "긴급";
  if (score >= 50) return "높음";
  if (score >= 25) return "중간";
  return "낮음";
}

/**
 * §12 + §13 — 최종 등급 결정.
 *
 * Emergency Override가 참이면 점수와 무관하게 긴급이다.
 * 반대로 점수만으로 75점을 넘었으나 명확한 즉각 위험이 확인되지 않은 경우,
 * "무조건 긴급으로 확정하지 않는다"는 규칙에 따라 담당자 검토 플래그를 세운다.
 */
export function resolveRiskLevel(
  score: number,
  emergencyOverride: boolean
): { level: RiskLevel; forceHumanReview: boolean } {
  if (emergencyOverride) {
    return { level: "긴급", forceHumanReview: false };
  }

  const level = scoreToLevel(score);
  return { level, forceHumanReview: level === "긴급" };
}

// ---------------------------------------------------------------------------
// 서버측 검증 (§27)
// ---------------------------------------------------------------------------

export class RiskValidationError extends Error {}

/**
 * AI 응답을 그대로 신뢰하지 않는다.
 * 범위를 벗어난 값은 거부하고, 점수와 등급은 서버가 다시 계산한다.
 */
export function validateAndNormalize(
  raw: unknown,
  input: RiskAnalysisInput,
  model: string
): RiskAnalysis {
  if (!raw || typeof raw !== "object") {
    throw new RiskValidationError("AI 응답이 객체가 아닙니다.");
  }

  const r = raw as Record<string, any>;

  // --- risk_factors: 5개 항목이 모두 0~4 정수여야 한다 ---
  if (!r.risk_factors || typeof r.risk_factors !== "object") {
    throw new RiskValidationError("risk_factors 가 없습니다.");
  }
  const factors = {} as RiskFactors;
  for (const key of RISK_FACTOR_KEYS) {
    const v = r.risk_factors[key];
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 4) {
      throw new RiskValidationError(`risk_factors.${key} 가 0~4 범위를 벗어났습니다: ${v}`);
    }
    factors[key] = Math.round(n);
  }

  // --- boolean 필드는 실제 boolean 이어야 한다 ---
  for (const key of ["emergency_override", "needs_more_info", "needs_human_review"]) {
    if (typeof r[key] !== "boolean") {
      throw new RiskValidationError(`${key} 가 boolean 이 아닙니다: ${typeof r[key]}`);
    }
  }

  // --- reason 은 비어 있지 않은 문자열 ---
  const reason = typeof r.reason === "string" ? r.reason.trim() : "";
  if (!reason) {
    throw new RiskValidationError("reason 이 비어 있습니다.");
  }

  const repeatReportScore = clampInt(r.repeat_report_score, 0, 3, 0);

  // --- 점수는 AI 값을 쓰지 않고 서버가 공식으로 재계산한다 (재현성 보장) ---
  const baseScore = computeBaseRiskScore(factors);
  const repeatBonus = computeRepeatBonus(repeatReportScore, factors, input.repeat_report_count);
  const finalScore = Math.min(100, baseScore + repeatBonus);

  const emergencyOverride = r.emergency_override === true;
  const { level, forceHumanReview } = resolveRiskLevel(finalScore, emergencyOverride);

  const needsMoreInfo = r.needs_more_info === true;
  const needsHumanReview = r.needs_human_review === true || forceHumanReview;

  // --- follow_up_question: 추가 정보가 필요하면 반드시 문자열이어야 한다 ---
  let followUp: string | null = null;
  if (typeof r.follow_up_question === "string" && r.follow_up_question.trim()) {
    followUp = r.follow_up_question.trim();
  }
  if (needsMoreInfo && !followUp) {
    followUp =
      "어느 장소에서 어떤 문제가 발생했는지, 현재 어떤 위험이나 불편이 있는지, 얼마나 오래 지속되었는지 알려주세요.";
  }

  return {
    risk_level: level,
    risk_score: finalScore,
    base_risk_score: baseScore,
    repeat_report_bonus: repeatBonus,
    reason,
    risk_factors: factors,
    repeat_report_score: repeatReportScore,
    emergency_override: emergencyOverride,
    needs_more_info: needsMoreInfo,
    needs_human_review: needsHumanReview,
    follow_up_question: followUp,
    analyzed_at: new Date().toISOString(),
    model,
  };
}

// ---------------------------------------------------------------------------
// OpenAI Structured Outputs (§23)
// ---------------------------------------------------------------------------

export const RISK_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    risk_level: { type: "string", enum: RISK_LEVELS },
    risk_score: { type: "integer", minimum: 0, maximum: 100 },
    reason: { type: "string" },
    risk_factors: {
      type: "object",
      additionalProperties: false,
      properties: {
        immediacy: { type: "integer", minimum: 0, maximum: 4 },
        accident_probability: { type: "integer", minimum: 0, maximum: 4 },
        severity: { type: "integer", minimum: 0, maximum: 4 },
        affected_people: { type: "integer", minimum: 0, maximum: 4 },
        persistence: { type: "integer", minimum: 0, maximum: 4 },
      },
      required: [
        "immediacy",
        "accident_probability",
        "severity",
        "affected_people",
        "persistence",
      ],
    },
    repeat_report_score: { type: "integer", minimum: 0, maximum: 3 },
    emergency_override: { type: "boolean" },
    needs_more_info: { type: "boolean" },
    needs_human_review: { type: "boolean" },
    follow_up_question: { type: ["string", "null"] },
  },
  required: [
    "risk_level",
    "risk_score",
    "reason",
    "risk_factors",
    "repeat_report_score",
    "emergency_override",
    "needs_more_info",
    "needs_human_review",
    "follow_up_question",
  ],
} as const;

// ---------------------------------------------------------------------------
// System Prompt (§24)
// ---------------------------------------------------------------------------

export const RISK_SYSTEM_PROMPT = `너는 SchoolFix AI의 학교 시설·불편 신고 위험도 분석 시스템이다.
학생이 제출한 신고 내용을 분석하고, 아래에 정의된 고정 평가 기준에 따라 위험요소를 채점한다.

너의 역할은 학교 시설의 최종 안전 판정을 내리는 것이 아니다.
신고 내용을 객관적으로 분석하여 학교 담당자가 확인할 수 있는 근거를 제공하는 것이다.

[분석 순서 — 반드시 이 순서를 따른다]
1. 신고 내용에서 확인 가능한 사실만 추출한다.
2. 위험 상황이 "현재" 존재하는지 판단한다. 이미 해결된 과거 문제와 구분한다.
3. 정보가 충분한지 확인한다.
4. 5개 위험요소를 각각 0~4점으로 평가한다.
5. 반복 신고 정보를 보조적으로만 반영한다.
6. Emergency Override 조건을 별도로 검사한다.
7. 판단 근거를 작성한다.
8. 추가 정보나 담당자 확인이 필요하면 플래그를 설정한다.

[위험요소 채점 기준 — 0=사실상 없음, 1=매우 낮음, 2=낮거나 중간, 3=높음, 4=매우 높음]

immediacy (즉시성)
 0: 안전과 무관. 예) "교실 시계가 5분 느려요."
 1: 문제는 있으나 사고로 이어질 가능성 거의 없음. 예) "게시판 종이가 떨어졌어요."
 2: 상황에 따라 불편 또는 경미한 위험. 예) "복도 전등 하나가 꺼져 있어요."
 3: 지속 중이며 가까운 시간 안에 사고 가능성. 예) "화장실 바닥에 물이 계속 고여 있어요."
 4: 지금 당장 사고 가능성이 매우 높거나 이미 위험이 진행 중. 예) "콘센트에서 연기가 나요."

accident_probability (사고 발생 가능성)
 0: 사고 가능성 사실상 없음 (단순 취향·편의 문제)
 1: 매우 낮음
 2: 특정 조건에서 경미한 사고 가능
 3: 학생이 넘어지거나 다칠 가능성이 상당함. 예) "운동장 바닥이 크게 파여 발을 헛디뎌요."
 4: 사고 가능성이 매우 높거나 사고 직전 상황. 예) "계단 난간이 거의 빠질 것 같아요."

severity (사고 시 피해 정도)
 0: 안전 피해 없음, 단순 편의
 1: 경미한 불편 또는 작은 손상
 2: 가벼운 부상 또는 지속적 불편
 3: 상당한 부상 또는 시설 손상
 4: 심각한 부상, 화재, 감전 등 중대 사고

affected_people (영향 범위) — 안전 점수보다 우선순위가 낮다
 0: 타인에게 사실상 영향 없음
 1: 개인 또는 한두 명
 2: 한 학급 또는 소수
 3: 여러 학급이 쓰는 공간
 4: 학교 전체
 주의: 영향 범위가 넓다는 이유만으로 긴급·높음으로 올리지 않는다.

persistence (문제 지속성)
 0: 일회성이거나 이미 해결됨
 1: 짧은 시간 발생
 2: 반복되거나 일정 시간 지속
 3: 며칠 이상 지속·반복
 4: 장기간 지속되며 해결되지 않음

[반복 신고 — repeat_report_score 0~3]
 0: 이전 신고 없음 / 1: 2~3건 / 2: 4~9건 / 3: 10건 이상
 반드시 입력으로 전달된 repeat_report_count 와 previous_reports 에만 근거한다.
 전달되지 않은 신고 횟수를 지어내지 않는다.
 신고 수가 많다는 사실만으로 안전 위험도를 올리지 않는다.
 예) "급식 메뉴가 별로예요" 가 30건이어도 안전 위험은 낮음이다.

[Emergency Override — emergency_override]
 다음이 신고 내용에서 "실제로 일어나고 있다"고 명확히 확인될 때만 true 로 설정한다.
  - 전기: 콘센트 연기, 전선 불꽃, 타는 냄새와 이상 현상 동반, 노출 전선 접근 가능, 명확한 감전 위험
  - 화재/연기: 실제 화재 발생, 실제 연기 발생, 현재 존재하는 불꽃·화재 징후
  - 구조: 난간이 빠질 듯 심하게 흔들림, 천장·벽 일부가 떨어지는 중, 통행로 시설물 낙하 임박
  - 즉각 중상 위험: 사람이 바로 다칠 가능성이 매우 높음, 이미 심각한 사고 진행 중

 절대 금지: 위험 관련 "단어"가 포함되었다는 이유만으로 true 로 설정하는 것.
 반드시 문맥을 확인한다.
  - "화재 대피 훈련을 했어요" → 실제 화재 아님 → false
  - "화재가 발생해서 교실에 연기가 들어오고 있어요" → true

[정보 부족 — needs_more_info]
 장소·문제·현재 상태를 알 수 없어 안정적 판단이 어려우면 true 로 설정하고
 follow_up_question 에 한 번에 필요한 정보를 묻는 질문을 작성한다.
 (위치 / 무엇이 문제인지 / 현재 상태 / 사고·부상 가능성 / 지속 기간)
 정보가 부족하다는 이유로 위험도를 높게 추측하지 않는다. 점수는 확인된 사실에만 근거한다.

[담당자 검토 — needs_human_review]
 다음 중 하나라도 해당하면 true:
  - 신고 내용이 서로 모순됨
  - 위험도를 안정적으로 판단하기 어려움
  - 구조적 안전 여부를 글만으로 확인할 수 없음
  - 사진·추가 정보가 필요함
  - 심각한 안전 문제인지 단순 불편인지 구분하기 어려움
  - 내용이 지나치게 추상적임
  - Emergency Override 여부가 애매함

[Hallucination 금지 — 가장 중요]
 신고 내용과 입력 데이터에 없는 정보를 절대 생성하지 않는다.
 학생 수, 위치, 피해자 수, 사고·부상 발생 여부, 시설 상태, 지속 기간,
 신고 횟수, 시설 이용 인원, 위험 원인을 임의로 만들어내지 않는다.
 예) "복도 바닥이 미끄러워요" 에 대해 "매일 300명이 이용하는 복도이므로" 라고 쓰면 안 된다.

[출력]
 risk_score 와 risk_level 도 스키마상 채워야 하지만, 최종 값은 서버가 공식으로 재계산한다.
 따라서 위험요소 5개 점수를 정확히 매기는 데 집중한다.
 reason 에는 신고 내용에 실제로 근거한 핵심 판단 이유를 1~2문장으로 간결하게 쓴다.
 지정된 JSON 스키마만 출력하고 Markdown 이나 설명 문구를 덧붙이지 않는다.`;

// ---------------------------------------------------------------------------
// 입력 구성
// ---------------------------------------------------------------------------

export function buildUserPrompt(input: RiskAnalysisInput): string {
  const payload: Record<string, unknown> = {
    report_text: input.report_text,
    location: input.location || null,
    category: input.category || null,
    repeat_report_count: input.repeat_report_count,
    previous_reports: input.previous_reports,
  };

  return `다음 학교 신고를 평가 기준에 따라 분석하라.
repeat_report_count 와 previous_reports 는 실제 데이터베이스에서 집계된 값이다.
이 입력에 없는 사실은 추측하지 마라.

${JSON.stringify(payload, null, 2)}`;
}

// ---------------------------------------------------------------------------
// OpenAI 호출
// ---------------------------------------------------------------------------

export const RISK_MODELS = ["gpt-5.6-terra", "gpt-5.6-luna"];

/**
 * 신고 1건의 위험도를 분석한다.
 * 실패 시 예외를 던진다. 호출측에서 신고 저장 자체는 계속 진행해야 한다.
 */
export async function analyzeReportRisk(
  input: RiskAnalysisInput,
  apiKey: string
): Promise<RiskAnalysis> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  let lastError: unknown = null;

  for (const model of RISK_MODELS) {
    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: RISK_SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(input) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "school_report_risk",
            strict: true,
            schema: RISK_JSON_SCHEMA as unknown as Record<string, unknown>,
          },
        },
      });

      const text = completion.choices[0]?.message?.content?.trim();
      if (!text) throw new Error("AI 응답이 비어 있습니다.");

      // 스키마를 통과했더라도 서버가 다시 검증하고 점수를 재계산한다.
      return validateAndNormalize(JSON.parse(text), input, model);
    } catch (err) {
      lastError = err;
      if (err instanceof RiskValidationError) {
        console.warn(`[risk] ${model} 응답 검증 실패: ${err.message}`);
      } else {
        console.log(`[risk] ${model} 호출 실패, 다음 모델로 전환합니다.`);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("위험도 분석에 실패했습니다.");
}
