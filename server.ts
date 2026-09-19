/**
 * SchoolFix AI — 공개형 학교 신고 서비스 백엔드
 *
 * 인증 구조
 *  - 일반 사용자 로그인 없음. 누구나 신고 등록/조회/AI 요약/PDF/인쇄 사용 가능.
 *  - "내 신고" 는 로그인 대신 신고 생성 시 발급하는 익명 소유 토큰으로 식별한다.
 *    (DB 에는 해시만 저장, 원본은 브라우저에만 존재)
 *  - 관리자 권한이 필요한 기능은 "신고 삭제" 하나뿐이며,
 *    서버가 bcrypt 해시로 비밀번호를 검증한 뒤 1회용 삭제 토큰을 발급한다.
 *
 * 보안은 serverSecurity.ts 에 모아 두었다.
 */

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

// 인자 없는 dotenv.config()는 .env만 읽기 때문에 README가 안내하는 .env.local이 무시된다.
dotenv.config({ path: [".env.local", ".env"] });

import {
  analyzeReportRisk,
  type RiskAnalysis,
  type RiskAnalysisInput,
} from "./riskAnalysis";
import {
  generateAiSummary,
  type AiReportInput,
  type AiSummaryResult,
  type ReportStatistics,
} from "./aiSummary";
import {
  rateLimit,
  checkRateLimit,
  LIMITS,
  verifyAdminPassword,
  isAdminPasswordConfigured,
  issueDeleteToken,
  consumeDeleteToken,
  issueOwnerToken,
  hashOwnerToken,
  validateReportInput,
  securityHeaders,
  corsPolicy,
  safeError,
} from "./serverSecurity";
import { checkReportFields, PROFANITY_MESSAGE } from "./src/security/profanityFilter";
import { SCHOOL_LOCATIONS, ISSUE_CATEGORIES } from "./src/types";

const app = express();
// 호스팅 플랫폼(Render/Railway 등)은 PORT를 주입한다. 로컬에서는 3000.
const PORT = Number(process.env.PORT) || 3000;

// Render 등 프록시 뒤에서 req.ip 가 실제 클라이언트를 가리키도록 한다 (Rate Limit 정확도).
app.set("trust proxy", 1);

app.use(securityHeaders());
app.use(corsPolicy());
app.use(express.json({ limit: "15mb" }));

// 배포 시에는 영구 디스크 마운트 경로를 DATA_DIR로 지정한다(예: /var/data).
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "reports_db.json");

interface StoredReport {
  id: string;
  title?: string;
  location: string;
  category: string;
  description: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  status: "pending" | "reviewing" | "in_progress" | "completed";
  assignee?: string | null;
  resolutionNote?: string | null;
  riskAnalysis?: RiskAnalysis | null;
  riskAnalysisError?: string | null;
  /** 익명 소유 토큰의 SHA-256 해시. "내 신고" 조회에만 사용하며 절대 외부로 내보내지 않는다. */
  ownerTokenHash?: string | null;
  /** Soft Delete — 값이 있으면 모든 공개 기능에서 제외된다. */
  deletedAt?: string | null;
  reviewedAt?: string | null;
  inProgressAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 영구 디스크가 없는 환경에서는 슬립·재배포마다 DB가 비워진다.
// 시연용 예시 신고(data.seed.json)가 있으면 DB가 없을 때만 1회 주입한다.
function seedReportsIfEmpty() {
  try {
    if (fs.existsSync(DB_FILE)) return;
    const seedFile = path.join(process.cwd(), "data.seed.json");
    if (!fs.existsSync(seedFile)) return;
    const parsed = JSON.parse(fs.readFileSync(seedFile, "utf-8"));
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), "utf-8");
    console.log(`[seed] 예시 신고 ${parsed.length}건을 주입했습니다.`);
  } catch (err) {
    console.error("[seed] 시드 데이터 주입 실패:", err);
  }
}
seedReportsIfEmpty();

// ---------------------------------------------------------------------------
// 저장소
// ---------------------------------------------------------------------------

function loadAllReports(): StoredReport[] {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error("[db] reports_db.json 읽기 실패:", err);
  }
  return [];
}

/**
 * 삭제되지 않은 신고만 반환한다.
 * 목록·검색·상세·통계·AI·PDF·인쇄 등 모든 공개 경로는 반드시 이 함수를 쓴다(§12).
 */
function loadReports(): StoredReport[] {
  return loadAllReports().filter((r) => !r.deletedAt);
}

function saveReports(reports: StoredReport[]) {
  try {
    // 임시 파일에 쓴 뒤 교체한다. 쓰기 도중 중단돼도 기존 파일이 깨지지 않는다.
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(reports, null, 2), "utf-8");
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error("[db] reports_db.json 저장 실패:", err);
  }
}

// ---------------------------------------------------------------------------
// 공개 DTO — DB 객체를 그대로 내보내지 않는다 (§13, §55)
// ---------------------------------------------------------------------------

/**
 * 누구나 볼 수 있는 형태.
 * 개인정보와 내부 식별값(ownerTokenHash 등)은 포함하지 않는다.
 *
 * 과거 로그인 기능이 있던 시절의 신고에는 userEmail/userName 이 남아 있을 수 있는데,
 * 이 DTO 는 화이트리스트 방식이라 그런 필드가 자동으로 걸러진다.
 */
function toPublicReport(r: StoredReport) {
  return {
    id: r.id,
    title: r.title ?? "",
    location: r.location,
    category: r.category,
    description: r.description,
    status: r.status,
    riskLevel: r.riskAnalysis?.risk_level ?? null,
    riskScore: r.riskAnalysis?.risk_score ?? null,
    riskAnalysis: r.riskAnalysis ?? null,
    attachmentUrl: r.attachmentUrl ?? null,
    assignee: r.assignee ?? null,
    resolutionNote: r.resolutionNote ?? null,
    reviewedAt: r.reviewedAt ?? null,
    inProgressAt: r.inProgressAt ?? null,
    completedAt: r.completedAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** "내 신고" — 공개 형태와 동일하되 본인 것임을 표시한다. */
function toMyReport(r: StoredReport) {
  return { ...toPublicReport(r), isMine: true as const };
}

// ---------------------------------------------------------------------------
// 위험도 분석 연동 (riskAnalysis.ts 가 유일한 계산 출처)
// ---------------------------------------------------------------------------

function buildRepeatContext(
  reports: StoredReport[],
  location: string,
  category: string,
  excludeId?: string
): { count: number; previous: string[] } {
  const matches = reports.filter(
    (r) =>
      r.id !== excludeId &&
      r.location === location &&
      r.category === category &&
      r.status !== "completed"
  );
  return { count: matches.length, previous: matches.slice(0, 3).map((r) => r.description) };
}

async function runRiskAnalysis(
  description: string,
  location: string,
  category: string,
  repeat: { count: number; previous: string[] }
): Promise<{ analysis: RiskAnalysis | null; error: string | null }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { analysis: null, error: "위험도 분석을 사용할 수 없습니다." };
  }

  const input: RiskAnalysisInput = {
    report_text: description,
    location,
    category,
    repeat_report_count: repeat.count,
    previous_reports: repeat.previous,
  };

  try {
    return { analysis: await analyzeReportRisk(input, apiKey), error: null };
  } catch (err) {
    console.error("[risk] 분석 실패:", err instanceof Error ? err.message : err);
    return { analysis: null, error: "위험도 분석에 실패했습니다." };
  }
}

// ---------------------------------------------------------------------------
// 미분석 신고 자동 채점
//
// 위험도는 접수 시점에 매겨진다. 하지만 그때 API 키가 없었거나 호출이 실패했거나,
// 시드로 주입된 신고처럼 애초에 접수 과정을 거치지 않은 건은 등급이 비어 있다.
// 관리자 화면을 없앴기 때문에 사람이 수동으로 다시 돌릴 방법도 없다.
//
// 그래서 서버가 뜬 뒤 백그라운드로 미분석 건을 하나씩 채점한다.
//  - 기동을 막지 않도록 비동기로 돌린다
//  - 건당 간격을 두어 API 를 몰아치지 않는다
//  - 실패하면 사유만 남기고 넘어가며, 다음 기동 때 다시 시도한다
// ---------------------------------------------------------------------------

const BACKFILL_DELAY_MS = 1500;
const BACKFILL_MAX_PER_RUN = 20;

async function backfillMissingRiskAnalysis() {
  if (!process.env.OPENAI_API_KEY) return;

  const pending = loadReports().filter((r) => !r.riskAnalysis);
  if (pending.length === 0) return;

  const targets = pending.slice(0, BACKFILL_MAX_PER_RUN);
  console.log(
    `[risk] 미분석 신고 ${pending.length}건 확인, ${targets.length}건 채점을 시작합니다.`
  );

  let done = 0;
  for (const target of targets) {
    const repeat = buildRepeatContext(
      loadReports(),
      target.location,
      target.category,
      target.id
    );
    const { analysis, error } = await runRiskAnalysis(
      target.description,
      target.location,
      target.category,
      repeat
    );

    // 채점 중 다른 요청이 DB 를 바꿨을 수 있으므로 매번 다시 읽고 해당 건만 갱신한다.
    const all = loadAllReports();
    const idx = all.findIndex((r) => r.id === target.id);
    if (idx === -1) continue;

    if (analysis) {
      all[idx].riskAnalysis = analysis;
      all[idx].riskAnalysisError = null;
      done += 1;
    } else {
      all[idx].riskAnalysisError = error;
    }
    saveReports(all);

    // 집합이 바뀌었으니 요약 캐시를 버린다.
    summaryCache = null;

    await new Promise((resolve) => setTimeout(resolve, BACKFILL_DELAY_MS));
  }

  console.log(`[risk] 자동 채점 완료: ${done}/${targets.length}건`);
}

// ---------------------------------------------------------------------------
// 통계 — 반드시 실제 DB 에서 계산한다 (§20)
// ---------------------------------------------------------------------------

function computeStatistics(reports: StoredReport[]): ReportStatistics {
  const byRisk: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byLocation: Record<string, number> = {};
  let unanalyzed = 0;

  for (const r of reports) {
    const level = r.riskAnalysis?.risk_level;
    if (level) byRisk[level] = (byRisk[level] || 0) + 1;
    else unanalyzed += 1;

    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    byLocation[r.location] = (byLocation[r.location] || 0) + 1;
  }

  return { total: reports.length, byRisk, byCategory, byStatus, byLocation, unanalyzed };
}

// ---------------------------------------------------------------------------
// 라우트
// ---------------------------------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", storedReportsCount: loadReports().length });
});

/** 전체 신고 — 누구나 조회 가능. 개인정보 없음. */
app.get("/api/reports", (_req, res) => {
  const reports = loadReports();
  res.json({
    ok: true,
    data: reports.map(toPublicReport),
    stats: computeStatistics(reports),
  });
});

/** 신고 상세 — 목록과 동일한 공개 범위 (§56) */
app.get("/api/reports/:id", (req, res) => {
  const report = loadReports().find((r) => r.id === req.params.id);
  if (!report) {
    return safeError(res, 404, "해당 신고를 찾을 수 없습니다.");
  }
  return res.json({ ok: true, data: toPublicReport(report) });
});

/**
 * 내 신고 — 브라우저가 보관한 익명 소유 토큰으로 조회한다.
 * 토큰을 URL 에 노출하지 않기 위해 POST 를 쓴다.
 */
app.post("/api/reports/mine", (req, res) => {
  const tokens = Array.isArray(req.body?.tokens) ? req.body.tokens : [];
  if (tokens.length === 0) {
    return res.json({ ok: true, data: [] });
  }

  const hashes = new Set(
    tokens
      .filter((t: unknown): t is string => typeof t === "string" && t.length === 64)
      .slice(0, 200)
      .map((t: string) => hashOwnerToken(t))
  );

  const mine = loadReports().filter((r) => r.ownerTokenHash && hashes.has(r.ownerTokenHash));
  return res.json({ ok: true, data: mine.map(toMyReport) });
});

/** 신고 등록 */
app.post("/api/reports", rateLimit("submit", LIMITS.submitReport), async (req, res) => {
  // 1) 입력값 검증 — 프론트엔드 검증을 신뢰하지 않는다 (§21, §29)
  const validation = validateReportInput(req.body || {}, SCHOOL_LOCATIONS, ISSUE_CATEGORIES);
  if (!validation.ok) {
    return safeError(res, 400, validation.error || "입력값이 올바르지 않습니다.");
  }

  // 2) 욕설/유해 표현 검사 — 서버가 최종 판단한다 (§21)
  const profanity = checkReportFields({
    title: req.body.title,
    description: req.body.description,
    location: req.body.location,
    category: req.body.category,
  });
  if (profanity.blocked) {
    return res.status(400).json({
      ok: false,
      error: PROFANITY_MESSAGE,
      code: "PROFANITY_BLOCKED",
    });
  }

  try {
    const reports = loadAllReports();
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");

    // 당일 발급된 최대 일련번호 + 1 (삭제가 있어도 중복되지 않는다)
    const prefix = `REP-${dateStr}-`;
    const lastSerial = reports.reduce((max, r) => {
      if (!r.id.startsWith(prefix)) return max;
      const n = Number.parseInt(r.id.slice(prefix.length), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    const reportId = `${prefix}${String(lastSerial + 1).padStart(4, "0")}`;

    const description = String(req.body.description).trim();
    const location = String(req.body.location).trim();
    const category = String(req.body.category).trim();
    const title =
      req.body.title && String(req.body.title).trim()
        ? String(req.body.title).trim()
        : `${location} ${category} 불편 신고`;

    // 3) 위험도 분석 (실패해도 접수 자체는 성공시킨다)
    const active = reports.filter((r) => !r.deletedAt);
    const repeat = buildRepeatContext(active, location, category);
    const { analysis, error: riskError } = await runRiskAnalysis(
      description,
      location,
      category,
      repeat
    );

    // 4) 익명 소유 토큰 — 원본은 응답으로 1회만 전달하고 DB 에는 해시만 남긴다
    const { token: ownerToken, hash: ownerTokenHash } = issueOwnerToken();

    const newReport: StoredReport = {
      id: reportId,
      title,
      location,
      category,
      description,
      attachmentUrl: req.body.attachmentUrl ? String(req.body.attachmentUrl) : null,
      attachmentName: req.body.attachmentName ? String(req.body.attachmentName) : null,
      attachmentSize:
        typeof req.body.attachmentSize === "number" ? req.body.attachmentSize : null,
      status: "pending",
      riskAnalysis: analysis,
      riskAnalysisError: riskError,
      ownerTokenHash,
      deletedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    reports.unshift(newReport);
    saveReports(reports);

    return res.status(201).json({
      ok: true,
      data: toMyReport(newReport),
      // 브라우저가 저장해야 "내 신고" 에서 다시 찾을 수 있다.
      ownerToken,
    });
  } catch (err) {
    return safeError(res, 500, "신고를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.", err);
  }
});

// ---------------------------------------------------------------------------
// AI 요약 (§17 ~ §24)
// ---------------------------------------------------------------------------

let summaryCache: { key: string; result: AiSummaryResult } | null = null;

app.post("/api/ai/summary", async (req, res) => {
  const reports = loadReports();
  const stats = computeStatistics(reports);

  // 신고가 없으면 OpenAI 를 호출하지 않는다 (§24, §51)
  if (reports.length === 0) {
    return res.json({
      ok: true,
      empty: true,
      stats,
      summary: null,
      message: "현재 분석할 신고 데이터가 없습니다. 신고가 등록되면 AI 요약을 생성할 수 있습니다.",
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return safeError(res, 503, "AI 요약을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }

  // 동일한 신고 집합에 대해서는 캐시를 재사용한다 (§27 — 비용 남용 방지)
  const cacheKey = `${reports.length}:${reports.map((r) => `${r.id}@${r.updatedAt}`).join("|")}`;
  if (summaryCache && summaryCache.key === cacheKey) {
    return res.json({ ok: true, cached: true, stats, summary: summaryCache.result });
  }

  // Rate Limit 은 실제로 OpenAI 를 호출할 때만 소모한다.
  // 미들웨어로 걸면 캐시 적중(비용 0)도 한도를 깎아,
  // 같은 학교 IP 에서 몇 번만 눌러도 전체 사용자가 막힌다.
  const limit = checkRateLimit("summary", req, LIMITS.aiSummary);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({ ok: false, error: LIMITS.aiSummary.message });
  }

  const aiInput: AiReportInput[] = reports.map((r) => ({
    location: r.location,
    category: r.category,
    riskLevel: r.riskAnalysis?.risk_level ?? null,
    status: r.status,
    content: r.description,
    createdAt: r.createdAt,
  }));

  try {
    const summary = await generateAiSummary(aiInput, apiKey);
    summaryCache = { key: cacheKey, result: summary };
    return res.json({ ok: true, cached: false, stats, summary });
  } catch (err) {
    return safeError(
      res,
      502,
      "AI 요약을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.",
      err
    );
  }
});

// ---------------------------------------------------------------------------
// 신고 삭제 — 유일하게 관리자 권한이 필요한 기능 (§2, §3)
// ---------------------------------------------------------------------------

/**
 * 1단계: 관리자 비밀번호 검증.
 * 성공하면 해당 신고에만 쓸 수 있는 1회용·단기 삭제 토큰을 발급한다.
 * 비밀번호 자체는 응답·로그 어디에도 남기지 않는다.
 */
app.post("/api/admin/verify-delete", rateLimit("adminVerify", LIMITS.adminVerify), async (req, res) => {
  const { reportId, password } = req.body || {};

  if (!isAdminPasswordConfigured()) {
    // 설정 미비 사실을 사용자에게 자세히 알리지 않는다 (§9)
    console.error("[admin] ADMIN_PASSWORD_HASH 환경변수가 설정되지 않았습니다.");
    return safeError(res, 503, "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }

  if (typeof reportId !== "string" || !reportId) {
    return safeError(res, 400, "요청이 올바르지 않습니다.");
  }

  const exists = loadReports().some((r) => r.id === reportId);
  if (!exists) {
    return safeError(res, 404, "해당 신고를 찾을 수 없습니다.");
  }

  const valid = await verifyAdminPassword(password);
  if (!valid) {
    // 시도 횟수·인증 방식 등 내부 정보를 노출하지 않는다
    return res.status(401).json({ ok: false, error: "관리자 비밀번호가 올바르지 않습니다." });
  }

  return res.json({ ok: true, deleteToken: issueDeleteToken(reportId) });
});

/**
 * 2단계: 실제 삭제.
 * 삭제 API 자체가 권한을 검사하므로, 프론트엔드 상태를 조작하거나
 * 개발자도구에서 직접 호출해도 토큰 없이는 삭제할 수 없다 (§7, §8).
 */
app.delete("/api/reports/:id", (req, res) => {
  const { id } = req.params;
  const token = req.headers["x-delete-token"];

  if (!consumeDeleteToken(token, id)) {
    return safeError(res, 401, "삭제 권한이 확인되지 않았습니다. 다시 시도해주세요.");
  }

  const reports = loadAllReports();
  const target = reports.find((r) => r.id === id && !r.deletedAt);
  if (!target) {
    return safeError(res, 404, "삭제할 신고를 찾을 수 없습니다.");
  }

  // Soft Delete — 기록은 남기되 모든 공개 기능에서 제외된다 (§11, §12)
  target.deletedAt = new Date().toISOString();
  target.updatedAt = target.deletedAt;
  saveReports(reports);

  // 삭제로 집합이 바뀌었으므로 AI 요약 캐시를 무효화한다
  summaryCache = null;

  return res.json({ ok: true, message: `신고 [${id}]가 삭제되었습니다.` });
});

// 정의되지 않은 API 경로는 여기서 끝낸다.
// 이 핸들러가 없으면 프로덕션의 SPA fallback(app.get("*"))이 /api/* 요청까지 받아
// 존재하지 않는 엔드포인트가 200과 함께 index.html 을 돌려준다.
// 제거된 구 인증 API가 살아 있는 것처럼 보이고, 클라이언트는 JSON 대신 HTML 을 받게 된다.
app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, error: "요청한 API를 찾을 수 없습니다." });
});

// ---------------------------------------------------------------------------

async function startServer() {
  const isProduction =
    process.env.NODE_ENV === "production" || process.argv[1]?.endsWith("server.cjs");

  const publicPath = path.join(process.cwd(), "public");
  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
  }

  if (!isProduction) {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);

    // 기동을 막지 않도록 응답을 기다리지 않고 백그라운드로 돌린다.
    backfillMissingRiskAnalysis().catch((err) => {
      console.error("[risk] 자동 채점 실패:", err instanceof Error ? err.message : err);
    });
  });
}

startServer();
