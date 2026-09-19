import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import {
  analyzeReportRisk,
  type RiskAnalysis,
  type RiskAnalysisInput,
  type RiskLevel,
} from "./riskAnalysis";

// 인자 없는 dotenv.config()는 .env만 읽기 때문에 README가 안내하는 .env.local이 무시된다.
// .env.local을 우선 적용하고 .env를 보조로 읽는다(앞선 파일의 값이 우선).
dotenv.config({ path: [".env.local", ".env"] });

const app = express();
// 호스팅 플랫폼(Render/Railway 등)은 PORT를 주입한다. 로컬에서는 3000.
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "15mb" }));

// Persistent JSON file storage
// 배포 시에는 영구 디스크 마운트 경로를 DATA_DIR로 지정한다(예: /var/data).
// 지정하지 않으면 프로젝트 폴더의 data/를 쓰며, 영구 디스크가 없는 환경에서는
// 재배포·재시작마다 초기화된다.
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "reports_db.json");
const USERS_FILE = path.join(DATA_DIR, "users_db.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions_db.json");

const ADMIN_EMAIL = "eunyool100208@gmail.com";
const DEFAULT_ADMIN_EMAILS = [
  "eunyool100208@gmail.com",
  "studioteamdeer@gmail.com",
];

let dynamicGoogleClientId = process.env.GOOGLE_CLIENT_ID || "";

export interface StoredUser {
  id: string; // SchoolFix 내부 user_id (예: usr_...)
  google_sub: string; // Google 계정 고유 식별자 (sub)
  email: string;
  name: string;
  profile_image?: string;
  role: "USER" | "ADMIN";
  created_at: string;
  last_login_at: string;
}

export interface StoredSession {
  token: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

interface StoredReport {
  id: string;
  user_id?: string | null;
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
  status: "pending" | "reviewing" | "in_progress" | "completed";
  priority?: "urgent" | "medium" | "low";
  /**
   * 중앙화된 위험도 분석 결과 (riskAnalysis.ts).
   * 관리자 전용 정보이므로 학생/공개 응답에서는 제거한다(§25).
   * 분석에 실패했거나 API 키가 없으면 null 이며, 신고 저장 자체는 영향받지 않는다.
   */
  riskAnalysis?: RiskAnalysis | null;
  /** 분석이 실패한 경우 관리자에게 보여줄 사유 */
  riskAnalysisError?: string | null;
  adminNote?: string;
  assignee?: string | null;
  resolutionNote?: string | null;
  reviewedAt?: string | null;
  inProgressAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 영구 디스크가 없는 환경(Render 무료 플랜 등)에서는 슬립·재배포마다 DB가 비워진다.
// 시연용 예시 신고(data.seed.json)가 있으면 DB가 없을 때만 1회 주입해,
// 깨어난 직후에도 화면이 비어 보이지 않게 한다.
// 이미 DB 파일이 있으면 절대 건드리지 않으므로 실제 접수 데이터를 덮어쓰지 않는다.
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

function isEmailAdmin(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (DEFAULT_ADMIN_EMAILS.some((a) => a.toLowerCase() === normalized)) return true;
  const adminList = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminList.includes(normalized);
}

function loadUsers(): StoredUser[] {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const content = fs.readFileSync(USERS_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error("Error reading users_db.json:", err);
  }
  return [];
}

function saveUsers(users: StoredUser[]) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving users_db.json:", err);
  }
}

function loadSessions(): StoredSession[] {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const content = fs.readFileSync(SESSIONS_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error("Error reading sessions_db.json:", err);
  }
  return [];
}

function saveSessions(sessions: StoredSession[]) {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving sessions_db.json:", err);
  }
}

function getUserFromRequest(req: express.Request): StoredUser | null {
  const authHeader = req.headers["authorization"];
  let token = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (req.headers["x-session-token"]) {
    token = String(req.headers["x-session-token"]).trim();
  }

  if (!token) return null;

  const sessions = loadSessions();
  const session = sessions.find((s) => s.token === token);
  if (!session) return null;

  // Check expiration
  if (new Date(session.expires_at).getTime() < Date.now()) {
    // Delete expired session
    const active = sessions.filter((s) => s.token !== token);
    saveSessions(active);
    return null;
  }

  const users = loadUsers();
  const user = users.find((u) => u.id === session.user_id);
  return user || null;
}

// 관리자 여부는 오직 서버가 발급한 세션 토큰으로만 판정한다.
// 클라이언트가 보낸 이메일(x-user-email 헤더, adminEmail 쿼리)은 위조가 가능하므로 신뢰하지 않는다.
function isAdminUser(user: StoredUser | null): boolean {
  return Boolean(user && (user.role === "ADMIN" || isEmailAdmin(user.email)));
}

// 신고 작성자 본인 여부 판정
function isReportOwner(report: StoredReport, user: StoredUser): boolean {
  if (report.user_id && report.user_id === user.id) return true;
  if (report.google_sub && report.google_sub === user.google_sub) return true;
  if (report.userEmail && report.userEmail.toLowerCase() === user.email.toLowerCase()) return true;
  return false;
}

// ---------------------------------------------------------------------------
// 위험도 분석 연동 (riskAnalysis.ts 가 유일한 계산 출처)
// ---------------------------------------------------------------------------

/** risk_level 을 기존 운영 우선순위로 매핑한다. 관리자가 이후 수동 변경할 수 있다. */
function riskLevelToPriority(level: RiskLevel): "urgent" | "medium" | "low" {
  if (level === "긴급" || level === "높음") return "urgent";
  if (level === "중간") return "medium";
  return "low";
}

/**
 * 실제 DB에서 동일 위치·유형의 이전 신고를 집계한다.
 * AI에게는 여기서 나온 값만 전달하며, 없는 횟수를 만들어내지 않는다(§21).
 */
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

  return {
    count: matches.length,
    previous: matches.slice(0, 3).map((r) => r.description),
  };
}

/**
 * 신고 1건을 분석한다. 실패해도 예외를 던지지 않고 사유만 돌려준다.
 * 신고 접수 자체가 AI 장애로 실패해서는 안 되기 때문이다.
 */
async function runRiskAnalysis(
  description: string,
  location: string,
  category: string,
  repeat: { count: number; previous: string[] }
): Promise<{ analysis: RiskAnalysis | null; error: string | null }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { analysis: null, error: "OPENAI_API_KEY가 설정되지 않아 위험도 분석을 건너뛰었습니다." };
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
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error("[risk] 분석 실패:", msg);
    return { analysis: null, error: "위험도 분석에 실패했습니다. 관리자 재분석이 필요합니다." };
  }
}

/**
 * 작성자 본인에게 돌려주는 형태.
 * 본인 신고이므로 본인 정보는 유지하되, 관리자 전용 정보(AI 위험도 분석, 관리자 메모)는 제거한다(§25).
 */
function toOwnerReport(r: StoredReport) {
  const { riskAnalysis, riskAnalysisError, adminNote, ...rest } = r;
  return {
    ...rest,
    // 학생에게는 "담당자 확인이 필요한 건인지" 정도만 노출한다.
    needsHumanReview: riskAnalysis?.needs_human_review ?? false,
  };
}

// 개인정보(신고자 이름/이메일/계정 식별자/관리자 메모/첨부 이미지)를 제거한 공개용 형태로 변환
function toPublicReport(r: StoredReport) {
  return {
    id: r.id,
    title: r.title,
    location: r.location,
    category: r.category,
    description: r.description,
    // 공개 형태에는 신고자 신원이 일절 포함되지 않으므로 항상 익명으로 표시한다.
    isAnonymous: true,
    status: r.status,
    priority: r.priority,
    assignee: r.assignee,
    resolutionNote: r.resolutionNote,
    reviewedAt: r.reviewedAt,
    inProgressAt: r.inProgressAt,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function verifyAdminAuth(req: express.Request, res: express.Response): boolean {
  const user = getUserFromRequest(req);
  if (isAdminUser(user)) {
    return true;
  }

  if (!user) {
    res.status(401).json({
      ok: false,
      error: "로그인이 필요하거나 세션이 만료되었습니다. 관리자 계정으로 로그인 후 다시 시도해주세요.",
    });
    return false;
  }

  res.status(403).json({
    ok: false,
    error: `관리자(${ADMIN_EMAIL}) 전용 권한입니다. 관리자 계정으로 로그인해야 처리할 수 있습니다.`,
  });
  return false;
}

function loadReports(): StoredReport[] {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("Error reading reports_db.json:", err);
  }
  return [];
}

function saveReports(reports: StoredReport[]) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(reports, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving reports_db.json:", err);
  }
}

// -------------------------------------------------------------
// Authentication Endpoints (Real Google Identity Services / OAuth)
// -------------------------------------------------------------

// API: Get Google OAuth Client configuration & app host info
app.get("/api/auth/config", (req, res) => {
  const currentClientId = process.env.GOOGLE_CLIENT_ID || dynamicGoogleClientId || "";
  const host = req.get("host") || "localhost:3000";
  const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const detectedOrigin = `${protocol}://${host}`;

  res.json({
    ok: true,
    clientId: currentClientId,
    configured: Boolean(currentClientId),
    adminEmail: ADMIN_EMAIL,
    detectedOrigin,
    suggestedRedirectUri: detectedOrigin,
  });
});

// API: Set or update Google Client ID dynamically for runtime environment
app.post("/api/auth/config", (req, res) => {
  const { clientId } = req.body;
  if (!clientId || typeof clientId !== "string" || !clientId.trim()) {
    return res.status(400).json({ ok: false, error: "유효한 Google Client ID를 입력해주세요." });
  }
  dynamicGoogleClientId = clientId.trim();
  return res.json({
    ok: true,
    message: "Google Client ID가 성공적으로 설정되었습니다.",
    clientId: dynamicGoogleClientId,
  });
});

// API: Real Google Identity Services (GSI) credential verification
app.post("/api/auth/google", async (req, res) => {
  const { credential } = req.body;

  if (!credential || typeof credential !== "string") {
    return res.status(400).json({
      ok: false,
      error: "Google 인증 자격 증명(ID Token)이 전달되지 않았습니다.",
    });
  }

  try {
    let payload: {
      sub?: string;
      email?: string;
      email_verified?: string | boolean;
      name?: string;
      picture?: string;
      aud?: string;
      error_description?: string;
    } = {};

    if (credential.startsWith("dev_mock_")) {
      // Development/Sandbox verification payload
      try {
        const parsed = JSON.parse(Buffer.from(credential.replace("dev_mock_", ""), "base64").toString("utf-8"));
        payload = parsed;
      } catch {
        payload = {
          sub: "109823489123891239812",
          email: "student.fix@school.kr",
          name: "김학생 (Google 인증)",
          picture: "https://api.dicebear.com/7.x/bottts/svg?seed=student",
        };
      }
    } else {
      // Verify ID Token with Google's official tokeninfo endpoint
      const googleVerifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
      const googleRes = await fetch(googleVerifyUrl);

      if (!googleRes.ok) {
        const errText = await googleRes.text();
        console.error("[Google Auth Error] Token validation failed:", errText);
        return res.status(401).json({
          ok: false,
          error: "Google 계정 인증에 실패했습니다. 유효하지 않거나 만료된 Google 인증 토큰입니다. 다시 로그인해주세요.",
        });
      }

      payload = (await googleRes.json()) as typeof payload;
    }

    if (!payload.sub || !payload.email) {
      return res.status(400).json({
        ok: false,
        error: "Google 인증 결과에서 사용자 고유 식별자(sub) 또는 이메일을 확인할 수 없습니다.",
      });
    }

    const email = payload.email.trim().toLowerCase();
    const name = payload.name?.trim() || email.split("@")[0];
    const picture = payload.picture || "";
    const googleSub = payload.sub;

    const users = loadUsers();
    let user = users.find((u) => u.google_sub === googleSub);

    if (!user) {
      // Check if user previously existed with this email
      const byEmail = users.find((u) => u.email.toLowerCase() === email);
      if (byEmail) {
        byEmail.google_sub = googleSub;
        byEmail.name = name;
        if (picture) byEmail.profile_image = picture;
        byEmail.last_login_at = new Date().toISOString();
        if (isEmailAdmin(email)) byEmail.role = "ADMIN";
        user = byEmail;
      } else {
        // Create new user account with google_sub as primary identity
        const newUserId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        user = {
          id: newUserId,
          google_sub: googleSub,
          email,
          name,
          profile_image: picture,
          role: isEmailAdmin(email) ? "ADMIN" : "USER",
          created_at: new Date().toISOString(),
          last_login_at: new Date().toISOString(),
        };
        users.push(user);
      }
    } else {
      // Existing user: update latest login info
      user.name = name;
      if (picture) user.profile_image = picture;
      user.last_login_at = new Date().toISOString();
      if (isEmailAdmin(email)) {
        user.role = "ADMIN";
      }
    }

    saveUsers(users);

    // Link any previous reports submitted with this user's email to this user's id
    const reports = loadReports();
    let reportsUpdated = false;
    reports.forEach((r) => {
      if ((!r.user_id || r.user_id !== user!.id) && r.userEmail && r.userEmail.toLowerCase() === email) {
        r.user_id = user!.id;
        r.google_sub = googleSub;
        reportsUpdated = true;
      }
    });
    if (reportsUpdated) {
      saveReports(reports);
    }

    // Create secure server session
    const sessionToken = `s_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    const sessions = loadSessions();
    sessions.push({
      token: sessionToken,
      user_id: user.id,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    });
    saveSessions(sessions);

    return res.json({
      ok: true,
      token: sessionToken,
      user: {
        id: user.id,
        google_sub: user.google_sub,
        email: user.email,
        name: user.name,
        profile_image: user.profile_image,
        avatar: user.profile_image,
        role: user.role,
        created_at: user.created_at,
        last_login_at: user.last_login_at,
      },
    });
  } catch (err: any) {
    console.error("[Google Auth Server Error]:", err);
    return res.status(500).json({
      ok: false,
      error: "Google 로그인 처리 중 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    });
  }
});

// API: Get current authenticated user profile
app.get("/api/auth/me", (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({
      ok: false,
      error: "로그인이 필요하거나 세션이 만료되었습니다.",
    });
  }

  return res.json({
    ok: true,
    user: {
      id: user.id,
      google_sub: user.google_sub,
      email: user.email,
      name: user.name,
      profile_image: user.profile_image,
      avatar: user.profile_image,
      role: user.role,
      created_at: user.created_at,
      last_login_at: user.last_login_at,
    },
  });
});

// API: Logout and terminate session
app.post("/api/auth/logout", (req, res) => {
  const authHeader = req.headers["authorization"];
  let token = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (req.headers["x-session-token"]) {
    token = String(req.headers["x-session-token"]).trim();
  }

  if (token) {
    const sessions = loadSessions();
    const filtered = sessions.filter((s) => s.token !== token);
    saveSessions(filtered);
  }

  return res.json({ ok: true, message: "성공적으로 로그아웃되었습니다." });
});

// -------------------------------------------------------------
// Report Management Endpoints
// -------------------------------------------------------------

// API: Health check
app.get("/api/health", (req, res) => {
  const reports = loadReports();
  res.json({
    status: "ok",
    storedReportsCount: reports.length,
  });
});

// API: 「전체 진행상황」 (Overall Progress) - 실시간 통계 및 개인정보 완벽 보호된 공개 리포트 목록
app.get("/api/reports/overall", (req, res) => {
  const reports = loadReports();

  const total = reports.length;
  const pending = reports.filter((r) => r.status === "pending").length;
  const reviewing = reports.filter((r) => r.status === "reviewing").length;
  const inProgress = reports.filter((r) => r.status === "in_progress").length;
  const completed = reports.filter((r) => r.status === "completed").length;

  // 요구사항 11: 전체 진행상황에서는 개인정보(신고자 이름, 이메일, Google 계정, 관리자 메모, 전화번호 등)를 절대 공개하지 않음
  const publicReports = reports.map(toPublicReport);

  res.json({
    ok: true,
    stats: {
      total,
      pending,
      reviewing,
      inProgress,
      completed,
    },
    data: publicReports,
  });
});

// API: 「내 진행상황」 (My Progress) - 현재 로그인한 사용자가 직접 접수한 신고 및 상세 진행상황만 조회
app.get("/api/reports/my", (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({
      ok: false,
      error: "로그인이 필요합니다. Google 계정으로 로그인 후 내 진행상황을 확인해주세요.",
    });
  }

  const reports = loadReports();
  const myReports = reports.filter((r) => isReportOwner(r, user));

  const total = myReports.length;
  const pending = myReports.filter((r) => r.status === "pending").length;
  const reviewing = myReports.filter((r) => r.status === "reviewing").length;
  const inProgress = myReports.filter((r) => r.status === "in_progress").length;
  const completed = myReports.filter((r) => r.status === "completed").length;

  res.json({
    ok: true,
    stats: {
      total,
      pending,
      reviewing,
      inProgress,
      completed,
    },
    // 본인 신고라도 관리자 전용 분석 결과는 제외한다(§25).
    data: myReports.map(toOwnerReport),
  });
});

// API: Get reports from DB
// 관리자는 전체 원본을, 일반 사용자는 "본인 신고만 원본 + 나머지는 개인정보 제거본"을 받는다.
app.get("/api/reports", (req, res) => {
  const user = getUserFromRequest(req);
  const reports = loadReports();

  if (isAdminUser(user)) {
    return res.json({ ok: true, scope: "admin", data: reports });
  }

  const data = reports.map((r) =>
    user && isReportOwner(r, user) ? toOwnerReport(r) : toPublicReport(r)
  );

  return res.json({ ok: true, scope: user ? "user" : "public", data });
});

// API: Get single report by ID (동일한 개인정보 보호 규칙 적용)
app.get("/api/reports/:id", (req, res) => {
  const { id } = req.params;
  const user = getUserFromRequest(req);
  const reports = loadReports();
  const report = reports.find((r) => r.id === id);
  if (!report) {
    return res.status(404).json({ ok: false, error: "해당 신고를 찾을 수 없습니다." });
  }

  if (isAdminUser(user)) {
    return res.json({ ok: true, data: report });
  }
  if (user && isReportOwner(report, user)) {
    return res.json({ ok: true, data: toOwnerReport(report) });
  }

  return res.json({ ok: true, data: toPublicReport(report) });
});

// API: Submit a genuine report into DB
app.post("/api/reports", async (req, res) => {
  const user = getUserFromRequest(req);
  const {
    title,
    location = "교실",
    category,
    description,
    isAnonymous = true,
    userEmail = null,
    userName = null,
    attachmentUrl = null,
    attachmentName = null,
    attachmentSize = null,
  } = req.body;

  // Validation
  if (!location || !String(location).trim()) {
    return res.status(400).json({ ok: false, error: "문제 위치를 선택해주세요." });
  }
  if (!category || !String(category).trim()) {
    return res.status(400).json({ ok: false, error: "문제 종류를 선택해주세요." });
  }
  if (!description || !String(description).trim()) {
    return res.status(400).json({ ok: false, error: "문제 내용을 입력해주세요." });
  }

  try {
    const reports = loadReports();
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    // 전체 건수가 아니라 "당일 발급된 최대 일련번호 + 1"을 사용한다.
    // 건수 기반으로 매기면 신고가 한 번이라도 삭제됐을 때 접수번호가 중복된다.
    const prefix = `REP-${dateStr}-`;
    const lastSerial = reports.reduce((max, r) => {
      if (!r.id.startsWith(prefix)) return max;
      const n = Number.parseInt(r.id.slice(prefix.length), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    const reportId = `${prefix}${String(lastSerial + 1).padStart(4, "0")}`;

    const trimmedDesc = String(description).trim();
    const generatedTitle =
      title && String(title).trim()
        ? String(title).trim()
        : `${String(location).trim()} ${String(category).trim()} 불편 신고`;

    const finalEmail = user ? user.email : (userEmail ? String(userEmail).trim() : null);
    const finalName = user ? user.name : (userName ? String(userName).trim() : null);

    const finalLocation = String(location).trim();
    const finalCategory = String(category).trim();

    // 위험도 분석 (§30 흐름: 검증 -> 분석 -> 스키마 검증 -> DB 저장)
    // 클라이언트가 보낸 priority 는 신뢰하지 않는다. 위험도는 서버에서만 산출한다(§28).
    const repeat = buildRepeatContext(reports, finalLocation, finalCategory);
    const { analysis, error: riskError } = await runRiskAnalysis(
      trimmedDesc,
      finalLocation,
      finalCategory,
      repeat
    );

    const newReport: StoredReport = {
      id: reportId,
      user_id: user ? user.id : null,
      google_sub: user ? user.google_sub : null,
      title: generatedTitle,
      location: finalLocation,
      category: finalCategory,
      description: trimmedDesc,
      isAnonymous: Boolean(isAnonymous),
      userEmail: finalEmail,
      userName: finalName,
      attachmentUrl: attachmentUrl ? String(attachmentUrl) : null,
      attachmentName: attachmentName ? String(attachmentName) : null,
      attachmentSize: typeof attachmentSize === "number" ? attachmentSize : null,
      status: "pending",
      priority: analysis ? riskLevelToPriority(analysis.risk_level) : "medium",
      riskAnalysis: analysis,
      riskAnalysisError: riskError,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    reports.unshift(newReport);
    saveReports(reports);

    // 접수 응답에는 관리자 전용 분석 결과를 포함하지 않는다(§25).
    return res.status(201).json({
      ok: true,
      data: toOwnerReport(newReport),
    });
  } catch (err) {
    console.error("Failed to save report to database:", err);
    return res.status(500).json({
      ok: false,
      error: "신고를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.",
    });
  }
});

// API: Update report content (Edit) - 작성자 본인 또는 관리자만 수정 가능
app.patch("/api/reports/:id", (req, res) => {
  const { id } = req.params;
  const { title, location, category, description, isAnonymous } = req.body;

  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({
      ok: false,
      error: "로그인이 필요하거나 세션이 만료되었습니다. 다시 로그인 후 수정해주세요.",
    });
  }

  const reports = loadReports();
  const reportIndex = reports.findIndex((r) => r.id === id);

  if (reportIndex === -1) {
    return res.status(404).json({ ok: false, error: "수정할 신고를 찾을 수 없습니다." });
  }

  const existing = reports[reportIndex];

  if (!isAdminUser(user) && !isReportOwner(existing, user)) {
    return res.status(403).json({
      ok: false,
      error: "본인이 접수한 신고 또는 관리자만 수정할 수 있습니다.",
    });
  }

  if (location !== undefined) existing.location = String(location).trim();
  if (category !== undefined) existing.category = String(category).trim();
  if (description !== undefined) existing.description = String(description).trim();
  if (title !== undefined) existing.title = String(title).trim();
  if (isAnonymous !== undefined) existing.isAnonymous = Boolean(isAnonymous);
  existing.updatedAt = new Date().toISOString();

  saveReports(reports);
  return res.json({ ok: true, data: existing });
});

// API: Process report by Admin (Assignee, Resolution Note, Status, Priority, Timeline)
app.patch("/api/reports/:id/process", (req, res) => {
  if (!verifyAdminAuth(req, res)) return;
  const { id } = req.params;
  const { status, assignee, resolutionNote, adminNote, priority } = req.body;

  const validStatuses = ["pending", "reviewing", "in_progress", "completed"];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ ok: false, error: "유효하지 않은 상태값입니다." });
  }

  const validPriorities = ["urgent", "medium", "low"];
  if (priority && !validPriorities.includes(priority)) {
    return res.status(400).json({ ok: false, error: "유효하지 않은 우선순위 값입니다." });
  }

  const reports = loadReports();
  const reportIndex = reports.findIndex((r) => r.id === id);

  if (reportIndex === -1) {
    return res.status(404).json({ ok: false, error: "해당 신고를 찾을 수 없습니다." });
  }

  const existing = reports[reportIndex];
  const now = new Date().toISOString();

  if (status && status !== existing.status) {
    existing.status = status;
    if (status === "reviewing" && !existing.reviewedAt) {
      existing.reviewedAt = now;
    } else if (status === "in_progress") {
      if (!existing.reviewedAt) existing.reviewedAt = now;
      if (!existing.inProgressAt) existing.inProgressAt = now;
    } else if (status === "completed") {
      if (!existing.reviewedAt) existing.reviewedAt = now;
      if (!existing.inProgressAt) existing.inProgressAt = now;
      existing.completedAt = now;
    }
  }

  if (priority !== undefined) {
    existing.priority = priority;
  }
  if (assignee !== undefined) {
    existing.assignee = assignee ? String(assignee).trim() : null;
  }
  if (resolutionNote !== undefined) {
    existing.resolutionNote = resolutionNote ? String(resolutionNote).trim() : null;
  }
  if (adminNote !== undefined) {
    existing.adminNote = adminNote ? String(adminNote).trim() : undefined;
  }

  existing.updatedAt = now;
  saveReports(reports);

  return res.json({ ok: true, data: existing });
});

// API: 위험도 재분석 (관리자 전용)
// 분석이 실패했거나, 신고 내용이 수정되어 다시 평가해야 할 때 사용한다.
app.post("/api/reports/:id/analyze-risk", async (req, res) => {
  if (!verifyAdminAuth(req, res)) return;
  const { id } = req.params;

  const reports = loadReports();
  const idx = reports.findIndex((r) => r.id === id);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "해당 신고를 찾을 수 없습니다." });
  }

  const target = reports[idx];
  const repeat = buildRepeatContext(reports, target.location, target.category, target.id);
  const { analysis, error } = await runRiskAnalysis(
    target.description,
    target.location,
    target.category,
    repeat
  );

  if (!analysis) {
    return res.status(502).json({ ok: false, error: error || "위험도 분석에 실패했습니다." });
  }

  target.riskAnalysis = analysis;
  target.riskAnalysisError = null;
  target.priority = riskLevelToPriority(analysis.risk_level);
  target.updatedAt = new Date().toISOString();
  saveReports(reports);

  return res.json({ ok: true, data: target });
});

// API: Dedicated quick priority update
app.patch("/api/reports/:id/priority", (req, res) => {
  if (!verifyAdminAuth(req, res)) return;
  const { id } = req.params;
  const { priority } = req.body;

  const validPriorities = ["urgent", "medium", "low"];
  if (!priority || !validPriorities.includes(priority)) {
    return res.status(400).json({
      ok: false,
      error: "우선순위는 'urgent', 'medium', 'low' 중 하나여야 합니다.",
    });
  }

  const reports = loadReports();
  const reportIndex = reports.findIndex((r) => r.id === id);

  if (reportIndex === -1) {
    return res.status(404).json({ ok: false, error: "해당 신고를 찾을 수 없습니다." });
  }

  const existing = reports[reportIndex];
  existing.priority = priority;
  existing.updatedAt = new Date().toISOString();

  saveReports(reports);
  return res.json({ ok: true, data: existing });
});

// API: Update report status (Legacy/Quick Status Update)
app.patch("/api/reports/:id/status", (req, res) => {
  if (!verifyAdminAuth(req, res)) return;
  const { id } = req.params;
  const { status, adminNote } = req.body;

  const validStatuses = ["pending", "reviewing", "in_progress", "completed"];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ ok: false, error: "유효하지 않은 상태값입니다." });
  }

  const reports = loadReports();
  const reportIndex = reports.findIndex((r) => r.id === id);

  if (reportIndex === -1) {
    return res.status(404).json({ ok: false, error: "해당 신고를 찾을 수 없습니다." });
  }

  const existing = reports[reportIndex];
  const now = new Date().toISOString();

  if (status && status !== existing.status) {
    existing.status = status;
    if (status === "reviewing" && !existing.reviewedAt) {
      existing.reviewedAt = now;
    } else if (status === "in_progress") {
      if (!existing.reviewedAt) existing.reviewedAt = now;
      if (!existing.inProgressAt) existing.inProgressAt = now;
    } else if (status === "completed") {
      if (!existing.reviewedAt) existing.reviewedAt = now;
      if (!existing.inProgressAt) existing.inProgressAt = now;
      existing.completedAt = now;
    }
  }

  if (typeof adminNote === "string") {
    existing.adminNote = adminNote.trim();
  }
  existing.updatedAt = now;

  saveReports(reports);

  return res.json({
    ok: true,
    data: existing,
  });
});

// API: Delete report (with verification requirement)
app.delete("/api/reports/:id", (req, res) => {
  if (!verifyAdminAuth(req, res)) return;
  const { id } = req.params;
  const reports = loadReports();
  const reportIndex = reports.findIndex((r) => r.id === id);

  if (reportIndex === -1) {
    return res.status(404).json({ ok: false, error: "삭제할 신고를 찾을 수 없습니다." });
  }

  const deletedReport = reports.splice(reportIndex, 1)[0];
  saveReports(reports);

  return res.json({
    ok: true,
    message: `신고 [${id}]가 성공적으로 삭제되었습니다.`,
    data: deletedReport,
  });
});

// API: 교내 시설 안전 종합 리포트 (관리자 전용)
//
// 중요: 이 엔드포인트는 위험도를 "다시 판단하지 않는다".
// 각 신고의 위험도는 접수 시점에 riskAnalysis.ts 가 이미 산출해 DB에 저장했다.
// 여기서는 저장된 값을 집계만 한다. 따라서
//   - 위험도 계산식이 한 곳에만 존재하고 (§28)
//   - 화면에 표시되는 모든 숫자가 실제 DB에서 계산되며 (§25)
//   - AI 호출이 없으므로 환각이 발생할 여지가 없다.
app.post("/api/ai/analyze", (req, res) => {
  if (!verifyAdminAuth(req, res)) return;

  try {
    const reports = loadReports();

    if (!reports || reports.length === 0) {
      return res.status(400).json({ ok: false, error: "분석할 신고 데이터가 없습니다." });
    }

    const total = reports.length;
    const pending = reports.filter((r) => r.status === "pending").length;
    const inProgress = reports.filter(
      (r) => r.status === "reviewing" || r.status === "in_progress"
    ).length;
    const completed = reports.filter((r) => r.status === "completed").length;

    const analyzed = reports.filter(
      (r): r is StoredReport & { riskAnalysis: RiskAnalysis } => Boolean(r.riskAnalysis)
    );
    const unanalyzedCount = total - analyzed.length;

    // --- 신고별 위험도 항목 (저장된 값 그대로) ---
    const priorityItems = analyzed
      .map((r) => ({
        reportId: r.id,
        location: r.location,
        category: r.category,
        contentSummary:
          r.description.length > 70 ? `${r.description.slice(0, 67)}…` : r.description,
        currentStatus:
          r.status === "completed"
            ? "처리 완료"
            : r.status === "pending"
            ? "접수 대기"
            : "처리 중",
        priority: r.riskAnalysis.risk_level,
        riskScore: r.riskAnalysis.risk_score,
        riskFactors: r.riskAnalysis.risk_factors,
        emergencyOverride: r.riskAnalysis.emergency_override,
        needsMoreInfo: r.riskAnalysis.needs_more_info,
        needsHumanReview: r.riskAnalysis.needs_human_review,
        rationale: r.riskAnalysis.reason,
      }))
      .sort((a, b) => b.riskScore - a.riskScore);

    const countLevel = (level: RiskLevel) =>
      analyzed.filter((r) => r.riskAnalysis.risk_level === level).length;

    const priorityStats = {
      urgent: countLevel("긴급"),
      high: countLevel("높음"),
      medium: countLevel("중간"),
      low: countLevel("낮음"),
    };

    const emergencyCount = analyzed.filter((r) => r.riskAnalysis.emergency_override).length;
    const needsMoreInfoCount = analyzed.filter((r) => r.riskAnalysis.needs_more_info).length;
    const needsHumanReviewCount = analyzed.filter(
      (r) => r.riskAnalysis.needs_human_review
    ).length;

    // --- 위치별 / 유형별 집계 ---
    function groupBy(keyOf: (r: StoredReport) => string) {
      const map = new Map<string, { count: number; urgentish: number; maxScore: number }>();
      for (const r of reports) {
        const key = keyOf(r) || "기타";
        const cur = map.get(key) || { count: 0, urgentish: 0, maxScore: 0 };
        cur.count += 1;
        const ra = r.riskAnalysis;
        if (ra) {
          if (ra.risk_level === "긴급" || ra.risk_level === "높음") cur.urgentish += 1;
          if (ra.risk_score > cur.maxScore) cur.maxScore = ra.risk_score;
        }
        map.set(key, cur);
      }
      return Array.from(map.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.urgentish - a.urgentish || b.count - a.count);
    }

    const byLocation = groupBy((r) => r.location);
    const byCategory = groupBy((r) => r.category);

    const locationSummaries = byLocation.map((l) => ({
      location: l.name,
      count: l.count,
      summary:
        l.urgentish > 0
          ? `신고 ${l.count}건 중 긴급·높음 ${l.urgentish}건이 확인되었습니다. (최고 위험점수 ${l.maxScore})`
          : `신고 ${l.count}건이 접수되었으며 긴급·높음으로 분류된 건은 없습니다.`,
    }));

    const categorySummaries = byCategory.map((c) => ({
      category: c.name,
      count: c.count,
      summary:
        c.urgentish > 0
          ? `신고 ${c.count}건 중 긴급·높음 ${c.urgentish}건이 확인되었습니다. (최고 위험점수 ${c.maxScore})`
          : `신고 ${c.count}건이 접수되었습니다.`,
    }));

    // --- 종합 위험 수준 (저장된 등급 분포에서 결정) ---
    let overallRiskLevel: "safe" | "caution" | "warning" | "dangerous" = "safe";
    let overallRiskLevelLabel = "양호(안전)";
    if (priorityStats.urgent > 0) {
      overallRiskLevel = "dangerous";
      overallRiskLevelLabel = "즉시 조치 필요(위험)";
    } else if (priorityStats.high >= 2) {
      overallRiskLevel = "warning";
      overallRiskLevelLabel = "위험 경고(경고)";
    } else if (priorityStats.high >= 1 || priorityStats.medium > 1) {
      overallRiskLevel = "caution";
      overallRiskLevelLabel = "관찰 필요(주의)";
    }

    const hotspots = byLocation
      .filter((l) => l.urgentish > 0)
      .slice(0, 3)
      .map((l) => ({
        location: l.name,
        reason: `긴급·높음 ${l.urgentish}건이 집중되어 있습니다.`,
        riskLevel: l.urgentish >= 2 ? "긴급" : "높음",
      }));

    const frequentRisks = byCategory
      .filter((c) => c.count >= 2)
      .slice(0, 3)
      .map((c) => ({
        category: c.name,
        description: `${c.count}건 접수 (긴급·높음 ${c.urgentish}건)`,
        riskLevel: c.urgentish >= 2 ? "긴급" : c.urgentish === 1 ? "높음" : "중간",
      }));

    // --- 반복 문제: 실제로 2건 이상 누적된 경우만 ---
    const recurringIssues: { issue: string; evidence: string }[] = [];
    for (const l of byLocation.filter((x) => x.count >= 2)) {
      recurringIssues.push({
        issue: `${l.name} 반복 신고`,
        evidence: `동일 위치에서 ${l.count}건이 접수되었습니다.`,
      });
    }
    for (const c of byCategory.filter((x) => x.count >= 2)) {
      if (!recurringIssues.some((ri) => ri.issue.includes(c.name))) {
        recurringIssues.push({
          issue: `${c.name} 반복 발생`,
          evidence: `동일 유형으로 ${c.count}건이 접수되었습니다.`,
        });
      }
    }

    // --- 요약·권고: 실제 집계값만 사용 ---
    const topLocations = byLocation.slice(0, 3).map((l) => l.name).join(", ");

    const overallSummary =
      `전체 ${total}건(미처리 ${pending}건, 처리 중 ${inProgress}건, 완료 ${completed}건) 중 ` +
      `${analyzed.length}건에 대한 위험도 분석이 완료되었습니다. ` +
      `긴급 ${priorityStats.urgent}건, 높음 ${priorityStats.high}건, 중간 ${priorityStats.medium}건, 낮음 ${priorityStats.low}건으로 분류되었습니다.` +
      (unanalyzedCount > 0 ? ` 미분석 ${unanalyzedCount}건은 재분석이 필요합니다.` : "");

    const recommendations: string[] = [];
    if (emergencyCount > 0) {
      recommendations.push(
        `즉각 위험으로 판정된 ${emergencyCount}건은 현장 접근을 통제하고 우선 조치하십시오.`
      );
    }
    if (priorityStats.urgent > 0) {
      recommendations.push(`긴급 ${priorityStats.urgent}건을 최우선으로 현장 확인하십시오.`);
    }
    if (hotspots.length > 0) {
      recommendations.push(`${topLocations} 구역에 대한 집중 점검을 실시하십시오.`);
    }
    if (needsHumanReviewCount > 0) {
      recommendations.push(
        `담당자 확인이 필요한 ${needsHumanReviewCount}건은 사진 또는 현장 확인으로 위험도를 재검토하십시오.`
      );
    }
    if (needsMoreInfoCount > 0) {
      recommendations.push(
        `정보가 부족한 ${needsMoreInfoCount}건은 신고자에게 추가 정보를 요청하십시오.`
      );
    }
    if (recommendations.length === 0) {
      recommendations.push("현재 긴급 위험은 확인되지 않았습니다. 정기 점검을 유지하십시오.");
    }

    return res.json({
      ok: true,
      data: {
        analyzedAt: new Date().toISOString(),
        targetCount: total,
        analyzedCount: analyzed.length,
        unanalyzedCount,
        stats: { total, pending, inProgress, completed },
        overallSummary,
        safetyTrends: {
          overallRiskLevel,
          overallRiskLevelLabel,
          trendHeadline:
            priorityStats.urgent > 0
              ? `긴급 ${priorityStats.urgent}건 — 즉시 조치가 필요합니다.`
              : priorityStats.high > 0
              ? `높음 ${priorityStats.high}건 — 우선 점검이 필요합니다.`
              : "긴급·높음으로 분류된 신고가 없습니다.",
          trendSummary: overallSummary,
          hotspots,
          frequentRisks,
          urgentActionNeeded: priorityStats.urgent > 0 || emergencyCount > 0,
        },
        locationSummaries,
        categorySummaries,
        priorityStats,
        priorityItems,
        flagStats: {
          emergencyOverride: emergencyCount,
          needsMoreInfo: needsMoreInfoCount,
          needsHumanReview: needsHumanReviewCount,
        },
        recurringIssues,
        recommendations,
      },
    });
  } catch (err: any) {
    console.error("[analyze] 집계 실패:", err?.message || err);
    return res.status(500).json({
      ok: false,
      error: "리포트 집계 중 오류가 발생했습니다.",
    });
  }
});

async function startServer() {
  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.argv[1]?.endsWith("server.cjs");

  const publicPath = path.join(process.cwd(), "public");
  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
  }

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
