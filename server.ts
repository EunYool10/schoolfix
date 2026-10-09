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
import crypto from "crypto";
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
  isStaffPasswordConfigured,
  verifyStaffPassword,
  createStaffSession,
  getStaffSession,
  revokeStaffSession,
  setStaffSessionCookie,
  clearStaffSessionCookie,
  issueDeleteToken,
  consumeDeleteToken,
  issueOwnerToken,
  hashOwnerToken,
  validateReportInput,
  validateClarifyInput,
  FIELD_LIMITS,
  securityHeaders,
  corsPolicy,
  safeError,
} from "./serverSecurity";
import {
  aggregateLocationStats,
  normalizeLocationText,
  type LocationStatInput,
} from "./locationStats";
import {
  analyzeClarity,
  composeDescription,
  createClarifySession,
  getClarifySession,
  dropClarifySession,
  MAX_CLARIFY_QUESTIONS,
  type ClarifySession,
} from "./reportClarify";
import { maskProfanity, maskTerms } from "./src/security/profanityFilter";
import { ISSUE_CATEGORIES } from "./src/types";
import { filterReports, parseFilterQuery } from "./src/utils/reportFilter";
import { RISK_LEVELS } from "./riskAnalysis";

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
const SCHOOL_APPLICATIONS_FILE = path.join(DATA_DIR, "school_applications.json");
const SCHOOL_CATALOG_FILE = path.join(process.cwd(), "schools.seed.json");
// 테스트 시연 데이터는 더 이상 실제 신고 목록에 노출하지 않는다.
const LEGACY_SAMPLE_REPORT_IDS = new Set([
  "REP-20260919-0001",
  "REP-20260919-0002",
  "REP-20260919-0003",
  "REP-20260919-0004",
]);

interface SchoolCatalogEntry {
  id: string; schoolName: string; officialWebsite: string; address: string;
  highSchoolType?: "일반고" | "특성화고" | "특목고";
  supportStatus: "active" | "reviewing" | "rejected";
  verificationStatus: "official" | "needs_review";
  verifiedAt: string; sourceUrl: string;
  departments: Array<{ name: string; classesByGrade: number[] }>;
  locationTypes: Array<{ type: string; verificationStatus: string }>;
  locations: Array<{ id: string; type: string; name: string; count?: number; verificationStatus: string }>;
}

function loadSchools(): SchoolCatalogEntry[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(SCHOOL_CATALOG_FILE, "utf-8"));
    return Array.isArray(parsed) ? parsed.filter((school) => school.supportStatus === "active") : [];
  } catch (err) {
    console.error("[schools] 학교 카탈로그 읽기 실패:", err);
    return [];
  }
}
function findSchool(id: unknown) { return typeof id === "string" ? loadSchools().find((school) => school.id === id) : undefined; }

interface StoredReport {
  id: string;
  schoolId?: string;
  schoolName?: string;
  locationId?: string | null;
  locationType?: string;
  buildingName?: string | null;
  floor?: string | null;
  department?: string | null;
  grade?: string | null;
  className?: string | null;
  roomName?: string | null;
  title?: string;
  location: string;
  /**
   * 상세 위치 — 학생이 직접 적었거나, AI 사전 확인이 학생 문장에서 그대로 발췌한 값.
   * 위치 통계는 location 과 이 값을 합쳐 집계한다. 없으면 null 이며 추측해서 채우지 않는다.
   * 기존 신고에는 이 필드가 없으며, 없으면 location 만으로 집계된다.
   */
  locationDetail?: string | null;
  category: string;
  description: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  status: "pending" | "reviewing" | "in_progress" | "completed";
  moderationStatus?: "held" | "approved";
  moderationReason?: string | null;
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

// ---------------------------------------------------------------------------
// 저장소
// ---------------------------------------------------------------------------

function loadAllReports(): StoredReport[] {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      if (Array.isArray(parsed)) {
        const realReports = parsed.filter((report) => !LEGACY_SAMPLE_REPORT_IDS.has(report.id));
        if (realReports.length !== parsed.length) {
          saveReports(realReports);
          console.log(`[db] 테스트용 예시 신고 ${parsed.length - realReports.length}건을 제거했습니다.`);
        }
        const defaultSchool = loadSchools()[0];
        return realReports.map((report) => report.schoolId || !defaultSchool ? report : { ...report, schoolId: defaultSchool.id, schoolName: defaultSchool.schoolName });
      }
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
  return loadAllReports().filter((r) => !r.deletedAt && r.moderationStatus !== "held");
}

interface SchoolApplication {
  id: string;
  schoolName: string;
  website: string;
  address: string;
  reason: string;
  requests: string;
  replyEmail: string;
  status: "new" | "reviewed";
  createdAt: string;
  updatedAt: string;
}

function loadSchoolApplications(): SchoolApplication[] {
  try {
    if (!fs.existsSync(SCHOOL_APPLICATIONS_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(SCHOOL_APPLICATIONS_FILE, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[school-applications] 신청함 읽기 실패:", err);
    return [];
  }
}

function saveSchoolApplications(applications: SchoolApplication[]) {
  try {
    const tmp = `${SCHOOL_APPLICATIONS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(applications, null, 2), "utf-8");
    fs.renameSync(tmp, SCHOOL_APPLICATIONS_FILE);
  } catch (err) {
    console.error("[school-applications] 신청함 저장 실패:", err);
    throw err;
  }
}

/** 텍스트와 첨부 이미지를 OpenAI Moderation으로 검사한다. 검사 실패 시 이미지는 보류한다. */
async function moderateReport(title: string, description: string, image: string | null) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const profanityDetected = maskProfanity(`${title}\n${description}`).count > 0;
    return { hold: profanityDetected || Boolean(image), reason: profanityDetected ? "부적절한 표현 자동 감지" : image ? "이미지 안전성 검사 미설정" : null };
  }
  try {
    const content: Array<Record<string, unknown>> = [{ type: "text", text: `${title}\n${description}` }];
    if (image) content.push({ type: "image_url", image_url: { url: image } });
    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "omni-moderation-latest", input: content }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`moderation status ${response.status}`);
    const result = await response.json() as { results?: Array<{ flagged?: boolean; categories?: Record<string, boolean> }> };
    if (!Array.isArray(result.results) || result.results.length === 0) throw new Error("moderation response missing results");
    const flagged = result.results.some((item) => item.flagged);
    const profanityDetected = maskProfanity(`${title}\n${description}`).count > 0;
    return { hold: flagged || profanityDetected, reason: flagged ? "안전성 검사에서 검토 필요 판정" : profanityDetected ? "부적절한 표현 자동 감지" : null };
  } catch (err) {
    console.error("[moderation] 검사 실패:", err instanceof Error ? err.message : err);
    const profanityDetected = maskProfanity(`${title}\n${description}`).count > 0;
    return { hold: profanityDetected || Boolean(image), reason: profanityDetected ? "부적절한 표현 자동 감지" : image ? "이미지 안전성 검사 실패" : null };
  }
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
    schoolId: r.schoolId ?? "cem-h",
    schoolName: r.schoolName ?? loadSchools()[0]?.schoolName ?? "",
    locationId: r.locationId ?? null,
    locationType: r.locationType ?? r.location,
    buildingName: r.buildingName ?? null,
    floor: r.floor ?? null,
    department: r.department ?? null,
    grade: r.grade ?? null,
    className: r.className ?? null,
    roomName: r.roomName ?? null,
    title: r.title ?? "",
    location: r.location,
    locationDetail: r.locationDetail ?? null,
    category: r.category,
    description: r.description,
    status: r.status,
    moderationStatus: r.moderationStatus ?? "approved",
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
  schoolId: string,
  location: string,
  category: string,
  excludeId?: string
): { count: number; previous: string[] } {
  const matches = reports.filter(
    (r) =>
      r.id !== excludeId &&
      r.schoolId === schoolId &&
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
      target.schoolId ?? "cem-h",
      target.location,
      target.category,
      target.id
    );
    const { analysis, error } = await runRiskAnalysis(
      target.description,
      [target.schoolName, target.location, target.locationDetail, target.buildingName, target.floor].filter(Boolean).join(" · "),
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

app.get("/api/schools", (_req, res) => {
  return res.json({ ok: true, data: loadSchools().map(({ id, schoolName, officialWebsite, address, highSchoolType, supportStatus, verificationStatus, verifiedAt, sourceUrl, departments }) => ({ id, schoolName, officialWebsite, address, highSchoolType, supportStatus, verificationStatus, verifiedAt, sourceUrl, departments })) });
});

app.get("/api/schools/:schoolId/locations", (req, res) => {
  const school = findSchool(req.params.schoolId);
  if (!school) return safeError(res, 404, "지원 중인 학교를 찾을 수 없습니다.");
  return res.json({ ok: true, schoolId: school.id, data: school.locations.filter((location) => location.verificationStatus === "official"), locationTypes: school.locationTypes ?? [...new Set(school.locations.map((location) => location.type))].map((type) => ({ type, verificationStatus: "official" })), verificationStatus: school.verificationStatus, sourceUrl: school.sourceUrl });
});

/** 학교 추가 요청은 학생 화면에 공개하지 않고 DATA_DIR에 별도 보관한다. */
app.post("/api/school-applications", rateLimit("schoolApplication", { windowMs: 60 * 60 * 1000, max: 5, message: "신청이 너무 많습니다. 잠시 후 다시 시도해주세요." }), (req, res) => {
  const body = req.body || {};
  const schoolName = typeof body.schoolName === "string" ? body.schoolName.trim() : "";
  const website = typeof body.website === "string" ? body.website.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const requests = typeof body.requests === "string" ? body.requests.trim() : "";
  const replyEmail = typeof body.replyEmail === "string" ? body.replyEmail.trim() : "";
  if (!schoolName || schoolName.length > 100 || !address || address.length > 200 || !reason || reason.length > 1000 || requests.length > 1000 || replyEmail.length > 254) {
    return safeError(res, 400, "필수 항목을 확인하고 입력 길이를 줄여주세요.");
  }
  try {
    const parsedUrl = new URL(website);
    if (!(parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:") || website.length > 500) throw new Error("invalid website");
  } catch {
    return safeError(res, 400, "학교 공식 홈페이지 주소를 확인해주세요.");
  }
  if (replyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmail)) return safeError(res, 400, "회신 이메일 주소를 확인해주세요.");

  const now = new Date().toISOString();
  const application: SchoolApplication = {
    id: `SCH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    schoolName, website, address, reason, requests, replyEmail,
    status: "new", createdAt: now, updatedAt: now,
  };
  try {
    saveSchoolApplications([application, ...loadSchoolApplications()]);
    return res.status(201).json({ ok: true, data: { id: application.id, createdAt: application.createdAt } });
  } catch {
    return safeError(res, 500, "신청을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
});

/** 전체 신고 — 누구나 조회 가능. 개인정보 없음. */
app.get("/api/reports", (req, res) => {
  const school = findSchool(req.query.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  const reports = loadReports().filter((report) => report.schoolId === school.id);
  res.json({
    ok: true,
    data: reports.map(toPublicReport),
    stats: computeStatistics(reports),
  });
});

// ---------------------------------------------------------------------------
// 위치별 통계
//
// "어느 장소에서 문제가 가장 많이 발생하는가" 를 실제 DB 에서 계산한다.
// OpenAI 를 호출하지 않는다 — 통계는 결정론적이어야 하고 조회마다 비용이 들면 안 된다.
//
// 목록 화면과 **같은 필터 규칙**(src/utils/reportFilter.ts)을 쓴다.
// 규칙이 두 벌이면 "최근 7일" 로 좁힌 목록과 그 아래 통계가 서로 다른 신고를 세게 된다.
// ---------------------------------------------------------------------------

const STATUS_VALUES = ["pending", "reviewing", "in_progress", "completed"];

function requireStaff(req: express.Request, res: express.Response): boolean {
  if (getStaffSession(req)) return true;
  safeError(res, 401, "운영진 로그인이 필요합니다.");
  return false;
}

app.get("/api/staff/session", (req, res) => {
  res.json({ ok: true, authenticated: Boolean(getStaffSession(req)) });
});

app.post("/api/staff/login", rateLimit("staffLogin", LIMITS.staffLogin), async (req, res) => {
  if (!isStaffPasswordConfigured()) {
    console.error("[staff] STAFF_PASSWORD_HASH 환경변수가 설정되지 않았습니다.");
    return safeError(res, 503, "운영진 로그인을 사용할 수 없습니다.");
  }
  const valid = await verifyStaffPassword(req.body?.password);
  if (!valid) return safeError(res, 401, "비밀번호가 올바르지 않습니다.");
  const token = createStaffSession();
  setStaffSessionCookie(res, token);
  return res.json({ ok: true });
});

app.post("/api/staff/logout", (req, res) => {
  revokeStaffSession(getStaffSession(req));
  clearStaffSessionCookie(res);
  return res.json({ ok: true });
});

app.get("/api/staff/school-applications", (req, res) => {
  if (!requireStaff(req, res)) return;
  return res.json({ ok: true, data: loadSchoolApplications() });
});

app.patch("/api/staff/school-applications/:id", (req, res) => {
  if (!requireStaff(req, res)) return;
  const action = req.body?.action;
  if (action !== "mark-reviewed" && action !== "mark-new") return safeError(res, 400, "신청 처리 상태가 올바르지 않습니다.");
  const applications = loadSchoolApplications();
  const application = applications.find((item) => item.id === req.params.id);
  if (!application) return safeError(res, 404, "학교 신청을 찾을 수 없습니다.");
  application.status = action === "mark-reviewed" ? "reviewed" : "new";
  application.updatedAt = new Date().toISOString();
  try {
    saveSchoolApplications(applications);
    return res.json({ ok: true });
  } catch {
    return safeError(res, 500, "신청 상태를 저장하지 못했습니다.");
  }
});

app.delete("/api/staff/school-applications/:id", (req, res) => {
  if (!requireStaff(req, res)) return;
  const applications = loadSchoolApplications();
  const remaining = applications.filter((item) => item.id !== req.params.id);
  if (remaining.length === applications.length) return safeError(res, 404, "학교 신청을 찾을 수 없습니다.");
  try {
    saveSchoolApplications(remaining);
    return res.json({ ok: true });
  } catch {
    return safeError(res, 500, "학교 신청을 삭제하지 못했습니다.");
  }
});

app.get("/api/staff/moderation", (req, res) => {
  if (!requireStaff(req, res)) return;
  const school = findSchool(req.query.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  const held = loadAllReports().filter((report) => !report.deletedAt && report.schoolId === school.id && report.moderationStatus === "held");
  return res.json({ ok: true, data: held.map((report) => ({ ...toPublicReport(report), moderationReason: report.moderationReason ?? null, attachmentName: report.attachmentName ?? null })) });
});

app.patch("/api/staff/reports/:id/moderation", (req, res) => {
  if (!requireStaff(req, res)) return;
  const school = findSchool(req.query.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  const action = req.body?.action;
  if (action !== "approve" && action !== "reject") return safeError(res, 400, "검토 작업이 올바르지 않습니다.");
  const all = loadAllReports();
  const report = all.find((item) => item.id === req.params.id && item.schoolId === school.id && !item.deletedAt && item.moderationStatus === "held");
  if (!report) return safeError(res, 404, "검토 대기 신고를 찾을 수 없습니다.");
  const now = new Date().toISOString();
  if (action === "approve") {
    report.moderationStatus = "approved";
    report.moderationReason = null;
  } else {
    report.deletedAt = now;
  }
  report.updatedAt = now;
  saveReports(all);
  summaryCache = null;
  return res.json({ ok: true });
});

app.patch("/api/staff/reports/:id", (req, res) => {
  if (!requireStaff(req, res)) return;
  const school = findSchool(req.query.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  const { id } = req.params;
  const body = req.body || {};
  const allowedStatuses = ["pending", "reviewing", "in_progress", "completed"];
  if (typeof body.status !== "string" || !allowedStatuses.includes(body.status)) {
    return safeError(res, 400, "처리 상태가 올바르지 않습니다.");
  }
  const assignee = typeof body.assignee === "string" ? body.assignee.trim() : "";
  const resolutionNote = typeof body.resolutionNote === "string" ? body.resolutionNote.trim() : "";
  if (assignee.length > 100 || resolutionNote.length > 1000) {
    return safeError(res, 400, "담당자 또는 처리 메모가 너무 깁니다.");
  }
  const all = loadAllReports();
  const report = all.find((item) => item.id === id && item.schoolId === school.id && !item.deletedAt);
  if (!report) return safeError(res, 404, "해당 신고를 찾을 수 없습니다.");
  if (report.moderationStatus === "held") return safeError(res, 409, "먼저 안전성 검토에서 신고를 승인해주세요.");

  const now = new Date().toISOString();
  report.status = body.status;
  report.assignee = assignee || null;
  report.resolutionNote = resolutionNote || null;
  report.updatedAt = now;
  if (body.status === "reviewing" && !report.reviewedAt) report.reviewedAt = now;
  if (body.status === "in_progress" && !report.inProgressAt) report.inProgressAt = now;
  if (body.status === "completed" && !report.completedAt) report.completedAt = now;
  saveReports(all);
  summaryCache = null;
  return res.json({ ok: true, data: toPublicReport(report) });
});

app.get("/api/reports/location-statistics", (req, res) => {
  const school = findSchool(req.query.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  const filters = parseFilterQuery(
    req.query as Record<string, unknown>,
    ISSUE_CATEGORIES,
    RISK_LEVELS,
    STATUS_VALUES
  );

  // 공개 DTO 로 바꾼 뒤 거른다. 목록 화면이 받는 것과 정확히 같은 데이터를 세게 된다.
  const scoped = filterReports(loadReports().filter((report) => report.schoolId === school.id).map(toPublicReport), filters);

  const input: LocationStatInput[] = scoped.map((r) => ({
    location: r.location,
    locationDetail: [r.locationDetail, r.buildingName, r.floor, r.department, r.grade ? `${r.grade}학년` : null, r.className, r.roomName].filter(Boolean).join(" · ") || null,
    category: r.category,
    riskLevel: r.riskLevel,
    createdAt: r.createdAt,
  }));

  res.json({
    ok: true,
    total: scoped.length,
    locations: aggregateLocationStats(input),
    appliedFilters: filters,
  });
});

/** 신고 상세 — 목록과 동일한 공개 범위 (§56) */
app.get("/api/reports/:id", (req, res) => {
  const school = findSchool(req.query.schoolId);
  const report = school ? loadReports().find((r) => r.id === req.params.id && r.schoolId === school.id) : undefined;
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
  const school = findSchool(req.body?.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
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

  const mine = loadAllReports().filter((r) => !r.deletedAt && r.schoolId === school.id && r.ownerTokenHash && hashes.has(r.ownerTokenHash));
  return res.json({ ok: true, data: mine.map(toMyReport) });
});

/**
 * 접수 직전의 사전 확인 (§16).
 *
 * 프론트엔드가 이미 /api/reports/analyze 로 확인을 마쳤다면 그 세션을 그대로 쓴다 (추가 호출 없음).
 * 세션 없이 곧바로 이 API 를 호출한 경우(개발자도구·외부 스크립트)에도
 * 서버가 한 번 확인해서 애매한 신고가 그대로 저장되지 않게 한다.
 *
 * 확인 자체가 실패하면 접수를 막지 않는다. 위험도 분석과 같은 원칙이다 —
 * 부가 기능의 장애가 신고 접수를 막아서는 안 된다.
 */
type ClarityGate =
  | { proceed: true; description: string; locationDetail: string | null; session: ClarifySession | null }
  | { proceed: false; sessionId: string; question: string; missingField: string | null };

async function resolveClarityForSubmission(body: Record<string, any>): Promise<ClarityGate> {
  const location = String(body.location).trim();
  const category = String(body.category).trim();
  const description = String(body.description).trim();

  // 학생이 직접 적은 상세 위치가 최우선이다. AI 추출값보다 신뢰도가 높다.
  const manualDetail =
    typeof body.locationDetail === "string"
      ? normalizeLocationText(body.locationDetail).slice(0, FIELD_LIMITS.locationDetail.max)
      : "";

  // 1) 프론트엔드가 마친 확인 세션 — 내용이 그대로여야 인정한다.
  //    확인 후 본문을 고쳤다면 그 세션의 판단은 더 이상 이 신고에 대한 것이 아니다.
  const session = getClarifySession(body.clarifySessionId);
  if (
    session &&
    session.schoolId === body.schoolId &&
    session.location === location &&
    session.category === category &&
    session.baseDescription.trim() === description
  ) {
    const settled =
      session.verdict?.status === "ready" || session.turns.length >= MAX_CLARIFY_QUESTIONS;
    if (settled) {
      return {
        proceed: true,
        description: composeDescription(session),
        locationDetail: manualDetail || session.verdict?.location_detail || null,
        session,
      };
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { proceed: true, description, locationDetail: manualDetail || null, session: null };
  }

  // 2) 세션이 없으면 서버가 직접 한 번 확인한다.
  try {
    const verdict = await analyzeClarity({ location, category, description, turns: [] }, apiKey);

    if (verdict.status === "needs_more_information" && verdict.question) {
      const fresh = createClarifySession(location, category, description, body.schoolId);
      fresh.verdict = verdict;
      return {
        proceed: false,
        sessionId: fresh.id,
        question: verdict.question,
        missingField: verdict.missing_field,
      };
    }

    return {
      proceed: true,
      description,
      locationDetail: manualDetail || verdict.location_detail || null,
      session: null,
    };
  } catch (err) {
    console.error("[clarify] 접수 전 확인 실패:", err instanceof Error ? err.message : err);
    return { proceed: true, description, locationDetail: manualDetail || null, session: null };
  }
}

/** 신고 등록 */
app.post("/api/reports", rateLimit("submit", LIMITS.submitReport), async (req, res) => {
  const school = findSchool(req.body?.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  const allowedLocations = school.locationTypes?.map((entry) => entry.type) ?? [...new Set(school.locations.map((entry) => entry.type)), "기타"];
  // 1) 입력값 검증 — 프론트엔드 검증을 신뢰하지 않는다 (§21, §29)
  const validation = validateReportInput(req.body || {}, allowedLocations, ISSUE_CATEGORIES);
  if (!validation.ok) {
    return safeError(res, 400, validation.error || "입력값이 올바르지 않습니다.");
  }
  const selectedLocationId = typeof req.body.locationId === "string" ? req.body.locationId : "";
  const selectedLocation = selectedLocationId ? school.locations.find((entry) => entry.id === selectedLocationId) : undefined;
  if (selectedLocationId && (!selectedLocation || selectedLocation.type !== req.body.location)) {
    return safeError(res, 400, "선택한 세부 위치가 해당 학교의 위치 목록과 일치하지 않습니다.");
  }
  const hasManualLocation = [req.body.locationDetail, req.body.buildingName, req.body.floor, req.body.className, req.body.roomName].some((value) => typeof value === "string" && value.trim());
  if (!selectedLocation && !hasManualLocation) {
    return safeError(res, 400, "세부 위치를 선택하거나 직접 입력해주세요.");
  }
  const department = typeof req.body.department === "string" ? req.body.department.trim() : "";
  if (department && !school.departments.some((entry) => entry.name === department)) {
    return safeError(res, 400, "선택한 학과가 학교 공식 정보와 일치하지 않습니다.");
  }
  const gradeInput = typeof req.body.grade === "string" ? req.body.grade.trim() : "";
  const className = typeof req.body.className === "string" ? req.body.className.trim() : "";
  if ((department || gradeInput || className) && String(req.body.location).trim() !== "교실") {
    return safeError(res, 400, "학과·학년·반 정보는 교실 신고에만 사용할 수 있습니다.");
  }
  if (gradeInput && (!/^[1-3]$/.test(gradeInput) || (department && school.departments.find((entry) => entry.name === department)?.classesByGrade[Number(gradeInput) - 1] === 0))) {
    return safeError(res, 400, "선택한 학년·학과가 학교 공식 현황과 일치하지 않습니다.");
  }

  // 1-2) 사전 확인 — 충분히 명확해지기 전에는 DB 에 저장하지 않는다 (§16)
  let clarity: ClarityGate;
  try {
    clarity = await resolveClarityForSubmission(req.body);
  } catch (err) {
    return safeError(res, 500, "신고를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.", err);
  }

  if (!clarity.proceed) {
    return res.status(422).json({
      ok: false,
      status: "needs_more_information",
      question: clarity.question,
      missingField: clarity.missingField,
      sessionId: clarity.sessionId,
      error: "신고 내용을 조금만 더 알려주세요.",
    });
  }

  // 2) 욕설/유해 표현 자동 마스킹
  //
  //    접수를 거부하지 않고 해당 표현만 #### 로 가린다.
  //    학생이 흥분한 상태로 쓴 신고도 시설 문제 자체는 유효한 정보이므로,
  //    표현만 걸러내고 내용은 살리는 편이 낫다.
  //
  //    1차: 규칙 기반 (즉시·무료·결정론적)
  //    2차: AI 가 찾아낸 표현 (아래 위험도 분석 응답에서 함께 받는다)
  //
  //    대상은 추가 확인 답변까지 합쳐진 본문이다. 답변에 들어간 표현도 걸러야 한다.
  const maskedTitle = maskProfanity(req.body.title);
  const maskedDescription = maskProfanity(clarity.description);


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

    // 1차 마스킹이 적용된 텍스트를 기준으로 삼는다.
    let description = maskedDescription.text.trim();
    const location = String(req.body.location).trim();
    const category = String(req.body.category).trim();
    let title =
      maskedTitle.text && maskedTitle.text.trim()
        ? maskedTitle.text.trim()
        : `${location} ${category} 불편 신고`;

    // 3) 위험도 분석 (실패해도 접수 자체는 성공시킨다)
    const active = reports.filter((r) => !r.deletedAt && r.schoolId === school.id);
    const repeat = buildRepeatContext(active, school.id, location, category);
    const { analysis, error: riskError } = await runRiskAnalysis(
      description,
      [school.schoolName, location, selectedLocation?.name, req.body.buildingName, req.body.floor].filter(Boolean).join(" · "),
      category,
      repeat
    );

    // 3-2) AI 가 추가로 찾아낸 표현을 2차 마스킹한다.
    //      치환은 서버가 수행한다. AI 가 고쳐 쓴 문장을 그대로 받으면
    //      신고 내용 자체가 바뀔 수 있기 때문이다.
    let aiMaskCount = 0;
    if (analysis && analysis.offensive_terms.length > 0) {
      const d = maskTerms(description, analysis.offensive_terms);
      const ti = maskTerms(title, analysis.offensive_terms);
      description = d.text;
      title = ti.text;
      aiMaskCount = d.count + ti.count;
    }

    const maskedCount = maskedTitle.count + maskedDescription.count + aiMaskCount;

    const attachmentUrl = req.body.attachmentUrl ? String(req.body.attachmentUrl) : null;
    const moderation = await moderateReport(title, description, attachmentUrl);

    // 4) 익명 소유 토큰 — 원본은 응답으로 1회만 전달하고 DB 에는 해시만 남긴다
    const { token: ownerToken, hash: ownerTokenHash } = issueOwnerToken();

    const newReport: StoredReport = {
      id: reportId,
      schoolId: school.id,
      schoolName: school.schoolName,
      locationId: selectedLocation?.id ?? null,
      locationType: location,
      buildingName: typeof req.body.buildingName === "string" ? req.body.buildingName.trim().slice(0, 100) : null,
      floor: typeof req.body.floor === "string" ? req.body.floor.trim().slice(0, 40) : null,
      department: department || null,
      grade: gradeInput || null,
      className: className.slice(0, 40) || null,
      roomName: typeof req.body.roomName === "string" ? req.body.roomName.trim().slice(0, 100) : null,
      title,
      location,
      locationDetail: clarity.locationDetail,
      category,
      description,
      attachmentUrl,
      attachmentName: req.body.attachmentName ? String(req.body.attachmentName) : null,
      attachmentSize:
        typeof req.body.attachmentSize === "number" ? req.body.attachmentSize : null,
      status: "pending",
      moderationStatus: moderation.hold ? "held" : "approved",
      moderationReason: moderation.reason,
      riskAnalysis: analysis,
      riskAnalysisError: riskError,
      ownerTokenHash,
      deletedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    reports.unshift(newReport);
    saveReports(reports);

    // 접수가 끝났으면 대화 상태를 더 들고 있을 이유가 없다.
    if (clarity.session) dropClarifySession(clarity.session.id);

    return res.status(201).json({
      ok: true,
      data: toMyReport(newReport),
      // 브라우저가 저장해야 "내 신고" 에서 다시 찾을 수 있다.
      ownerToken,
      // 부적절한 표현이 가려졌다면 사용자에게 알린다.
      masked: maskedCount > 0,
      maskedCount,
      heldForReview: moderation.hold,
    });
  } catch (err) {
    return safeError(res, 500, "신고를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.", err);
  }
});

// ---------------------------------------------------------------------------
// AI 사전 확인 — 애매한 신고에 질문 1개를 되묻는다 (§8 ~ §15)
//
// 이 라우트는 DB 에 아무것도 쓰지 않는다. 대화 상태는 메모리 세션에만 있고,
// 최종 저장은 POST /api/reports 가 담당한다 (§16).
// ---------------------------------------------------------------------------

/** 세션 상태를 그대로 응답 형태로 바꾼다. 응답 조립이 한 곳에만 있도록 모아 둔다. */
function clarifyResponse(session: ClarifySession, extra: Record<string, unknown> = {}) {
  const verdict = session.verdict;
  return {
    ok: true,
    status: verdict?.status ?? "ready",
    question: verdict?.status === "needs_more_information" ? verdict.question : null,
    missingField: verdict?.status === "needs_more_information" ? verdict.missing_field : null,
    sessionId: session.id,
    turns: session.turns,
    locationDetail: verdict?.location_detail ?? null,
    ...extra,
  };
}

app.post("/api/reports/analyze", rateLimit("clarify", LIMITS.clarify), async (req, res) => {
  const school = findSchool(req.body?.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  if (req.body.locationId) {
    const entry = school.locations.find((item) => item.id === req.body.locationId);
    if (!entry || entry.type !== req.body.location) return safeError(res, 400, "선택한 세부 위치가 해당 학교의 위치 목록과 일치하지 않습니다.");
  }
  const allowedLocations = school.locationTypes?.map((entry) => entry.type) ?? [...new Set(school.locations.map((entry) => entry.type)), "기타"];
  // 1) 입력 검증 — 신고 등록과 같은 기준 (§22)
  const validation = validateClarifyInput(req.body || {}, allowedLocations, ISSUE_CATEGORIES);
  if (!validation.ok || !validation.value) {
    return safeError(res, 400, validation.error || "입력값이 올바르지 않습니다.");
  }
  const input = validation.value;

  // 2) 세션 확보 — 이어가기면 기존 대화를, 최초면 새로 만든다 (§15)
  let session: ClarifySession;

  if (input.sessionId) {
    const existing = getClarifySession(input.sessionId);
    if (!existing) {
      // 만료된 세션으로 계속 시도하면 답변이 허공으로 사라진다. 다시 시작하도록 알린다.
      return safeError(res, 410, "확인 과정이 만료되었습니다. 신고 내용을 다시 제출해주세요.");
    }
    session = existing;
    if (session.schoolId !== school.id) return safeError(res, 409, "학교가 변경되었습니다. 신고 내용을 다시 확인해주세요.");

    const pendingQuestion = session.verdict?.question;
    if (!pendingQuestion) {
      // 이미 충분하다고 판단이 끝난 세션이다. 답변이 한 번 더 도착해도(더블 클릭 등)
      // 오류로 돌려주면 답변이 실패한 것처럼 보이므로, 현재 상태를 그대로 다시 알려준다.
      if (session.verdict?.status === "ready") {
        return res.json(clarifyResponse(session, { cached: true }));
      }
      return safeError(res, 409, "답변할 질문이 없습니다. 신고 내용을 다시 제출해주세요.");
    }

    // 같은 답변을 다시 보낸 경우 — 직전 판정을 그대로 돌려주고 OpenAI 를 호출하지 않는다 (§21).
    const lastTurn = session.turns[session.turns.length - 1];
    if (lastTurn && lastTurn.answer === input.answer && lastTurn.question === pendingQuestion) {
      return res.json(clarifyResponse(session, { cached: true }));
    }

    session.turns.push({ question: pendingQuestion, answer: input.answer });
  } else {
    session = createClarifySession(input.location, input.category, input.description, school.id);
  }

  // 3) 질문 한도 — 무한 반복으로 접수를 막지 않는다 (§12)
  if (session.turns.length >= MAX_CLARIFY_QUESTIONS) {
    session.verdict = {
      status: "ready",
      question: null,
      missing_field: null,
      location_detail: session.verdict?.location_detail ?? null,
      problem: session.verdict?.problem ?? null,
      model: session.verdict?.model ?? "none",
    };
    return res.json(clarifyResponse(session, { maxTurnsReached: true }));
  }

  // 4) AI 확인. 키가 없거나 호출이 실패하면 접수를 막지 않는다.
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    session.verdict = {
      status: "ready",
      question: null,
      missing_field: null,
      location_detail: null,
      problem: null,
      model: "none",
    };
    return res.json(clarifyResponse(session, { skipped: true }));
  }

  try {
    session.verdict = await analyzeClarity(
      {
        location: session.location,
        category: session.category,
        description: session.baseDescription,
        turns: session.turns,
      },
      apiKey
    );
    return res.json(clarifyResponse(session));
  } catch (err) {
    // 내부 오류·API Key 관련 정보를 사용자에게 노출하지 않는다 (§20).
    console.error("[clarify] 확인 실패:", err instanceof Error ? err.message : err);
    session.verdict = {
      status: "ready",
      question: null,
      missing_field: null,
      location_detail: null,
      problem: null,
      model: "none",
    };
    return res.json(clarifyResponse(session, { skipped: true }));
  }
});

// ---------------------------------------------------------------------------
// AI 요약 (§17 ~ §24)
// ---------------------------------------------------------------------------

let summaryCache: { key: string; result: AiSummaryResult } | null = null;

app.post("/api/ai/summary", async (req, res) => {
  const school = findSchool(req.body?.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  const reports = loadReports().filter((report) => report.schoolId === school.id);
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
  const cacheKey = `${school.id}:${reports.length}:${reports.map((r) => `${r.id}@${r.updatedAt}`).join("|")}`;
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
    location: [r.schoolName, r.locationType ?? r.location, r.locationDetail, r.buildingName, r.floor, r.department, r.grade ? `${r.grade}학년` : null, r.className, r.roomName].filter(Boolean).join(" · "),
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
  const school = findSchool(req.body?.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");

  if (!isAdminPasswordConfigured()) {
    // 설정 미비 사실을 사용자에게 자세히 알리지 않는다 (§9)
    console.error("[admin] ADMIN_PASSWORD_HASH 환경변수가 설정되지 않았습니다.");
    return safeError(res, 503, "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }

  if (typeof reportId !== "string" || !reportId) {
    return safeError(res, 400, "요청이 올바르지 않습니다.");
  }

  const exists = loadReports().some((r) => r.id === reportId && r.schoolId === school.id);
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
