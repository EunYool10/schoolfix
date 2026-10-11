/**
 * 운영진·교사 계정과 로그인 세션
 *
 * 계정
 *  - 공용 계정: 환경변수 STAFF_PASSWORD_HASH(운영진, 아이디 admin) 와
 *    SCHOOL_TEACHER_PASSWORD_HASHES(학교별 교사 공용 비밀번호). 예전 방식 그대로 쓸 수 있다.
 *  - 개인 계정: 관리자가 화면에서 만든다. 처리 이력에 누가 했는지 이름이 남고,
 *    한 명이 빠지면 그 계정만 끄면 된다. 비밀번호는 bcrypt 해시로만 저장한다.
 *
 * 세션
 *  - 브라우저에는 원본 토큰(HttpOnly 쿠키)만, 서버에는 SHA-256 해시만 둔다.
 *  - 해시 목록을 저장소에 함께 저장해, 서버가 잠들었다 깨거나 재배포돼도 다시 로그인하지 않게 한다.
 *    저장소에 남은 해시만으로는 쿠키를 만들 수 없다.
 */

import type express from "express";
import crypto from "crypto";

export type StaffRole = "admin" | "staff" | "teacher";

export interface StaffAccount {
  id: string;
  /** 로그인 아이디. 영문 소문자로 저장한다. */
  username: string;
  /** 처리 이력·화면에 보이는 이름 */
  displayName: string;
  role: StaffRole;
  /** 교사 계정의 소속 학교. 운영진 계정은 null */
  schoolId: string | null;
  passwordHash: string;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface StaffSession {
  /** 쿠키 토큰의 SHA-256 해시 */
  tokenHash: string;
  role: StaffRole;
  /** 개인 계정 id. 공용 계정 로그인이면 null */
  accountId: string | null;
  name: string;
  /** 교사 세션의 학교. 운영진은 null */
  schoolId: string | null;
  createdAt: number;
  expiresAt: number;
}

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const SESSION_COOKIE = "schoolfix_staff_session";
/** 예전 버전의 교사 세션 쿠키. 로그아웃할 때 함께 지운다. */
const LEGACY_TEACHER_COOKIE = "schoolfix_teacher_session";
/** STAFF_PASSWORD_HASH 공용 계정의 아이디. 개인 계정으로는 만들 수 없다. */
export const MASTER_USERNAME = "admin";
export const ROLE_LABEL: Record<StaffRole, string> = { admin: "관리자", staff: "운영진", teacher: "교사" };

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const PASSWORD_MIN_LENGTH = 8;

export function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** 아이디 형식 오류 메시지. 문제가 없으면 null */
export function usernameError(username: string): string | null {
  if (!USERNAME_PATTERN.test(username)) return "아이디는 영문 소문자·숫자·마침표·하이픈·밑줄 3~32자로, 영문이나 숫자로 시작해야 합니다.";
  if (username === MASTER_USERNAME) return `'${MASTER_USERNAME}'은(는) 공용 운영진 계정용이라 쓸 수 없습니다.`;
  return null;
}

export function passwordError(password: unknown): string | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) return `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
  if (password.length > 72) return "비밀번호는 72자를 넘을 수 없습니다.";
  return null;
}

export function displayNameError(name: string): string | null {
  if (!name || name.length > 40) return "이름은 1~40자로 입력해주세요.";
  return null;
}

/** 화면에 내보내는 계정 정보. 비밀번호 해시는 절대 포함하지 않는다. */
export function publicAccount(account: StaffAccount) {
  const { passwordHash: _omit, ...rest } = account;
  return rest;
}

export function newAccountId(): string {
  return `acc_${crypto.randomBytes(9).toString("base64url")}`;
}

/**
 * 없는 아이디로 로그인할 때도 bcrypt 비교 시간만큼 기다리게 해, 응답 시간으로 아이디 존재 여부를 알 수 없게 한다.
 * 어떤 비밀번호와도 일치하지 않는 고정 해시다.
 */
export const DUMMY_PASSWORD_HASH = "$2b$12$VMjo9olWh9QFMyrimo2tqOD3Lf6wKxyZhmRMhcXCiNeIlCdwUDesK";

// ---------------------------------------------------------------------------
// 세션 저장소
// ---------------------------------------------------------------------------

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(`session:${token}`).digest("hex");
}

export class SessionStore {
  private sessions = new Map<string, StaffSession>();
  private persistWarned = false;

  /** persist 는 변경될 때마다 전체 목록(해시)을 저장한다. 실패해도 로그인은 메모리로 계속 동작한다. */
  constructor(private persist: (sessions: StaffSession[]) => Promise<void>) {}

  /** 서버 시작 시 저장소에서 읽은 세션을 불러온다. 만료된 것은 버린다. */
  load(list: unknown, now = Date.now()) {
    this.sessions.clear();
    if (!Array.isArray(list)) return;
    for (const item of list as StaffSession[]) {
      if (!item || typeof item.tokenHash !== "string" || !/^[a-f0-9]{64}$/.test(item.tokenHash)) continue;
      if (typeof item.expiresAt !== "number" || item.expiresAt <= now) continue;
      if (!["admin", "staff", "teacher"].includes(item.role)) continue;
      this.sessions.set(item.tokenHash, { ...item });
    }
  }

  create(data: Omit<StaffSession, "tokenHash" | "createdAt" | "expiresAt">, now = Date.now()): string {
    const token = crypto.randomBytes(32).toString("hex");
    this.sessions.set(hashSessionToken(token), { ...data, tokenHash: hashSessionToken(token), createdAt: now, expiresAt: now + SESSION_TTL_MS });
    this.save(now);
    return token;
  }

  get(token: string | null, now = Date.now()): StaffSession | null {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const session = this.sessions.get(hashSessionToken(token));
    if (!session) return null;
    if (session.expiresAt <= now) {
      this.sessions.delete(session.tokenHash);
      this.save(now);
      return null;
    }
    return session;
  }

  revoke(token: string | null) {
    if (!token) return;
    if (this.sessions.delete(hashSessionToken(token))) this.save();
  }

  /** 계정을 끄거나 지우거나 비밀번호를 바꾸면 그 계정의 세션을 모두 끝낸다. keepToken 세션은 남긴다. */
  revokeAccount(accountId: string, keepToken?: string | null) {
    const keep = keepToken ? hashSessionToken(keepToken) : null;
    let changed = false;
    for (const [hash, session] of this.sessions) {
      if (session.accountId === accountId && hash !== keep) {
        this.sessions.delete(hash);
        changed = true;
      }
    }
    if (changed) this.save();
  }

  /** 계정 이름이 바뀌면 열린 세션의 이름도 맞춘다. */
  renameAccount(accountId: string, name: string, role: StaffRole, schoolId: string | null) {
    let changed = false;
    for (const session of this.sessions.values()) {
      if (session.accountId === accountId) {
        session.name = name;
        session.role = role;
        session.schoolId = schoolId;
        changed = true;
      }
    }
    if (changed) this.save();
  }

  size() {
    return this.sessions.size;
  }

  private save(now = Date.now()) {
    for (const [hash, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(hash);
    }
    const snapshot = [...this.sessions.values()].map((session) => ({ ...session }));
    this.persist(snapshot).catch((err) => {
      if (this.persistWarned) return;
      this.persistWarned = true;
      console.error("[staff] 로그인 세션을 저장하지 못했습니다. 서버가 재시작되면 다시 로그인해야 합니다 (supabase/schema.sql 갱신 필요할 수 있음):", err instanceof Error ? err.message : err);
    });
  }
}

// ---------------------------------------------------------------------------
// 쿠키
// ---------------------------------------------------------------------------

function readCookie(req: express.Request, name: string): string | null {
  const raw = (req.headers.cookie || "").split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return raw || null;
}

export function readSessionToken(req: express.Request): string | null {
  return readCookie(req, SESSION_COOKIE);
}

function cookieSuffix() {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

export function setSessionCookie(res: express.Response, token: string) {
  res.append("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}${cookieSuffix()}`);
}

export function clearSessionCookies(res: express.Response) {
  res.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cookieSuffix()}`);
  res.append("Set-Cookie", `${LEGACY_TEACHER_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cookieSuffix()}`);
}
