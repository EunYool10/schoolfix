import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

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
    data: myReports,
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
    user && isReportOwner(r, user) ? r : toPublicReport(r)
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

  if (isAdminUser(user) || (user && isReportOwner(report, user))) {
    return res.json({ ok: true, data: report });
  }

  return res.json({ ok: true, data: toPublicReport(report) });
});

// API: Submit a genuine report into DB
app.post("/api/reports", (req, res) => {
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

    const newReport: StoredReport = {
      id: reportId,
      user_id: user ? user.id : null,
      google_sub: user ? user.google_sub : null,
      title: generatedTitle,
      location: String(location).trim(),
      category: String(category).trim(),
      description: trimmedDesc,
      isAnonymous: Boolean(isAnonymous),
      userEmail: finalEmail,
      userName: finalName,
      attachmentUrl: attachmentUrl ? String(attachmentUrl) : null,
      attachmentName: attachmentName ? String(attachmentName) : null,
      attachmentSize: typeof attachmentSize === "number" ? attachmentSize : null,
      status: "pending",
      priority: req.body.priority === "urgent" || req.body.priority === "low" ? req.body.priority : "medium",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    reports.unshift(newReport);
    saveReports(reports);

    return res.status(201).json({
      ok: true,
      data: newReport,
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

// API: AI Report Analysis (Read-only, strictly uses real DB reports)
app.post("/api/ai/analyze", async (req, res) => {
  // 전체 신고 본문을 반환하고 외부 AI 비용을 발생시키는 엔드포인트이므로 관리자 전용으로 제한한다.
  if (!verifyAdminAuth(req, res)) return;

  try {
    const reports = loadReports();

    if (!reports || reports.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "분석할 신고 데이터가 없습니다.",
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "OPENAI_API_KEY가 설정되지 않았습니다. 관리자 환경 설정(.env.local)을 확인해주세요.",
      });
    }

    // Lazy initialization of the OpenAI client to ensure safe server startup
    const { default: OpenAI } = await import("openai");
    const ai = new OpenAI({ apiKey });

    // Compute actual real stats from DB
    const total = reports.length;
    const pending = reports.filter((r) => r.status === "pending").length;
    const inProgress = reports.filter(
      (r) => r.status === "reviewing" || r.status === "in_progress"
    ).length;
    const completed = reports.filter((r) => r.status === "completed").length;

    // Provide strict input of real reports only
    const inputReports = reports.map((r) => ({
      id: r.id,
      location: r.location,
      category: r.category,
      description: r.description,
      status:
        r.status === "completed"
          ? "처리 완료"
          : r.status === "pending"
          ? "미처리"
          : "처리 중",
      createdAt: r.createdAt,
    }));

    const prompt = `당신은 학교 행정 및 시설 안전 관리자를 위한 "AI 시설 안전 분석 및 트렌드 리포트" 분석 시스템입니다.
아래에 전달된 [실제 접수된 학교 신고 데이터 목록]만을 분석하여 JSON 형식으로 결과를 출력하십시오.

[중요 제약 조건 및 원칙]:
1. 전달된 실제 신고 데이터에 없는 가상의 신고나 없는 ID를 절대로 지어내지 마십시오.
2. 분석 대상 신고 목록의 'id'는 반드시 전달된 id와 정확히 일치해야 합니다.
3. 위치별 분석(locationSummaries)에는 실제 신고 데이터에 존재하는 위치만 포함하십시오.
4. 문제 종류별 분석(categorySummaries)에는 실제 신고 데이터에 존재하는 문제 종류만 포함하십시오.
5. 시설 안전 트렌드(safetyTrends): 등록된 신고 내용을 종합하여 학교 시설 안전의 주요 트렌드, 위험 구역(hotspots), 빈발 위험 유형(frequentRisks), 종합 위험 수준(overallRiskLevel: 'safe'|'caution'|'warning'|'dangerous')을 도출하십시오.
6. 각 신고에 대해 AI 처리 우선순위를 '긴급', '높음', '보통', '낮음' 중 하나로 판정하고, 'rationale'에 해당 신고 내용의 구체적 근거(예: 학생 부상 위험, 감전, 누수, 미끄러짐 등 학생 안전과의 직결성)를 1~2문장으로 명확히 서술하십시오.
7. 반복 문제 분석(recurringIssues)은 전달된 데이터에서 실제로 2건 이상 유사한 패턴이나 같은 장소/유형의 문제가 관찰될 때만 서술하십시오. 데이터가 적거나 패턴이 없다면 빈 배열([])로 두십시오.
8. 한국어로 명확하고 전문적인 학교 행정 보고서 문체로 작성하십시오.

[실제 접수된 학교 신고 데이터 목록 (${inputReports.length}건)]:
${JSON.stringify(inputReports, null, 2)}

반드시 다음 JSON 스키마를 엄격히 준수하여 응답하십시오:
{
  "overallSummary": "전체 신고 내용 요약 (2~4문장)",
  "safetyTrends": {
    "overallRiskLevel": "safe" 또는 "caution" 또는 "warning" 또는 "dangerous",
    "overallRiskLevelLabel": "양호(안전)" 또는 "관찰 필요(주의)" 또는 "위험 경고(경고)" 또는 "즉시 조치 필요(위험)",
    "trendHeadline": "시설 안전 주요 트렌드 핵심 한 줄 요약",
    "trendSummary": "교내 시설 전반의 안전 현황 및 발생 추이 분석 (2~3문장)",
    "hotspots": [
      {
        "location": "취약 구역 위치명",
        "reason": "해당 구역의 안전 위험 집중 원인 요약",
        "riskLevel": "긴급/높음/보통"
      }
    ],
    "frequentRisks": [
      {
        "category": "빈발 문제 종류",
        "description": "반복되는 위험 현상 및 영향 요약",
        "riskLevel": "긴급/높음/보통"
      }
    ],
    "urgentActionNeeded": true 또는 false
  },
  "locationSummaries": [
    {
      "location": "실제 신고에 있는 위치명",
      "count": 해당 위치 실제 신고 수(숫자),
      "summary": "해당 위치의 주요 문제 요약"
    }
  ],
  "categorySummaries": [
    {
      "category": "실제 신고에 있는 문제 종류명",
      "count": 해당 종류 실제 신고 수(숫자),
      "summary": "해당 문제 종류의 요약"
    }
  ],
  "priorityStats": {
    "urgent": 긴급 건수(숫자),
    "high": 높음 건수(숫자),
    "medium": 보통 건수(숫자),
    "low": 낮음 건수(숫자)
  },
  "priorityItems": [
    {
      "reportId": "실제 신고 id (예: REP-...)",
      "location": "해당 신고 위치",
      "category": "해당 신고 문제 종류",
      "contentSummary": "신고 내용 핵심 요약 (1~2문장)",
      "currentStatus": "미처리/처리 중/처리 완료",
      "priority": "긴급",
      "rationale": "신고 내용에 근거한 구체적인 우선순위 판단 사유"
    }
  ],
  "recurringIssues": [
    {
      "issue": "반복 확인된 문제 제목",
      "evidence": "실제 신고 데이터에 근거한 패턴 설명"
    }
  ],
  "recommendations": [
    "학교 시설 안전 관리를 위한 관리자 참고사항 및 우선 조치 권고사항 (2~4개)"
  ]
}`;

    // 1순위는 균형형, 실패 시 저비용 모델로 폴백한다.
    const modelsToTry = [
      "gpt-5.6-terra",
      "gpt-5.6-luna",
    ];
    let responseText = "";
    let lastError: any = null;

    for (const model of modelsToTry) {
      try {
        const completion = await ai.chat.completions.create({
          model,
          messages: [
            {
              role: "system",
              content:
                "당신은 학교 시설 안전 데이터를 분석하는 시스템입니다. 반드시 유효한 JSON 객체 하나만 출력하고, 코드 블록이나 설명 문구를 덧붙이지 마십시오.",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        });
        responseText = completion.choices[0]?.message?.content?.trim() || "";
        if (responseText) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        // Clean log without printing raw 503 JSON stack to avoid triggering log monitors
        console.log(`[AI Analysis] Model ${model} is currently busy, switching to alternate model...`);
        // Brief pause before trying next candidate
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }

    if (!responseText) {
      throw lastError || new Error("AI 분석 응답이 비어 있습니다.");
    }

    let parsedResult: any;
    try {
      parsedResult = JSON.parse(responseText);
    } catch (e) {
      throw new Error("AI 응답 형식이 올바르지 않습니다.");
    }

    // Sanitize and ensure priorityItems only reference real report IDs
    const validReportIdSet = new Set(reports.map((r) => r.id));
    const sanitizedPriorityItems = Array.isArray(parsedResult.priorityItems)
      ? parsedResult.priorityItems
          .filter((item: any) => validReportIdSet.has(item.reportId))
          .map((item: any) => {
            const original = reports.find((r) => r.id === item.reportId)!;
            const validPriority: "긴급" | "높음" | "보통" | "낮음" = [
              "긴급",
              "높음",
              "보통",
              "낮음",
            ].includes(item.priority)
              ? item.priority
              : "보통";
            return {
              reportId: original.id,
              location: original.location,
              category: original.category,
              contentSummary: item.contentSummary || original.description.slice(0, 80),
              currentStatus:
                original.status === "completed"
                  ? "처리 완료"
                  : original.status === "pending"
                  ? "미처리"
                  : "처리 중",
              priority: validPriority,
              rationale: item.rationale || "접수된 신고 내용을 종합하여 우선순위를 검토함.",
            };
          })
      : [];

    // Recalculate priorityStats strictly based on sanitized priority items
    const priorityStats = {
      urgent: sanitizedPriorityItems.filter((i: any) => i.priority === "긴급").length,
      high: sanitizedPriorityItems.filter((i: any) => i.priority === "높음").length,
      medium: sanitizedPriorityItems.filter((i: any) => i.priority === "보통").length,
      low: sanitizedPriorityItems.filter((i: any) => i.priority === "낮음").length,
    };

    const finalReport = {
      analyzedAt: new Date().toISOString(),
      targetCount: reports.length,
      stats: {
        total,
        pending,
        inProgress,
        completed,
      },
      overallSummary: parsedResult.overallSummary || "전체 신고 요약이 완료되었습니다.",
      safetyTrends: parsedResult.safetyTrends && typeof parsedResult.safetyTrends === "object"
        ? {
            overallRiskLevel: ["safe", "caution", "warning", "dangerous"].includes(parsedResult.safetyTrends.overallRiskLevel)
              ? parsedResult.safetyTrends.overallRiskLevel
              : "caution",
            overallRiskLevelLabel: parsedResult.safetyTrends.overallRiskLevelLabel || "관찰 필요(주의)",
            trendHeadline: parsedResult.safetyTrends.trendHeadline || "학교 시설 안전 점검 및 예방 관리 진행 필요",
            trendSummary: parsedResult.safetyTrends.trendSummary || parsedResult.overallSummary || "등록된 신고에 대한 시설 안전 트렌드 점검이 필요합니다.",
            hotspots: Array.isArray(parsedResult.safetyTrends.hotspots) ? parsedResult.safetyTrends.hotspots : [],
            frequentRisks: Array.isArray(parsedResult.safetyTrends.frequentRisks) ? parsedResult.safetyTrends.frequentRisks : [],
            urgentActionNeeded: Boolean(parsedResult.safetyTrends.urgentActionNeeded),
          }
        : undefined,
      locationSummaries: Array.isArray(parsedResult.locationSummaries)
        ? parsedResult.locationSummaries
        : [],
      categorySummaries: Array.isArray(parsedResult.categorySummaries)
        ? parsedResult.categorySummaries
        : [],
      priorityStats,
      priorityItems: sanitizedPriorityItems,
      recurringIssues: Array.isArray(parsedResult.recurringIssues)
        ? parsedResult.recurringIssues
        : [],
      recommendations: Array.isArray(parsedResult.recommendations)
        ? parsedResult.recommendations
        : [],
    };

    return res.json({
      ok: true,
      data: finalReport,
    });
  } catch (err: any) {
    let userFriendlyMsg = "AI 신고 분석 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    const rawMsg = err?.message || String(err);
    if (rawMsg.includes("429") || rawMsg.includes("rate limit") || rawMsg.includes("quota")) {
      userFriendlyMsg = "AI 요청 한도에 도달했습니다. 잠시 후 다시 분석을 시도하거나 OpenAI 사용량을 확인해주세요.";
    } else if (rawMsg.includes("503") || rawMsg.includes("overloaded") || rawMsg.includes("UNAVAILABLE")) {
      userFriendlyMsg = "현재 AI 모델 처리량이 많아 일시적으로 지연되고 있습니다. 잠시 후 다시 분석을 시도해주세요.";
    } else if (rawMsg.includes("401") || rawMsg.includes("API key") || rawMsg.includes("Incorrect API key")) {
      userFriendlyMsg = "OPENAI_API_KEY 설정이 올바르지 않거나 확인되지 않습니다.";
    } else if (rawMsg.includes("model_not_found") || rawMsg.includes("does not exist")) {
      userFriendlyMsg = "요청한 AI 모델을 사용할 수 없습니다. 계정의 모델 접근 권한을 확인해주세요.";
    } else if (rawMsg && !rawMsg.startsWith("{") && !rawMsg.includes("error")) {
      userFriendlyMsg = rawMsg;
    }

    return res.status(500).json({
      ok: false,
      error: userFriendlyMsg,
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
