/**
 * SchoolFix AI — 공개형 학교 신고 서비스 백엔드
 *
 * 인증 구조
 *  - 학생 로그인 없음. 누구나 신고 등록/조회/AI 요약/PDF/인쇄 사용 가능.
 *  - "내 신고" 는 로그인 대신 신고 생성 시 발급하는 익명 소유 토큰으로 식별한다.
 *    (DB 에는 해시만 저장, 원본은 브라우저에만 존재)
 *    기기를 바꾸면 접수 때 보여 준 확인 코드로 다시 연결한다.
 *  - 운영진·교사는 공용 비밀번호 또는 개인 계정으로 로그인한다 (staffAuth.ts).
 *  - "신고 삭제" 는 관리자 비밀번호를 한 번 더 확인한 뒤 1회용 삭제 토큰을 발급한다.
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
  failureLimit,
  LIMITS,
  isStaffPasswordConfigured,
  verifyStaffPassword,
  isTeacherPasswordConfigured,
  verifyTeacherPassword,
  issueOwnerToken,
  ownerTokenHashes,
  issueRecoveryCode,
  normalizeRecoveryCode,
  hashRecoveryCode,
  safeHashEqual,
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
import { lastNotifyResult, sendApplicationNotification, sendMonthlyNotification, sendNewReportNotification, sendTestNotification, sendText, sendUrgentNotification, webhookChannel, type MonthlySchoolSummary } from "./notify";
import { buildMonthlyReport, monthKey, shiftMonth } from "./src/utils/monthlyStats";
import { computeSla } from "./src/utils/sla";
import { feedbackPending } from "./src/utils/feedback";
import { decodePhotoDataUrl, localPhotoBackend, newPhotoId, PHOTO_ID_PATTERN, PHOTO_RULES, PhotoCache, photoTypeFromId, supabasePhotoBackend, type IncomingPhoto, type PhotoBackend, type StoredPhoto } from "./photoStore";
import { activeBlock, blockUntil, evaluateReporter, type BlockedReporter } from "./abuseGuard";
import bcrypt from "bcryptjs";
import {
  assignableRoles,
  canAssignOwner,
  canManageAccount,
  clearSessionCookies,
  displayNameError,
  hasOwner,
  isAdminRole,
  DUMMY_PASSWORD_HASH,
  MASTER_USERNAME,
  newAccountId,
  normalizeUsername,
  passwordError,
  publicAccount,
  readSessionToken,
  ROLE_LABEL,
  SessionStore,
  setSessionCookie,
  usernameError,
  type StaffAccount,
  type StaffRole,
  type StaffSession,
} from "./staffAuth";
import { buildReportPush, parseSubscription, pushEnabled, recipientsFor, sendPush, upsertPushRecord, vapidPublicKey, type PushRecord } from "./pushNotify";
import { createDocLocks, nextStoreVersion, StoreConflictError } from "./storeSync";
import { keepAwakeUrl, parseKeepAwakeHours, withinKeepAwake } from "./keepAwake";
import { BACKUP_KEEP, BACKUP_KINDS, BACKUP_NAME_PATTERN, backupName, expiredBackups, kstDate, localBackupStore, supabaseBackupStore, type BackupInfo, type BackupKind, type BackupStore } from "./backupStore";
import { appendAudit, auditCategory, MAX_AUDIT_ENTRIES, newAuditEntry, type AuditAction, type AuditCategory, type AuditEntry } from "./auditLog";

const app = express();
// 호스팅 플랫폼(Render/Railway 등)은 PORT를 주입한다. 로컬에서는 3000.
const PORT = Number(process.env.PORT) || 3000;

// Render 등 프록시 뒤에서 req.ip 가 실제 클라이언트를 가리키도록 한다 (Rate Limit 정확도).
app.set("trust proxy", 1);

app.use(securityHeaders());
app.use(corsPolicy());
// 사진 여러 장(장당 최대 5MB, base64 로 약 1.37배)을 한 번에 받을 수 있게 둔다.
app.use(express.json({ limit: "45mb" }));

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

/**
 * 공식 카탈로그는 배포할 때만 바뀌므로 한 번 읽어 둔다.
 * 거의 모든 요청이 findSchool 을 거치는데, 매번 파일을 읽고 파싱하면 학교가 늘수록 느려진다.
 */
let seedSchoolsCache: SchoolCatalogEntry[] | null = null;
function loadSeedSchools(): SchoolCatalogEntry[] {
  if (seedSchoolsCache) return seedSchoolsCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(SCHOOL_CATALOG_FILE, "utf-8"));
    seedSchoolsCache = Array.isArray(parsed) ? parsed : [];
    return seedSchoolsCache;
  } catch (err) {
    console.error("[schools] 학교 카탈로그 읽기 실패:", err);
    return [];
  }
}

/** 지원 학교 = 공식 카탈로그(schools.seed.json) + 운영진이 화면에서 등록한 학교 */
function loadSchools(): SchoolCatalogEntry[] {
  const seed = loadSeedSchools();
  const seedIds = new Set(seed.map((school) => school.id));
  const custom = loadCustomSchools().filter((school) => !seedIds.has(school.id));
  return [...seed, ...custom].filter((school) => school.supportStatus === "active");
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
  /** 예전 신고의 사진 한 장 (data URL). 새 신고는 photos 를 쓴다. */
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  /** 사진 저장소(photoStore.ts)에 따로 저장한 사진들 */
  photos?: StoredPhoto[];
  status: "pending" | "reviewing" | "assigned" | "scheduled" | "in_progress" | "completed";
  moderationStatus?: "held" | "approved";
  moderationReason?: string | null;
  assignee?: string | null;
  resolutionNote?: string | null;
  riskAnalysis?: RiskAnalysis | null;
  riskAnalysisError?: string | null;
  /** 익명 소유 토큰의 SHA-256 해시. "내 신고" 조회에만 사용하며 절대 외부로 내보내지 않는다. */
  ownerTokenHash?: string | null;
  /** 확인 코드로 다른 기기를 연결할 때 발급한 소유 토큰들의 해시 (최근 것만 남긴다) */
  extraOwnerTokenHashes?: string[];
  /** 접수 때 한 번 보여 준 확인 코드의 해시. 예전 신고에는 없다. */
  recoveryCodeHash?: string | null;
  /** 접수한 기기 토큰의 해시. 반복 신고 판단에만 쓰며 외부로 내보내지 않는다. */
  reporterHash?: string | null;
  /** "나도 겪었어요" 를 누른 기기 토큰 해시 목록. 외부에는 개수만 내보낸다. */
  meTooHashes?: string[];
  /** 학교가 신고한 학생에게만 보여 주는 답변 (공개 처리 결과와 별개) */
  reporterReply?: string | null;
  reporterReplyAt?: string | null;
  /** 처리 완료 후 신고한 학생의 만족도 응답 */
  feedback?: { resolved: boolean; comment: string | null; at: string } | null;
  /** 상태 변경 이력 — 운영진 화면에서만 보여 준다 */
  history?: ReportHistoryEntry[];
  /** Soft Delete — 값이 있으면 모든 공개 기능에서 제외된다. */
  deletedAt?: string | null;
  /** 누가 지웠는지. 이 기능 전에 지운 신고에는 없다. */
  deletedBy?: { name: string; role: string; accountId: string | null } | null;
  deleteReason?: string | null;
  /** 신고한 학생이 나중에 덧붙인 설명 (신고한 학생과 운영진·교사만 본다) */
  followups?: ReportFollowup[];
  reviewedAt?: string | null;
  assignedAt?: string | null;
  scheduledAt?: string | null;
  inProgressAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ReportHistoryEntry {
  at: string;
  /** 누가 바꿨는지. 역할과, 개인 계정이면 그 이름을 남긴다. */
  actor: "staff" | "teacher" | "reporter" | "system";
  /** 개인 계정 이름 또는 공용 계정 표시. 예전 이력과 신고자 이력에는 없다. */
  actorName?: string | null;
  action: "status" | "assignee" | "reply" | "moderation" | "feedback" | "spam" | "delete" | "restore" | "followup";
  from?: string | null;
  to?: string | null;
}

interface ReportFollowup {
  id: string;
  at: string;
  text: string;
  photos: StoredPhoto[];
  /** 자동 안전성 검사에서 확인이 필요하다고 본 경우. 운영진 화면에 경고와 함께 보인다. */
  held: boolean;
  heldReason: string | null;
}

/** 삭제한 신고의 사진을 남겨 두는 기간. 이 안에는 되살리면 사진도 돌아온다. */
const DELETED_PHOTO_RETENTION_DAYS = envNumber("DELETED_PHOTO_RETENTION_DAYS", 30);

/** 숫자 환경변수. 비었거나 숫자가 아니거나 min 보다 작으면 기본값 */
function envNumber(name: string, fallback: number, min = 0): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min ? value : fallback;
}
/** 신고 하나에 덧붙일 수 있는 설명 수와 설명 하나의 사진 수 */
const MAX_FOLLOWUPS = 10;
const MAX_FOLLOWUP_PHOTOS = 3;

/** 이력이 끝없이 늘어나지 않게 최근 것만 남긴다. */
const MAX_HISTORY = 100;
function addHistory(report: StoredReport, entry: Omit<ReportHistoryEntry, "at">, at = new Date().toISOString()) {
  report.history = [...(report.history ?? []), { at, ...entry }].slice(-MAX_HISTORY);
}

/** 이 신고의 소유 토큰 해시들 (접수 기기 + 확인 코드로 연결한 기기) */
function reportOwnerHashes(report: StoredReport): string[] {
  return [report.ownerTokenHash ?? "", ...(report.extraOwnerTokenHashes ?? [])].filter(Boolean);
}

function ownsReport(report: StoredReport, hashes: Set<string>): boolean {
  return reportOwnerHashes(report).some((hash) => hashes.has(hash));
}

/** 확인 코드로 연결할 수 있는 기기 수. 넘으면 가장 오래된 연결부터 끊는다. */
const MAX_EXTRA_OWNERS = 10;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// 저장소
// ---------------------------------------------------------------------------

// Data API 화면의 "API URL"(…/rest/v1)을 그대로 붙여넣는 경우가 많다.
// 서버가 /rest/v1 을 직접 붙이므로, 끝의 슬래시와 /rest/v1 은 떼고 프로젝트 주소만 남긴다.
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_API_KEY = SUPABASE_SECRET_KEY || SUPABASE_SERVICE_ROLE_KEY;
const useSupabaseStore = Boolean(SUPABASE_URL && SUPABASE_API_KEY);
const requireSupabaseStore = process.env.REQUIRE_SUPABASE_STORE === "true";
let cachedReports: StoredReport[] = [];
let cachedSchoolApplications: SchoolApplication[] = [];

function localReports(): StoredReport[] {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("[db] reports_db.json 읽기 실패:", err);
  }
  return [];
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
  /** 이 신청으로 운영진이 등록한 학교 id */
  registeredSchoolId?: string | null;
  createdAt: string;
  updatedAt: string;
}

function localSchoolApplications(): SchoolApplication[] {
  try {
    if (!fs.existsSync(SCHOOL_APPLICATIONS_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(SCHOOL_APPLICATIONS_FILE, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[school-applications] 신청함 읽기 실패:", err);
    return [];
  }
}

class SupabaseRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function supabaseStoreRequest(pathname: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: SUPABASE_API_KEY,
      // New sb_secret keys are API keys, not JWTs, and must not be sent as Bearer tokens.
      ...(SUPABASE_SECRET_KEY ? {} : { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }),
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new SupabaseRequestError(response.status, `Supabase 저장소 요청 실패 (${response.status}): ${detail.slice(0, 300)}`);
  }
  return response;
}

type StoreKey = "reports" | "school_applications" | "custom_schools" | "blocked_reporters" | "settings" | "staff_accounts" | "staff_sessions" | "push_subscriptions" | "audit_log";
const STORE_KEYS: StoreKey[] = ["reports", "school_applications", "custom_schools", "blocked_reporters", "settings", "staff_accounts", "staff_sessions", "push_subscriptions", "audit_log"];

/** 문서별로 마지막으로 읽거나 쓴 버전(updated_at). 문서가 아직 없으면 null (storeSync.ts 참고) */
const storeVersions = new Map<StoreKey, string | null>();

async function readSupabaseDocument(key: StoreKey): Promise<{ payload: unknown[] | null; updatedAt: string | null }> {
  const query = new URLSearchParams({ select: "key,payload,updated_at", key: `eq.${key}`, limit: "1" });
  const response = await supabaseStoreRequest(`schoolfix_store?${query.toString()}`);
  const rows = await response.json() as Array<{ key?: string; payload?: unknown; updated_at?: string }>;
  if (rows.length === 0) return { payload: null, updatedAt: null };
  if (rows.length !== 1 || rows[0].key !== key || !Array.isArray(rows[0].payload)) {
    throw new Error(`Supabase의 ${key} 문서 형식이 올바르지 않습니다. 기존 데이터를 덮어쓰지 않도록 시작을 중단합니다.`);
  }
  return { payload: rows[0].payload, updatedAt: rows[0].updated_at ?? null };
}

/**
 * 문서를 쓴다. 마지막으로 읽은 버전이 그대로일 때만 쓰고, 그사이 다른 서버가 바꿨으면
 * StoreConflictError 를 던진다. withDocLock 이 최신 문서를 다시 읽고 작업을 다시 실행한다.
 */
async function writeSupabaseDocument(key: StoreKey, payload: unknown): Promise<void> {
  const version = storeVersions.get(key) ?? null;
  const updatedAt = nextStoreVersion(version);
  let rows: Array<{ updated_at?: string }>;
  if (version) {
    const query = new URLSearchParams({ key: `eq.${key}`, updated_at: `eq.${version}`, select: "updated_at" });
    const response = await supabaseStoreRequest(`schoolfix_store?${query.toString()}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ payload, updated_at: updatedAt }),
    });
    rows = await response.json();
    if (rows.length === 0) throw new StoreConflictError<StoreKey>(key);
  } else {
    // 문서가 아직 없을 때. 다른 서버가 먼저 만들었으면 중복 키(409)로 실패한다.
    try {
      const response = await supabaseStoreRequest("schoolfix_store?select=updated_at", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ key, payload, updated_at: updatedAt }),
      });
      rows = await response.json();
    } catch (err) {
      if (err instanceof SupabaseRequestError && err.status === 409) throw new StoreConflictError<StoreKey>(key);
      throw err;
    }
  }
  storeVersions.set(key, rows[0]?.updated_at ?? updatedAt);
}

/** 문서마다 작업을 하나씩 실행하고, 다른 서버와 충돌하면 최신 문서를 읽어 다시 실행한다. */
const withDocLock = createDocLocks<StoreKey>((key) => refreshDocument(key));

/** 저장소에서 문서를 다시 읽어 메모리에 반영한다. */
async function refreshDocument(key: StoreKey) {
  if (!useSupabaseStore) return;
  const { payload, updatedAt } = await readSupabaseDocument(key);
  storeVersions.set(key, updatedAt);
  applyDocument(key, payload ?? []);
}

/** 저장소에서 읽은 문서를 메모리 캐시에 넣는다. */
function applyDocument(key: StoreKey, payload: unknown[]) {
  switch (key) {
    case "reports": {
      const defaultSchool = loadSchools()[0];
      cachedReports = (payload as StoredReport[])
        .filter((report) => !LEGACY_SAMPLE_REPORT_IDS.has(report.id))
        .map((report) => structuredClone(report.schoolId || !defaultSchool ? report : { ...report, schoolId: defaultSchool.id, schoolName: defaultSchool.schoolName }));
      // 다른 서버가 바꾼 신고가 들어왔으니 AI 요약 캐시를 버린다.
      summaryCache = null;
      break;
    }
    case "school_applications": cachedSchoolApplications = (payload as SchoolApplication[]).map((item) => ({ ...item })); break;
    case "custom_schools": cachedCustomSchools = (payload as SchoolCatalogEntry[]).map((item) => structuredClone(item)); break;
    case "blocked_reporters": cachedBlockedReporters = (payload as BlockedReporter[]).map((item) => ({ ...item })); break;
    case "settings": cachedSettings = (payload as NotificationSettings[]).map((item) => ({ ...item })); break;
    case "staff_accounts": cachedStaffAccounts = (payload as StaffAccount[]).map((item) => ({ ...item })); break;
    case "staff_sessions": staffSessions.syncFromRemote(payload); break;
    case "push_subscriptions": cachedPushRecords = (payload as PushRecord[]).map((item) => ({ ...item })); break;
    case "audit_log": cachedAudit = (payload as AuditEntry[]).map((item) => ({ ...item })); break;
  }
}

/**
 * 다른 서버가 바꾼 문서를 가져온다. 버전만 가볍게 확인하고, 바뀐 문서만 다시 읽는다.
 * 배포 중 옛 서버에 들어온 신고가 새 서버 화면에 늦게라도 나타나게 한다.
 */
let syncing = false;
async function syncFromStore() {
  // Supabase 가 느려 이전 확인이 아직 끝나지 않았으면 겹쳐 돌리지 않는다.
  if (!useSupabaseStore || syncing) return;
  syncing = true;
  try {
    const response = await supabaseStoreRequest("schoolfix_store?select=key,updated_at");
    const rows = await response.json() as Array<{ key: string; updated_at: string }>;
    for (const row of rows) {
      const key = row.key as StoreKey;
      if (!STORE_KEYS.includes(key) || storeVersions.get(key) === row.updated_at) continue;
      await withDocLock(key, async () => {
        if (storeVersions.get(key) !== row.updated_at) await refreshDocument(key);
      });
    }
  } finally {
    syncing = false;
  }
}

async function initializeDataStore() {
  if (Boolean(SUPABASE_URL) !== Boolean(SUPABASE_API_KEY) || (SUPABASE_SECRET_KEY && SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error("SUPABASE_URL과 API 키를 함께 설정하고, SUPABASE_SECRET_KEY 또는 SUPABASE_SERVICE_ROLE_KEY 중 하나만 사용해야 합니다.");
  }
  if (!useSupabaseStore) {
    if (requireSupabaseStore) {
      throw new Error("REQUIRE_SUPABASE_STORE=true 이지만 Supabase 연결 정보가 없습니다. 영구 저장소 없이 서버를 시작하지 않습니다.");
    }
    if (process.env.NODE_ENV === "production") {
      console.warn("[store] 경고: 영구 저장소가 연결되지 않았습니다. Render 재시작·재배포 시 JSON 데이터가 사라질 수 있습니다. Supabase 설정 후 REQUIRE_SUPABASE_STORE=true를 설정하세요.");
    }
    console.log("[store] 로컬 JSON 파일 저장소를 사용합니다.");
    staffSessions.load(readLocalArray<StaffSession>(STAFF_SESSIONS_FILE, "staff-sessions"));
    return;
  }
  // 로컬 개발용 Supabase(CLI, http://127.0.0.1:54321)와 테스트용 흉내 서버만 http 를 허용한다.
  if (!/^https:\/\//i.test(SUPABASE_URL) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(SUPABASE_URL)) {
    throw new Error("SUPABASE_URL은 HTTPS 주소여야 합니다.");
  }
  // 대시보드 주소(supabase.com/dashboard/...)나 경로가 남은 주소는 REST 요청이 404(PGRST125)로 실패한다.
  // 원인을 알 수 있도록 시작 단계에서 바로 알려 준다.
  let supabaseUrl: URL;
  try {
    supabaseUrl = new URL(SUPABASE_URL);
  } catch {
    throw new Error("SUPABASE_URL 형식이 올바르지 않습니다. 예: https://abcd1234.supabase.co");
  }
  if (supabaseUrl.hostname === "supabase.com" || supabaseUrl.hostname.endsWith(".supabase.com")) {
    throw new Error("SUPABASE_URL에 대시보드 주소가 들어 있습니다. Project URL(예: https://abcd1234.supabase.co)을 넣어 주세요.");
  }
  if (supabaseUrl.pathname !== "/" && supabaseUrl.pathname !== "") {
    throw new Error(`SUPABASE_URL에는 경로 없이 프로젝트 주소만 넣어 주세요. 현재 경로: ${supabaseUrl.pathname} (예: https://abcd1234.supabase.co)`);
  }
  // 공개용 키(publishable / anon)를 넣으면 테이블 권한 오류(42501)로 실패한다.
  // 테이블을 anon 에 열어 주는 잘못된 "해결"로 이어지지 않도록 원인을 분명히 알려 준다.
  if (SUPABASE_SECRET_KEY && !SUPABASE_SECRET_KEY.startsWith("sb_secret_")) {
    throw new Error("SUPABASE_SECRET_KEY에는 Supabase > Project Settings > API Keys 의 Secret key(sb_secret_...)를 넣어야 합니다. Publishable key(sb_publishable_...)나 anon 키는 사용할 수 없습니다.");
  }
  if (SUPABASE_SERVICE_ROLE_KEY) {
    let role = "";
    try {
      role = JSON.parse(Buffer.from(SUPABASE_SERVICE_ROLE_KEY.split(".")[1] || "", "base64url").toString("utf-8")).role || "";
    } catch {
      // 형식을 해석할 수 없으면 서버가 실제 요청으로 확인한다.
    }
    if (role && role !== "service_role") {
      throw new Error(`SUPABASE_SERVICE_ROLE_KEY에 ${role} 키가 들어 있습니다. service_role 키 또는 SUPABASE_SECRET_KEY(sb_secret_...)를 사용해 주세요.`);
    }
  }

  const documents = await Promise.all(STORE_KEYS.map(async (key) => ({ key, ...(await readSupabaseDocument(key)) })));
  // 나중에 추가된 문서들은 처음 쓸 때 만든다. 테이블 제약(supabase/schema.sql)을 아직 갱신하지 않은
  // 배포에서도 서버가 시작은 되도록, 시작 시점에는 쓰지 않는다.
  for (const { key, payload, updatedAt } of documents) {
    storeVersions.set(key, updatedAt);
    if (key === "staff_sessions") staffSessions.load(payload ?? []);
    else if (key !== "reports" && key !== "school_applications") applyDocument(key, payload ?? []);
  }
  const remoteReports = documents.find((doc) => doc.key === "reports")?.payload ?? null;
  const remoteApplications = documents.find((doc) => doc.key === "school_applications")?.payload ?? null;
  const reports = Array.isArray(remoteReports) ? remoteReports as StoredReport[] : localReports();
  const applications = Array.isArray(remoteApplications) ? remoteApplications as SchoolApplication[] : localSchoolApplications();
  applyDocument("reports", reports);
  applyDocument("school_applications", applications);
  const realCount = cachedReports.length;

  // 첫 연결 시에는 기존 data/ JSON을 가져오고, 이후에는 Supabase를 기준 저장소로 삼습니다.
  // 다른 서버가 같은 순간 먼저 가져왔으면(충돌) 그쪽 내용을 그대로 쓴다.
  const importDocument = async (key: StoreKey, payload: unknown[]) => {
    try {
      await writeSupabaseDocument(key, payload);
    } catch (err) {
      if (!(err instanceof StoreConflictError)) throw err;
      await refreshDocument(key);
    }
  };
  if (!Array.isArray(remoteReports) || realCount !== reports.length) {
    if (!Array.isArray(remoteReports)) console.log(`[store] Supabase reports 문서가 없어 로컬 데이터 ${realCount}건을 가져옵니다.`);
    await importDocument("reports", cachedReports);
  }
  if (!Array.isArray(remoteApplications)) {
    console.log(`[store] Supabase school_applications 문서가 없어 로컬 데이터 ${applications.length}건을 가져옵니다.`);
    await importDocument("school_applications", cachedSchoolApplications);
  }
  console.log(`[store] Supabase 연결 완료: 신고 ${cachedReports.length}건, 학교 신청 ${cachedSchoolApplications.length}건`);
}

function loadAllReports(): StoredReport[] {
  const stored = useSupabaseStore ? cachedReports : localReports();
  const realReports = stored.filter((report) => !LEGACY_SAMPLE_REPORT_IDS.has(report.id));
  const defaultSchool = loadSchools()[0];
  // Supabase reads come from an in-memory cache. Return detached objects so a
  // route cannot mutate the cache before its write succeeds.
  return realReports.map((report) => {
    const copy = structuredClone(report);
    return copy.schoolId || !defaultSchool ? copy : { ...copy, schoolId: defaultSchool.id, schoolName: defaultSchool.schoolName };
  });
}

/** 삭제·검토 보류된 신고는 모든 공개 경로에서 제외한다. */
function loadReports(): StoredReport[] {
  return loadAllReports().filter((r) => !r.deletedAt && r.moderationStatus !== "held");
}

function loadSchoolApplications(): SchoolApplication[] {
  const applications = useSupabaseStore ? cachedSchoolApplications : localSchoolApplications();
  return applications.map((application) => ({ ...application }));
}

// --- 운영진이 등록한 학교 / 장난 신고로 처리된 기기 -------------------------------

const CUSTOM_SCHOOLS_FILE = path.join(DATA_DIR, "custom_schools.json");
const BLOCKED_REPORTERS_FILE = path.join(DATA_DIR, "blocked_reporters.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
let cachedCustomSchools: SchoolCatalogEntry[] = [];
let cachedBlockedReporters: BlockedReporter[] = [];
/** 저장소 문서는 배열 형식이어야 하므로 설정 객체 하나를 배열에 담아 둔다. */
let cachedSettings: NotificationSettings[] = [];

/** 운영진 화면 "알림" 탭에서 켜고 끄는 알림 종류와, 월간 보고 중복 발송 방지 기록 */
interface NotificationSettings {
  /** 모든 새 신고(공개 보류 포함). 보류 신고는 사유·전체 내용·사진까지 보낸다. */
  allReports: boolean;
  /** 긴급 신고. 모든 신고 알림이 꺼져 있을 때와, 접수 뒤 백그라운드 채점에서 긴급으로 판정됐을 때 쓴다. */
  urgent: boolean;
  applications: boolean;
  monthly: boolean;
  /** 마지막으로 자동 발송한 월간 보고의 대상 월 "YYYY-MM" */
  lastMonthlyReport: string | null;
  /** 이미 적용한 총괄 비상 복구(OWNER_RESET_*)의 지문. 재시작할 때마다 다시 적용하지 않게 한다. */
  ownerResetApplied?: string | null;
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = { allReports: true, urgent: true, applications: true, monthly: true, lastMonthlyReport: null };

function loadNotificationSettings(): NotificationSettings {
  const list = useSupabaseStore ? cachedSettings : readLocalArray<NotificationSettings>(SETTINGS_FILE, "settings");
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...(list[0] ?? {}) };
}

async function saveNotificationSettings(settings: NotificationSettings) {
  if (useSupabaseStore) {
    await writeSupabaseDocument("settings", [settings]);
    cachedSettings = [{ ...settings }];
    return;
  }
  writeLocalArray(SETTINGS_FILE, [settings]);
}

function readLocalArray<T>(file: string, label: string): T[] {
  try {
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`[${label}] 읽기 실패:`, err);
    return [];
  }
}

function writeLocalArray(file: string, data: unknown[]) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

/** Supabase 테이블 제약이 새 문서 종류를 아직 허용하지 않을 때 운영진에게 보여 줄 안내 */
const STORE_SCHEMA_HINT = "저장하지 못했습니다. Supabase를 쓰는 경우 supabase/schema.sql 의 최신 내용을 SQL Editor에서 한 번 실행해야 합니다.";

function loadCustomSchools(): SchoolCatalogEntry[] {
  const list = useSupabaseStore ? cachedCustomSchools : readLocalArray<SchoolCatalogEntry>(CUSTOM_SCHOOLS_FILE, "custom-schools");
  return list.map((school) => structuredClone(school));
}

async function saveCustomSchools(list: SchoolCatalogEntry[]) {
  if (useSupabaseStore) {
    await writeSupabaseDocument("custom_schools", list);
    cachedCustomSchools = list.map((school) => structuredClone(school));
    return;
  }
  writeLocalArray(CUSTOM_SCHOOLS_FILE, list);
}

function loadBlockedReporters(): BlockedReporter[] {
  const list = useSupabaseStore ? cachedBlockedReporters : readLocalArray<BlockedReporter>(BLOCKED_REPORTERS_FILE, "blocked-reporters");
  // 만료된 항목은 의미가 없으므로 읽을 때 걸러낸다.
  const now = Date.now();
  return list.filter((entry) => new Date(entry.until).getTime() > now).map((entry) => ({ ...entry }));
}

async function saveBlockedReporters(list: BlockedReporter[]) {
  if (useSupabaseStore) {
    await writeSupabaseDocument("blocked_reporters", list);
    cachedBlockedReporters = list.map((entry) => ({ ...entry }));
    return;
  }
  writeLocalArray(BLOCKED_REPORTERS_FILE, list);
}

// --- 운영진·교사 개인 계정 / 로그인 세션 / 학생 알림 구독 ---------------------------

const STAFF_ACCOUNTS_FILE = path.join(DATA_DIR, "staff_accounts.json");
const STAFF_SESSIONS_FILE = path.join(DATA_DIR, "staff_sessions.json");
const PUSH_SUBSCRIPTIONS_FILE = path.join(DATA_DIR, "push_subscriptions.json");
let cachedStaffAccounts: StaffAccount[] = [];
let cachedPushRecords: PushRecord[] = [];

function loadStaffAccounts(): StaffAccount[] {
  const list = useSupabaseStore ? cachedStaffAccounts : readLocalArray<StaffAccount>(STAFF_ACCOUNTS_FILE, "staff-accounts");
  return list.map((account) => ({ ...account }));
}

async function saveStaffAccounts(list: StaffAccount[]) {
  if (useSupabaseStore) {
    await writeSupabaseDocument("staff_accounts", list);
    cachedStaffAccounts = list.map((account) => ({ ...account }));
    return;
  }
  writeLocalArray(STAFF_ACCOUNTS_FILE, list);
}

/** 계정 목록의 "읽기 → 수정 → 저장" 을 하나씩 실행한다. 동시에 두 계정을 만들어도 한쪽이 사라지지 않게 한다. */
function withAccountsLock<T>(task: () => Promise<T>): Promise<T> {
  return withDocLock("staff_accounts", task);
}

/**
 * 로그인 세션 — 해시만 저장소에 남긴다 (staffAuth.ts).
 * 저장할 목록은 차례가 왔을 때 snapshot() 으로 다시 뜬다. 그래서 차례를 기다리는 저장이 이미 있으면
 * 하나 더 줄 세우지 않는다. 다른 서버와 충돌하면 그쪽 목록과 합친 뒤 다시 저장한다.
 */
let sessionWriteQueued = false;
const staffSessions = new SessionStore(async () => {
  if (sessionWriteQueued) return;
  sessionWriteQueued = true;
  await withDocLock("staff_sessions", async () => {
    sessionWriteQueued = false;
    const snapshot = staffSessions.snapshot();
    if (useSupabaseStore) await writeSupabaseDocument("staff_sessions", snapshot);
    else writeLocalArray(STAFF_SESSIONS_FILE, snapshot);
    staffSessions.markPersisted(snapshot);
  }).finally(() => { sessionWriteQueued = false; });
});

function loadPushRecords(): PushRecord[] {
  const list = useSupabaseStore ? cachedPushRecords : readLocalArray<PushRecord>(PUSH_SUBSCRIPTIONS_FILE, "push-subscriptions");
  return list.map((record) => ({ ...record, keys: { ...record.keys }, ownerTokenHashes: [...record.ownerTokenHashes] }));
}

async function savePushRecords(list: PushRecord[]) {
  if (useSupabaseStore) {
    await writeSupabaseDocument("push_subscriptions", list);
    cachedPushRecords = list.map((record) => ({ ...record }));
    return;
  }
  writeLocalArray(PUSH_SUBSCRIPTIONS_FILE, list);
}

function withPushLock<T>(task: () => Promise<T>): Promise<T> {
  return withDocLock("push_subscriptions", task);
}

// --- 운영 기록 (auditLog.ts) ------------------------------------------------------

const AUDIT_FILE = path.join(DATA_DIR, "audit_log.json");
let cachedAudit: AuditEntry[] = [];
/**
 * 아직 저장하지 못한 기록 (최근 것부터). 저장이 막혀도(예: Supabase 키 제약이 옛날 것) 화면에는 바로 보이고,
 * 저장이 다시 되면 한꺼번에 저장한다. 서버가 다시 시작되면 사라지므로 화면에 경고를 띄운다.
 */
let pendingAudit: AuditEntry[] = [];
let auditSaveProblem: { message: string; needsSchemaUpdate: boolean; since: string } | null = null;

/** supabase/schema.sql 의 키 제약을 지금 서버가 쓰는 문서 목록으로 바꾸는 SQL */
const STORE_KEY_CONSTRAINT_SQL = [
  "alter table public.schoolfix_store drop constraint if exists schoolfix_store_key_check;",
  "alter table public.schoolfix_store add constraint schoolfix_store_key_check",
  `  check (key in (${STORE_KEYS.map((key) => `'${key}'`).join(", ")}));`,
].join("\n");

function savedAudit(): AuditEntry[] {
  return useSupabaseStore ? cachedAudit : readLocalArray<AuditEntry>(AUDIT_FILE, "audit-log");
}

/** 저장된 기록과 아직 저장하지 못한 기록을 합쳐 최근 것부터 */
function loadAudit(): AuditEntry[] {
  const saved = savedAudit();
  const merged = pendingAudit.length ? [...pendingAudit, ...saved.filter((entry) => !pendingAudit.some((item) => item.id === entry.id))].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)) : saved;
  return merged.slice(0, MAX_AUDIT_ENTRIES).map((entry) => ({ ...entry }));
}

async function saveAudit(list: AuditEntry[]) {
  if (useSupabaseStore) {
    await writeSupabaseDocument("audit_log", list);
    cachedAudit = list.map((entry) => ({ ...entry }));
    return;
  }
  writeLocalArray(AUDIT_FILE, list);
}

/**
 * 중요한 일을 운영 기록에 남긴다. 응답을 기다리지 않는다 — 기록에 실패해도 그 일 자체는 막지 않는다.
 * actor 가 null 이면 시스템이 한 일(자동 백업 등)이다.
 */
function audit(actor: StaffSession | null, action: AuditAction, target: string | null = null, detail: string | null = null) {
  const entry = newAuditEntry(action, actor ? { name: actor.name, role: actor.role, accountId: actor.accountId } : null, target, detail);
  pendingAudit = appendAudit(pendingAudit, entry);
  void flushAudit();
}

/** 아직 저장하지 못한 기록을 저장한다. 실패하면 남겨 두고 다음 기록이나 주기 확인 때 다시 시도한다. */
function flushAudit(): Promise<void> {
  return withDocLock("audit_log", async () => {
    if (pendingAudit.length === 0) return;
    const batch = pendingAudit;
    await saveAudit(loadAudit());
    pendingAudit = pendingAudit.filter((entry) => !batch.includes(entry));
    if (auditSaveProblem) console.log("[audit] 운영 기록 저장이 다시 됩니다. 밀린 기록을 저장했습니다.");
    auditSaveProblem = null;
  }).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    const needsSchemaUpdate = err instanceof SupabaseRequestError && (message.includes("schoolfix_store_key_check") || message.includes("23514"));
    if (!auditSaveProblem || auditSaveProblem.message !== message) {
      console.error(`[audit] 운영 기록을 저장하지 못했습니다${needsSchemaUpdate ? " — Supabase SQL Editor 에서 supabase/schema.sql 을 다시 실행해야 합니다" : ""}:`, message);
    }
    auditSaveProblem = { message, needsSchemaUpdate, since: auditSaveProblem?.since ?? new Date().toISOString() };
  });
}

/**
 * 신고한 학생의 기기로 알림을 보낸다. 응답을 기다리지 않는다 — 알림 실패가 처리 저장을 막지 않는다.
 * 만료된 구독은 보낸 뒤 지운다.
 */
function notifyReporter(report: StoredReport, change: Parameters<typeof buildReportPush>[1]) {
  if (!pushEnabled()) return;
  const message = buildReportPush(report, change);
  if (!message) return;
  const recipients = recipientsFor(loadPushRecords(), reportOwnerHashes(report));
  if (recipients.length === 0) return;
  void sendPush(recipients, message).then(async (expired) => {
    if (expired.length === 0) return;
    await withPushLock(async () => {
      await savePushRecords(loadPushRecords().filter((record) => !expired.includes(record.id)));
    });
  }).catch((err) => console.error("[push] 만료 구독 정리 실패:", err instanceof Error ? err.message : err));
}

/** 운영진이 학교를 등록할 때 쓰는 기본 위치 유형. 공식 확인 전이므로 모두 확인 필요 상태다. */
const DEFAULT_LOCATION_TYPES = ["교실", "복도", "화장실", "계단", "급식실", "체육관", "운동장", "도서관", "특별실", "보건·상담", "학습공간", "공용공간"]
  .map((type) => ({ type, verificationStatus: "needs_review" }))
  .concat([{ type: "기타", verificationStatus: "user_entered" }]);

/** 기기 토큰 → 해시. "내 신고" 소유 토큰과 섞이지 않도록 용도별 접두어를 붙인다. */
function deviceHash(token: unknown, purpose: "reporter" | "metoo"): string | null {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  return crypto.createHash("sha256").update(`${purpose}:${token}`).digest("hex");
}

async function saveSchoolApplications(applications: SchoolApplication[]) {
  if (useSupabaseStore) {
    await writeSupabaseDocument("school_applications", applications);
    cachedSchoolApplications = applications.map((application) => structuredClone(application));
    return;
  }
  try {
    const tmp = `${SCHOOL_APPLICATIONS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(applications, null, 2), "utf-8");
    fs.renameSync(tmp, SCHOOL_APPLICATIONS_FILE);
  } catch (err) {
    console.error("[school-applications] 신청함 저장 실패:", err);
    throw err;
  }
}

async function moderationFlagged(apiKey: string, content: Array<Record<string, unknown>>): Promise<boolean> {
  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "omni-moderation-latest", input: content }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`moderation status ${response.status}`);
  const result = await response.json() as { results?: Array<{ flagged?: boolean }> };
  if (!Array.isArray(result.results) || result.results.length === 0) throw new Error("moderation response missing results");
  return result.results.some((item) => item.flagged);
}

/**
 * 텍스트와 첨부 사진을 OpenAI Moderation으로 검사한다. 검사하지 못한 사진이 있으면 보류한다.
 * 사진은 한 장씩 따로 검사한다(요청 하나에 이미지 여러 장을 넣는 것을 보장하지 않는다).
 */
async function moderateReport(title: string, description: string, images: string[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  const profanityDetected = maskProfanity(`${title}\n${description}`).count > 0;
  const hasImages = images.length > 0;
  if (!apiKey) {
    return { hold: profanityDetected || hasImages, reason: profanityDetected ? "부적절한 표현 자동 감지" : hasImages ? "이미지 안전성 검사 미설정" : null };
  }
  try {
    const checks = await Promise.all([
      moderationFlagged(apiKey, [{ type: "text", text: `${title}\n${description}` }]),
      ...images.map((url) => moderationFlagged(apiKey, [{ type: "image_url", image_url: { url } }])),
    ]);
    const flagged = checks.some(Boolean);
    return { hold: flagged || profanityDetected, reason: flagged ? "안전성 검사에서 검토 필요 판정" : profanityDetected ? "부적절한 표현 자동 감지" : null };
  } catch (err) {
    console.error("[moderation] 검사 실패:", err instanceof Error ? err.message : err);
    return { hold: profanityDetected || hasImages, reason: profanityDetected ? "부적절한 표현 자동 감지" : hasImages ? "이미지 안전성 검사 실패" : null };
  }
}

/**
 * 신고 목록의 "읽기 → 수정 → 저장" 구간을 한 번에 하나씩만 실행한다.
 * 저장은 전체 목록을 통째로 덮어쓰므로, 두 요청이 같은 스냅샷을 읽고 각자 저장하면
 * 먼저 저장한 쪽의 변경(새 신고·상태 변경)이 사라지고 접수번호도 중복된다.
 * 잠금 안에서는 OpenAI 호출처럼 오래 걸리는 작업을 하지 않는다.
 * 다른 서버(배포 중 옛 서버)가 그사이 목록을 바꿨으면 최신 목록을 읽어 작업을 다시 실행한다.
 */
function withReportsLock<T>(task: () => Promise<T>): Promise<T> {
  return withDocLock("reports", task);
}

async function saveReports(reports: StoredReport[]) {
  if (useSupabaseStore) {
    await writeSupabaseDocument("reports", reports);
    cachedReports = reports.map((report) => structuredClone(report));
    return;
  }
  try {
    // 임시 파일에 쓴 뒤 교체한다. 쓰기 도중 중단돼도 기존 파일이 깨지지 않는다.
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(reports, null, 2), "utf-8");
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error("[db] reports_db.json 저장 실패:", err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 사진 저장소 — 신고 JSON 과 분리해 저장한다 (photoStore.ts)
// ---------------------------------------------------------------------------

const PHOTO_BUCKET = process.env.SUPABASE_PHOTO_BUCKET?.trim() || "report-photos";
const photoBackend: PhotoBackend = useSupabaseStore
  ? supabasePhotoBackend(SUPABASE_URL, SUPABASE_API_KEY, !SUPABASE_SECRET_KEY, PHOTO_BUCKET)
  : localPhotoBackend(path.join(DATA_DIR, "photos"));
let photoBackendReady = false;
const photoCache = new PhotoCache();

/** 버킷 준비. 실패해도 서버는 뜨고, 사진을 올릴 때 다시 시도한다. */
async function ensurePhotoBackend(): Promise<boolean> {
  if (photoBackendReady) return true;
  try {
    await photoBackend.init();
    photoBackendReady = true;
  } catch (err) {
    console.error("[photos] 사진 저장소 준비 실패:", err instanceof Error ? err.message : err);
  }
  return photoBackendReady;
}

/** 요청 본문의 사진들. 예전 화면이 보내는 attachmentUrl 한 장도 받아 준다. */
function parseIncomingPhotos(body: Record<string, unknown>): { ok: true; photos: IncomingPhoto[] } | { ok: false; error: string } {
  const raw: unknown[] = Array.isArray(body.photos)
    ? body.photos
    : body.attachmentUrl ? [{ dataUrl: body.attachmentUrl, name: body.attachmentName }] : [];
  if (raw.length > PHOTO_RULES.maxPhotos) return { ok: false, error: `사진은 ${PHOTO_RULES.maxPhotos}장까지 첨부할 수 있습니다.` };
  const photos: IncomingPhoto[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return { ok: false, error: "첨부 사진 형식이 올바르지 않습니다." };
    const { dataUrl, name } = item as { dataUrl?: unknown; name?: unknown };
    const decoded = decodePhotoDataUrl(dataUrl);
    if (!decoded.ok) return decoded;
    photos.push({ buffer: decoded.buffer, type: decoded.type, name: typeof name === "string" ? name.trim().slice(0, 120) || null : null });
  }
  return { ok: true, photos };
}

/** 사진을 모두 올린다. 하나라도 실패하면 이미 올린 것을 지우고 실패를 돌려준다. */
async function uploadPhotos(photos: IncomingPhoto[]): Promise<StoredPhoto[]> {
  if (photos.length === 0) return [];
  if (!(await ensurePhotoBackend())) throw new Error("사진 저장소를 사용할 수 없습니다.");
  const stored: StoredPhoto[] = [];
  try {
    for (const photo of photos) {
      const id = newPhotoId(photo.type);
      await photoBackend.put(id, photo.buffer, photo.type);
      photoCache.set(id, photo.buffer);
      stored.push({ id, name: photo.name, size: photo.buffer.length, type: photo.type });
    }
    return stored;
  } catch (err) {
    await removePhotos(stored);
    throw err;
  }
}

/** 삭제·반려된 신고의 사진은 저장소에서도 지운다. 실패해도 신고 처리는 막지 않는다. */
async function removePhotos(photos: StoredPhoto[] | undefined) {
  if (!photos?.length) return;
  photos.forEach((photo) => photoCache.delete(photo.id));
  await photoBackend.remove(photos.map((photo) => photo.id)).catch((err) => {
    console.error("[photos] 사진 삭제 실패:", err instanceof Error ? err.message : err);
  });
}

/** 화면에 내보내는 사진 목록. 예전 신고의 data URL 사진도 같은 모양으로 맞춘다. */
function publicPhotos(r: StoredReport) {
  const list = (r.photos ?? []).map((photo) => ({ url: `/api/photos/${photo.id}`, name: photo.name, size: photo.size }));
  if (r.attachmentUrl) list.push({ url: r.attachmentUrl, name: r.attachmentName ?? null, size: r.attachmentSize ?? 0 });
  return list;
}

/** 알림에 실을 사진(data URL). 접수 직후에는 받은 바이트를 그대로 쓴다. */
function photosAsAttachments(photos: IncomingPhoto[]) {
  return photos.map((photo) => ({ dataUrl: `data:${photo.type};base64,${photo.buffer.toString("base64")}`, name: photo.name, size: photo.buffer.length }));
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
    // 저장된 과거 신고에도 필터 적용 전 원문이 남아 있을 수 있으므로
    // 공개 API로 내보낼 때 한 번 더 규칙 기반 필터를 적용한다.
    title: maskProfanity(r.title ?? "").text,
    location: r.location,
    locationDetail: r.locationDetail ?? null,
    category: r.category,
    description: maskProfanity(r.description).text,
    status: r.status,
    moderationStatus: r.moderationStatus ?? "approved",
    riskLevel: r.riskAnalysis?.risk_level ?? null,
    riskScore: r.riskAnalysis?.risk_score ?? null,
    riskAnalysis: r.riskAnalysis ?? null,
    photos: publicPhotos(r),
    assignee: r.assignee ?? null,
    resolutionNote: r.resolutionNote ?? null,
    reviewedAt: r.reviewedAt ?? null,
    assignedAt: r.assignedAt ?? null,
    scheduledAt: r.scheduledAt ?? null,
    inProgressAt: r.inProgressAt ?? null,
    completedAt: r.completedAt ?? null,
    meTooCount: r.meTooHashes?.length ?? 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** "내 신고" — 공개 형태에 신고한 학생만 볼 수 있는 답변·만족도 응답을 더한다. */
function toMyReport(r: StoredReport) {
  return {
    ...toPublicReport(r),
    isMine: true as const,
    reporterReply: r.reporterReply ?? null,
    reporterReplyAt: r.reporterReplyAt ?? null,
    feedback: r.feedback ?? null,
    // 내가 덧붙인 설명. 사진은 운영진만 열 수 있어 장수만 알려 준다.
    followups: (r.followups ?? []).map((followup) => ({ id: followup.id, at: followup.at, text: followup.text, photoCount: followup.photos.length })),
  };
}

/**
 * 운영진·교사 화면용. 처리에 필요한 내부 정보(이력, 학생 답변, 반복 신고 여부)를 더한다.
 * 기기 해시 원문은 여기서도 내보내지 않는다.
 */
function toStaffReport(r: StoredReport, all: StoredReport[], blocked: BlockedReporter[]) {
  const sameDevice = r.reporterHash ? all.filter((other) => other.reporterHash === r.reporterHash).length : 0;
  return {
    ...toPublicReport(r),
    moderationReason: r.moderationReason ?? null,
    attachmentName: r.attachmentName ?? null,
    reporterReply: r.reporterReply ?? null,
    reporterReplyAt: r.reporterReplyAt ?? null,
    feedback: r.feedback ?? null,
    followups: (r.followups ?? []).map((followup) => ({
      id: followup.id,
      at: followup.at,
      text: followup.text,
      held: followup.held,
      heldReason: followup.heldReason,
      photos: followup.photos.map((photo) => ({ url: `/api/photos/${photo.id}`, name: photo.name, size: photo.size })),
    })),
    history: r.history ?? [],
    reporter: {
      /** 같은 기기에서 접수된 신고 수 (이 신고 포함). 기기 정보가 없으면 0 */
      deviceReportCount: sameDevice,
      blocked: Boolean(activeBlock(r.reporterHash ?? null, blocked)),
    },
  };
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

/**
 * 위험도가 알림 기준 이상이면 운영진에게 웹훅으로 알린다.
 * 응답을 기다리지 않는다 — 알림이 늦거나 실패해도 신고 처리에는 영향이 없다.
 */
/** 알림 메시지에 붙일 사이트 주소. HTTPS 가 아니면 붙이지 않는다. */
function publicBaseUrl(): string | null {
  const base = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  return base && /^https:\/\//i.test(base) ? base : null;
}

/**
 * 새 신고 알림. "모든 신고" 알림이 켜져 있으면 공개 보류 신고까지 모두 보내고,
 * 보류 신고에는 보류 사유·전체 내용·첨부 사진을 싣는다. 꺼져 있으면 기존처럼 긴급 신고만 보낸다.
 */
function notifyNewReport(report: StoredReport, photos: IncomingPhoto[] = []) {
  if (!process.env.NOTIFY_WEBHOOK_URL) return;
  if (!loadNotificationSettings().allReports) {
    notifyIfUrgent(report);
    return;
  }
  const held = report.moderationStatus === "held";
  void sendNewReportNotification({
    schoolName: report.schoolName ?? "",
    reportId: report.id,
    title: maskProfanity(report.title ?? "").text || `${report.location} ${report.category}`,
    location: [report.locationType ?? report.location, report.locationDetail, report.buildingName, report.floor, report.department, report.grade ? `${report.grade}학년` : null, report.className, report.roomName].filter(Boolean).join(" · "),
    category: report.category,
    riskLevel: report.riskAnalysis?.risk_level ?? null,
    riskScore: report.riskAnalysis?.risk_score ?? null,
    description: maskProfanity(report.description).text,
    held,
    heldReason: held ? report.moderationReason ?? null : null,
    // 사진은 보류 신고일 때만 파일로 올라가지만, 몇 장인지는 모든 신고 알림에 표시한다.
    attachments: photosAsAttachments(photos),
    link: publicBaseUrl(),
  });
}

function notifyIfUrgent(report: StoredReport) {
  const analysis = report.riskAnalysis;
  if (!analysis || !process.env.NOTIFY_WEBHOOK_URL || !loadNotificationSettings().urgent) return;
  void sendUrgentNotification({
    schoolName: report.schoolName ?? "",
    reportId: report.id,
    title: maskProfanity(report.title ?? "").text || `${report.location} ${report.category}`,
    location: [report.locationType ?? report.location, report.locationDetail, report.buildingName, report.floor, report.roomName].filter(Boolean).join(" · "),
    category: report.category,
    riskLevel: analysis.risk_level,
    riskScore: analysis.risk_score ?? null,
    description: maskProfanity(report.description).text,
    held: report.moderationStatus === "held",
    link: publicBaseUrl(),
  });
}

// ---------------------------------------------------------------------------
// 월간 보고 알림
//
// 매달 초(한국 시간 1일 오전 9시 이후) 지난달 보고를 한 번 보낸다.
// 무료 플랜은 서버가 잠들 수 있으므로 "정해진 시각에 한 번" 이 아니라
// "아직 안 보냈으면 깨어 있을 때 보낸다" 로 동작한다. 보낸 달은 저장소에 기록해 중복을 막는다.
// ---------------------------------------------------------------------------

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 저장소 기록에 실패해도 같은 프로세스에서 같은 달을 반복해 보내지 않도록 기억한다. */
let monthlySentInProcess: string | null = null;
let monthlyInFlight = false;

/** 학교별 월간 요약. 공개 보류·삭제된 신고는 제외한다. 접수나 완료가 있는 학교만 담는다. */
function summarizeMonth(month: string, schoolId?: string): MonthlySchoolSummary[] {
  const reports = loadReports().filter((r) => !schoolId || r.schoolId === schoolId);
  const bySchool = new Map<string, StoredReport[]>();
  for (const report of reports) {
    const key = report.schoolId ?? "";
    bySchool.set(key, [...(bySchool.get(key) ?? []), report]);
  }
  const summaries: MonthlySchoolSummary[] = [];
  for (const [id, list] of bySchool) {
    const inputs = list.map((r) => ({
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      status: r.status,
      category: r.category,
      location: [r.locationType ?? r.location, r.locationDetail].filter(Boolean).join(" · "),
      riskLevel: r.riskAnalysis?.risk_level ?? null,
    }));
    const monthly = buildMonthlyReport(inputs, month);
    if (monthly.received === 0 && monthly.completedInMonth === 0) continue;
    summaries.push({
      schoolName: list[0]?.schoolName || findSchool(id)?.schoolName || id,
      received: monthly.received,
      completedInMonth: monthly.completedInMonth,
      completionRate: monthly.completionRate,
      avgResolutionHours: monthly.avgResolutionHours,
      completedLate: monthly.completedLate,
      overdueOpen: inputs.filter((r) => r.status !== "completed" && computeSla(r).overdue).length,
      topCategory: monthly.byCategory[0]?.[0] ?? null,
      topLocation: monthly.byLocation[0]?.[0] ?? null,
    });
  }
  return summaries.sort((a, b) => b.received - a.received);
}

async function maybeSendMonthlyReport(now = Date.now()) {
  if (!process.env.NOTIFY_WEBHOOK_URL || monthlyInFlight) return;
  const settings = loadNotificationSettings();
  if (!settings.monthly) return;
  const kst = new Date(now + KST_OFFSET_MS);
  const target = shiftMonth(monthKey(new Date(now).toISOString()) as string, -1);
  if (settings.lastMonthlyReport === target || monthlySentInProcess === target) return;
  // 1일 오전 9시 전에는 보내지 않는다. 2일 이후에 깨어났다면 바로 보낸다.
  if (kst.getUTCDate() === 1 && kst.getUTCHours() < 9) return;

  monthlyInFlight = true;
  try {
    const sent = await sendMonthlyNotification(target, summarizeMonth(target), publicBaseUrl());
    if (!sent) return;
    monthlySentInProcess = target;
    await withDocLock("settings", () => saveNotificationSettings({ ...loadNotificationSettings(), lastMonthlyReport: target })).catch((err) => {
      console.error("[notify] 월간 보고 발송 기록 저장 실패 (supabase/schema.sql 갱신 필요할 수 있음):", err instanceof Error ? err.message : err);
    });
    console.log(`[notify] ${target} 월간 보고를 보냈습니다.`);
  } finally {
    monthlyInFlight = false;
  }
}

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
    const updated = await withReportsLock(async () => {
      const all = loadAllReports();
      const idx = all.findIndex((r) => r.id === target.id);
      if (idx === -1) return false;

      if (analysis) {
        all[idx].riskAnalysis = analysis;
        all[idx].riskAnalysisError = null;
      } else {
        all[idx].riskAnalysisError = error;
      }
      await saveReports(all);
      return true;
    });
    if (!updated) continue;
    if (analysis) {
      done += 1;
      notifyIfUrgent({ ...target, riskAnalysis: analysis });
    }

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
  const persistent = useSupabaseStore;
  res.json({
    status: "ok",
    dataStore: persistent ? "supabase" : "local-json",
    persistence: {
      durable: persistent,
      warning: persistent ? null : "영구 저장소가 연결되지 않아 서버 재시작·재배포 시 데이터가 사라질 수 있습니다.",
    },
    storedReportsCount: loadReports().length,
    // 알림이 안 올 때 로그인 없이 원인을 확인할 수 있도록 연결 여부와 마지막 전송 결과만 보여 준다.
    // 웹훅 주소는 비밀값이라 내보내지 않는다.
    notifications: {
      channel: webhookChannel(process.env.NOTIFY_WEBHOOK_URL),
      lastResult: lastNotifyResult(),
    },
    photos: { store: photoBackend.kind, ready: photoBackendReady },
    // 학생 알림(VAPID 키) 설정 여부만 알려 준다. 키 자체는 내보내지 않는다.
    studentPush: { enabled: pushEnabled() },
    // 운영 기록 저장이 막혔는지만 알려 준다 (기록 내용은 관리자 화면에서만).
    auditLog: { saving: auditSaveProblem ? "failing" : "ok", needsSchemaUpdate: Boolean(auditSaveProblem?.needsSchemaUpdate), unsaved: pendingAudit.length },
  });
});

/**
 * 신고 사진. 공개된 신고의 사진은 누구나, 공개 보류 신고의 사진은 운영진만 볼 수 있다.
 * 삭제된 신고의 사진이나 어느 신고에도 속하지 않은 id 는 없는 것으로 답한다.
 */
app.get("/api/photos/:month/:file", async (req, res) => {
  const id = `${req.params.month}/${req.params.file}`;
  if (!PHOTO_ID_PATTERN.test(id)) return safeError(res, 404, "사진을 찾을 수 없습니다.");
  // 사진마다 전체 목록을 복제하지 않도록 저장소 원본을 읽기만 한다.
  const raw = useSupabaseStore ? cachedReports : localReports();
  let report = raw.find((r) => r.photos?.some((photo) => photo.id === id));
  let isPublic = Boolean(report) && report?.moderationStatus !== "held";
  const viewer = sessionOf(req);
  // 공개 보류 신고의 사진은 운영진만 본다.
  let canSeePrivate = Boolean(viewer && viewer.role !== "teacher");
  if (!report) {
    // 학생이 나중에 덧붙인 설명의 사진은 공개하지 않는다. 그 학교를 맡은 운영진·교사만 본다.
    report = raw.find((r) => r.followups?.some((followup) => followup.photos?.some((photo) => photo.id === id)));
    isPublic = false;
    canSeePrivate = Boolean(viewer && report && (viewer.role !== "teacher" || viewer.schoolId === report.schoolId));
  }
  if (!report || report.deletedAt) return safeError(res, 404, "사진을 찾을 수 없습니다.");
  if (!isPublic && !canSeePrivate) return safeError(res, 404, "사진을 찾을 수 없습니다.");

  try {
    let buffer = photoCache.get(id);
    if (!buffer) {
      if (!(await ensurePhotoBackend())) return safeError(res, 503, "사진을 불러오지 못했습니다.");
      buffer = (await photoBackend.get(id)) ?? undefined;
      if (!buffer) return safeError(res, 404, "사진을 찾을 수 없습니다.");
      photoCache.set(id, buffer);
    }
    res.setHeader("Content-Type", photoTypeFromId(id));
    // 신고가 나중에 삭제·보류될 수 있으므로 공용 캐시에는 두지 않고 브라우저에서만 잠깐 둔다.
    res.setHeader("Cache-Control", isPublic ? "private, max-age=3600" : "private, no-store");
    res.setHeader("Content-Disposition", "inline");
    return res.send(buffer);
  } catch (err) {
    return safeError(res, 502, "사진을 불러오지 못했습니다.", err);
  }
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
app.post("/api/school-applications", rateLimit("schoolApplication", { windowMs: 60 * 60 * 1000, max: 5, message: "신청이 너무 많습니다. 잠시 후 다시 시도해주세요." }), async (req, res) => {
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
    await withDocLock("school_applications", () => saveSchoolApplications([application, ...loadSchoolApplications()]));
  } catch {
    return safeError(res, 500, "신청을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
  if (loadNotificationSettings().applications) {
    // 응답을 기다리지 않는다. 알림 실패가 신청 접수를 막지 않는다.
    void sendApplicationNotification({
      schoolName: maskProfanity(schoolName).text,
      address: maskProfanity(address).text,
      website,
      reason: maskProfanity(reason).text,
      hasReplyEmail: Boolean(replyEmail),
      link: publicBaseUrl(),
    });
  }
  return res.status(201).json({ ok: true, data: { id: application.id, createdAt: application.createdAt } });
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

const STATUS_VALUES = ["pending", "reviewing", "assigned", "scheduled", "in_progress", "completed"];

// ---------------------------------------------------------------------------
// 운영진·교사 로그인과 개인 계정 (staffAuth.ts)
// ---------------------------------------------------------------------------

/** 지금 요청의 로그인 세션. 교사 세션도 포함한다. */
function sessionOf(req: express.Request): StaffSession | null {
  return staffSessions.get(readSessionToken(req));
}

/** 운영진(관리자 포함) 세션만. 교사 세션은 null */
function staffSessionOf(req: express.Request): StaffSession | null {
  const session = sessionOf(req);
  return session && session.role !== "teacher" ? session : null;
}

function requireStaff(req: express.Request, res: express.Response): StaffSession | null {
  const session = staffSessionOf(req);
  if (session) return session;
  safeError(res, 401, "운영진 로그인이 필요합니다.");
  return null;
}

function requireAdmin(req: express.Request, res: express.Response): StaffSession | null {
  const session = requireStaff(req, res);
  if (!session) return null;
  if (isAdminRole(session.role)) return session;
  safeError(res, 403, "관리자 계정만 사용할 수 있습니다.");
  return null;
}

function requireReportManager(req: express.Request, res: express.Response, schoolId: string): StaffSession | null {
  const session = sessionOf(req);
  if (session && (session.role !== "teacher" || session.schoolId === schoolId)) return session;
  safeError(res, 401, "해당 학교의 교사 또는 운영진 로그인이 필요합니다.");
  return null;
}

/** 처리 이력에 남길 행위자 */
function historyActor(session: StaffSession): Pick<ReportHistoryEntry, "actor" | "actorName"> {
  return { actor: session.role === "teacher" ? "teacher" : "staff", actorName: session.name };
}

/**
 * 신고를 지우는 일(삭제·장난 신고 처리·검토 대기 신고 삭제·영구 삭제)은 개인 계정으로만 한다.
 * 공용 비밀번호로 지우면 누가 지웠는지 알 수 없기 때문이다.
 */
function requirePersonalAccount(session: StaffSession, res: express.Response): boolean {
  if (session.accountId) return true;
  safeError(res, 403, "신고를 지우는 일은 개인 계정으로 로그인해야 할 수 있습니다. '계정 관리'에서 내 계정을 만들어 로그인해주세요.");
  return false;
}

function deletedByOf(session: StaffSession): StoredReport["deletedBy"] {
  return { name: session.name, role: session.role, accountId: session.accountId };
}

/** 신고에 딸린 사진 전부 (본문 + 학생이 덧붙인 설명) */
function allPhotosOf(report: StoredReport): StoredPhoto[] {
  return [...(report.photos ?? []), ...(report.followups ?? []).flatMap((followup) => followup.photos ?? [])];
}

function sessionPayload(session: StaffSession) {
  return {
    ok: true,
    authenticated: true,
    // 예전 화면과의 호환을 위해 총괄·관리자·운영진은 "staff" 로 내보낸다.
    role: session.role === "teacher" ? "teacher" : "staff",
    isAdmin: isAdminRole(session.role),
    isOwner: session.role === "owner",
    roleLabel: ROLE_LABEL[session.role],
    name: session.name,
    schoolId: session.schoolId,
    hasAccount: Boolean(session.accountId),
  };
}

/** 새 세션을 시작한다. 같은 브라우저의 이전 세션은 끝낸다. */
function startSession(req: express.Request, res: express.Response, data: Omit<StaffSession, "tokenHash" | "createdAt" | "expiresAt">): StaffSession {
  staffSessions.revoke(readSessionToken(req));
  const token = staffSessions.create(data);
  setSessionCookie(res, token);
  return staffSessions.get(token) as StaffSession;
}

/** 로그인 성공 — 세션을 시작하고 운영 기록에 남긴다. */
function loginResponse(req: express.Request, res: express.Response, data: Omit<StaffSession, "tokenHash" | "createdAt" | "expiresAt">) {
  const session = startSession(req, res, data);
  audit(session, "login", session.schoolId ? findSchool(session.schoolId)?.schoolName ?? session.schoolId : null);
  return res.json(sessionPayload(session));
}

/**
 * 개인 계정 로그인 확인. 없는 아이디나 꺼진 계정도 같은 시간만큼 비교해,
 * 응답 시간으로 아이디가 있는지 알 수 없게 한다.
 */
async function verifyAccountLogin(username: string, password: unknown): Promise<StaffAccount | null> {
  const account = loadStaffAccounts().find((item) => item.username === username && !item.disabled);
  if (typeof password !== "string" || !password || password.length > 72) return null;
  const valid = await bcrypt.compare(password, account?.passwordHash ?? DUMMY_PASSWORD_HASH).catch(() => false);
  return valid && account ? account : null;
}

/** 로그인 실패 제한 — 틀린 비밀번호만 센다. 학교 공용 IP 의 정상 로그인은 막지 않는다. */
const loginFailures = failureLimit("staffLogin", LIMITS.staffLogin);

function loginGate(req: express.Request, res: express.Response, next: express.NextFunction) {
  const wait = loginFailures.blockedFor(req);
  if (!wait) return next();
  res.setHeader("Retry-After", String(wait));
  return res.status(429).json({ ok: false, error: loginFailures.message });
}

function loginFailed(req: express.Request, res: express.Response, message: string) {
  loginFailures.fail(req);
  return safeError(res, 401, message);
}

/** 마지막 로그인 시각. 저장에 실패해도 로그인은 막지 않는다. */
function touchLastLogin(accountId: string) {
  void withAccountsLock(async () => {
    const list = loadStaffAccounts();
    const account = list.find((item) => item.id === accountId);
    if (!account) return;
    account.lastLoginAt = new Date().toISOString();
    await saveStaffAccounts(list);
  }).catch((err) => console.error("[staff] 마지막 로그인 시각 저장 실패:", err instanceof Error ? err.message : err));
}

function accountSession(account: StaffAccount): Omit<StaffSession, "tokenHash" | "createdAt" | "expiresAt"> {
  return { role: account.role, accountId: account.id, name: account.displayName, schoolId: account.role === "teacher" ? account.schoolId : null };
}

app.get("/api/staff/session", (req, res) => {
  const session = sessionOf(req);
  if (!session) return res.json({ ok: true, authenticated: false, role: null, schoolId: null });
  return res.json(sessionPayload(session));
});

/**
 * 운영진 로그인.
 *  - 아이디를 비우거나 admin 이면 공용 비밀번호(STAFF_PASSWORD_HASH) — 관리자 권한
 *  - 그 밖의 아이디는 개인 계정. 교사 계정으로 들어오면 소속 학교만 관리한다.
 */
app.post("/api/staff/login", loginGate, async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  if (!username || username === MASTER_USERNAME) {
    if (!isStaffPasswordConfigured()) {
      console.error("[staff] STAFF_PASSWORD_HASH 환경변수가 설정되지 않았습니다.");
      return loadStaffAccounts().length > 0
        ? safeError(res, 401, "아이디와 비밀번호를 입력해주세요.")
        : safeError(res, 503, "운영진 로그인을 사용할 수 없습니다.");
    }
    if (!await verifyStaffPassword(req.body?.password)) {
      return loginFailed(req, res, username ? "아이디 또는 비밀번호가 올바르지 않습니다." : "비밀번호가 올바르지 않습니다.");
    }
    return loginResponse(req, res, { role: "admin", accountId: null, name: "공용 운영진 계정", schoolId: null });
  }
  const account = await verifyAccountLogin(username, req.body?.password);
  if (!account) return loginFailed(req, res, "아이디 또는 비밀번호가 올바르지 않습니다.");
  touchLastLogin(account.id);
  return loginResponse(req, res, accountSession(account));
});

/**
 * 교사 로그인.
 *  - 아이디를 비우면 학교 공용 비밀번호(SCHOOL_TEACHER_PASSWORD_HASHES)
 *  - 아이디가 있으면 개인 계정. 교사 계정은 이 학교 소속이어야 한다.
 */
app.post("/api/staff/teacher-login", loginGate, async (req, res) => {
  const school = findSchool(req.body?.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  const username = normalizeUsername(req.body?.username);
  if (username) {
    const account = await verifyAccountLogin(username, req.body?.password);
    if (!account) return loginFailed(req, res, "아이디 또는 비밀번호가 올바르지 않습니다.");
    if (account.role === "teacher" && account.schoolId !== school.id) return safeError(res, 403, "다른 학교의 교사 계정입니다. 소속 학교를 선택한 뒤 로그인해주세요.");
    touchLastLogin(account.id);
    return loginResponse(req, res, accountSession(account));
  }
  if (!isTeacherPasswordConfigured(school.id)) return safeError(res, 503, "이 학교의 교사 공용 비밀번호가 설정되지 않았습니다. 개인 계정이 있으면 아이디를 입력해주세요.");
  if (!await verifyTeacherPassword(req.body?.password, school.id)) return loginFailed(req, res, "학교 비밀번호가 올바르지 않습니다.");
  return loginResponse(req, res, { role: "teacher", accountId: null, name: `${school.schoolName} 교사(공용)`, schoolId: school.id });
});

app.post("/api/staff/logout", (req, res) => {
  staffSessions.revoke(readSessionToken(req));
  clearSessionCookies(res);
  return res.json({ ok: true });
});

/** 개인 계정 사용자가 자기 비밀번호를 바꾼다. 다른 기기의 세션은 끝낸다. */
app.post("/api/staff/me/password", loginGate, async (req, res) => {
  const session = sessionOf(req);
  if (!session) return safeError(res, 401, "로그인이 필요합니다.");
  if (!session.accountId) return safeError(res, 400, "공용 계정의 비밀번호는 환경변수에서 바꿔야 합니다.");
  const problem = passwordError(req.body?.newPassword);
  if (problem) return safeError(res, 400, problem);
  const current = loadStaffAccounts().find((item) => item.id === session.accountId && !item.disabled);
  if (!current) return safeError(res, 404, "계정을 찾을 수 없습니다.");
  const valid = typeof req.body?.currentPassword === "string" && await bcrypt.compare(req.body.currentPassword, current.passwordHash).catch(() => false);
  if (!valid) return loginFailed(req, res, "현재 비밀번호가 올바르지 않습니다.");
  const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  try {
    await withAccountsLock(async () => {
      const list = loadStaffAccounts();
      const account = list.find((item) => item.id === session.accountId);
      if (!account) throw new Error("account missing");
      account.passwordHash = passwordHash;
      account.updatedAt = new Date().toISOString();
      await saveStaffAccounts(list);
    });
  } catch (err) {
    return safeError(res, 500, STORE_SCHEMA_HINT, err);
  }
  staffSessions.revokeAccount(session.accountId, readSessionToken(req));
  audit(session, "account.password_change", current.username);
  return res.json({ ok: true });
});

/** 관리자가 아닌 상태로 남지 않도록, 켜진 관리자(총괄 포함)가 하나도 없게 되는 변경은 막는다. */
function leavesNoAdmin(list: StaffAccount[]): boolean {
  return !isStaffPasswordConfigured() && !list.some((item) => isAdminRole(item.role) && !item.disabled);
}

/** 화면에서 직접 줄 수 있는 역할. 총괄은 지정·넘기기(/owner)로만 정한다. */
function parseRole(value: unknown): StaffRole | null {
  return value === "admin" || value === "staff" || value === "teacher" ? value : null;
}

function manageDeniedMessage(target: StaffAccount): string {
  return target.role === "owner"
    ? "총괄 계정은 다른 사람이 바꾸거나 끄거나 지울 수 없습니다. 총괄 본인은 '내 비밀번호'에서 비밀번호를 바꿀 수 있습니다."
    : "관리자 계정은 총괄만 바꿀 수 있습니다.";
}

/**
 * 운영 기록 (관리자). 최근 것부터 보여 준다. category 로 거르고, before(시각)로 이전 기록을 이어 받는다.
 */
app.get("/api/staff/audit", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const category = typeof req.query.category === "string" ? req.query.category : "all";
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const before = typeof req.query.before === "string" ? req.query.before : null;
  let list = loadAudit();
  if (["login", "account", "report", "backup", "etc"].includes(category)) list = list.filter((entry) => auditCategory(entry.action) === (category as AuditCategory));
  if (before) list = list.filter((entry) => entry.at < before);
  // 저장이 막혀 있으면 화면에 이유와 고치는 방법을 함께 보여 준다. 저장소 응답 원문은 관리자에게만 간다.
  const saveProblem = auditSaveProblem && {
    unsaved: pendingAudit.length,
    since: auditSaveProblem.since,
    needsSchemaUpdate: auditSaveProblem.needsSchemaUpdate,
    detail: auditSaveProblem.message.slice(0, 300),
    fixSql: auditSaveProblem.needsSchemaUpdate ? STORE_KEY_CONSTRAINT_SQL : null,
  };
  return res.json({ ok: true, data: list.slice(0, limit), hasMore: list.length > limit, saveProblem });
});

/** 계정 목록 (관리자). 교사 계정의 학교를 고를 수 있도록 지원 학교 목록도 함께 준다. */
app.get("/api/staff/accounts", (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const list = loadStaffAccounts();
  return res.json({
    ok: true,
    data: list.map(publicAccount),
    masterConfigured: isStaffPasswordConfigured(),
    ownerExists: hasOwner(list),
    // 화면이 보여 줄 버튼을 고를 수 있도록 지금 로그인한 사람의 역할을 알려 준다. 실제 권한은 서버가 다시 확인한다.
    viewer: { role: session.role, accountId: session.accountId },
    schools: loadSchools().map(({ id, schoolName }) => ({ id, schoolName })),
  });
});

app.post("/api/staff/accounts", async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const body = req.body || {};
  const username = normalizeUsername(body.username);
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const role = parseRole(body.role);
  const problem = usernameError(username) || displayNameError(displayName) || (role ? null : "역할을 선택해주세요.") || passwordError(body.password);
  if (problem) return safeError(res, 400, problem);
  const schoolId = role === "teacher" ? findSchool(body.schoolId)?.id ?? null : null;
  if (role === "teacher" && !schoolId) return safeError(res, 400, "교사 계정은 소속 학교를 선택해주세요.");

  const passwordHash = await bcrypt.hash(body.password, 12);
  const now = new Date().toISOString();
  const account: StaffAccount = { id: newAccountId(), username, displayName, role: role as StaffRole, schoolId, passwordHash, disabled: false, createdAt: now, updatedAt: now, lastLoginAt: null };
  try {
    const created = await withAccountsLock(async () => {
      const list = loadStaffAccounts();
      if (!assignableRoles(session.role, hasOwner(list)).includes(account.role)) return 403;
      if (list.some((item) => item.username === username)) return 409;
      await saveStaffAccounts([...list, account]);
      return "ok";
    });
    if (created === 403) return safeError(res, 403, "관리자 계정은 총괄만 만들 수 있습니다.");
    if (created === 409) return safeError(res, 409, "이미 사용 중인 아이디입니다.");
  } catch (err) {
    return safeError(res, 500, STORE_SCHEMA_HINT, err);
  }
  audit(session, "account.create", account.username, `${account.displayName} · ${ROLE_LABEL[account.role]}${account.schoolId ? ` · ${findSchool(account.schoolId)?.schoolName ?? account.schoolId}` : ""}`);
  return res.status(201).json({ ok: true, data: publicAccount(account) });
});

/** 계정 수정 — 이름·역할·소속 학교·비밀번호 재설정·사용 중지 */
app.patch("/api/staff/accounts/:id", async (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const body = req.body || {};
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : undefined;
  const role = body.role === undefined ? undefined : parseRole(body.role);
  const disabled = typeof body.disabled === "boolean" ? body.disabled : undefined;
  const password = body.password === undefined || body.password === "" ? undefined : body.password;
  const problem = (displayName !== undefined ? displayNameError(displayName) : null)
    || (role === null ? "역할이 올바르지 않습니다." : null)
    || (password !== undefined ? passwordError(password) : null);
  if (problem) return safeError(res, 400, problem);
  if (req.params.id === admin.accountId && (disabled === true || (role && role !== "admin"))) {
    return safeError(res, 400, "지금 로그인한 자기 계정은 끄거나 관리자 권한을 뺄 수 없습니다.");
  }
  const passwordHash = password !== undefined ? await bcrypt.hash(password, 12) : undefined;

  let result: { error: number; message: string } | { account: StaffAccount; endSessions: boolean; changes: Array<[AuditAction, string | null]> };
  try {
    result = await withAccountsLock(async () => {
      const list = loadStaffAccounts();
      const account = list.find((item) => item.id === req.params.id);
      if (!account) return { error: 404, message: "계정을 찾을 수 없습니다." };
      const before = { ...account };
      const ownerExists = hasOwner(list);
      if (!canManageAccount(admin.role, account, ownerExists)) return { error: 403, message: manageDeniedMessage(account) };
      if (role && role !== account.role && !assignableRoles(admin.role, ownerExists).includes(role)) {
        return { error: 403, message: "관리자 역할은 총괄만 줄 수 있습니다." };
      }
      const nextRole = role ?? account.role;
      const nextSchoolId = nextRole === "teacher"
        ? (body.schoolId !== undefined ? findSchool(body.schoolId)?.id ?? null : account.schoolId)
        : null;
      if (nextRole === "teacher" && !nextSchoolId) return { error: 400, message: "교사 계정은 소속 학교를 선택해주세요." };
      const endSessions = passwordHash !== undefined || (disabled === true && !account.disabled) || nextRole !== account.role || nextSchoolId !== account.schoolId;
      if (displayName !== undefined) account.displayName = displayName;
      account.role = nextRole;
      account.schoolId = nextSchoolId;
      if (disabled !== undefined) account.disabled = disabled;
      if (passwordHash !== undefined) account.passwordHash = passwordHash;
      account.updatedAt = new Date().toISOString();
      if (leavesNoAdmin(list)) return { error: 400, message: "켜진 관리자 계정이 하나는 있어야 합니다. 다른 관리자 계정을 먼저 만들어주세요." };
      await saveStaffAccounts(list);
      // 운영 기록에 남길 변경 내용
      const changes: Array<[AuditAction, string | null]> = [];
      if (before.disabled !== account.disabled) changes.push([account.disabled ? "account.disable" : "account.enable", null]);
      if (passwordHash !== undefined) changes.push(["account.password_reset", null]);
      const updates = [
        before.displayName !== account.displayName ? `이름 ${before.displayName} → ${account.displayName}` : null,
        before.role !== account.role ? `역할 ${ROLE_LABEL[before.role]} → ${ROLE_LABEL[account.role]}` : null,
        before.schoolId !== account.schoolId && account.schoolId ? `학교 → ${findSchool(account.schoolId)?.schoolName ?? account.schoolId}` : null,
      ].filter(Boolean).join(", ");
      if (updates) changes.push(["account.update", updates]);
      return { account, endSessions, changes };
    });
  } catch (err) {
    return safeError(res, 500, STORE_SCHEMA_HINT, err);
  }
  if ("error" in result) return safeError(res, result.error, result.message);
  if (result.endSessions) staffSessions.revokeAccount(result.account.id);
  else staffSessions.renameAccount(result.account.id, result.account.displayName, result.account.role, result.account.schoolId);
  for (const [action, detail] of result.changes) audit(admin, action, result.account.username, detail);
  return res.json({ ok: true, data: publicAccount(result.account) });
});

app.delete("/api/staff/accounts/:id", async (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  if (req.params.id === admin.accountId) return safeError(res, 400, "지금 로그인한 자기 계정은 삭제할 수 없습니다.");
  let result: { deleted: StaffAccount } | 404 | 400 | { denied: string };
  try {
    result = await withAccountsLock(async () => {
      const list = loadStaffAccounts();
      const target = list.find((item) => item.id === req.params.id);
      if (!target) return 404;
      if (!canManageAccount(admin.role, target, hasOwner(list))) return { denied: manageDeniedMessage(target) };
      const remaining = list.filter((item) => item.id !== req.params.id);
      if (leavesNoAdmin(remaining)) return 400;
      await saveStaffAccounts(remaining);
      return { deleted: target };
    });
  } catch (err) {
    return safeError(res, 500, STORE_SCHEMA_HINT, err);
  }
  if (result === 404) return safeError(res, 404, "계정을 찾을 수 없습니다.");
  if (result === 400) return safeError(res, 400, "켜진 관리자 계정이 하나는 있어야 합니다. 다른 관리자 계정을 먼저 만들어주세요.");
  if ("denied" in result) return safeError(res, 403, result.denied);
  staffSessions.revokeAccount(req.params.id);
  audit(admin, "account.delete", result.deleted.username, `${result.deleted.displayName} · ${ROLE_LABEL[result.deleted.role]}`);
  return res.json({ ok: true });
});

/**
 * 총괄 지정·넘기기.
 *  - 총괄이 없으면 관리자(공용 비밀번호 포함) 누구나 한 사람을 처음 총괄로 지정할 수 있다.
 *  - 총괄이 있으면 지금 총괄 본인만 다른 사람에게 넘길 수 있고, 넘긴 사람은 관리자가 된다.
 * 총괄은 학교에 묶이지 않는다. 꺼진 계정은 지정할 수 없다.
 */
app.post("/api/staff/accounts/:id/owner", async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  let result: { error: number; message: string } | { owner: StaffAccount; previous: StaffAccount | null };
  try {
    result = await withAccountsLock(async () => {
      const list = loadStaffAccounts();
      const target = list.find((item) => item.id === req.params.id);
      if (!target) return { error: 404, message: "계정을 찾을 수 없습니다." };
      const current = list.find((item) => item.role === "owner") ?? null;
      if (!canAssignOwner(session, current?.id ?? null)) return { error: 403, message: "총괄 자리는 지금 총괄 본인만 넘길 수 있습니다." };
      if (target.role === "owner") return { error: 400, message: "이미 총괄인 계정입니다." };
      if (target.disabled) return { error: 400, message: "사용 중지된 계정은 총괄로 지정할 수 없습니다. 먼저 다시 켜 주세요." };
      const now = new Date().toISOString();
      if (current) {
        current.role = "admin";
        current.updatedAt = now;
      }
      target.role = "owner";
      target.schoolId = null;
      target.updatedAt = now;
      await saveStaffAccounts(list);
      return { owner: target, previous: current };
    });
  } catch (err) {
    return safeError(res, 500, STORE_SCHEMA_HINT, err);
  }
  if ("error" in result) return safeError(res, result.error, result.message);
  // 열려 있는 세션의 역할도 바로 바꾼다. 다시 로그인하지 않아도 새 권한이 적용된다.
  staffSessions.renameAccount(result.owner.id, result.owner.displayName, "owner", null);
  if (result.previous) staffSessions.renameAccount(result.previous.id, result.previous.displayName, "admin", null);
  audit(session, result.previous ? "owner.transfer" : "owner.designate", result.owner.username, result.previous ? `${result.previous.displayName} → ${result.owner.displayName}` : result.owner.displayName);
  return res.json({ ok: true, data: publicAccount(result.owner), previousOwner: result.previous ? publicAccount(result.previous) : null });
});

// ---------------------------------------------------------------------------
// 백업 (backupStore.ts)
//
// 백업 파일에는 저장소 문서를 그대로 담는다. 비밀번호 해시·로그인 세션·학생 알림 구독은 넣지 않는다.
// 신고의 소유 토큰·기기 해시는 원본이 아니라 해시라서 넣는다(되돌렸을 때 "내 신고" 가 그대로 이어지게).
// ---------------------------------------------------------------------------

const BACKUP_BUCKET = process.env.SUPABASE_BACKUP_BUCKET?.trim() || "schoolfix-backups";
const backupStore: BackupStore = useSupabaseStore
  ? supabaseBackupStore(SUPABASE_URL, SUPABASE_API_KEY, !SUPABASE_SECRET_KEY, BACKUP_BUCKET)
  : localBackupStore(path.join(DATA_DIR, "backups"));
let backupStoreReady = false;

async function ensureBackupStore() {
  if (!backupStoreReady) {
    await backupStore.init();
    backupStoreReady = true;
  }
}

/** 지금 저장소 상태를 백업 형태로 뜬다 (사진 제외). */
function buildBackupSnapshot(kind: string) {
  const reports = loadAllReports();
  const applications = loadSchoolApplications();
  return {
    meta: {
      app: "schoolfix",
      format: 1,
      kind,
      exportedAt: new Date().toISOString(),
      dataStore: useSupabaseStore ? "supabase" : "local-json",
      counts: { reports: reports.length, schoolApplications: applications.length },
      includesPhotos: false,
      note: "비밀번호 해시, 로그인 세션, 학생 알림 구독은 포함하지 않습니다.",
    },
    reports,
    schoolApplications: applications,
    customSchools: loadCustomSchools(),
    blockedReporters: loadBlockedReporters(),
    settings: loadNotificationSettings(),
    staffAccounts: loadStaffAccounts().map(publicAccount),
  };
}

/** 백업을 보관소에 저장하고, 종류별로 오래된 것을 정리한다. */
async function createStoredBackup(kind: BackupKind): Promise<BackupInfo> {
  await ensureBackupStore();
  const name = backupName(kind);
  const body = JSON.stringify(buildBackupSnapshot(kind));
  await backupStore.put(name, body);
  try {
    const expired = expiredBackups(await backupStore.list(kind), BACKUP_KEEP[kind]);
    if (expired.length) await backupStore.remove(expired);
  } catch (err) {
    console.error("[backup] 오래된 백업 정리 실패:", err instanceof Error ? err.message : err);
  }
  return { name, size: Buffer.byteLength(body), createdAt: new Date().toISOString() };
}

/** 오늘(한국 날짜) 자동 백업이 없으면 만든다. 서버가 잠들어 있었으면 깨어날 때 만든다. */
let lastAutoBackupDate: string | null = null;
async function maybeAutoBackup() {
  const today = kstDate();
  if (lastAutoBackupDate === today) return;
  await ensureBackupStore();
  const existing = await backupStore.list("auto");
  if (!existing.some((item) => item.name === backupName("auto"))) {
    const info = await createStoredBackup("auto");
    audit(null, "backup.auto", info.name);
    console.log(`[backup] 자동 백업을 만들었습니다: ${info.name}`);
  }
  lastAutoBackupDate = today;
}

/**
 * 삭제한 지 보관 기간이 지난 신고의 사진을 사진 저장소에서 지운다.
 * 글은 '삭제됨' 표시로 남는다(완전 삭제는 관리자가 '영구 삭제' 로 한다).
 */
async function purgeDeletedPhotos() {
  const cutoff = Date.now() - DELETED_PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const due = loadAllReports().filter((report) => report.deletedAt && Date.parse(report.deletedAt) < cutoff && allPhotosOf(report).length > 0);
  if (due.length === 0) return;
  let removed: StoredPhoto[] = [];
  await withReportsLock(async () => {
    removed = [];
    const all = loadAllReports();
    for (const report of all) {
      if (!report.deletedAt || Date.parse(report.deletedAt) >= cutoff) continue;
      const photos = allPhotosOf(report);
      if (photos.length === 0) continue;
      removed.push(...photos);
      report.photos = [];
      for (const followup of report.followups ?? []) followup.photos = [];
    }
    if (removed.length) await saveReports(all);
  });
  await removePhotos(removed);
  console.log(`[photos] 삭제한 지 ${DELETED_PHOTO_RETENTION_DAYS}일이 지난 신고의 사진 ${removed.length}장을 지웠습니다.`);
}

/** 매일 할 일 — 자동 백업과 오래된 삭제 사진 정리. 서버가 깨어 있을 때 30분마다 확인한다. */
async function runMaintenance() {
  await maybeAutoBackup().catch((err) => console.error("[backup] 자동 백업 실패:", err instanceof Error ? err.message : err));
  await purgeDeletedPhotos().catch((err) => console.error("[photos] 삭제 사진 정리 실패:", err instanceof Error ? err.message : err));
}

/** 백업 파일 내용이 맞는 형태인지 확인한다. 틀리면 무엇이 틀렸는지 알려 준다. */
function validateBackup(data: unknown): { ok: true; backup: ReturnType<typeof buildBackupSnapshot> } | { ok: false; error: string } {
  const value = data as Record<string, unknown> | null;
  if (!value || typeof value !== "object") return { ok: false, error: "백업 파일 형식이 아닙니다." };
  const meta = value.meta as { app?: unknown } | undefined;
  if (meta?.app !== "schoolfix") return { ok: false, error: "SchoolFix 백업 파일이 아닙니다." };
  for (const key of ["reports", "schoolApplications", "customSchools", "blockedReporters"]) {
    if (!Array.isArray(value[key])) return { ok: false, error: `백업 파일에 ${key} 목록이 없습니다.` };
  }
  const reports = value.reports as Array<Record<string, unknown>>;
  if (!reports.every((report) => report && typeof report.id === "string" && typeof report.description === "string" && typeof report.createdAt === "string")) {
    return { ok: false, error: "백업 파일의 신고 형식이 올바르지 않습니다." };
  }
  return { ok: true, backup: value as unknown as ReturnType<typeof buildBackupSnapshot> };
}

/** 백업 내용으로 되돌린다. 계정·로그인 세션·학생 알림 구독은 그대로 둔다. */
async function applyBackup(backup: ReturnType<typeof buildBackupSnapshot>) {
  await withReportsLock(() => saveReports(backup.reports as StoredReport[]));
  await withDocLock("school_applications", () => saveSchoolApplications(backup.schoolApplications as SchoolApplication[]));
  await withDocLock("custom_schools", () => saveCustomSchools(backup.customSchools as SchoolCatalogEntry[]));
  await withDocLock("blocked_reporters", () => saveBlockedReporters(backup.blockedReporters as BlockedReporter[]));
  if (backup.settings && typeof backup.settings === "object") {
    const restored = backup.settings as Partial<NotificationSettings>;
    await withDocLock("settings", async () => {
      const current = loadNotificationSettings();
      const next = { ...current };
      for (const key of ["allReports", "urgent", "applications", "monthly"] as const) {
        if (typeof restored[key] === "boolean") next[key] = restored[key] as boolean;
      }
      await saveNotificationSettings(next);
    });
  }
  summaryCache = null;
}

/**
 * 전체 백업 내려받기 (관리자). 지금 상태를 바로 떠서 받는다.
 * photos=1 이면 사진을 data URL 로 함께 담는다. 사진이 많으면 커지므로 한 장씩 흘려 보낸다.
 */
app.get("/api/staff/backup", async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const withPhotos = req.query.photos === "1";
  const snapshot = buildBackupSnapshot("download");
  snapshot.meta.includesPhotos = withPhotos;
  audit(session, "backup.download", withPhotos ? "지금 상태 (사진 포함)" : "지금 상태");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Disposition", `attachment; filename="schoolfix-backup-${snapshot.meta.exportedAt.slice(0, 10)}${withPhotos ? "-photos" : ""}.json"`);
  const json = JSON.stringify(snapshot);
  if (!withPhotos) return res.send(json);

  // 마지막 } 를 떼고 사진 항목을 이어 붙인다.
  res.write(`${json.slice(0, -1)},"photos":{`);
  let first = true;
  let missing = 0;
  for (const photo of snapshot.reports.flatMap(allPhotosOf)) {
    let buffer = photoCache.get(photo.id) ?? null;
    if (!buffer) {
      try {
        buffer = (await ensurePhotoBackend()) ? await photoBackend.get(photo.id) : null;
      } catch (err) {
        console.error("[backup] 사진 읽기 실패:", photo.id, err instanceof Error ? err.message : err);
      }
    }
    if (!buffer) { missing += 1; continue; }
    res.write(`${first ? "" : ","}${JSON.stringify(photo.id)}:${JSON.stringify(`data:${photo.type};base64,${buffer.toString("base64")}`)}`);
    first = false;
  }
  res.end(`},"missingPhotos":${missing}}`);
});

/** 보관 중인 백업 목록 (관리자) */
app.get("/api/staff/backups", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    await ensureBackupStore();
    const [auto, manual, beforeRestore] = await Promise.all(BACKUP_KINDS.map((kind) => backupStore.list(kind)));
    return res.json({ ok: true, store: backupStore.kind, keep: BACKUP_KEEP, data: { auto, manual, beforeRestore } });
  } catch (err) {
    return safeError(res, 502, "백업 목록을 불러오지 못했습니다.", err);
  }
});

/** 지금 백업 만들기 (관리자) */
app.post("/api/staff/backups", async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  try {
    const info = await createStoredBackup("manual");
    audit(session, "backup.create", info.name);
    return res.status(201).json({ ok: true, data: info });
  } catch (err) {
    return safeError(res, 502, "백업을 만들지 못했습니다.", err);
  }
});

/** 보관 중인 백업 파일 내려받기 (관리자) */
app.get("/api/staff/backups/file", async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const name = typeof req.query.name === "string" ? req.query.name : "";
  if (!BACKUP_NAME_PATTERN.test(name)) return safeError(res, 400, "백업 이름이 올바르지 않습니다.");
  try {
    await ensureBackupStore();
    const body = await backupStore.get(name);
    if (body === null) return safeError(res, 404, "백업을 찾을 수 없습니다.");
    audit(session, "backup.download", name);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="schoolfix-${name.replace("/", "-")}"`);
    return res.send(body);
  } catch (err) {
    return safeError(res, 502, "백업을 불러오지 못했습니다.", err);
  }
});

/**
 * 백업으로 되돌리기 (총괄만). 보관 중인 백업 이름(name) 또는 내려받아 둔 백업 파일 내용(data)을 받는다.
 * 되돌리기 직전 상태를 before-restore 백업으로 먼저 남겨, 잘못 되돌렸어도 다시 되돌릴 수 있게 한다.
 * 계정·로그인 세션·학생 알림 구독은 바꾸지 않는다.
 */
app.post("/api/staff/restore", async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  if (session.role !== "owner") return safeError(res, 403, "백업으로 되돌리기는 총괄만 할 수 있습니다.");
  let data: unknown = req.body?.data;
  let source = "올린 파일";
  if (typeof req.body?.name === "string") {
    const name = req.body.name;
    if (!BACKUP_NAME_PATTERN.test(name)) return safeError(res, 400, "백업 이름이 올바르지 않습니다.");
    try {
      await ensureBackupStore();
      const body = await backupStore.get(name);
      if (body === null) return safeError(res, 404, "백업을 찾을 수 없습니다.");
      data = JSON.parse(body);
      source = name;
    } catch (err) {
      return safeError(res, 502, "백업을 불러오지 못했습니다.", err);
    }
  }
  const checked = validateBackup(data);
  if (!checked.ok) return safeError(res, 400, checked.error);
  let safety: BackupInfo;
  try {
    safety = await createStoredBackup("before-restore");
  } catch (err) {
    return safeError(res, 502, "되돌리기 전 상태를 백업하지 못해 중단했습니다. 잠시 후 다시 시도해주세요.", err);
  }
  try {
    await applyBackup(checked.backup);
  } catch (err) {
    return safeError(res, 500, `되돌리는 중 오류가 났습니다. 직전 상태는 ${safety.name} 에 있습니다.`, err);
  }
  audit(session, "backup.restore", source, `신고 ${checked.backup.reports.length}건 · 직전 상태 ${safety.name}`);
  return res.json({ ok: true, restored: { reports: checked.backup.reports.length }, safetyBackup: safety.name });
});

// ---------------------------------------------------------------------------
// 학생 알림 구독 (pushNotify.ts)
// ---------------------------------------------------------------------------

app.get("/api/push/config", (_req, res) => {
  return res.json({ ok: true, enabled: pushEnabled(), publicKey: vapidPublicKey() });
});

/**
 * 이 기기로 "내 신고" 알림을 받는다. 브라우저 구독 정보와 이 기기가 가진 소유 토큰을 함께 받는다.
 * 실제로 있는 신고의 토큰만 묶는다.
 */
app.post("/api/push/subscribe", rateLimit("push", LIMITS.push), async (req, res) => {
  if (!pushEnabled()) return safeError(res, 503, "알림 기능이 설정되지 않았습니다.");
  const subscription = parseSubscription(req.body?.subscription);
  if (!subscription) return safeError(res, 400, "이 브라우저의 알림 구독 정보를 확인할 수 없습니다.");
  const hashes = ownerTokenHashes(req.body?.tokens);
  const known = new Set(loadAllReports().filter((report) => !report.deletedAt).flatMap(reportOwnerHashes));
  const linked = [...hashes].filter((hash) => known.has(hash));
  if (linked.length === 0) return res.json({ ok: true, linked: 0 });
  try {
    await withPushLock(async () => {
      const { list, changed } = upsertPushRecord(loadPushRecords(), subscription, linked);
      if (changed) await savePushRecords(list);
    });
  } catch (err) {
    return safeError(res, 500, STORE_SCHEMA_HINT, err);
  }
  return res.json({ ok: true, linked: linked.length });
});

app.post("/api/push/unsubscribe", rateLimit("push", LIMITS.push), async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== "string" || endpoint.length > 1000) return safeError(res, 400, "요청이 올바르지 않습니다.");
  try {
    await withPushLock(async () => {
      const list = loadPushRecords();
      const remaining = list.filter((record) => record.endpoint !== endpoint);
      if (remaining.length !== list.length) await savePushRecords(remaining);
    });
  } catch (err) {
    return safeError(res, 500, STORE_SCHEMA_HINT, err);
  }
  return res.json({ ok: true });
});

app.get("/api/staff/school-applications", (req, res) => {
  if (!requireStaff(req, res)) return;
  return res.json({ ok: true, data: loadSchoolApplications() });
});

app.patch("/api/staff/school-applications/:id", async (req, res) => {
  if (!requireStaff(req, res)) return;
  const action = req.body?.action;
  if (action !== "mark-reviewed" && action !== "mark-new") return safeError(res, 400, "신청 처리 상태가 올바르지 않습니다.");
  try {
    const found = await withDocLock("school_applications", async () => {
      const applications = loadSchoolApplications();
      const application = applications.find((item) => item.id === req.params.id);
      if (!application) return false;
      application.status = action === "mark-reviewed" ? "reviewed" : "new";
      application.updatedAt = new Date().toISOString();
      await saveSchoolApplications(applications);
      return true;
    });
    return found ? res.json({ ok: true }) : safeError(res, 404, "학교 신청을 찾을 수 없습니다.");
  } catch {
    return safeError(res, 500, "신청 상태를 저장하지 못했습니다.");
  }
});

app.delete("/api/staff/school-applications/:id", async (req, res) => {
  if (!requireStaff(req, res)) return;
  try {
    const found = await withDocLock("school_applications", async () => {
      const applications = loadSchoolApplications();
      const remaining = applications.filter((item) => item.id !== req.params.id);
      if (remaining.length === applications.length) return false;
      await saveSchoolApplications(remaining);
      return true;
    });
    return found ? res.json({ ok: true }) : safeError(res, 404, "학교 신청을 찾을 수 없습니다.");
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

app.patch("/api/staff/reports/:id/moderation", async (req, res) => {
  const session = requireStaff(req, res);
  if (!session) return;
  const school = findSchool(req.query.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  const action = req.body?.action;
  if (action !== "approve" && action !== "reject") return safeError(res, 400, "검토 작업이 올바르지 않습니다.");
  // 공개하지 않고 지우는 것도 삭제다. 누가 지웠는지 남도록 개인 계정으로만 한다.
  if (action === "reject" && !requirePersonalAccount(session, res)) return;
  let found: StoredReport | null;
  try {
    found = await withReportsLock(async () => {
      const all = loadAllReports();
      const report = all.find((item) => item.id === req.params.id && item.schoolId === school.id && !item.deletedAt && item.moderationStatus === "held");
      if (!report) return null;
      const now = new Date().toISOString();
      if (action === "approve") {
        report.moderationStatus = "approved";
        report.moderationReason = null;
      } else {
        // 사진은 다른 삭제와 같이 보관 기간 동안 비공개로 남겼다가 지운다. 삭제된 신고의 사진은 아무도 열 수 없다.
        report.deletedAt = now;
        report.deletedBy = deletedByOf(session);
        report.deleteReason = `검토 후 삭제${report.moderationReason ? ` (${report.moderationReason})` : ""}`;
      }
      report.updatedAt = now;
      addHistory(report, { ...historyActor(session), action: "moderation", from: "held", to: action === "approve" ? "approved" : "deleted" }, now);
      await saveReports(all);
      return report;
    });
  } catch (err) {
    return safeError(res, 500, "신고 검토 상태를 저장하지 못했습니다.", err);
  }
  if (!found) return safeError(res, 404, "검토 대기 신고를 찾을 수 없습니다.");
  summaryCache = null;
  audit(session, action === "approve" ? "report.approve" : "report.reject", req.params.id, school.schoolName);
  if (action === "approve") notifyReporter(found, { published: true });
  return res.json({ ok: true });
});

/** 운영진·교사 화면의 신고 목록. 운영진은 공개 보류 신고까지 함께 받는다. */
app.get("/api/staff/reports", (req, res) => {
  const school = findSchool(req.query.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  const session = requireReportManager(req, res, school.id);
  if (!session) return;
  const isStaff = session.role !== "teacher";
  const all = loadAllReports();
  const blocked = loadBlockedReporters();
  const scoped = all.filter((report) => !report.deletedAt && report.schoolId === school.id && (isStaff || report.moderationStatus !== "held"));
  return res.json({ ok: true, data: scoped.map((report) => toStaffReport(report, all, blocked)) });
});

/**
 * 장난 신고 처리 — 신고를 지우고, 접수한 기기의 이후 신고를 일정 기간 공개 보류로 돌린다.
 * 접수 자체를 막지는 않는다. 진짜 위험 신고일 수 있으므로 운영진이 확인한 뒤 공개한다.
 */
app.post("/api/staff/reports/:id/spam", async (req, res) => {
  const session = requireStaff(req, res);
  if (!session) return;
  if (!requirePersonalAccount(session, res)) return;
  const school = findSchool(req.query.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  let reporterHash: string | null = null;
  try {
    const found = await withReportsLock(async () => {
      const all = loadAllReports();
      const report = all.find((item) => item.id === req.params.id && item.schoolId === school.id && !item.deletedAt);
      if (!report) return false;
      const now = new Date().toISOString();
      // 사진은 바로 지우지 않는다. 되살릴 수 있도록 일정 기간 남겨 두었다가 지운다 (purgeDeletedPhotos).
      report.deletedAt = now;
      report.deletedBy = deletedByOf(session);
      report.deleteReason = "장난 신고로 처리";
      report.updatedAt = now;
      addHistory(report, { ...historyActor(session), action: "spam", to: "deleted" }, now);
      reporterHash = report.reporterHash ?? null;
      await saveReports(all);
      return true;
    });
    if (!found) return safeError(res, 404, "해당 신고를 찾을 수 없습니다.");
  } catch (err) {
    return safeError(res, 500, "장난 신고 처리를 저장하지 못했습니다.", err);
  }
  summaryCache = null;
  audit(session, "report.spam", req.params.id, school.schoolName);

  // 기기 정보가 없는 과거 신고는 지우기만 한다.
  if (!reporterHash) return res.json({ ok: true, blocked: false });
  try {
    const hash: string = reporterHash;
    await withDocLock("blocked_reporters", async () => {
      const list = loadBlockedReporters().filter((entry) => entry.hash !== hash);
      list.push({ hash, until: blockUntil(), reason: "운영진이 장난 신고로 처리", reportId: req.params.id, createdAt: new Date().toISOString() });
      await saveBlockedReporters(list);
    });
    return res.json({ ok: true, blocked: true });
  } catch (err) {
    console.error("[abuse] 차단 목록 저장 실패:", err);
    return res.status(207).json({ ok: true, blocked: false, warning: STORE_SCHEMA_HINT });
  }
});

/**
 * 신고 삭제 — 운영진(개인 계정)만, 사유를 꼭 적는다. 누가 언제 왜 지웠는지 처리 이력과 운영 기록에 남는다.
 * 기록은 지우지 않고 '삭제됨' 표시만 한다. 관리자는 '삭제된 신고' 에서 되살릴 수 있다.
 */
app.delete("/api/staff/reports/:id", async (req, res) => {
  const session = requireStaff(req, res);
  if (!session) return;
  if (!requirePersonalAccount(session, res)) return;
  const school = findSchool(req.query.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 2 || reason.length > 300) return safeError(res, 400, "삭제 사유를 2~300자로 적어주세요.");
  try {
    const found = await withReportsLock(async () => {
      const all = loadAllReports();
      const report = all.find((item) => item.id === req.params.id && item.schoolId === school.id && !item.deletedAt);
      if (!report) return false;
      const now = new Date().toISOString();
      report.deletedAt = now;
      report.deletedBy = deletedByOf(session);
      report.deleteReason = reason;
      report.updatedAt = now;
      addHistory(report, { ...historyActor(session), action: "delete", to: reason }, now);
      await saveReports(all);
      return true;
    });
    if (!found) return safeError(res, 404, "해당 신고를 찾을 수 없습니다.");
  } catch (err) {
    return safeError(res, 500, "신고를 삭제하지 못했습니다.", err);
  }
  summaryCache = null;
  audit(session, "report.delete", req.params.id, `${school.schoolName} · ${reason}`);
  return res.json({ ok: true });
});

/** 삭제된 신고 목록 (관리자). 누가 언제 왜 지웠는지와 사진을 언제까지 되살릴 수 있는지 보여 준다. */
app.get("/api/staff/deleted-reports", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const school = findSchool(req.query.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  const deleted = loadAllReports()
    .filter((report) => report.deletedAt && report.schoolId === school.id)
    .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  return res.json({
    ok: true,
    data: deleted.map((report) => ({
      id: report.id,
      title: maskProfanity(report.title ?? "").text,
      description: maskProfanity(report.description).text,
      location: [report.locationType ?? report.location, report.locationDetail, report.buildingName, report.floor, report.roomName].filter(Boolean).join(" · "),
      category: report.category,
      createdAt: report.createdAt,
      deletedAt: report.deletedAt,
      deletedBy: report.deletedBy ?? null,
      deleteReason: report.deleteReason ?? null,
      photoCount: allPhotosOf(report).length,
      photosKeptUntil: allPhotosOf(report).length > 0
        ? new Date(Date.parse(report.deletedAt as string) + DELETED_PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
        : null,
      history: report.history ?? [],
    })),
  });
});

/** 삭제한 신고 되살리기 (관리자). 사진 보관 기간이 지났으면 글만 돌아온다. */
app.post("/api/staff/reports/:id/restore", async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const school = findSchool(req.query.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  try {
    const found = await withReportsLock(async () => {
      const all = loadAllReports();
      const report = all.find((item) => item.id === req.params.id && item.schoolId === school.id && item.deletedAt);
      if (!report) return false;
      const now = new Date().toISOString();
      addHistory(report, { ...historyActor(session), action: "restore", from: report.deleteReason ?? "삭제됨", to: "되살림" }, now);
      report.deletedAt = null;
      report.deletedBy = null;
      report.deleteReason = null;
      report.updatedAt = now;
      await saveReports(all);
      return true;
    });
    if (!found) return safeError(res, 404, "삭제된 신고를 찾을 수 없습니다.");
  } catch (err) {
    return safeError(res, 500, "신고를 되살리지 못했습니다.", err);
  }
  summaryCache = null;
  audit(session, "report.restore", req.params.id, school.schoolName);
  return res.json({ ok: true });
});

/**
 * 영구 삭제 (관리자, 개인 계정) — 신고를 저장소에서 완전히 지우고 사진도 지운다. 되돌릴 수 없다.
 * 개인정보가 담긴 신고의 완전 삭제 요청을 처리할 때 쓴다. 먼저 삭제(휴지통)된 신고만 지울 수 있다.
 */
app.delete("/api/staff/deleted-reports/:id", async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  if (!requirePersonalAccount(session, res)) return;
  const school = findSchool(req.query.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  let removedPhotos: StoredPhoto[] = [];
  try {
    const found = await withReportsLock(async () => {
      const all = loadAllReports();
      const report = all.find((item) => item.id === req.params.id && item.schoolId === school.id && item.deletedAt);
      if (!report) return false;
      removedPhotos = allPhotosOf(report);
      await saveReports(all.filter((item) => item !== report));
      return true;
    });
    if (!found) return safeError(res, 404, "삭제된 신고를 찾을 수 없습니다.");
  } catch (err) {
    return safeError(res, 500, "신고를 영구 삭제하지 못했습니다.", err);
  }
  await removePhotos(removedPhotos);
  audit(session, "report.purge", req.params.id, school.schoolName);
  return res.json({ ok: true });
});

/** 공개 보류 중인 기기 목록. 기기 해시 원문 대신 앞부분만 보여 준다. */
app.get("/api/staff/blocked-reporters", (req, res) => {
  if (!requireStaff(req, res)) return;
  return res.json({
    ok: true,
    data: loadBlockedReporters().map((entry) => ({
      id: entry.hash.slice(0, 12),
      until: entry.until,
      reason: entry.reason,
      reportId: entry.reportId,
      createdAt: entry.createdAt,
    })),
  });
});

app.delete("/api/staff/blocked-reporters/:id", async (req, res) => {
  const session = requireStaff(req, res);
  if (!session) return;
  const id = String(req.params.id);
  if (!/^[a-f0-9]{12}$/.test(id)) return safeError(res, 400, "요청이 올바르지 않습니다.");
  try {
    const found = await withDocLock("blocked_reporters", async () => {
      const list = loadBlockedReporters();
      const remaining = list.filter((entry) => !entry.hash.startsWith(id));
      if (remaining.length === list.length) return false;
      await saveBlockedReporters(remaining);
      return true;
    });
    if (!found) return safeError(res, 404, "보류 중인 기기를 찾을 수 없습니다.");
  } catch (err) {
    return safeError(res, 500, STORE_SCHEMA_HINT, err);
  }
  audit(session, "device.unblock", `기기 ${id}…`);
  return res.json({ ok: true });
});

// --- 운영진 화면 "알림" 탭 ------------------------------------------------------

/** 알림 연결 상태와 설정. 웹훅 주소 자체는 비밀값이라 내보내지 않는다. */
app.get("/api/staff/notifications", (req, res) => {
  if (!requireStaff(req, res)) return;
  const settings = loadNotificationSettings();
  return res.json({
    ok: true,
    data: {
      channel: webhookChannel(process.env.NOTIFY_WEBHOOK_URL),
      minRisk: ["긴급", "높음", "중간", "낮음"].includes(process.env.NOTIFY_MIN_RISK || "") ? process.env.NOTIFY_MIN_RISK : "긴급",
      linkConfigured: Boolean(publicBaseUrl()),
      allReports: settings.allReports,
      urgent: settings.urgent,
      applications: settings.applications,
      monthly: settings.monthly,
      lastMonthlyReport: settings.lastMonthlyReport,
    },
  });
});

app.patch("/api/staff/notifications", async (req, res) => {
  const session = requireStaff(req, res);
  if (!session) return;
  const body = req.body || {};
  const keys = ["allReports", "urgent", "applications", "monthly"] as const;
  const changes = keys.filter((key) => typeof body[key] === "boolean");
  try {
    await withDocLock("settings", async () => {
      const next = { ...loadNotificationSettings() };
      for (const key of changes) next[key] = body[key];
      await saveNotificationSettings(next);
    });
  } catch (err) {
    return safeError(res, 500, STORE_SCHEMA_HINT, err);
  }
  if (changes.length) audit(session, "settings.notifications", null, changes.map((key) => `${key}=${body[key] ? "켬" : "끔"}`).join(", "));
  return res.json({ ok: true });
});

app.post("/api/staff/notifications/test", rateLimit("notifyTest", { windowMs: 10 * 60 * 1000, max: 5, message: "테스트 알림은 10분에 5번까지 보낼 수 있습니다." }), async (req, res) => {
  if (!requireStaff(req, res)) return;
  if (!webhookChannel(process.env.NOTIFY_WEBHOOK_URL)) return safeError(res, 400, "NOTIFY_WEBHOOK_URL 환경변수가 설정되지 않았습니다.");
  const sent = await sendTestNotification();
  if (sent) return res.json({ ok: true });
  const reason = lastNotifyResult()?.error;
  return safeError(res, 502, `알림을 보내지 못했습니다${reason ? ` (${reason})` : ""}. 웹훅 주소가 올바른지, 디스코드에서 웹훅이 삭제되지 않았는지 확인해주세요.`);
});

/** 선택한 달의 월간 보고를 지금 보낸다. 학교를 지정하면 그 학교만 담는다. */
app.post("/api/staff/notifications/monthly", rateLimit("notifyMonthly", { windowMs: 10 * 60 * 1000, max: 10, message: "잠시 후 다시 시도해주세요." }), async (req, res) => {
  if (!requireStaff(req, res)) return;
  if (!webhookChannel(process.env.NOTIFY_WEBHOOK_URL)) return safeError(res, 400, "NOTIFY_WEBHOOK_URL 환경변수가 설정되지 않았습니다.");
  const month = typeof req.body?.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(req.body.month) ? req.body.month : null;
  if (!month) return safeError(res, 400, "보낼 달을 확인해주세요.");
  const school = req.body?.schoolId ? findSchool(req.body.schoolId) : undefined;
  if (req.body?.schoolId && !school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  const sent = await sendMonthlyNotification(month, summarizeMonth(month, school?.id), publicBaseUrl());
  return sent ? res.json({ ok: true }) : safeError(res, 502, "알림을 보내지 못했습니다. 웹훅 주소를 확인해주세요.");
});

/** 운영진이 화면에서 등록한 학교 목록 */
app.get("/api/staff/schools", (req, res) => {
  if (!requireStaff(req, res)) return;
  return res.json({
    ok: true,
    data: loadCustomSchools().map(({ id, schoolName, officialWebsite, address, highSchoolType, supportStatus, verifiedAt }) => ({ id, schoolName, officialWebsite, address, highSchoolType, supportStatus, verifiedAt })),
  });
});

/**
 * 학교 추가 신청을 승인하고 학교를 등록한다. 재배포 없이 바로 학교 선택 화면에 나타난다.
 * 시설 정보는 공식 확인 전이므로 기본 위치 유형만 "확인 필요" 상태로 둔다.
 */
app.post("/api/staff/schools", async (req, res) => {
  const session = requireStaff(req, res);
  if (!session) return;
  const body = req.body || {};
  const id = typeof body.id === "string" ? body.id.trim().toLowerCase() : "";
  const schoolName = typeof body.schoolName === "string" ? body.schoolName.trim() : "";
  const officialWebsite = typeof body.officialWebsite === "string" ? body.officialWebsite.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const highSchoolType = ["일반고", "특성화고", "특목고"].includes(body.highSchoolType) ? body.highSchoolType as SchoolCatalogEntry["highSchoolType"] : undefined;
  const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";

  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id)) return safeError(res, 400, "학교 ID는 영문 소문자·숫자·하이픈 2~40자로 입력해주세요. (예: gm-h)");
  if (!schoolName || schoolName.length > 100) return safeError(res, 400, "학교 이름을 확인해주세요.");
  if (!address || address.length > 200) return safeError(res, 400, "학교 주소를 확인해주세요.");
  try {
    const url = new URL(officialWebsite);
    if (!["http:", "https:"].includes(url.protocol) || officialWebsite.length > 500) throw new Error("invalid");
  } catch {
    return safeError(res, 400, "학교 공식 홈페이지 주소를 확인해주세요.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const entry: SchoolCatalogEntry = {
    id, schoolName, officialWebsite, address, highSchoolType,
    supportStatus: "active",
    verificationStatus: "needs_review",
    verifiedAt: today,
    sourceUrl: officialWebsite,
    departments: [],
    locationTypes: DEFAULT_LOCATION_TYPES,
    locations: [],
  };
  let conflict: string | null = null;
  try {
    conflict = await withDocLock("custom_schools", async () => {
      // 중복 확인도 잠금 안에서 한다. 두 운영진이 같은 학교를 동시에 등록해도 하나만 들어간다.
      const existing = [...loadSeedSchools(), ...loadCustomSchools()];
      if (existing.some((school) => school.id === id)) return "이미 사용 중인 학교 ID입니다.";
      if (existing.some((school) => school.schoolName === schoolName && school.supportStatus === "active")) return "같은 이름의 학교가 이미 지원 중입니다.";
      await saveCustomSchools([...loadCustomSchools(), entry]);
      return null;
    });
  } catch (err) {
    return safeError(res, 500, STORE_SCHEMA_HINT, err);
  }
  if (conflict) return safeError(res, 409, conflict);
  audit(session, "school.register", id, schoolName);

  if (applicationId) {
    // 학교 등록은 이미 끝났다. 신청함 표시만 실패한 경우 등록을 되돌리지 않는다.
    await withDocLock("school_applications", async () => {
      const applications = loadSchoolApplications();
      const application = applications.find((item) => item.id === applicationId);
      if (!application) return;
      application.status = "reviewed";
      application.registeredSchoolId = id;
      application.updatedAt = new Date().toISOString();
      await saveSchoolApplications(applications);
    }).catch((err) => console.error("[schools] 신청 상태 갱신 실패:", err));
  }
  return res.status(201).json({ ok: true, data: { id, schoolName } });
});

/** 운영진이 등록한 학교의 지원 중지. 기존 신고는 남지만 학교 선택 화면에서 사라진다. */
app.delete("/api/staff/schools/:id", async (req, res) => {
  const session = requireStaff(req, res);
  if (!session) return;
  let stopped: string | null = null;
  try {
    stopped = await withDocLock("custom_schools", async () => {
      const list = loadCustomSchools();
      const target = list.find((school) => school.id === req.params.id);
      if (!target) return null;
      target.supportStatus = "rejected";
      await saveCustomSchools(list);
      return target.schoolName;
    });
  } catch (err) {
    return safeError(res, 500, STORE_SCHEMA_HINT, err);
  }
  if (!stopped) return safeError(res, 404, "운영진이 등록한 학교만 지원을 중지할 수 있습니다.");
  audit(session, "school.stop", req.params.id, stopped);
  return res.json({ ok: true });
});

app.patch("/api/staff/reports/:id", async (req, res) => {
  const school = findSchool(req.query.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  const session = requireReportManager(req, res, school.id);
  if (!session) return;
  const { id } = req.params;
  const body = req.body || {};
  const allowedStatuses = ["pending", "reviewing", "assigned", "scheduled", "in_progress", "completed"];
  if (typeof body.status !== "string" || !allowedStatuses.includes(body.status)) {
    return safeError(res, 400, "처리 상태가 올바르지 않습니다.");
  }
  const assignee = typeof body.assignee === "string" ? body.assignee.trim() : "";
  const resolutionNote = typeof body.resolutionNote === "string" ? body.resolutionNote.trim() : "";
  // 필드를 보내지 않은 예전 화면에서 저장해도 기존 답변이 지워지지 않게 한다.
  const reporterReply = typeof body.reporterReply === "string" ? body.reporterReply.trim() : undefined;
  if (assignee.length > 100 || resolutionNote.length > 1000 || (reporterReply?.length ?? 0) > 1000) {
    return safeError(res, 400, "담당자, 처리 메모 또는 학생 답변이 너무 깁니다.");
  }
  const actor = historyActor(session);
  let outcome: { error: 404 | 409 } | { report: StoredReport; all: StoredReport[]; statusFrom: string; replied: boolean };
  try {
    outcome = await withReportsLock(async () => {
      const all = loadAllReports();
      const report = all.find((item) => item.id === id && item.schoolId === school.id && !item.deletedAt);
      if (!report) return { error: 404 as const };
      if (report.moderationStatus === "held") return { error: 409 as const };

      const now = new Date().toISOString();
      const statusFrom = report.status;
      let replied = false;
      if (report.status !== body.status) addHistory(report, { ...actor, action: "status", from: report.status, to: body.status }, now);
      if ((report.assignee ?? "") !== assignee) addHistory(report, { ...actor, action: "assignee", from: report.assignee ?? null, to: assignee || null }, now);
      if (reporterReply !== undefined && (report.reporterReply ?? "") !== reporterReply) {
        addHistory(report, { ...actor, action: "reply", to: reporterReply ? "작성" : "삭제" }, now);
        report.reporterReply = reporterReply || null;
        report.reporterReplyAt = reporterReply ? now : null;
        replied = Boolean(reporterReply);
      }
      report.status = body.status;
      report.assignee = assignee || null;
      report.resolutionNote = resolutionNote || null;
      report.updatedAt = now;
      if (body.status === "reviewing" && !report.reviewedAt) report.reviewedAt = now;
      if (body.status === "assigned" && !report.assignedAt) report.assignedAt = now;
      if (body.status === "scheduled" && !report.scheduledAt) report.scheduledAt = now;
      if (body.status === "in_progress" && !report.inProgressAt) report.inProgressAt = now;
      if (body.status === "completed" && !report.completedAt) report.completedAt = now;
      // 완료를 되돌리면 완료 시각도 지운다. 남겨 두면 다시 완료할 때 옛 시각이 유지되어
      // 처리 시간·월별 완료 수·만족도 재응답 판단이 틀어진다.
      if (body.status !== "completed") report.completedAt = null;
      await saveReports(all);
      return { report, all, statusFrom, replied };
    });
  } catch (err) {
    return safeError(res, 500, "신고 처리 상태를 저장하지 못했습니다.", err);
  }
  if ("error" in outcome) {
    return outcome.error === 404
      ? safeError(res, 404, "해당 신고를 찾을 수 없습니다.")
      : safeError(res, 409, "먼저 안전성 검토에서 신고를 승인해주세요.");
  }
  summaryCache = null;
  notifyReporter(outcome.report, { status: { from: outcome.statusFrom, to: outcome.report.status }, reply: outcome.replied });
  return res.json({ ok: true, data: toStaffReport(outcome.report, outcome.all, loadBlockedReporters()) });
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
  const hashes = ownerTokenHashes(req.body?.tokens);
  if (hashes.size === 0) {
    return res.json({ ok: true, data: [] });
  }

  const mine = loadAllReports().filter((r) => !r.deletedAt && r.schoolId === school.id && ownsReport(r, hashes));
  return res.json({ ok: true, data: mine.map(toMyReport) });
});

/**
 * 다른 기기에서 내 신고 불러오기 — 접수번호와 확인 코드가 맞으면 이 기기용 소유 토큰을 새로 발급한다.
 * 맞지 않으면 어느 쪽이 틀렸는지 알려 주지 않는다.
 */
app.post("/api/reports/recover", rateLimit("recover", LIMITS.recover), async (req, res) => {
  const school = findSchool(req.body?.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  const reportId = typeof req.body?.reportId === "string" ? req.body.reportId.trim().toUpperCase() : "";
  const code = normalizeRecoveryCode(req.body?.code);
  if (!/^REP-\d{8}-\d{4,}$/.test(reportId) || !code) return safeError(res, 400, "접수번호와 확인 코드를 정확히 입력해주세요.");
  const codeHash = hashRecoveryCode(code);
  const { token, hash } = issueOwnerToken();

  let restored: StoredReport | null;
  try {
    restored = await withReportsLock(async () => {
      const all = loadAllReports();
      const report = all.find((r) => r.id === reportId && r.schoolId === school.id && !r.deletedAt);
      if (!report || !safeHashEqual(report.recoveryCodeHash, codeHash)) return null;
      report.extraOwnerTokenHashes = [...(report.extraOwnerTokenHashes ?? []), hash].slice(-MAX_EXTRA_OWNERS);
      // updatedAt 은 바꾸지 않는다. 기기 연결은 신고 내용의 변경이 아니다.
      await saveReports(all);
      return report;
    });
  } catch (err) {
    return safeError(res, 500, "신고를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.", err);
  }
  if (!restored) return safeError(res, 404, "접수번호나 확인 코드가 맞지 않습니다.");
  return res.json({ ok: true, ownerToken: token, data: toMyReport(restored) });
});

/** 기기마다 한 번만 셀 수 있도록 해시 목록으로 저장한다. 목록이 끝없이 커지지 않게 상한을 둔다. */
const MAX_ME_TOO = 2000;

/**
 * "나도 겪었어요" — 같은 문제를 겪은 학생이 새 신고 대신 기존 신고에 공감한다.
 * 로그인이 없으므로 브라우저의 기기 토큰으로 중복을 막는다.
 */
app.post("/api/reports/:id/me-too", rateLimit("meToo", LIMITS.meToo), async (req, res) => {
  const school = findSchool(req.body?.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  const hash = deviceHash(req.body?.deviceToken, "metoo");
  if (!hash) return safeError(res, 400, "요청이 올바르지 않습니다.");
  const add = req.body?.action !== "remove";

  try {
    const count = await withReportsLock(async () => {
      const all = loadAllReports();
      const report = all.find((r) => r.id === req.params.id && r.schoolId === school.id && !r.deletedAt && r.moderationStatus !== "held");
      if (!report) return null;
      const set = new Set(report.meTooHashes ?? []);
      const before = set.size;
      if (add && set.size < MAX_ME_TOO) set.add(hash);
      if (!add) set.delete(hash);
      if (set.size !== before) {
        report.meTooHashes = [...set];
        // updatedAt 은 바꾸지 않는다. 공감 수는 처리 상태 변경이 아니므로 AI 요약 캐시 등에 영향을 주지 않는다.
        await saveReports(all);
      }
      return set.size;
    });
    if (count === null) return safeError(res, 404, "해당 신고를 찾을 수 없습니다.");
    return res.json({ ok: true, meTooCount: count, joined: add });
  } catch (err) {
    return safeError(res, 500, "공감을 저장하지 못했습니다.", err);
  }
});

/**
 * 처리 완료 후 만족도 확인 — 신고한 학생만 응답할 수 있다(소유 토큰으로 확인).
 * "아직 해결되지 않았어요" 를 고르면 신고를 다시 "확인 중" 으로 돌린다.
 */
app.post("/api/reports/:id/feedback", rateLimit("feedback", LIMITS.feedback), async (req, res) => {
  const school = findSchool(req.body?.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  if (typeof req.body?.resolved !== "boolean") return safeError(res, 400, "해결 여부를 선택해주세요.");
  const resolved: boolean = req.body.resolved;
  const comment = typeof req.body?.comment === "string" ? maskProfanity(req.body.comment.trim()).text : "";
  if (comment.length > 500) return safeError(res, 400, "의견은 500자를 넘을 수 없습니다.");
  const hashes = ownerTokenHashes(req.body?.tokens);

  let result: "ok" | 404 | 403 | 409;
  let saved: StoredReport | null = null;
  try {
    result = await withReportsLock(async () => {
      const all = loadAllReports();
      const report = all.find((r) => r.id === req.params.id && r.schoolId === school.id && !r.deletedAt);
      if (!report) return 404;
      if (!ownsReport(report, hashes)) return 403;
      if (report.status !== "completed") return 409;
      // 이번 완료에 이미 응답했으면 다시 받지 않는다. "아직 그대로예요" 뒤 다시 완료되면 새로 응답할 수 있다.
      if (!feedbackPending(report)) return 409;

      const now = new Date().toISOString();
      report.feedback = { resolved, comment: comment || null, at: now };
      addHistory(report, { actor: "reporter", action: "feedback", to: resolved ? "해결됨" : "미해결" }, now);
      if (!resolved) {
        addHistory(report, { actor: "reporter", action: "status", from: "completed", to: "reviewing" }, now);
        report.status = "reviewing";
        // 다시 완료될 때 새 완료 시각이 기록되도록 비운다.
        report.completedAt = null;
      }
      report.updatedAt = now;
      await saveReports(all);
      saved = report;
      return "ok";
    });
  } catch (err) {
    return safeError(res, 500, "응답을 저장하지 못했습니다.", err);
  }
  if (result === 404) return safeError(res, 404, "해당 신고를 찾을 수 없습니다.");
  if (result === 403) return safeError(res, 403, "이 브라우저에서 접수한 신고만 응답할 수 있습니다.");
  if (result === 409) return safeError(res, 409, "처리 완료된 신고에 한 번만 응답할 수 있습니다.");
  summaryCache = null;
  return res.json({ ok: true, data: toMyReport(saved as unknown as StoredReport) });
});

/**
 * 추가 설명 — 신고한 학생이 접수 뒤에 설명이나 사진을 덧붙인다(소유 토큰으로 확인).
 * 학교 답변에 이어 "아직 그대로예요, 이 사진을 보세요" 처럼 대화를 이어 갈 수 있다.
 * 공개 목록에는 나오지 않고 신고한 학생과 운영진·교사만 본다. 글과 사진은 신고와 같은 안전성 검사를 거친다.
 */
app.post("/api/reports/:id/followups", rateLimit("followup", LIMITS.followup), async (req, res) => {
  const school = findSchool(req.body?.schoolId);
  if (!school) return safeError(res, 400, "지원 중인 학교를 선택해주세요.");
  const hashes = ownerTokenHashes(req.body?.tokens);
  const rawText = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (rawText.length < 2 || rawText.length > 1000) return safeError(res, 400, "추가 설명은 2~1000자로 적어주세요.");
  const parsedPhotos = parseIncomingPhotos({ photos: Array.isArray(req.body?.photos) ? req.body.photos : [] });
  if (!parsedPhotos.ok) return safeError(res, 400, parsedPhotos.error);
  if (parsedPhotos.photos.length > MAX_FOLLOWUP_PHOTOS) return safeError(res, 400, `추가 설명에는 사진을 ${MAX_FOLLOWUP_PHOTOS}장까지 붙일 수 있습니다.`);

  // 먼저 주인인지 확인한다. 아니면 사진을 올리거나 검사하지 않는다.
  const target = loadAllReports().find((r) => r.id === req.params.id && r.schoolId === school.id && !r.deletedAt);
  if (!target) return safeError(res, 404, "해당 신고를 찾을 수 없습니다.");
  if (!ownsReport(target, hashes)) return safeError(res, 403, "이 기기에서 접수했거나 불러온 신고에만 설명을 덧붙일 수 있습니다.");
  if ((target.followups ?? []).length >= MAX_FOLLOWUPS) return safeError(res, 409, `추가 설명은 신고 하나에 ${MAX_FOLLOWUPS}번까지 남길 수 있습니다.`);

  const text = maskProfanity(rawText).text;
  const moderation = await moderateReport("", text, photosAsAttachments(parsedPhotos.photos).map((photo) => photo.dataUrl));
  let storedPhotos: StoredPhoto[];
  try {
    storedPhotos = await uploadPhotos(parsedPhotos.photos);
  } catch (err) {
    return safeError(res, 503, "사진을 저장하지 못했습니다. 잠시 후 다시 시도하거나 사진을 빼고 보내주세요.", err);
  }
  const followup: ReportFollowup = {
    id: `F${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`,
    at: new Date().toISOString(),
    text,
    photos: storedPhotos,
    held: moderation.hold,
    heldReason: moderation.reason,
  };

  let saved: StoredReport | 403 | 404 | 409;
  try {
    saved = await withReportsLock(async () => {
      const all = loadAllReports();
      const report = all.find((r) => r.id === req.params.id && r.schoolId === school.id && !r.deletedAt);
      if (!report) return 404;
      if (!ownsReport(report, hashes)) return 403;
      if ((report.followups ?? []).length >= MAX_FOLLOWUPS) return 409;
      report.followups = [...(report.followups ?? []), followup];
      addHistory(report, { actor: "reporter", action: "followup", to: storedPhotos.length ? `추가 설명 (사진 ${storedPhotos.length}장)` : "추가 설명" }, followup.at);
      // updatedAt 은 바꾸지 않는다. 공개 내용이 바뀐 것이 아니다.
      await saveReports(all);
      return report;
    });
  } catch (err) {
    await removePhotos(storedPhotos);
    return safeError(res, 500, "추가 설명을 저장하지 못했습니다.", err);
  }
  if (typeof saved === "number") {
    await removePhotos(storedPhotos);
    return saved === 409 ? safeError(res, 409, `추가 설명은 신고 하나에 ${MAX_FOLLOWUPS}번까지 남길 수 있습니다.`) : safeError(res, saved, "해당 신고를 찾을 수 없습니다.");
  }

  // 운영진에게 알린다 ("모든 신고" 알림이 켜져 있을 때). 내용은 앞부분만, 사진은 장수만 보낸다.
  if (process.env.NOTIFY_WEBHOOK_URL && loadNotificationSettings().allReports) {
    const link = publicBaseUrl();
    void sendText([
      `📝 신고 추가 설명 — ${school.schoolName} ${saved.id}${followup.held ? " (안전성 확인 필요)" : ""}`,
      text.slice(0, 300),
      storedPhotos.length ? `사진 ${storedPhotos.length}장` : null,
      link ? `${link} → 운영진 화면에서 확인` : null,
    ].filter(Boolean).join("\n"), process.env, "추가 설명");
  }
  return res.status(201).json({ ok: true, data: toMyReport(saved) });
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
  // 사진은 형식·장수·크기를 확인하고 실제 이미지인지(파일 앞부분)까지 본다.
  const parsedPhotos = parseIncomingPhotos(req.body);
  if (!parsedPhotos.ok) return safeError(res, 400, parsedPhotos.error);
  const incomingPhotos = parsedPhotos.photos;
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
    // 반복 신고 집계용 스냅샷. 저장은 아래에서 잠금을 잡고 최신 목록을 다시 읽어 수행한다.
    const reports = loadAllReports();
    const now = new Date();

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

    const photoAttachments = photosAsAttachments(incomingPhotos);
    const moderation = await moderateReport(title, description, photoAttachments.map((photo) => photo.dataUrl));

    // 사진은 신고 목록과 따로 저장한다. 실패하면 사진 없이 접수하지 않고 다시 시도하도록 알린다.
    let storedPhotos: StoredPhoto[];
    try {
      storedPhotos = await uploadPhotos(incomingPhotos);
    } catch (err) {
      return safeError(res, 503, "사진을 저장하지 못했습니다. 잠시 후 다시 시도하거나 사진을 빼고 접수해주세요.", err);
    }

    // 4) 익명 소유 토큰 — 원본은 응답으로 1회만 전달하고 DB 에는 해시만 남긴다
    const { token: ownerToken, hash: ownerTokenHash } = issueOwnerToken();
    // 다른 기기에서 다시 불러올 때 쓰는 확인 코드. 이것도 응답으로 한 번만 보여 주고 해시만 남긴다.
    const { code: recoveryCode, hash: recoveryCodeHash } = issueRecoveryCode();
    // 반복 신고 판단용 기기 해시. 토큰이 없거나 형식이 틀리면 판단 없이 접수한다.
    const reporterHash = deviceHash(req.body.deviceToken, "reporter");

    const newReport: StoredReport = {
      id: "",
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
      attachmentUrl: null,
      attachmentName: null,
      attachmentSize: null,
      photos: storedPhotos,
      status: "pending",
      moderationStatus: moderation.hold ? "held" : "approved",
      moderationReason: moderation.reason,
      riskAnalysis: analysis,
      riskAnalysisError: riskError,
      ownerTokenHash,
      recoveryCodeHash,
      reporterHash,
      deletedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    // 위험도 분석·검사를 기다리는 동안 다른 신고가 저장됐을 수 있다.
    // 접수번호는 저장 직전의 최신 목록에서 매겨야 중복되지 않는다.
    await withReportsLock(async () => {
      const latest = loadAllReports();
      // 반복 신고 판단도 최신 목록으로 한다. 동시에 몰아 보낸 신고도 정확히 센다.
      const reporter = evaluateReporter(
        reporterHash,
        reporterHash ? latest.filter((r) => r.reporterHash === reporterHash).map((r) => r.createdAt) : [],
        loadBlockedReporters(),
        now.getTime()
      );
      if (reporter.hold && newReport.moderationStatus !== "held") {
        newReport.moderationStatus = "held";
        newReport.moderationReason = reporter.reason;
      }
      // 접수번호의 날짜는 한국 시간 기준이다. UTC로 매기면 오전 9시 전 신고에 전날 날짜가 붙는다.
      const prefix = `REP-${new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, "")}-`;
      // 당일 발급된 최대 일련번호 + 1 (삭제가 있어도 중복되지 않는다)
      const lastSerial = latest.reduce((max, r) => {
        if (!r.id.startsWith(prefix)) return max;
        const n = Number.parseInt(r.id.slice(prefix.length), 10);
        return Number.isFinite(n) && n > max ? n : max;
      }, 0);
      newReport.id = `${prefix}${String(lastSerial + 1).padStart(4, "0")}`;
      latest.unshift(newReport);
      await saveReports(latest);
    }).catch(async (err) => {
      // 신고가 저장되지 않았으면 올려 둔 사진도 남기지 않는다.
      await removePhotos(storedPhotos);
      throw err;
    });

    // 접수가 끝났으면 대화 상태를 더 들고 있을 이유가 없다.
    if (clarity.session) dropClarifySession(clarity.session.id);

    notifyNewReport(newReport, incomingPhotos);

    return res.status(201).json({
      ok: true,
      data: toMyReport(newReport),
      // 브라우저가 저장해야 "내 신고" 에서 다시 찾을 수 있다.
      ownerToken,
      // 기기를 바꿔도 접수번호와 이 코드로 다시 불러올 수 있다. 다시 보여 줄 수 없으므로 화면에서 꼭 안내한다.
      recoveryCode,
      // 부적절한 표현이 가려졌다면 사용자에게 알린다.
      masked: maskedCount > 0,
      maskedCount,
      heldForReview: newReport.moderationStatus === "held",
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

// 정의되지 않은 API 경로는 여기서 끝낸다.
// 이 핸들러가 없으면 프로덕션의 SPA fallback(app.get("*"))이 /api/* 요청까지 받아
// 존재하지 않는 엔드포인트가 200과 함께 index.html 을 돌려준다.
// 제거된 구 인증 API가 살아 있는 것처럼 보이고, 클라이언트는 JSON 대신 HTML 을 받게 된다.
app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, error: "요청한 API를 찾을 수 없습니다." });
});

// ---------------------------------------------------------------------------

/**
 * 총괄 비상 복구 — 총괄이 비밀번호를 잊었거나 연락이 닿지 않을 때, Render 환경변수로 한 번만 적용한다.
 *  - OWNER_RESET_PASSWORD_HASH: 새 비밀번호의 bcrypt 해시 (필수)
 *  - OWNER_RESET_USERNAME: 이 계정을 새 총괄로 만든다 (선택. 비우면 지금 총괄의 비밀번호만 바꾼다)
 * 같은 값으로는 한 번만 적용한다(설정 문서에 지문을 남긴다). 적용 뒤에는 환경변수를 지운다.
 * Render 환경변수를 바꿀 수 있는 사람만 쓸 수 있으므로, 서버를 운영하는 사람의 마지막 수단이다.
 */
async function applyOwnerReset() {
  const hash = process.env.OWNER_RESET_PASSWORD_HASH?.trim();
  if (!hash) return;
  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) {
    console.error("[owner-reset] OWNER_RESET_PASSWORD_HASH 는 bcrypt 해시여야 합니다. 적용하지 않았습니다.");
    return;
  }
  const username = normalizeUsername(process.env.OWNER_RESET_USERNAME);
  const fingerprint = crypto.createHash("sha256").update(`${username}:${hash}`).digest("hex");
  if (loadNotificationSettings().ownerResetApplied === fingerprint) return;

  const result = await withAccountsLock(async () => {
    const list = loadStaffAccounts();
    const current = list.find((item) => item.role === "owner") ?? null;
    const target = username ? list.find((item) => item.username === username) ?? null : current;
    if (!target) return null;
    const now = new Date().toISOString();
    const previous = current && current.id !== target.id ? current : null;
    if (previous) {
      previous.role = "admin";
      previous.updatedAt = now;
    }
    target.role = "owner";
    target.schoolId = null;
    target.disabled = false;
    target.passwordHash = hash;
    target.updatedAt = now;
    await saveStaffAccounts(list);
    return { target, previous };
  });
  if (!result) {
    console.error(`[owner-reset] ${username ? `아이디 ${username} 계정을` : "총괄 계정을"} 찾지 못해 적용하지 않았습니다.`);
    return;
  }
  staffSessions.revokeAccount(result.target.id);
  if (result.previous) staffSessions.renameAccount(result.previous.id, result.previous.displayName, "admin", null);
  await withDocLock("settings", () => saveNotificationSettings({ ...loadNotificationSettings(), ownerResetApplied: fingerprint }));
  audit(null, "owner.reset", result.target.username, result.previous ? `${result.previous.username} → ${result.target.username}` : "비밀번호 재설정");
  console.warn(`[owner-reset] 총괄 비상 복구를 적용했습니다 (${result.target.username}). 로그인해서 비밀번호를 바꾸고 OWNER_RESET_* 환경변수를 지워 주세요.`);
}

/** 낮 시간에 10분마다 자기 주소를 불러 무료 플랜 서버가 잠들지 않게 한다 (keepAwake.ts). */
function startKeepAwake() {
  const window = parseKeepAwakeHours(process.env.KEEP_AWAKE_HOURS);
  const url = keepAwakeUrl();
  if (!window || !url || process.env.NODE_ENV !== "production") return;
  console.log(`[keep-awake] 한국 시간 ${window.start}시~${window.end}시에는 10분마다 깨어 있게 합니다.`);
  setInterval(() => {
    if (!withinKeepAwake(window)) return;
    fetch(url, { signal: AbortSignal.timeout(10000) }).catch(() => undefined);
  }, 10 * 60 * 1000).unref?.();
}

async function startServer() {
  await initializeDataStore();
  await applyOwnerReset().catch((err) => console.error("[owner-reset] 적용 실패:", err instanceof Error ? err.message : err));
  // 사진 버킷 준비는 기동을 막지 않는다. 실패하면 첫 사진 업로드 때 다시 시도한다.
  void ensurePhotoBackend();
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
    // 재배포로 사라진 예전 화면 파일(assets/…)은 index.html 대신 404 로 답한다.
    // 열어 둔 탭은 이 실패를 보고 한 번 새로고침해 새 버전을 받는다 (src/utils/lazyScreen.ts).
    app.use("/assets", (_req, res) => {
      res.status(404).end();
    });
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

    // 월간 보고: 깨어날 때 한 번, 이후 30분마다 아직 안 보냈는지 확인한다.
    const checkMonthly = () => maybeSendMonthlyReport().catch((err) => {
      console.error("[notify] 월간 보고 확인 실패:", err instanceof Error ? err.message : err);
    });
    setTimeout(checkMonthly, 15_000).unref?.();
    setInterval(checkMonthly, 30 * 60 * 1000).unref?.();

    // 자동 백업·오래된 삭제 사진 정리: 깨어날 때 한 번, 이후 30분마다 확인한다.
    setTimeout(() => void runMaintenance(), envNumber("MAINTENANCE_START_DELAY_MS", 30_000, 100)).unref?.();
    setInterval(() => void runMaintenance(), 30 * 60 * 1000).unref?.();

    // 저장하지 못한 운영 기록을 5분마다 다시 저장해 본다 (SQL 을 고친 뒤 새 기록을 기다리지 않아도 되게).
    setInterval(() => { if (pendingAudit.length) void flushAudit(); }, envNumber("AUDIT_RETRY_INTERVAL_MS", 5 * 60 * 1000, 200)).unref?.();

    // 다른 서버(배포 중 옛 서버)가 바꾼 문서를 30초마다 확인해 가져온다.
    if (useSupabaseStore) {
      setInterval(() => {
        syncFromStore().catch((err) => console.error("[store] 다른 서버 변경 확인 실패:", err instanceof Error ? err.message : err));
      }, envNumber("STORE_SYNC_INTERVAL_MS", 30_000, 200)).unref?.();
    }

    startKeepAwake();
  });
}

startServer();
