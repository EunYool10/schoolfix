/**
 * SchoolFix 서버 보안 모듈
 *
 * 로그인이 없는 공개 서비스이므로, 인증 대신 다음으로 보호한다.
 *  - Rate Limit (신고 등록 / AI 요약 / 관리자 비밀번호 검증)
 *  - 입력값 검증 (길이·허용값)
 *  - 관리자 비밀번호 bcrypt 검증 (삭제 전용)
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

  /** 관리자 비밀번호 검증: 무차별 대입 방어 (§9) */
  adminVerify: {
    windowMs: 15 * 60 * 1000,
    max: 5,
    blockMs: 10 * 60 * 1000,
    message: "인증 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
  } as RateLimitRule,
};

// ---------------------------------------------------------------------------
// 관리자 비밀번호 (신고 삭제 전용)
// ---------------------------------------------------------------------------

/**
 * 비밀번호 원문은 서버 코드·프론트엔드·DB·로그 어디에도 두지 않는다.
 * bcrypt 해시만 환경변수 ADMIN_PASSWORD_HASH 로 주입받는다.
 */
export function isAdminPasswordConfigured(): boolean {
  const h = process.env.ADMIN_PASSWORD_HASH;
  return Boolean(h && h.startsWith("$2"));
}

export async function verifyAdminPassword(password: unknown): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash || typeof password !== "string" || !password) return false;

  try {
    return await bcrypt.compare(password, hash);
  } catch {
    // 오류 내용을 호출측에 전달하지 않는다 (§9 — 인증 방식 비노출)
    return false;
  }
}

// ---------------------------------------------------------------------------
// 삭제 토큰
//
// 비밀번호를 두 번 전송하지 않도록, 검증 성공 시 짧은 수명의 1회용 토큰을 발급한다.
// 토큰은 특정 신고 ID에 묶이며 메모리에만 존재한다.
// ---------------------------------------------------------------------------

interface DeleteGrant {
  reportId: string;
  expiresAt: number;
}

const deleteGrants = new Map<string, DeleteGrant>();
const DELETE_TOKEN_TTL_MS = 2 * 60 * 1000;

export function issueDeleteToken(reportId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  deleteGrants.set(token, { reportId, expiresAt: Date.now() + DELETE_TOKEN_TTL_MS });
  return token;
}

/** 1회용 — 성공하면 즉시 폐기한다. */
export function consumeDeleteToken(token: unknown, reportId: string): boolean {
  if (typeof token !== "string" || !token) return false;

  const grant = deleteGrants.get(token);
  if (!grant) return false;

  deleteGrants.delete(token);

  if (grant.expiresAt < Date.now()) return false;
  if (grant.reportId !== reportId) return false;

  return true;
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

// ---------------------------------------------------------------------------
// 입력값 검증 (§29)
// ---------------------------------------------------------------------------

export const FIELD_LIMITS = {
  title: { min: 0, max: 100 },
  description: { min: 5, max: 2000 },
  location: { min: 1, max: 50 },
  category: { min: 1, max: 30 },
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
        "img-src 'self' data: blob:",
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
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Delete-Token");
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
