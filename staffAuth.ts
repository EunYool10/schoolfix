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

/** 총괄(1명) > 관리자 > 운영진 > 교사 */
export type StaffRole = "owner" | "admin" | "staff" | "teacher";

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
export const ROLE_LABEL: Record<StaffRole, string> = { owner: "총괄", admin: "관리자", staff: "운영진", teacher: "교사" };

/** 계정 관리·백업 같은 관리자 기능을 쓸 수 있는 역할 */
export function isAdminRole(role: StaffRole): boolean {
  return role === "owner" || role === "admin";
}

export function hasOwner(list: Pick<StaffAccount, "role">[]): boolean {
  return list.some((account) => account.role === "owner");
}

/**
 * 계정 권한 규칙
 *  - 총괄 계정은 다른 누구도(공용 비밀번호 관리자 포함) 바꾸거나 끄거나 지울 수 없다.
 *    총괄 본인은 '내 비밀번호'로 비밀번호만 바꾸고, 자리는 다른 사람에게 넘기는 방식으로만 내려놓는다.
 *  - 총괄이 있으면 관리자 계정을 다루는 일은 총괄만 한다.
 *  - 총괄이 아직 없으면 예전처럼 관리자가 모든 계정을 다룬다.
 */
export function canManageAccount(actorRole: StaffRole, target: Pick<StaffAccount, "role">, ownerExists: boolean): boolean {
  if (!isAdminRole(actorRole) || target.role === "owner") return false;
  if (target.role === "admin") return actorRole === "owner" || !ownerExists;
  return true;
}

/** 새 계정을 만들거나 역할을 바꿀 때 줄 수 있는 역할. 총괄은 지정·넘기기로만 정한다. */
export function assignableRoles(actorRole: StaffRole, ownerExists: boolean): StaffRole[] {
  if (actorRole === "owner" || (actorRole === "admin" && !ownerExists)) return ["admin", "staff", "teacher"];
  if (actorRole === "admin") return ["staff", "teacher"];
  return [];
}

/** 총괄 지정·넘기기 — 총괄이 없으면 관리자 누구나 처음 한 번 지정하고, 있으면 지금 총괄 본인만 넘긴다. */
export function canAssignOwner(actor: Pick<StaffSession, "role" | "accountId">, currentOwnerId: string | null): boolean {
  if (!currentOwnerId) return isAdminRole(actor.role);
  return actor.role === "owner" && actor.accountId === currentOwnerId;
}

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

function validSessions(list: unknown, now: number): StaffSession[] {
  if (!Array.isArray(list)) return [];
  return (list as StaffSession[]).filter((item) =>
    Boolean(item)
    && typeof item.tokenHash === "string" && /^[a-f0-9]{64}$/.test(item.tokenHash)
    && typeof item.expiresAt === "number" && item.expiresAt > now
    && ["owner", "admin", "staff", "teacher"].includes(item.role));
}

export class SessionStore {
  private sessions = new Map<string, StaffSession>();
  /** 저장소에 마지막으로 있던 세션들. 다른 서버에서 끝낸 세션을 알아보는 데 쓴다. */
  private persisted = new Set<string>();
  /** 여기서 끝낸 세션(만료 시각까지 기억). 다른 서버의 옛 목록을 합칠 때 되살리지 않는다. */
  private revoked = new Map<string, number>();
  private persistWarned = false;

  /**
   * persist 는 세션이 바뀔 때마다 불린다. 저장할 목록은 snapshot() 으로 다시 얻을 수 있다.
   * 실패해도 로그인은 메모리로 계속 동작한다.
   */
  constructor(private persist: (sessions: StaffSession[]) => Promise<void>) {}

  /** 서버 시작 시 저장소에서 읽은 세션을 불러온다. 만료된 것은 버린다. */
  load(list: unknown, now = Date.now()) {
    this.sessions.clear();
    for (const item of validSessions(list, now)) this.sessions.set(item.tokenHash, { ...item });
    this.persisted = new Set(this.sessions.keys());
  }

  /**
   * 다른 서버가 저장한 목록과 합친다 (세 방향 비교).
   *  - 저장소에 있다가 사라진 세션 → 다른 서버에서 로그아웃·계정 중지된 것이므로 여기서도 끝낸다.
   *  - 저장소에 새로 생긴 세션 → 다른 서버에서 로그인한 것이므로 받아들인다(여기서 끝낸 것은 제외).
   *  - 여기서 새로 만들고 아직 저장하지 못한 세션은 그대로 둔다.
   */
  syncFromRemote(list: unknown, now = Date.now()) {
    const remote = validSessions(list, now);
    const remoteHashes = new Set(remote.map((session) => session.tokenHash));
    for (const hash of [...this.sessions.keys()]) {
      if (this.persisted.has(hash) && !remoteHashes.has(hash)) this.sessions.delete(hash);
    }
    for (const session of remote) {
      if (!this.sessions.has(session.tokenHash) && !this.revoked.has(session.tokenHash)) this.sessions.set(session.tokenHash, { ...session });
    }
    this.persisted = remoteHashes;
  }

  /** 지금 저장할 목록 (만료된 것 제외) */
  snapshot(now = Date.now()): StaffSession[] {
    return [...this.sessions.values()].filter((session) => session.expiresAt > now).map((session) => ({ ...session }));
  }

  /** 저장에 성공한 목록을 기억한다. */
  markPersisted(sessions: StaffSession[]) {
    this.persisted = new Set(sessions.map((session) => session.tokenHash));
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
      this.end(session.tokenHash);
      this.save(now);
      return null;
    }
    return session;
  }

  revoke(token: string | null) {
    if (!token) return;
    if (this.end(hashSessionToken(token))) this.save();
  }

  /** 계정을 끄거나 지우거나 비밀번호를 바꾸면 그 계정의 세션을 모두 끝낸다. keepToken 세션은 남긴다. */
  revokeAccount(accountId: string, keepToken?: string | null) {
    const keep = keepToken ? hashSessionToken(keepToken) : null;
    let changed = false;
    for (const [hash, session] of [...this.sessions]) {
      if (session.accountId === accountId && hash !== keep) changed = this.end(hash) || changed;
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

  private end(hash: string): boolean {
    const session = this.sessions.get(hash);
    if (!session) return false;
    this.sessions.delete(hash);
    this.revoked.set(hash, session.expiresAt);
    return true;
  }

  private save(now = Date.now()) {
    for (const [hash, session] of [...this.sessions]) {
      if (session.expiresAt <= now) this.end(hash);
    }
    for (const [hash, expiresAt] of [...this.revoked]) {
      if (expiresAt <= now) this.revoked.delete(hash);
    }
    this.persist(this.snapshot(now)).catch((err) => {
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
