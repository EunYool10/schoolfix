/**
 * SchoolFix 서버 보안 모듈
 *
 * 학생은 로그인 없이 쓰는 공개 서비스이므로, 다음으로 보호한다.
 *  - Rate Limit (신고 등록 / AI 요약 / 확인 코드 / 운영진 로그인 실패)
 *  - 입력값 검증 (길이·허용값)
 *  - 공용 비밀번호 bcrypt 검증 (개인 계정과 세션은 staffAuth.ts)
 *  - 보안 헤더 / CORS
 *  - 오류 정보 비노출
 *
 * "로그인 없음"이 "보안 없음"을 뜻하지 않는다.
 */

import type express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// Rate Limit (인메모리)
//
// 단일 인스턴스 기준이다. 다중 인스턴스로 확장하면 Redis 등 공유 저장소가 필요하다.
// ---------------------------------------------------------------------------

interface Bucket {
  count: number;
  resetAt: number;
  blockedUntil?: number;
}

export interface RateLimitRule {
  /** 시간 창 (ms) */
  windowMs: number;
  /** 창 안에서 허용할 요청 수 */
  max: number;
  /** 초과 시 차단 시간 (ms). 미지정 시 창이 끝날 때까지 */
  blockMs?: number;
  /** 사용자에게 보여줄 메시지 */
  message: string;
}

const buckets = new Map<string, Bucket>();

// 메모리 누수 방지: 10분마다 만료된 버킷 정리
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.resetAt < now && (!b.blockedUntil || b.blockedUntil < now)) {
      buckets.delete(key);
    }
  }
}, 10 * 60 * 1000).unref?.();

/**
 * 요청자 식별자.
 * Render 등 프록시 뒤에서는 app.set("trust proxy", 1) 이 필요하다.
 * IP 원문은 로그·화면·PDF·AI 어디에도 남기지 않고, 해시만 키로 쓴다(§33).
 */
export function clientKey(req: express.Request): string {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export function checkRateLimit(
  scope: string,
  req: express.Request,
  rule: RateLimitRule
): { allowed: boolean; retryAfterSec: number } {
  const key = `${scope}:${clientKey(req)}`;
  const now = Date.now();
  let b = buckets.get(key);

  if (b?.blockedUntil && b.blockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((b.blockedUntil - now) / 1000) };
  }

  if (!b || b.resetAt < now) {
    b = { count: 0, resetAt: now + rule.windowMs };
    buckets.set(key, b);
  }

  b.count += 1;

  if (b.count > rule.max) {
    b.blockedUntil = now + (rule.blockMs ?? rule.windowMs);
    return {
      allowed: false,
      retryAfterSec: Math.ceil((b.blockedUntil - now) / 1000),
    };
  }

  return { allowed: true, retryAfterSec: 0 };
}

/**
 * 실패한 시도만 세는 제한 — 로그인용.
 * 학교는 교사 여러 명이 IP 하나를 함께 쓰므로, 성공한 로그인까지 세면 정상 사용자가 막힌다.
 * 틀린 비밀번호만 세서 무차별 대입은 막고, 맞게 로그인한 사람은 몇 명이든 통과시킨다.
 */
export function failureLimit(scope: string, rule: RateLimitRule) {
  return {
    /** 지금 막혀 있으면 다시 시도할 수 있을 때까지 남은 초, 아니면 0 */
    blockedFor(req: express.Request): number {
      const b = buckets.get(`${scope}:${clientKey(req)}`);
      const now = Date.now();
      return b?.blockedUntil && b.blockedUntil > now ? Math.ceil((b.blockedUntil - now) / 1000) : 0;
    },
    /** 실패 1회를 기록한다. */
    fail(req: express.Request) {
      checkRateLimit(scope, req, rule);
    },
    message: rule.message,
  };
}

/** Express 미들웨어로 감싸서 쓰기 */
export function rateLimit(scope: string, rule: RateLimitRule) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const { allowed, retryAfterSec } = checkRateLimit(scope, req, rule);
    if (!allowed) {
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({ ok: false, error: rule.message });
      return;
    }
    next();
  };
}

// 실제 적용 규칙 --------------------------------------------------------------

export const LIMITS = {
  /** 신고 등록 (§23). 학교는 NAT 뒤에서 전교생이 한 IP 를 공유하므로, 한도를 낮게 잡으면 정상 사용자가 통째로 차단된다. 스크립트 대량 등록만 막을 수준으로 둔다. */
  submitReport: {
    windowMs: 10 * 60 * 1000,
    max: 60,
    blockMs: 5 * 60 * 1000,
    message: "짧은 시간에 너무 많은 신고가 등록되었습니다. 잠시 후 다시 시도해주세요.",
  } as RateLimitRule,

  /** AI 요약: 외부 API 비용이 발생하므로 더 엄격하게 */
  aiSummary: {
    windowMs: 10 * 60 * 1000,
    max: 5,
    blockMs: 10 * 60 * 1000,
    message: "AI 요약 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  } as RateLimitRule,

  /**
   * AI 사전 확인: 신고 1건당 최대 3~4회 호출되고 외부 API 비용이 발생한다.
   * 다만 접수 직전 단계라 너무 조이면 신고 자체를 못 하게 되므로,
   * 학교 공용 IP 를 고려해 여러 명이 연속으로 신고해도 걸리지 않을 선으로 둔다.
   */
  clarify: {
    windowMs: 10 * 60 * 1000,
    max: 40,
    blockMs: 5 * 60 * 1000,
    message: "신고 내용 확인 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  } as RateLimitRule,

  /** 운영진·교사 로그인: 틀린 비밀번호만 센다 (failureLimit). */
  staffLogin: {
    windowMs: 15 * 60 * 1000,
    max: 10,
    blockMs: 10 * 60 * 1000,
    message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
  } as RateLimitRule,
  /** "나도 겪었어요": 학교 공용 IP 를 고려해 넉넉히 두고, 중복은 기기 토큰으로 막는다. */
  meToo: {
    windowMs: 10 * 60 * 1000,
    max: 120,
    blockMs: 5 * 60 * 1000,
    message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  } as RateLimitRule,
  /** 처리 완료 만족도 응답 */
  feedback: {
    windowMs: 10 * 60 * 1000,
    max: 30,
    blockMs: 5 * 60 * 1000,
    message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  } as RateLimitRule,
  /**
   * 확인 코드로 내 신고 불러오기: 코드 대입을 막는다.
   * 학교 공용 IP 에서 여러 학생이 함께 써도 걸리지 않을 정도로만 둔다. 접수번호까지 맞아야 하므로 대입 공간은 충분히 크다.
   */
  recover: {
    windowMs: 15 * 60 * 1000,
    max: 30,
    blockMs: 15 * 60 * 1000,
    message: "시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
  } as RateLimitRule,
  /** 신고한 학생의 추가 설명 (사진 포함 가능) */
  followup: {
    windowMs: 10 * 60 * 1000,
    max: 30,
    blockMs: 5 * 60 * 1000,
    message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  } as RateLimitRule,
  /** 알림 구독 등록·해제 */
  push: {
    windowMs: 10 * 60 * 1000,
    max: 60,
    blockMs: 5 * 60 * 1000,
    message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  } as RateLimitRule,
};

// ---------------------------------------------------------------------------
// 공용 계정 비밀번호 (로그인 세션과 개인 계정은 staffAuth.ts)
// ---------------------------------------------------------------------------

export function isStaffPasswordConfigured(): boolean {
  const hash = process.env.STAFF_PASSWORD_HASH;
  return Boolean(hash && hash.startsWith("$2"));
}

export async function verifyStaffPassword(password: unknown): Promise<boolean> {
  const hash = process.env.STAFF_PASSWORD_HASH;
  if (!hash || typeof password !== "string" || !password) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

function teacherPasswordHashes(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(process.env.SCHOOL_TEACHER_PASSWORD_HASHES || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([schoolId, hash]) =>
      Boolean(schoolId) && typeof hash === "string" && hash.startsWith("$2")
    ));
  } catch { return {}; }
}

export function isTeacherPasswordConfigured(schoolId: string): boolean {
  return Boolean(teacherPasswordHashes()[schoolId]);
}

export async function verifyTeacherPassword(password: unknown, schoolId: string): Promise<boolean> {
  const hash = teacherPasswordHashes()[schoolId];
  if (!hash || typeof password !== "string" || !password) return false;
  try { return await bcrypt.compare(password, hash); } catch { return false; }
}

// ---------------------------------------------------------------------------
// 익명 신고 소유 토큰 ("내 신고")
//
// 로그인이 없으므로 userId 를 만들지 않는다(§9 금지 사항).
// 신고 생성 시 추측 불가능한 토큰을 발급해 브라우저에만 저장하고,
// DB 에는 SHA-256 해시만 남긴다. Math.random 은 쓰지 않는다.
// ---------------------------------------------------------------------------

export function issueOwnerToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, hash: hashOwnerToken(token) };
}

export function hashOwnerToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** 요청 본문의 소유 토큰 목록 → 해시 집합. 형식이 틀린 값은 버린다. */
export function ownerTokenHashes(tokens: unknown): Set<string> {
  const list: unknown[] = Array.isArray(tokens) ? tokens.slice(0, 200) : [];
  return new Set(list.filter((t): t is string => typeof t === "string" && /^[a-f0-9]{64}$/.test(t)).map(hashOwnerToken));
}

// ---------------------------------------------------------------------------
// 확인 코드 — 다른 기기에서 "내 신고" 를 다시 불러오기
//
// 소유 토큰은 브라우저 저장소에만 있어서, 저장소를 지우거나 기기를 바꾸면 내 신고를 잃는다.
// 그래서 접수할 때 사람이 옮겨 적을 수 있는 짧은 코드를 한 번 보여 주고, 서버에는 해시만 남긴다.
// 접수번호 + 확인 코드가 맞으면 새 소유 토큰을 발급해 그 기기를 다시 연결한다.
// 헷갈리는 글자(0/O, 1/I/L)는 뺐다. 31자 × 10자리 ≈ 49비트.
// ---------------------------------------------------------------------------

export const RECOVERY_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const RECOVERY_CODE_LENGTH = 10;

export function issueRecoveryCode(): { code: string; hash: string } {
  let raw = "";
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) raw += RECOVERY_CODE_ALPHABET[crypto.randomInt(RECOVERY_CODE_ALPHABET.length)];
  const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
  return { code, hash: hashRecoveryCode(raw) };
}

/** 사용자가 입력한 코드 → 비교용 형태(대문자 10자리). 형식이 틀리면 null */
export function normalizeRecoveryCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.toUpperCase().replace(/[\s-]/g, "");
  if (raw.length !== RECOVERY_CODE_LENGTH) return null;
  for (const ch of raw) if (!RECOVERY_CODE_ALPHABET.includes(ch)) return null;
  return raw;
}

export function hashRecoveryCode(normalized: string): string {
  return crypto.createHash("sha256").update(`recover:${normalized}`).digest("hex");
}

/** 해시를 비교할 때 앞부분이 맞는 정도로 시간이 달라지지 않게 한다. */
export function safeHashEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ---------------------------------------------------------------------------
// 입력값 검증 (§29)
// ---------------------------------------------------------------------------

export const FIELD_LIMITS = {
  title: { min: 0, max: 100 },
  description: { min: 5, max: 2000 },
  location: { min: 1, max: 50 },
  locationDetail: { min: 0, max: 150 },
  category: { min: 1, max: 30 },
  /** AI 추가 질문에 대한 답변 */
  answer: { min: 1, max: 500 },
};

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export function validateReportInput(
  body: Record<string, unknown>,
  allowedLocations: readonly string[],
  allowedCategories: readonly string[]
): ValidationResult {
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!location) return { ok: false, error: "문제 위치를 선택해주세요." };
  if (!allowedLocations.includes(location)) {
    return { ok: false, error: "허용되지 않은 위치입니다." };
  }

  if (!category) return { ok: false, error: "문제 종류를 선택해주세요." };
  if (!allowedCategories.includes(category)) {
    return { ok: false, error: "허용되지 않은 문제 종류입니다." };
  }

  if (description.length < FIELD_LIMITS.description.min) {
    return {
      ok: false,
      error: `문제 내용을 ${FIELD_LIMITS.description.min}자 이상 입력해주세요.`,
    };
  }
  if (description.length > FIELD_LIMITS.description.max) {
    return {
      ok: false,
      error: `문제 내용은 ${FIELD_LIMITS.description.max}자를 넘을 수 없습니다.`,
    };
  }

  if (title.length > FIELD_LIMITS.title.max) {
    return { ok: false, error: `제목은 ${FIELD_LIMITS.title.max}자를 넘을 수 없습니다.` };
  }

  // 상세 위치는 선택 입력이다. 고정 목록이 없으므로 길이만 제한한다.
  // 저장된 값은 React 가 escape 해서 렌더링하므로 별도 HTML 처리를 하지 않는다.
  const locationDetail =
    typeof body.locationDetail === "string" ? body.locationDetail.trim() : "";
  if (locationDetail.length > FIELD_LIMITS.locationDetail.max) {
    return {
      ok: false,
      error: `상세 위치는 ${FIELD_LIMITS.locationDetail.max}자를 넘을 수 없습니다.`,
    };
  }

  // 첨부는 data:image/* 만 허용한다. 외부 URL 을 넣으면 열람자 IP 가 새 나간다.
  const attachment = body.attachmentUrl;
  if (attachment !== null && attachment !== undefined) {
    if (typeof attachment !== "string" || !/^data:image\/(png|jpe?g|gif|webp);base64,/.test(attachment)) {
      return { ok: false, error: "첨부 파일 형식이 올바르지 않습니다." };
    }
    if (attachment.length > 12 * 1024 * 1024) {
      return { ok: false, error: "첨부 이미지 용량이 너무 큽니다." };
    }
  }

  return { ok: true };
}

/**
 * AI 사전 확인 요청 검증 (§22).
 *
 * 두 가지 형태를 받는다.
 *  - 최초 확인   : location + category + description
 *  - 답변 이어가기: sessionId + answer
 * 어느 쪽이든 신뢰할 수 없는 입력이므로 길이·허용값·타입을 서버가 확인한다.
 */
export interface ClarifyRequest {
  sessionId: string | null;
  location: string;
  category: string;
  description: string;
  answer: string;
}

export function validateClarifyInput(
  body: Record<string, unknown>,
  allowedLocations: readonly string[],
  allowedCategories: readonly string[]
): ValidationResult & { value?: ClarifyRequest } {
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";

  // 이어가기 요청 — 나머지 맥락은 서버 세션이 가지고 있다.
  if (sessionId) {
    if (sessionId.length > 100 || !/^[a-f0-9]+$/.test(sessionId)) {
      return { ok: false, error: "요청이 올바르지 않습니다." };
    }
    if (answer.length < FIELD_LIMITS.answer.min) {
      return { ok: false, error: "답변을 입력해주세요." };
    }
    if (answer.length > FIELD_LIMITS.answer.max) {
      return {
        ok: false,
        error: `답변은 ${FIELD_LIMITS.answer.max}자를 넘을 수 없습니다.`,
      };
    }
    return { ok: true, value: { sessionId, location: "", category: "", description: "", answer } };
  }

  // 최초 확인 — 신고 등록과 같은 기준으로 본다.
  const base = validateReportInput(body, allowedLocations, allowedCategories);
  if (!base.ok) return base;

  return {
    ok: true,
    value: {
      sessionId: null,
      location: String(body.location).trim(),
      category: String(body.category).trim(),
      description: String(body.description).trim(),
      answer: "",
    },
  };
}

// ---------------------------------------------------------------------------
// 보안 헤더 / CORS (§46, §48)
// ---------------------------------------------------------------------------

export function securityHeaders() {
  return (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

    // CSP: Google Fonts(Pretendard CDN) 와 인라인 스타일을 쓰는 현재 구조에 맞춘다.
    // script-src 에 'unsafe-inline' 을 넣지 않아 XSS 시 스크립트 실행을 막는다.
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "font-src 'self' https://cdn.jsdelivr.net data:",
        "img-src 'self' data: blob: https://www.google.com https://*.gstatic.com https://*.goegm.kr",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ")
    );

    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    next();
  };
}

/**
 * CORS: 프로덕션에서 와일드카드를 쓰지 않는다.
 * 프론트엔드와 API 가 같은 오리진에서 서비스되므로 기본적으로 교차 출처를 허용할 필요가 없다.
 * 필요한 경우에만 ALLOWED_ORIGINS 환경변수로 명시한다.
 */
export function corsPolicy() {
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const origin = req.headers.origin;

    if (origin && allowed.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }

    if (req.method === "OPTIONS") {
      res.sendStatus(origin && allowed.includes(origin) ? 204 : 403);
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// 오류 응답 (§47)
// ---------------------------------------------------------------------------

/** 내부 오류 정보를 사용자에게 노출하지 않는다. 상세 내용은 서버 로그로만 남긴다. */
export function safeError(
  res: express.Response,
  status: number,
  userMessage: string,
  internal?: unknown
) {
  if (internal) {
    console.error(`[error ${status}] ${userMessage}`, internal);
  }
  res.status(status).json({ ok: false, error: userMessage });
}

