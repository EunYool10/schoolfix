#!/usr/bin/env node
/**
 * API 종단 간 테스트 — 빌드한 서버(dist/server.cjs)를 실제로 띄워 HTTP 로 확인한다.
 *
 * 실행: npm run build 뒤
 *   npm run test:e2e              로컬 JSON 저장소
 *   npm run test:e2e:supabase     Supabase 흉내 서버(e2e/mockSupabase.mjs) — 서버 두 대 동시 쓰기까지
 *
 * 외부 서비스(OpenAI·Discord·푸시)는 부르지 않는다. 임시 폴더에 데이터를 만들고 끝나면 지운다.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import webpush from "web-push";
import { startMockSupabase } from "./mockSupabase.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODE = process.argv[2] === "supabase" ? "supabase" : "local";
const SCHOOL = "cem-h";
const OTHER_SCHOOL = "gmgd-e";
// 1x1 PNG
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

let passed = 0;
let failed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) { passed++; console.log(`  ✓ ${name}`); return; }
  failed++;
  failures.push(`${name} ${detail}`);
  console.log(`  ✗ ${name} ${detail}`);
}
const section = (title) => console.log(`\n=== ${title} ===\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(predicate, timeoutMs = 8000, stepMs = 200) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await predicate()) return true;
    await sleep(stepMs);
  }
  return false;
}

// --- 서버 띄우기 -----------------------------------------------------------------

const hashes = {
  master: bcrypt.hashSync("master-pass-1", 10),
  teacher: bcrypt.hashSync("teacher-pass-1", 10),
  reset: bcrypt.hashSync("reset-pass-99", 10),
};
const vapid = webpush.generateVAPIDKeys();
const tempDirs = [];
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schoolfix-e2e-"));
  tempDirs.push(dir);
  return dir;
}

function serverEnv(extra) {
  return {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    NODE_ENV: "production",
    STAFF_PASSWORD_HASH: hashes.master,
    SCHOOL_TEACHER_PASSWORD_HASHES: JSON.stringify({ [SCHOOL]: hashes.teacher }),
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    OPENAI_API_KEY: "",
    NOTIFY_WEBHOOK_URL: "",
    KEEP_AWAKE_HOURS: "off",
    MAINTENANCE_START_DELAY_MS: "300",
    STORE_SYNC_INTERVAL_MS: "400",
    ...extra,
  };
}

async function startServer(extraEnv, label) {
  const port = await freePort();
  const logs = [];
  const child = spawn(process.execPath, ["dist/server.cjs"], { cwd: ROOT, env: { ...serverEnv(extraEnv), PORT: String(port) } });
  child.stdout.on("data", (data) => logs.push(String(data)));
  child.stderr.on("data", (data) => logs.push(String(data)));
  const base = `http://127.0.0.1:${port}`;
  const up = await waitFor(async () => {
    try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; }
  }, 25000, 250);
  if (!up) {
    child.kill();
    throw new Error(`[${label}] 서버가 뜨지 않았습니다.\n${logs.join("")}`);
  }
  return {
    base,
    logs,
    call: client(base),
    stop: () => new Promise((resolve) => { child.once("exit", resolve); child.kill(); }),
  };
}

function client(base) {
  return async function call(method, url, body, cookie) {
    const res = await fetch(base + url, {
      method,
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    const session = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).find((c) => c.startsWith("schoolfix_staff_session=") && c.length > 30);
    return { status: res.status, json, cookie: session, headers: res.headers };
  };
}

/** 테스트 신고. 기기 토큰은 따로 정하지 않으면 매번 새로 만든다(같은 기기로 4건 넘게 보내면 반복 신고로 보류된다). */
const report = (extra = {}) => ({
  schoolId: SCHOOL,
  location: "교실",
  locationId: "general-classroom",
  category: "시설 고장",
  title: "테스트 신고",
  description: "2학년 3반 교실 뒤쪽 형광등이 깜빡거려요.",
  deviceToken: [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join(""),
  ...extra,
});

// --- 시나리오 ---------------------------------------------------------------------

async function mainScenarios(server, storage) {
  const { call } = server;
  const ctx = {};

  section("학생: 접수 · 확인 코드 · 다른 기기에서 불러오기");
  const created = await call("POST", "/api/reports", report());
  check("신고 접수", created.status === 201, JSON.stringify(created.json));
  ctx.r1 = created.json.data.id;
  ctx.owner1 = created.json.ownerToken;
  check("확인 코드 발급", /^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(created.json.recoveryCode ?? ""));
  const wrong = await call("POST", "/api/reports/recover", { schoolId: SCHOOL, reportId: ctx.r1, code: "22222-22222" });
  check("틀린 코드 404", wrong.status === 404);
  const recovered = await call("POST", "/api/reports/recover", { schoolId: SCHOOL, reportId: ctx.r1.toLowerCase(), code: created.json.recoveryCode.toLowerCase() });
  check("확인 코드로 불러오기", recovered.status === 200 && /^[a-f0-9]{64}$/.test(recovered.json.ownerToken ?? ""));
  const mine = await call("POST", "/api/reports/mine", { schoolId: SCHOOL, tokens: [recovered.json.ownerToken] });
  check("새 기기에서 내 신고 조회", mine.json.data?.[0]?.id === ctx.r1);

  const withPhoto = await call("POST", "/api/reports", report({ description: "화장실 세면대 아래로 물이 새서 바닥이 미끄러워요.", photos: [{ dataUrl: PNG, name: "leak.png" }] }));
  check("사진 신고 접수 (검사 키가 없어 공개 보류)", withPhoto.status === 201 && withPhoto.json.heldForReview === true, JSON.stringify(withPhoto.json).slice(0, 200));
  ctx.r2 = withPhoto.json.data.id;
  ctx.owner2 = withPhoto.json.ownerToken;
  ctx.photo2 = withPhoto.json.data.photos?.[0]?.url;
  const third = await call("POST", "/api/reports", report({ description: "3층 복도 끝 창문이 잘 닫히지 않아요." }));
  ctx.r3 = third.json.data.id;
  const fourth = await call("POST", "/api/reports", report({ description: "급식실 입구 바닥 타일이 깨져 있어요.", deviceToken: "e".repeat(64) }));
  ctx.r4 = fourth.json.data.id;
  check("신고 4건 접수번호가 모두 다름", new Set([ctx.r1, ctx.r2, ctx.r3, ctx.r4]).size === 4);

  section("계정 · 총괄");
  const master = await call("POST", "/api/staff/login", { password: "master-pass-1" });
  check("공용 비밀번호 로그인 = 관리자", master.json.isAdmin === true);
  ctx.master = master.cookie;
  const mk = (username, role, extra = {}) => call("POST", "/api/staff/accounts", { username, displayName: `${username} 님`, role, password: `${username}-pass-1`, ...extra }, ctx.master);
  for (const [username, role, extra] of [["boss", "staff"], ["adm2", "admin"], ["ops", "staff"], ["kim.t", "teacher", { schoolId: SCHOOL }], ["lee.t", "teacher", { schoolId: OTHER_SCHOOL }]]) {
    const res = await mk(username, role, extra);
    check(`계정 만들기 ${username}`, res.status === 201, JSON.stringify(res.json));
    ctx[`id_${username}`] = res.json.data?.id;
  }
  const designate = await call("POST", `/api/staff/accounts/${ctx.id_boss}/owner`, undefined, ctx.master);
  check("총괄 지정", designate.status === 200 && designate.json.data.role === "owner");
  check("공용 관리자는 총괄을 끌 수 없음", (await call("PATCH", `/api/staff/accounts/${ctx.id_boss}`, { disabled: true }, ctx.master)).status === 403);
  const login = async (username) => (await call("POST", "/api/staff/login", { username, password: `${username}-pass-1` })).cookie;
  ctx.boss = await login("boss");
  ctx.adm2 = await login("adm2");
  ctx.ops = await login("ops");
  ctx.kim = (await call("POST", "/api/staff/teacher-login", { schoolId: SCHOOL, username: "kim.t", password: "kim.t-pass-1" })).cookie;
  ctx.lee = (await call("POST", "/api/staff/teacher-login", { schoolId: OTHER_SCHOOL, username: "lee.t", password: "lee.t-pass-1" })).cookie;
  check("개인 계정 로그인 5개", [ctx.boss, ctx.adm2, ctx.ops, ctx.kim, ctx.lee].every(Boolean));

  section("검토 · 삭제 기록 · 되살리기 · 영구 삭제");
  const approve = await call("PATCH", `/api/staff/reports/${ctx.r2}/moderation?schoolId=${SCHOOL}`, { action: "approve" }, ctx.master);
  check("공개 보류 신고 승인 (공용 계정도 가능)", approve.status === 200);
  check("승인된 사진은 누구나 열람", (await fetch(server.base + ctx.photo2)).status === 200);
  const masterDelete = await call("DELETE", `/api/staff/reports/${ctx.r1}?schoolId=${SCHOOL}`, { reason: "중복 신고" }, ctx.master);
  check("공용 계정으로는 삭제 불가 (개인 계정만)", masterDelete.status === 403, JSON.stringify(masterDelete.json));
  check("사유 없으면 삭제 불가", (await call("DELETE", `/api/staff/reports/${ctx.r1}?schoolId=${SCHOOL}`, { reason: "" }, ctx.ops)).status === 400);
  check("교사는 삭제 불가", (await call("DELETE", `/api/staff/reports/${ctx.r1}?schoolId=${SCHOOL}`, { reason: "테스트" }, ctx.kim)).status === 401);
  const opsDelete = await call("DELETE", `/api/staff/reports/${ctx.r1}?schoolId=${SCHOOL}`, { reason: "중복 신고 (테스트)" }, ctx.ops);
  check("개인 계정으로 삭제", opsDelete.status === 200, JSON.stringify(opsDelete.json));
  const publicList = await call("GET", `/api/reports?schoolId=${SCHOOL}`);
  check("삭제한 신고는 공개 목록에서 빠짐", !publicList.json.data.some((r) => r.id === ctx.r1));
  check("삭제한 신고는 내 신고에서도 빠짐", (await call("POST", "/api/reports/mine", { schoolId: SCHOOL, tokens: [ctx.owner1] })).json.data.length === 0);
  check("운영진은 삭제된 신고 목록을 못 봄", (await call("GET", `/api/staff/deleted-reports?schoolId=${SCHOOL}`, undefined, ctx.ops)).status === 403);
  let deleted = await call("GET", `/api/staff/deleted-reports?schoolId=${SCHOOL}`, undefined, ctx.adm2);
  const d1 = deleted.json.data?.find((r) => r.id === ctx.r1);
  check("삭제된 신고에 누가·왜 남음", d1?.deletedBy?.name === "ops 님" && d1?.deleteReason === "중복 신고 (테스트)", JSON.stringify(d1));

  const deletePhoto = await call("DELETE", `/api/staff/reports/${ctx.r2}?schoolId=${SCHOOL}`, { reason: "사진 확인용 삭제" }, ctx.ops);
  check("사진 신고 삭제", deletePhoto.status === 200);
  check("삭제한 신고의 사진은 아무도 못 엶", (await fetch(server.base + ctx.photo2)).status === 404 && (await fetch(server.base + ctx.photo2, { headers: { Cookie: ctx.adm2 } })).status === 404);
  deleted = await call("GET", `/api/staff/deleted-reports?schoolId=${SCHOOL}`, undefined, ctx.adm2);
  check("삭제해도 사진은 보관 (되살릴 수 있게)", deleted.json.data.find((r) => r.id === ctx.r2)?.photoCount === 1);
  const restore = await call("POST", `/api/staff/reports/${ctx.r2}/restore?schoolId=${SCHOOL}`, undefined, ctx.adm2);
  check("관리자가 되살림", restore.status === 200);
  check("되살리면 사진도 다시 열림", (await fetch(server.base + ctx.photo2)).status === 200);
  const staffList = await call("GET", `/api/staff/reports?schoolId=${SCHOOL}`, undefined, ctx.ops);
  const r2history = staffList.json.data.find((r) => r.id === ctx.r2)?.history ?? [];
  check("처리 이력에 삭제·되살림이 이름과 함께 남음", r2history.some((h) => h.action === "delete" && h.actorName === "ops 님") && r2history.some((h) => h.action === "restore" && h.actorName === "adm2 님"), JSON.stringify(r2history));
  check("운영진은 되살리기 불가", (await call("POST", `/api/staff/reports/${ctx.r1}/restore?schoolId=${SCHOOL}`, undefined, ctx.ops)).status === 403);
  check("공용 계정은 영구 삭제 불가", (await call("DELETE", `/api/staff/deleted-reports/${ctx.r1}?schoolId=${SCHOOL}`, undefined, ctx.master)).status === 403);
  const purge = await call("DELETE", `/api/staff/deleted-reports/${ctx.r1}?schoolId=${SCHOOL}`, undefined, ctx.adm2);
  check("관리자가 영구 삭제", purge.status === 200);
  check("영구 삭제하면 저장소에서 사라짐", !(await storage.reportIds()).includes(ctx.r1));
  check("되살리지 않은 신고는 영구 삭제 대상 아님", (await call("DELETE", `/api/staff/deleted-reports/${ctx.r3}?schoolId=${SCHOOL}`, undefined, ctx.adm2)).status === 404);
  const spam = await call("POST", `/api/staff/reports/${ctx.r4}/spam?schoolId=${SCHOOL}`, undefined, ctx.ops);
  check("장난 신고 처리 (기기 검토 대상 지정)", spam.status === 200 && spam.json.blocked === true, JSON.stringify(spam.json));
  deleted = await call("GET", `/api/staff/deleted-reports?schoolId=${SCHOOL}`, undefined, ctx.adm2);
  check("장난 신고도 삭제 목록에 사유와 남음", deleted.json.data.find((r) => r.id === ctx.r4)?.deleteReason === "장난 신고로 처리");
  check("삭제된 신고에는 공감 불가", (await call("POST", `/api/reports/${ctx.r4}/me-too`, { schoolId: SCHOOL, deviceToken: "a".repeat(64) })).status === 404);
  check("삭제된 신고에는 추가 설명 불가", (await call("POST", `/api/reports/${ctx.r4}/followups`, { schoolId: SCHOOL, tokens: [fourth.json.ownerToken], text: "삭제된 신고에 설명" })).status === 404);

  const heldAgain = await call("POST", "/api/reports", report({ description: "운동장 철봉 옆 바닥에 유리 조각이 흩어져 있어요.", photos: [{ dataUrl: PNG, name: "glass.png" }] }));
  check("검토 대기 신고 하나 더", heldAgain.json.heldForReview === true);
  check("검토 대기 신고 삭제도 공용 계정은 불가", (await call("PATCH", `/api/staff/reports/${heldAgain.json.data.id}/moderation?schoolId=${SCHOOL}`, { action: "reject" }, ctx.master)).status === 403);
  check("검토 대기 신고 삭제 (개인 계정)", (await call("PATCH", `/api/staff/reports/${heldAgain.json.data.id}/moderation?schoolId=${SCHOOL}`, { action: "reject" }, ctx.ops)).status === 200);
  deleted = await call("GET", `/api/staff/deleted-reports?schoolId=${SCHOOL}`, undefined, ctx.adm2);
  check("검토 후 삭제도 누가 했는지 남음", deleted.json.data.find((r) => r.id === heldAgain.json.data.id)?.deletedBy?.name === "ops 님");
  for (const [label, url] of [["삭제된 신고", `/api/staff/deleted-reports?schoolId=${SCHOOL}`], ["운영 기록", "/api/staff/audit"], ["백업 목록", "/api/staff/backups"], ["계정 목록", "/api/staff/accounts"]]) {
    check(`교사는 ${label} 접근 불가`, (await call("GET", url, undefined, ctx.kim)).status === 401);
  }

  section("학생 추가 설명");
  const noToken = await call("POST", `/api/reports/${ctx.r2}/followups`, { schoolId: SCHOOL, tokens: [], text: "아직 그대로예요." });
  check("주인이 아니면 403", noToken.status === 403);
  check("너무 짧으면 400", (await call("POST", `/api/reports/${ctx.r2}/followups`, { schoolId: SCHOOL, tokens: [ctx.owner2], text: "a" })).status === 400);
  const tooMany = await call("POST", `/api/reports/${ctx.r2}/followups`, { schoolId: SCHOOL, tokens: [ctx.owner2], text: "사진 넷", photos: [1, 2, 3, 4].map((i) => ({ dataUrl: PNG, name: `${i}.png` })) });
  check("사진 3장 넘으면 400", tooMany.status === 400);
  const followup = await call("POST", `/api/reports/${ctx.r2}/followups`, { schoolId: SCHOOL, tokens: [ctx.owner2], text: "답변 고마워요. 아직 물이 새고 있어요.", photos: [{ dataUrl: PNG, name: "still.png" }] });
  check("추가 설명 + 사진", followup.status === 201 && followup.json.data.followups?.[0]?.photoCount === 1, JSON.stringify(followup.json).slice(0, 300));
  const staffView = (await call("GET", `/api/staff/reports?schoolId=${SCHOOL}`, undefined, ctx.ops)).json.data.find((r) => r.id === ctx.r2);
  const fPhoto = staffView?.followups?.[0]?.photos?.[0]?.url;
  check("운영진 화면에 추가 설명이 보임", staffView?.followups?.[0]?.text === "답변 고마워요. 아직 물이 새고 있어요." && Boolean(fPhoto));
  check("추가 설명 사진: 운영진 열람", (await fetch(server.base + fPhoto, { headers: { Cookie: ctx.ops } })).status === 200);
  check("추가 설명 사진: 같은 학교 교사 열람", (await fetch(server.base + fPhoto, { headers: { Cookie: ctx.kim } })).status === 200);
  check("추가 설명 사진: 다른 학교 교사는 못 봄", (await fetch(server.base + fPhoto, { headers: { Cookie: ctx.lee } })).status === 404);
  check("추가 설명 사진: 로그인 안 하면 못 봄", (await fetch(server.base + fPhoto)).status === 404);
  check("공개 신고에는 추가 설명이 안 나옴", !JSON.stringify((await call("GET", `/api/reports/${ctx.r2}?schoolId=${SCHOOL}`)).json).includes("아직 물이 새고"));

  section("운영 기록");
  await sleep(300);
  const audit = await call("GET", "/api/staff/audit?limit=500", undefined, ctx.boss);
  const actions = new Set((audit.json.data ?? []).map((entry) => entry.action));
  for (const action of ["login", "account.create", "owner.designate", "report.approve", "report.delete", "report.restore", "report.purge", "report.spam"]) {
    check(`운영 기록: ${action}`, actions.has(action));
  }
  const deleteEntry = (audit.json.data ?? []).find((entry) => entry.action === "report.delete" && entry.target === ctx.r1);
  check("운영 기록에 삭제한 사람 이름", deleteEntry?.actor?.name === "ops 님");
  const onlyReports = await call("GET", "/api/staff/audit?category=report", undefined, ctx.boss);
  check("분류로 거르기", onlyReports.json.data.length > 0 && onlyReports.json.data.every((entry) => entry.action.startsWith("report.")));
  check("운영진은 운영 기록을 못 봄", (await call("GET", "/api/staff/audit", undefined, ctx.ops)).status === 403);

  section("백업 · 되돌리기");
  const autoReady = await waitFor(async () => ((await call("GET", "/api/staff/backups", undefined, ctx.adm2)).json.data?.auto?.length ?? 0) >= 1, 6000, 300);
  check("오늘 자동 백업이 만들어짐", autoReady);
  const manual = await call("POST", "/api/staff/backups", undefined, ctx.adm2);
  check("지금 백업 만들기", manual.status === 201 && /^manual\//.test(manual.json.data?.name ?? ""), JSON.stringify(manual.json));
  const file = await call("GET", `/api/staff/backups/file?name=${encodeURIComponent(manual.json.data.name)}`, undefined, ctx.adm2);
  check("백업 내려받기", file.status === 200 && file.json.meta?.app === "schoolfix" && file.json.reports.some((r) => r.id === ctx.r3));
  check("백업에 비밀번호 해시 없음", !JSON.stringify(file.json).includes("$2b$") && !JSON.stringify(file.json).includes("$2a$"));
  check("이상한 백업 이름 거부", (await call("GET", "/api/staff/backups/file?name=../../etc/passwd", undefined, ctx.adm2)).status === 400);
  const del3 = await call("DELETE", `/api/staff/reports/${ctx.r3}?schoolId=${SCHOOL}`, { reason: "되돌리기 확인용" }, ctx.ops);
  check("백업 뒤에 신고 하나 삭제", del3.status === 200);
  check("관리자는 되돌리기 불가 (총괄만)", (await call("POST", "/api/staff/restore", { name: manual.json.data.name }, ctx.adm2)).status === 403);
  check("엉뚱한 파일로는 되돌리지 않음", (await call("POST", "/api/staff/restore", { data: { hello: 1 } }, ctx.boss)).status === 400);
  const restored = await call("POST", "/api/staff/restore", { name: manual.json.data.name }, ctx.boss);
  check("총괄이 백업으로 되돌림", restored.status === 200 && /^before-restore\//.test(restored.json.safetyBackup ?? ""), JSON.stringify(restored.json));
  check("되돌리면 삭제했던 신고가 돌아옴", (await call("GET", `/api/reports?schoolId=${SCHOOL}`)).json.data.some((r) => r.id === ctx.r3));
  const lists = (await call("GET", "/api/staff/backups", undefined, ctx.adm2)).json.data;
  check("되돌리기 직전 상태가 따로 남음", lists?.beforeRestore?.some((item) => item.name === restored.json.safetyBackup));
  check("되돌린 뒤에도 계정은 그대로", (await call("GET", "/api/staff/session", undefined, ctx.ops)).json.authenticated === true);

  section("학생 알림 구독");
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/e2e-fake", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
  check("구독 등록", (await call("POST", "/api/push/subscribe", { subscription: sub, tokens: [ctx.owner2] })).json.linked === 1);
  check("구독 해제", (await call("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint })).status === 200);

  // 재시작 뒤 확인할 준비: 사진 신고를 다시 지워 두고(보관 기간 0 으로 재시작하면 사진이 정리된다)
  const deleteAgain = await call("DELETE", `/api/staff/reports/${ctx.r2}?schoolId=${SCHOOL}`, { reason: "사진 정리 확인용" }, ctx.ops);
  check("재시작 전 사진 신고 다시 삭제", deleteAgain.status === 200);
  ctx.photoIds = [ctx.photo2, fPhoto].map((url) => url.replace("/api/photos/", ""));
  check("재시작 전 사진 파일이 저장소에 있음", (await storage.photoExists(ctx.photoIds[0])) && (await storage.photoExists(ctx.photoIds[1])));
  return ctx;
}

async function restartScenarios(server, storage, ctx) {
  const { call } = server;
  section("재시작 뒤: 로그인 유지 · 사진 정리 · 총괄 비상 복구");
  check("운영진 로그인 유지", (await call("GET", "/api/staff/session", undefined, ctx.ops)).json.authenticated === true);
  check("총괄 비상 복구로 총괄의 열린 로그인은 끝남", (await call("GET", "/api/staff/session", undefined, ctx.boss)).json.authenticated === false);
  check("예전 총괄 비밀번호는 거부", (await call("POST", "/api/staff/login", { username: "boss", password: "boss-pass-1" })).status === 401);
  const reset = await call("POST", "/api/staff/login", { username: "boss", password: "reset-pass-99" });
  check("비상 복구 비밀번호로 총괄 로그인", reset.status === 200 && reset.json.isOwner === true, JSON.stringify(reset.json));
  const purged = await waitFor(async () => {
    const list = (await call("GET", `/api/staff/deleted-reports?schoolId=${SCHOOL}`, undefined, ctx.adm2)).json.data ?? [];
    return list.find((r) => r.id === ctx.r2)?.photoCount === 0;
  }, 6000, 300);
  check("보관 기간이 지난 삭제 신고의 사진 정리", purged);
  check("사진 파일도 저장소에서 지워짐", !(await storage.photoExists(ctx.photoIds[0])) && !(await storage.photoExists(ctx.photoIds[1])));
  const audit = await call("GET", "/api/staff/audit?category=account", undefined, reset.cookie);
  check("운영 기록에 비상 복구", audit.json.data.some((entry) => entry.action === "owner.reset" && entry.actor === null));
  const changed = await call("POST", "/api/staff/me/password", { currentPassword: "reset-pass-99", newPassword: "boss-new-pass-1" }, reset.cookie);
  check("총괄이 비밀번호를 새로 바꿈", changed.status === 200);
  return { ...ctx, bossNew: "boss-new-pass-1" };
}

async function secondRestartScenarios(server, ctx) {
  section("두 번째 재시작: 비상 복구는 한 번만");
  const login = await server.call("POST", "/api/staff/login", { username: "boss", password: ctx.bossNew });
  check("같은 비상 복구 설정으로 다시 덮어쓰지 않음 (바꾼 비밀번호 유지)", login.status === 200, JSON.stringify(login.json));
}

async function twoServerScenarios(serverA, serverB, mock) {
  section("Supabase: 서버 두 대가 함께 쓸 때 (배포 중 상황)");
  const before = mock.stats.patchConflicts;
  const [a, b] = await Promise.all([
    serverA.call("POST", "/api/reports", report({ description: "A 서버로 들어온 신고 — 체육관 농구 골대 그물이 찢어졌어요." })),
    serverB.call("POST", "/api/reports", report({ description: "B 서버로 들어온 신고 — 도서관 의자 다리가 흔들려요." })),
  ]);
  check("두 서버 모두 접수 성공", a.status === 201 && b.status === 201, `${a.status} ${b.status}`);
  check("접수번호가 겹치지 않음", a.json.data.id !== b.json.data.id);
  const stored = mock.rows.get("reports").payload.map((r) => r.id);
  check("저장소에 두 신고가 모두 남음 (덮어쓰기 없음)", stored.includes(a.json.data.id) && stored.includes(b.json.data.id));
  check("충돌을 감지하고 다시 시도함", mock.stats.patchConflicts > before, `${mock.stats.patchConflicts} > ${before}`);

  const seen = await waitFor(async () => (await serverB.call("GET", `/api/reports?schoolId=${SCHOOL}`)).json.data.some((r) => r.id === a.json.data.id), 4000, 200);
  check("다른 서버에 들어온 신고가 곧 이쪽 목록에도 보임", seen);

  const login = await serverA.call("POST", "/api/staff/login", { username: "ops", password: "ops-pass-1" });
  const shared = await waitFor(async () => (await serverB.call("GET", "/api/staff/session", undefined, login.cookie)).json.authenticated === true, 4000, 200);
  check("다른 서버에서 한 로그인이 이쪽에서도 통함", shared);

  // A 는 상태를 바꾸고, B 는 같은 신고에 공감한다. B 의 목록이 낡았어도 둘 다 남아야 한다.
  const target = b.json.data.id;
  const statusChange = await serverA.call("PATCH", `/api/staff/reports/${target}?schoolId=${SCHOOL}`, { status: "in_progress", assignee: "시설팀", resolutionNote: "" }, login.cookie);
  const meToo = await serverB.call("POST", `/api/reports/${target}/me-too`, { schoolId: SCHOOL, deviceToken: "f".repeat(64) });
  check("상태 변경과 공감 모두 성공", statusChange.status === 200 && meToo.status === 200, `${statusChange.status} ${meToo.status}`);
  const final = mock.rows.get("reports").payload.find((r) => r.id === target);
  check("두 변경이 모두 저장됨", final?.status === "in_progress" && (final?.meTooHashes?.length ?? 0) === 1, JSON.stringify({ status: final?.status, meToo: final?.meTooHashes?.length }));

  const logout = await serverA.call("POST", "/api/staff/logout", undefined, login.cookie);
  const ended = await waitFor(async () => (await serverB.call("GET", "/api/staff/session", undefined, login.cookie)).json.authenticated === false, 4000, 200);
  check("다른 서버에서 한 로그아웃이 이쪽에도 반영", logout.status === 200 && ended);
}

// --- 실행 ---------------------------------------------------------------------------

/** Supabase 키 제약이 옛날 것(audit_log 없음)일 때 — 운영 기록이 보이고, 고칠 SQL 을 알려 주고, 고치면 밀린 기록이 저장된다. */
async function oldSchemaScenarios() {
  section("옛 Supabase 키 제약 (audit_log 저장 막힘)");
  const allowedKeys = ["reports", "school_applications", "custom_schools", "blocked_reporters", "settings", "staff_accounts", "staff_sessions", "push_subscriptions"];
  const oldMock = await startMockSupabase({ allowedKeys });
  const server = await startServer({ DATA_DIR: tempDir(), SUPABASE_URL: oldMock.url, SUPABASE_SECRET_KEY: "sb_secret_test", REQUIRE_SUPABASE_STORE: "true", AUDIT_RETRY_INTERVAL_MS: "300" }, "옛 키 제약");
  try {
    const { call } = server;
    const login = await call("POST", "/api/staff/login", { password: "master-pass-1" });
    check("옛 키 제약이어도 로그인됨", login.status === 200 && Boolean(login.cookie));
    const failing = await waitFor(async () => (await call("GET", "/api/health")).json.auditLog?.saving === "failing");
    check("상태 확인에 운영 기록 저장 실패 표시", failing);
    const health = (await call("GET", "/api/health")).json;
    check("상태 확인에 SQL 필요 표시", health.auditLog?.needsSchemaUpdate === true && health.auditLog?.unsaved >= 1);
    const audit = await call("GET", "/api/staff/audit", undefined, login.cookie);
    check("저장 못 한 기록도 운영 기록에 보임", audit.json.data?.some((entry) => entry.action === "login"));
    check("운영 기록 화면에 고치는 SQL", audit.json.saveProblem?.needsSchemaUpdate === true && audit.json.saveProblem?.fixSql?.includes("'audit_log'"));
    check("Supabase 에 audit_log 문서 없음 (제약 때문)", !oldMock.rows.has("audit_log"));

    allowedKeys.push("audit_log"); // 관리자가 SQL 을 실행한 상태
    const saved = await waitFor(async () => oldMock.rows.has("audit_log"));
    check("SQL 을 고치면 밀린 기록이 저장됨", saved && oldMock.rows.get("audit_log").payload.some((entry) => entry.action === "login"));
    const after = await call("GET", "/api/staff/audit", undefined, login.cookie);
    check("저장되면 경고가 사라짐", after.json.saveProblem === null && (await call("GET", "/api/health")).json.auditLog?.saving === "ok");
  } catch (err) {
    console.log(server.logs.join(""));
    throw err;
  } finally {
    await server.stop();
    await oldMock.close();
  }
}

async function main() {
  console.log(`\nSchoolFix API 종단 간 테스트 — ${MODE === "supabase" ? "Supabase 흉내 서버" : "로컬 JSON 저장소"}`);
  if (!fs.existsSync(path.join(ROOT, "dist", "server.cjs"))) throw new Error("dist/server.cjs 가 없습니다. 먼저 npm run build 를 실행하세요.");
  let mock = null;
  let storage;
  let env;
  const dataDir = tempDir();
  if (MODE === "supabase") {
    mock = await startMockSupabase();
    env = { DATA_DIR: dataDir, SUPABASE_URL: mock.url, SUPABASE_SECRET_KEY: "sb_secret_test", REQUIRE_SUPABASE_STORE: "true" };
    storage = {
      reportIds: async () => (mock.rows.get("reports")?.payload ?? []).map((r) => r.id),
      photoExists: async (id) => Boolean(mock.buckets.get("report-photos")?.has(id)),
    };
  } else {
    env = { DATA_DIR: dataDir };
    storage = {
      reportIds: async () => JSON.parse(fs.readFileSync(path.join(dataDir, "reports_db.json"), "utf8")).map((r) => r.id),
      photoExists: async (id) => fs.existsSync(path.join(dataDir, "photos", ...id.split("/"))),
    };
  }

  let server = await startServer(env, "1차");
  let ctx;
  try {
    ctx = await mainScenarios(server, storage);
    if (MODE === "supabase") {
      const second = await startServer({ ...env, DATA_DIR: tempDir() }, "2번째 서버");
      try {
        await twoServerScenarios(server, second, mock);
      } finally {
        await second.stop();
      }
    }
  } catch (err) {
    console.log(server.logs.join(""));
    throw err;
  } finally {
    await server.stop();
  }

  const resetEnv = { ...env, DELETED_PHOTO_RETENTION_DAYS: "0", OWNER_RESET_PASSWORD_HASH: hashes.reset };
  server = await startServer(resetEnv, "재시작");
  try {
    ctx = await restartScenarios(server, storage, ctx);
  } catch (err) {
    console.log(server.logs.join(""));
    throw err;
  } finally {
    await server.stop();
  }

  server = await startServer(resetEnv, "두 번째 재시작");
  try {
    await secondRestartScenarios(server, ctx);
  } finally {
    await server.stop();
  }

  if (mock) await mock.close();
  if (MODE === "supabase") await oldSchemaScenarios();
}

main()
  .catch((err) => {
    failed++;
    failures.push(String(err?.stack ?? err));
    console.error(err);
  })
  .finally(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
    console.log(`\n${"=".repeat(60)}`);
    console.log(`통과 ${passed} / 실패 ${failed}`);
    if (failures.length) {
      console.log("\n실패 목록:");
      failures.forEach((f) => console.log(`  - ${f}`));
    }
    console.log("=".repeat(60));
    process.exit(failed > 0 ? 1 : 0);
  });
