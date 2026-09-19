/**
 * SchoolFix 욕설/유해 표현 필터 — 프론트엔드와 백엔드가 공유하는 단일 모듈.
 *
 * 설계 원칙
 *  1. 규칙 기반으로만 판단한다. AI에 매번 물어보지 않는다(비용·지연·일관성).
 *  2. text.includes("씨발") 같은 단순 포함 검사를 쓰지 않는다.
 *     "씨 발", "씨.발", "씨-발" 처럼 구분자를 끼워 넣는 우회를 잡아야 하기 때문이다.
 *  3. 구분자 허용은 "금지어 글자 사이"에만 적용한다.
 *     문장 전체에서 공백을 제거하면 "학교를 보지 못했어요" 가
 *     "학교를보지못했어요" 가 되어 정상 문장을 오탐한다.
 *  4. 정상적인 불만·감정 표현은 차단하지 않는다.
 *     "화장실이 미친 듯이 더워요" 는 통과해야 한다.
 *
 * 최종 차단 여부는 반드시 서버(POST /api/reports)에서 결정한다.
 * 프론트엔드 검사는 사용자 편의를 위한 사전 안내일 뿐이다.
 */

export type ProfanityCategory =
  | "severe_profanity" // 심한 욕설
  | "family_insult" // 부모/가족 대상 패드립
  | "sexual" // 노골적인 성적 비속어
  | "severe_insult"; // 심각한 모욕 표현

interface BlockedTerm {
  /** 금지 표현 (글자 사이 구분자는 자동 허용) */
  term: string;
  category: ProfanityCategory;
  /**
   * 정상 단어의 일부로 흔히 쓰이는 표현인지 여부.
   * true 이면 exceptions 에 걸리지 않을 때만 차단한다.
   */
  ambiguous?: boolean;
  /** 이 패턴에 걸리면 정상 표현으로 보고 통과시킨다. */
  exceptions?: RegExp[];
}

/**
 * 금지어 중앙 목록.
 * 같은 수준의 표현을 추가할 때는 이 배열만 수정한다.
 */
const BLOCKED_TERMS: BlockedTerm[] = [
  // --- 심한 욕설 ---
  { term: "시발", category: "severe_profanity" },
  { term: "씨발", category: "severe_profanity" },
  { term: "시팔", category: "severe_profanity" },
  { term: "씨팔", category: "severe_profanity" },
  { term: "좆", category: "severe_profanity" },
  { term: "지랄", category: "severe_profanity" },
  { term: "개새끼", category: "severe_profanity" },
  { term: "새끼", category: "severe_profanity", ambiguous: true, exceptions: [/(강아지|고양이|짐승|동물|사자|호랑이)\s*새끼/] },
  { term: "꺼져", category: "severe_profanity" },

  // --- 심각한 모욕 ---
  { term: "병신", category: "severe_insult" },
  { term: "븅신", category: "severe_insult" },
  { term: "등신", category: "severe_insult" },
  { term: "찐따", category: "severe_insult" },
  { term: "머저리", category: "severe_insult" },

  // --- 패드립 ---
  { term: "니애미", category: "family_insult" },
  { term: "느금마", category: "family_insult" },
  { term: "느그애미", category: "family_insult" },
  { term: "엄마뒤짐", category: "family_insult" },
  { term: "애미뒤", category: "family_insult" },
  { term: "니미", category: "family_insult" },

  // --- 노골적인 성적 비속어 ---
  { term: "섹스", category: "sexual" },
  { term: "자위", category: "sexual", ambiguous: true, exceptions: [/자위\s*(대|권|적|하는\s*군|부|수단)/] },
  {
    term: "보지",
    category: "sexual",
    ambiguous: true,
    // "보지 못했다", "보지 마세요", "보지 않아요" 등은 정상 표현이다.
    exceptions: [/보지\s*(못|말|마|않|는|도|를|만|요\b)/],
  },
  {
    term: "자지",
    category: "sexual",
    ambiguous: true,
    // "자지러지다", "(문이) 잠가지지" 등 정상 활용형 제외.
    exceptions: [/자지\s*(러|않|말|마|도|는|만)/, /[가-힣](아|어|여)\s*자지/],
  },
];

/** 금지어 글자 사이에 끼워 넣어 우회하는 데 쓰이는 문자들 */
const SEPARATOR_CLASS = "[\\s.\\-_*~^'\"`|/\\\\+=,:;!?()\\[\\]{}<>]";

/** 정규식 메타문자 이스케이프 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 안전한 범위의 텍스트 정규화.
 * 한국어 문장을 손상시키지 않는 선에서만 처리한다.
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKC") // 전각/호환 문자 정규화
    .toLowerCase()
    .replace(/(.)\1{2,}/g, "$1$1") // 3회 이상 반복 문자 축약 (씨이이이발 -> 씨이발)
    .replace(/\s+/g, " ") // 연속 공백 정리
    .trim();
}

/** 금지어 하나에 대한 "구분자 허용" 정규식을 만든다. */
function buildTermRegex(term: string): RegExp {
  const pattern = term
    .split("")
    .map((ch) => escapeRegExp(ch))
    .join(`${SEPARATOR_CLASS}*`);
  return new RegExp(pattern, "gi");
}

// 모듈 로드 시 1회만 컴파일한다.
const COMPILED = BLOCKED_TERMS.map((t) => ({
  ...t,
  regex: buildTermRegex(t.term),
}));

export interface ProfanityResult {
  blocked: boolean;
  /** 어떤 범주에 걸렸는지 (사용자에게 원문 금지어를 노출하지 않기 위해 범주만 돌려준다) */
  categories: ProfanityCategory[];
}

/**
 * 자모 축약형(ㅆㅂ, ㅄ 등) 검사.
 *
 * 주의: NFKC 정규화는 호환 자모(U+3146 ㅆ)를 한글 자모(U+110A)로 바꾼다.
 * 따라서 두 코드포인트를 모두 매칭해야 한다. 한쪽만 쓰면 정규화 이후 패턴이 맞지 않는다.
 */
const J = {
  s: "[ㅅᄉ]", // ㅅ
  ss: "[ㅆᄊ]", // ㅆ
  b: "[ㅂᄇ]", // ㅂ
  j: "[ㅈᄌ]", // ㅈ
  r: "[ㄹᄅ]", // ㄹ
  bs: "[ㅄᄡ]", // ㅄ
};

/** 뒤에 모음이 붙으면 정상 음절 입력 중일 수 있으므로 제외한다. */
const NOT_VOWEL = "(?![ㅏ-ㅣᅡ-ᅵ])";

const JAMO_PATTERNS: { pattern: RegExp; category: ProfanityCategory }[] = [
  { pattern: new RegExp(`${J.s}\\s*${J.b}${NOT_VOWEL}`), category: "severe_profanity" },
  { pattern: new RegExp(`${J.ss}\\s*${J.b}${NOT_VOWEL}`), category: "severe_profanity" },
  { pattern: new RegExp(J.bs), category: "severe_insult" },
  { pattern: new RegExp(`${J.b}\\s*${J.s}${NOT_VOWEL}`), category: "severe_insult" },
  { pattern: new RegExp(`${J.j}\\s*${J.r}${NOT_VOWEL}`), category: "severe_profanity" },
];

/**
 * 텍스트에 강한 부적절 표현이 포함되어 있는지 검사한다.
 * 어떤 단어에 걸렸는지는 반환하지 않는다(§20 — 사용자에게 금지어 목록을 알려주지 않는다).
 */
export function checkProfanity(input: string | null | undefined): ProfanityResult {
  if (!input || typeof input !== "string") {
    return { blocked: false, categories: [] };
  }

  const normalized = normalizeText(input);
  const found = new Set<ProfanityCategory>();

  for (const entry of COMPILED) {
    entry.regex.lastIndex = 0;
    if (!entry.regex.test(normalized)) continue;

    // 모호한 표현은 예외 패턴에 걸리면 정상으로 본다.
    if (entry.ambiguous && entry.exceptions?.some((ex) => ex.test(normalized))) {
      continue;
    }

    found.add(entry.category);
  }

  for (const j of JAMO_PATTERNS) {
    if (j.pattern.test(normalized)) found.add(j.category);
  }

  return { blocked: found.size > 0, categories: Array.from(found) };
}

/**
 * 신고의 자유 입력 필드를 한 번에 검사한다.
 * 제목/내용/위치 등 사용자가 직접 타이핑하는 모든 필드가 대상이다.
 */
export function checkReportFields(fields: {
  title?: string | null;
  description?: string | null;
  location?: string | null;
  category?: string | null;
}): ProfanityResult {
  const categories = new Set<ProfanityCategory>();

  for (const value of [fields.title, fields.description, fields.location, fields.category]) {
    const r = checkProfanity(value);
    r.categories.forEach((c) => categories.add(c));
  }

  return { blocked: categories.size > 0, categories: Array.from(categories) };
}

/** 사용자에게 보여줄 안내 문구 (어떤 단어가 걸렸는지는 알려주지 않는다) */
export const PROFANITY_MESSAGE =
  "신고 내용에 사용할 수 없는 표현이 포함되어 있습니다. 해당 표현을 수정한 뒤 다시 등록해주세요.";
