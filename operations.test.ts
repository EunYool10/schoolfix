/**
 * 운영 기능 검증 — 실행: npm run test:ops
 *
 *  1) 처리 기한(SLA) 계산
 *  2) 월별 통계 (한국 시간 월 경계, 평균 처리 시간)
 *  3) 긴급 신고 알림 (기준 위험도, 웹훅 형식)
 *  4) 반복 신고자 걸러내기
 *  5)~7) 만족도 재응답, 비슷한 신고, 내 신고 새 소식
 *  8) 확인 코드로 내 신고 불러오기
 *  9) 학생 알림 (Web Push) — 구독 주소 검증, 묶기, 문구
 * 10) 운영진 개인 계정 규칙과 로그인 세션 (해시 저장, 재시작 후 유지, 강제 종료)
 * 11) 총괄 — 모든 계정 위의 1인자 (지정·넘기기, 아무도 못 건드림), 다른 서버와 세션 합치기
 * 12) 서버 여러 대 저장 충돌 — 버전 확인과 재시도
 * 13) 백업 보관 — 이름 규칙, 보관 개수, 로컬 보관소
 * 14) 첫 접속 지연 줄이기 — 깨어 있을 시간
 * 15) 운영 기록
 */

import { computeSla, slaLabel } from "./src/utils/sla";
import { buildMonthlyReport, monthKey, monthlyTrend, shiftMonth } from "./src/utils/monthlyStats";
import { attachmentToFile, buildNewReportPayload, buildNewReportText, type NewReportNotice } from "./notify";
import { buildApplicationEmbed, buildMonthlyEmbed, buildNewReportEmbed, EMBED_COLORS, escapeMarkdown, type DiscordEmbed } from "./notify";
import { buildApplicationText, buildMonthlyText, buildNotificationText, buildTextPayload, buildWebhookPayload, shouldNotify, webhookChannel, type UrgentNotice } from "./notify";
import { ABUSE_RULES, activeBlock, evaluateReporter, type BlockedReporter } from "./abuseGuard";
import { feedbackPending } from "./src/utils/feedback";
import { decodePhotoDataUrl, newPhotoId, PHOTO_ID_PATTERN, PHOTO_RULES, PhotoCache } from "./photoStore";
import { findSimilarReports } from "./src/utils/similarReports";
import { changesSince, snapshotOf } from "./src/utils/reportUpdates";
import { hashRecoveryCode, issueRecoveryCode, normalizeRecoveryCode, ownerTokenHashes, RECOVERY_CODE_ALPHABET, safeHashEqual } from "./serverSecurity";
import { buildReportPush, isAllowedPushEndpoint, parseSubscription, recipientsFor, upsertPushRecord } from "./pushNotify";
import { hashSessionToken, MASTER_USERNAME, passwordError, publicAccount, SessionStore, usernameError, type StaffAccount, type StaffSession } from "./staffAuth";
import { assignableRoles, canAssignOwner, canManageAccount, hasOwner, isAdminRole } from "./staffAuth";
import { createDocLocks, nextStoreVersion, StoreConflictError } from "./storeSync";
import { BACKUP_NAME_PATTERN, backupName, expiredBackups, kstDate, localBackupStore } from "./backupStore";
import { keepAwakeUrl, parseKeepAwakeHours, withinKeepAwake } from "./keepAwake";
import { appendAudit, auditCategory, newAuditEntry } from "./auditLog";
import fs from "fs";
import os from "os";
import path from "path";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name} ${detail}`);
    console.log(`  ✗ ${name} ${detail}`);
  }
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

console.log("\n=== 1) 처리 기한 ===\n");
{
  const created = "2026-10-01T00:00:00.000Z";
  const now = Date.parse(created);

  const urgent = computeSla({ riskLevel: "긴급", status: "pending", createdAt: created }, now + 12 * HOUR);
  check("긴급은 1일 기한, 12시간 경과 시 D-1", !urgent.overdue && urgent.daysLeft === 1 && slaLabel(urgent) === "D-1", JSON.stringify(urgent));

  const late = computeSla({ riskLevel: "긴급", status: "reviewing", createdAt: created }, now + DAY + 2 * HOUR);
  check("긴급 기한 2시간 초과 → 1일 초과", late.overdue && late.overdueDays === 1 && slaLabel(late) === "기한 1일 초과", JSON.stringify(late));

  const veryLate = computeSla({ riskLevel: "높음", status: "assigned", createdAt: created }, now + 4.5 * DAY);
  check("높음(3일) 4.5일 경과 → 2일 초과", veryLate.overdue && veryLate.overdueDays === 2, JSON.stringify(veryLate));

  const unanalyzed = computeSla({ riskLevel: null, status: "pending", createdAt: created }, now);
  check("분석 전 신고는 기본 7일", unanalyzed.dueAt === new Date(now + 7 * DAY).toISOString());

  const doneOnTime = computeSla({ riskLevel: "중간", status: "completed", createdAt: created, completedAt: new Date(now + 2 * DAY).toISOString() }, now + 30 * DAY);
  check("완료 건은 기한 초과로 표시하지 않음", !doneOnTime.overdue && doneOnTime.completedLate === false && slaLabel(doneOnTime) === "기한 내 완료");

  const doneLate = computeSla({ riskLevel: "긴급", status: "completed", createdAt: created, completedAt: new Date(now + 3 * DAY).toISOString() });
  check("기한을 넘겨 완료한 건 표시", doneLate.completedLate === true && slaLabel(doneLate) === "기한 넘겨 완료");
}

console.log("\n=== 2) 월별 통계 ===\n");
{
  check("월 경계는 한국 시간 — UTC 9/30 16:00 은 KST 10월", monthKey("2026-09-30T16:00:00Z") === "2026-10");
  check("UTC 9/30 14:59 는 KST 9월", monthKey("2026-09-30T14:59:00Z") === "2026-09");
  check("잘못된 날짜는 null", monthKey("not a date") === null);
  check("월 이동: 2026-01 에서 -1 → 2025-12", shiftMonth("2026-01", -1) === "2025-12");
  check("월 이동: 2026-11 에서 +3 → 2027-02", shiftMonth("2026-11", 3) === "2027-02");

  const reports = [
    { createdAt: "2026-10-02T01:00:00Z", completedAt: "2026-10-02T13:00:00Z", status: "completed", category: "시설 고장", location: "화장실", riskLevel: "중간" },
    { createdAt: "2026-10-05T01:00:00Z", completedAt: "2026-10-07T01:00:00Z", status: "completed", category: "시설 고장", location: "복도", riskLevel: "긴급" },
    { createdAt: "2026-10-09T01:00:00Z", completedAt: null, status: "reviewing", category: "안전 위험", location: "화장실", riskLevel: null },
    { createdAt: "2026-09-28T01:00:00Z", completedAt: "2026-10-01T01:00:00Z", status: "completed", category: "위생 문제", location: "급식실", riskLevel: "낮음" },
  ];
  const october = buildMonthlyReport(reports, "2026-10");
  check("10월 접수 3건", october.received === 3, String(october.received));
  check("10월 접수분 완료율 67%", october.completionRate === 67, String(october.completionRate));
  check("10월에 완료된 신고 3건 (9월 접수분 포함)", october.completedInMonth === 3, String(october.completedInMonth));
  // 12시간 + 48시간 + 72시간 = 132 / 3 = 44
  check("평균 처리 시간 44시간", october.avgResolutionHours === 44, String(october.avgResolutionHours));
  check("긴급 건 2일 만에 완료 → 기한 초과 완료 1건", october.completedLate === 1, String(october.completedLate));
  check("유형별 1위는 시설 고장 2건", october.byCategory[0]?.[0] === "시설 고장" && october.byCategory[0]?.[1] === 2);
  check("위험도 없는 신고는 미분석으로 집계", october.byRisk.some(([k, v]) => k === "미분석" && v === 1));

  const empty = buildMonthlyReport(reports, "2026-03");
  check("접수가 없는 달은 완료율·평균 시간 null", empty.completionRate === null && empty.avgResolutionHours === null && empty.received === 0);

  const trend = monthlyTrend(reports, 3, Date.parse("2026-10-15T00:00:00Z"));
  check("추이는 오래된 달부터 3개월", trend.map((p) => p.month).join(",") === "2026-08,2026-09,2026-10");
  check("9월 접수 1건, 10월 완료 3건", trend[1].received === 1 && trend[2].completed === 3);
}

console.log("\n=== 3) 긴급 신고 알림 ===\n");
{
  check("기준 미지정이면 긴급만", shouldNotify("긴급", undefined) && !shouldNotify("높음", undefined));
  check("기준 '높음'이면 높음·긴급", shouldNotify("높음", "높음") && shouldNotify("긴급", "높음") && !shouldNotify("중간", "높음"));
  check("잘못된 기준값은 긴급만", shouldNotify("긴급", "아무거나") && !shouldNotify("높음", "아무거나"));
  check("위험도 없으면 보내지 않음", !shouldNotify(null, "낮음"));

  const notice: UrgentNotice = {
    schoolName: "테스트고",
    reportId: "REP-20261010-0001",
    title: "콘센트 연기",
    location: "교실 · 본관 2층",
    category: "안전 위험",
    riskLevel: "긴급",
    riskScore: 88,
    description: "콘센트에서 연기가 나요 @everyone ".repeat(20),
    held: true,
    link: "https://schoolfix.example",
  };
  const text = buildNotificationText(notice);
  check("본문에 학교·위험도·접수번호", text.includes("테스트고") && text.includes("[긴급 88점]") && text.includes("REP-20261010-0001"));
  check("긴 내용은 200자로 자름", text.includes("…"));
  check("공개 보류 안내 포함", text.includes("공개 보류"));

  const discord = buildWebhookPayload("https://discord.com/api/webhooks/1/abc", notice);
  check("Discord 형식은 content + 멘션 차단", typeof discord.content === "string" && JSON.stringify(discord.allowed_mentions) === '{"parse":[]}');
  const slack = buildWebhookPayload("https://hooks.slack.com/services/x", notice);
  check("Slack 형식은 text", typeof slack.text === "string" && !("content" in slack));
  const generic = buildWebhookPayload("https://hook.example.com/abc", notice);
  check("일반 웹훅은 text·content·report", "text" in generic && "content" in generic && "report" in generic);
}

console.log("\n=== 3-2) 학교 신청·월간 보고 알림 ===\n");
{
  check("Discord 웹훅 인식", webhookChannel("https://discord.com/api/webhooks/1/abc") === "discord");
  check("Slack 웹훅 인식", webhookChannel("https://hooks.slack.com/services/x") === "slack");
  check("HTTP 주소는 거부", webhookChannel("http://discord.com/api/webhooks/1/abc") === null);
  check("빈 값은 null", webhookChannel(undefined) === null && webhookChannel("not a url") === null);
  const long = buildTextPayload("https://discord.com/api/webhooks/1/abc", "가".repeat(3000));
  check("Discord 본문은 2000자 제한 안으로 자름", String(long.content).length <= 1900);

  const application = buildApplicationText({
    schoolName: "새학교고등학교",
    address: "경기도 광명시",
    website: "https://new-h.goegm.kr",
    reason: "우리 학교도 쓰고 싶어요",
    hasReplyEmail: true,
    link: "https://schoolfix.example",
  });
  check("학교 신청 알림에 학교·주소·사유", application.includes("새학교고등학교") && application.includes("경기도 광명시") && application.includes("우리 학교도"));
  check("회신 이메일 주소는 싣지 않고 유무만", application.includes("회신 이메일: 있음") && !application.includes("@"));

  const monthly = buildMonthlyText("2026-09", [
    { schoolName: "가학교", received: 12, completedInMonth: 9, completionRate: 75, avgResolutionHours: 30, completedLate: 1, overdueOpen: 2, topCategory: "시설 고장", topLocation: "화장실" },
  ], "https://schoolfix.example");
  check("월간 보고에 월·학교·수치", monthly.includes("2026년 9월") && monthly.includes("가학교") && monthly.includes("접수 12건") && monthly.includes("완료율 75%"));
  check("평균 처리 30시간 → 1.3일", monthly.includes("평균 처리 1.3일"));
  check("신고가 없는 달 안내", buildMonthlyText("2026-08", [], null).includes("신고가 없습니다"));
  const many = buildMonthlyText("2026-09", Array.from({ length: 60 }, (_, i) => ({ schoolName: `학교${i}`, received: 1, completedInMonth: 0, completionRate: 0, avgResolutionHours: null, completedLate: 0, overdueOpen: 0, topCategory: null, topLocation: null })), null);
  check("학교가 많아도 1900자 안으로 줄임", many.length <= 1900 && many.includes("일부 생략"));
}

console.log("\n=== 3-3) 모든 신고 알림 · 보류 신고 사진 첨부 ===\n");
{
  // 1x1 투명 PNG
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const base: NewReportNotice = {
    schoolName: "테스트고", reportId: "REP-20261010-0007", title: "복도 전등", location: "복도 · 본관 2층",
    category: "시설 고장", riskLevel: "중간", riskScore: 40, description: "가".repeat(2000),
    held: false, heldReason: null, attachments: [{ dataUrl: png, name: "사진.png", size: 68 }], link: null,
  };
  const discordUrl = "https://discord.com/api/webhooks/1/abc";

  const normal = buildNewReportText(base, 0);
  check("일반 신고는 🆕 + 위험도 + 접수번호", normal.startsWith("🆕 새 신고 [중간 40점] 테스트고") && normal.includes("REP-20261010-0007"));
  check("일반 신고 내용은 300자로 요약", normal.includes("…") && !normal.includes("가".repeat(301)));
  check("긴급 신고는 🚨", buildNewReportText({ ...base, riskLevel: "긴급", riskScore: 90 }, 0).startsWith("🚨"));
  check("분석 전 신고 표시", buildNewReportText({ ...base, riskLevel: null, riskScore: null }, 0).includes("[분석 전]"));
  const normalPayload = buildNewReportPayload(discordUrl, base);
  check("일반 신고는 사진 없이 텍스트로", !(normalPayload instanceof FormData) && typeof (normalPayload as Record<string, unknown>).content === "string");

  const held = { ...base, held: true, heldReason: "부적절한 표현 자동 감지" };
  const heldText = buildNewReportText(held, 1);
  check("보류 신고는 ⏸️ + 보류 사유 + 검토 안내", heldText.startsWith("⏸️ 공개 보류 신고") && heldText.includes("보류 사유: 부적절한 표현 자동 감지") && heldText.includes("승인하거나 삭제"));
  check("보류 신고 내용은 1200자까지", heldText.includes("가".repeat(1200)) && !heldText.includes("가".repeat(1201)));
  const heldPayload = buildNewReportPayload(discordUrl, held);
  check("Discord 보류 신고는 사진을 multipart 로 첨부", heldPayload instanceof FormData && (heldPayload as FormData).has("files[0]") && (heldPayload as FormData).has("payload_json"));
  const payloadJson = heldPayload instanceof FormData ? JSON.parse(String(heldPayload.get("payload_json"))) : {};
  check("첨부 메시지에도 멘션 차단·파일명은 접수번호", JSON.stringify(payloadJson.allowed_mentions) === '{"parse":[]}' && payloadJson.attachments?.[0]?.filename === "REP-20261010-0007.png", payloadJson);
  check("Slack 은 사진 없이 '운영진 화면에서 확인' 안내", String((buildNewReportPayload("https://hooks.slack.com/services/x", held) as Record<string, unknown>).text).includes("운영진 화면에서 확인"));

  check("PNG 데이터 → 파일 변환", attachmentToFile(base.attachments[0], "REP-1")?.blob.type === "image/png");
  check("이미지가 아닌 data URL 은 거부", attachmentToFile({ dataUrl: "data:text/html;base64,PGgxPg==", name: null, size: null }, "REP-1") === null);
  const huge = "data:image/jpeg;base64," + "A".repeat(13 * 1024 * 1024);
  check("9MB 를 넘는 사진은 첨부하지 않음", attachmentToFile({ dataUrl: huge, name: null, size: null }, "REP-1") === null);
  check("너무 큰 사진은 텍스트로만 + 화면 확인 안내", !(buildNewReportPayload(discordUrl, { ...held, attachments: [{ dataUrl: huge, name: "큰사진.jpg", size: 9_900_000 }] }) instanceof FormData));

  // 사진 여러 장
  const three = { ...held, attachments: [1, 2, 3].map((i) => ({ dataUrl: png, name: `p${i}.png`, size: 68 })) };
  const multi = buildNewReportPayload(discordUrl, three) as FormData;
  const multiJson = JSON.parse(String(multi.get("payload_json")));
  check("보류 사진 3장은 모두 파일로 첨부", multi.has("files[0]") && multi.has("files[1]") && multi.has("files[2]") && multiJson.attachments.length === 3);
  check("두 번째 사진부터 파일명에 번호", multiJson.attachments[1].filename === "REP-20261010-0007-2.png", multiJson.attachments);
  check("여러 장 안내 문구", buildNewReportText(three, 3).includes("사진 3장") && buildNewReportText(three, 3).includes("아래 사진"));
  check("일부만 실린 경우 나머지 안내", buildNewReportText(three, 1).includes("아래 1장, 나머지는 운영진 화면에서 확인"));
  const many = { ...held, attachments: Array.from({ length: 12 }, () => ({ dataUrl: png, name: null, size: 68 })) };
  check("Discord 파일은 10개까지만", JSON.parse(String((buildNewReportPayload(discordUrl, many) as FormData).get("payload_json"))).attachments.length === 10);
}

console.log("\n=== 3-5) 사진 저장소 ===\n");
{
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const ok = decodePhotoDataUrl(png);
  check("PNG data URL 해독 + 실제 형식 확인", ok.ok && ok.type === "image/png");
  check("이미지 형식이 아니면 거부", !decodePhotoDataUrl("data:text/html;base64,PGgxPg==").ok);
  check("확장자만 이미지인 가짜 파일은 거부", !decodePhotoDataUrl("data:image/png;base64," + Buffer.from("<script>alert(1)</script>").toString("base64")).ok);
  check("5MB 넘는 사진은 거부", !decodePhotoDataUrl("data:image/jpeg;base64," + Buffer.alloc(PHOTO_RULES.maxBytes + 10, 0xff).toString("base64")).ok);
  const id = newPhotoId("image/jpeg", new Date("2026-10-10T00:00:00Z"));
  check("사진 id 형식 (월/무작위.jpg)", PHOTO_ID_PATTERN.test(id) && id.startsWith("202610/"), id);
  check("경로 이동 id 는 거부", !PHOTO_ID_PATTERN.test("202610/../../etc/passwd") && !PHOTO_ID_PATTERN.test("202610/abc.jpg"));
  const cache = new PhotoCache(1000);
  cache.set("a", Buffer.alloc(200)); cache.set("b", Buffer.alloc(200)); cache.get("a");
  cache.set("c", Buffer.alloc(200)); cache.set("d", Buffer.alloc(200)); cache.set("e", Buffer.alloc(200)); cache.set("f", Buffer.alloc(200));
  check("사진 캐시는 용량을 넘으면 오래 안 쓴 것부터 버림", cache.get("b") === undefined && cache.get("a") !== undefined);
}

console.log("\n=== 3-4) 디스코드 카드 꾸미기 ===\n");
{
  const notice: NewReportNotice = {
    schoolName: "테스트고", reportId: "REP-20261010-0010", title: "복도 **전등** 깜빡임", location: "복도 · 본관 2층",
    category: "시설 고장", riskLevel: "긴급", riskScore: 88, description: "[여기를 눌러요](https://evil.example) 전등이 깜빡여요 @everyone",
    held: false, heldReason: null, attachments: [], link: "https://schoolfix.example",
  };
  const urgent = buildNewReportEmbed(notice, null);
  check("긴급 신고 카드는 빨간 띠 + 🚨 제목", urgent.color === EMBED_COLORS.긴급 && urgent.title === "🚨 긴급 신고");
  check("카드에 학교·위치·분류·위험도·접수번호 칸", urgent.author?.name.includes("테스트고") === true && ["📍 위치", "🏷️ 분류", "⚠️ 위험도", "🔖 접수번호"].every((n) => urgent.fields?.some((f) => f.name === n)));
  check("위험도 칸은 아이콘·점수까지", urgent.fields?.find((f) => f.name === "⚠️ 위험도")?.value === "🔴 긴급 · 88점");
  check("제목 클릭 시 사이트로 이동", urgent.url === "https://schoolfix.example");
  check("사용자 글의 숨은 링크·굵게 표시는 무력화", (urgent.description ?? "").includes("\\[여기를 눌러요\\]\\(https") && (urgent.description ?? "").includes("\\*\\*전등\\*\\*"), urgent.description);
  check("마크다운 이스케이프", escapeMarkdown("a*b_c`d") === "a\\*b\\_c\\`d");

  const colorOf = (level: string | null) => buildNewReportEmbed({ ...notice, riskLevel: level, riskScore: null }, null).color;
  check("위험도별 색: 높음 주황 · 중간 노랑 · 낮음 회색 · 분석 전 연회색", colorOf("높음") === EMBED_COLORS.높음 && colorOf("중간") === EMBED_COLORS.중간 && colorOf("낮음") === EMBED_COLORS.낮음 && colorOf(null) === EMBED_COLORS.unanalyzed);

  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const held: NewReportNotice = { ...notice, riskLevel: null, riskScore: null, held: true, heldReason: "이미지 안전성 검사 실패", attachments: [{ dataUrl: png, name: "photo.png", size: 68 }] };
  const heldPayload = buildNewReportPayload("https://discord.com/api/webhooks/1/abc", held);
  const heldJson = heldPayload instanceof FormData ? JSON.parse(String(heldPayload.get("payload_json"))) : {};
  const heldEmbed: DiscordEmbed = heldJson.embeds?.[0] ?? {};
  check("보류 카드는 황색 띠 + 보류 사유 칸이 맨 위", heldEmbed.color === EMBED_COLORS.held && heldEmbed.fields?.[0]?.name === "🛑 보류 사유");
  check("보류 사진은 카드 안에 크게 (attachment://)", heldEmbed.image?.url === "attachment://REP-20261010-0010.png", JSON.stringify(heldEmbed.image));
  check("푸시 미리보기 한 줄 + 멘션 차단", heldJson.content === "⏸️ 공개 보류 신고 · 테스트고" && JSON.stringify(heldJson.allowed_mentions) === '{"parse":[]}');

  const app = buildApplicationEmbed({ schoolName: "새학교", address: "광명", website: "https://new.example/path", reason: "신청", hasReplyEmail: false, link: null });
  check("학교 신청 카드는 파란 띠 + 홈페이지는 링크 미리보기 없는 주소", app.color === EMBED_COLORS.application && app.fields?.find((f) => f.name === "🌐 홈페이지")?.value === "<https://new.example/path>");

  const monthly = buildMonthlyEmbed("2026-09", [
    { schoolName: "가학교", received: 12, completedInMonth: 9, completionRate: 75, avgResolutionHours: 30, completedLate: 1, overdueOpen: 2, topCategory: "시설 고장", topLocation: "화장실" },
    { schoolName: "나학교", received: 3, completedInMonth: 1, completionRate: 33, avgResolutionHours: 5, completedLate: 0, overdueOpen: 0, topCategory: null, topLocation: null },
  ], null);
  check("월간 보고 카드는 초록 띠 + 전체 합계", monthly.color === EMBED_COLORS.monthly && (monthly.description ?? "").includes("접수 **15건**") && (monthly.description ?? "").includes("처리 완료 **10건**"), monthly.description);
  check("학교마다 칸 하나", monthly.fields?.length === 2 && monthly.fields[0].name === "🏫 가학교");
  const many = buildMonthlyEmbed("2026-09", Array.from({ length: 30 }, (_, i) => ({ schoolName: `학교${i}`, received: 1, completedInMonth: 0, completionRate: 0, avgResolutionHours: null, completedLate: 0, overdueOpen: 0, topCategory: null, topLocation: null })), null);
  check("칸은 25개까지, 나머지는 '외 N개 학교'", many.fields?.length === 25 && (many.fields?.[24].value ?? "").includes("외 6개 학교"));
}

console.log("\n=== 4) 반복 신고자 걸러내기 ===\n");
{
  const now = Date.parse("2026-10-10T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  check("기기 정보가 없으면 판단하지 않음", !evaluateReporter(null, [ago(1000), ago(2000), ago(3000)], [], now).hold);
  check("10분 안에 2건 뒤 3번째는 통과", !evaluateReporter("h", [ago(60_000), ago(120_000)], [], now).hold);
  check(`10분 안에 ${ABUSE_RULES.burstMax}건 뒤에는 보류`, evaluateReporter("h", [ago(60_000), ago(120_000), ago(180_000)], [], now).hold);
  check("11분 전 신고는 연속 신고로 세지 않음", !evaluateReporter("h", [ago(11 * 60_000), ago(12 * 60_000), ago(13 * 60_000)], [], now).hold);

  const daily = Array.from({ length: ABUSE_RULES.dailyMax }, (_, i) => ago((i + 1) * HOUR));
  check(`하루 ${ABUSE_RULES.dailyMax}건을 넘기면 보류`, evaluateReporter("h", daily, [], now).hold);

  const blocked: BlockedReporter[] = [
    { hash: "bad", until: new Date(now + DAY).toISOString(), reason: "x", reportId: null, createdAt: ago(DAY) },
    { hash: "old", until: new Date(now - 1).toISOString(), reason: "x", reportId: null, createdAt: ago(40 * DAY) },
  ];
  check("장난 신고로 처리된 기기는 보류", evaluateReporter("bad", [], blocked, now).hold);
  check("보류 기간이 지난 기기는 통과", !evaluateReporter("old", [], blocked, now).hold && activeBlock("old", blocked, now) === null);
}

console.log("\n=== 5) 만족도 재응답 ===\n");
{
  check("미완료 신고는 묻지 않음", !feedbackPending({ status: "reviewing", completedAt: null, feedback: null }));
  check("완료 후 응답 전이면 물음", feedbackPending({ status: "completed", completedAt: "2026-10-01T00:00:00Z", feedback: null }));
  check("이번 완료에 응답했으면 묻지 않음", !feedbackPending({ status: "completed", completedAt: "2026-10-01T00:00:00Z", feedback: { at: "2026-10-02T00:00:00Z" } }));
  check("'아직 그대로예요' 뒤 다시 완료되면 다시 물음", feedbackPending({ status: "completed", completedAt: "2026-10-05T00:00:00Z", feedback: { at: "2026-10-02T00:00:00Z" } }));
}

console.log("\n=== 6) 비슷한 신고 찾기 ===\n");
{
  const base = { status: "pending", moderationStatus: "approved", location: "화장실", locationType: "화장실", category: "시설 고장", createdAt: "2026-10-01T00:00:00Z" };
  const reports = [
    { ...base, id: "same-place", locationId: "wc-3f", locationDetail: "본관 3층 남자 화장실" },
    { ...base, id: "same-category", locationDetail: "별관 1층" },
    { ...base, id: "other-category", category: "위생 문제", locationDetail: "체육관 옆" },
    { ...base, id: "done", status: "completed", locationId: "wc-3f" },
    { ...base, id: "held", moderationStatus: "held", locationId: "wc-3f" },
    { ...base, id: "other-type", location: "복도", locationType: "복도", locationId: "wc-3f" },
    { ...base, id: "popular", locationDetail: "별관 1층", meTooCount: 9 },
  ];
  const found = findSimilarReports({ locationType: "화장실", locationId: "wc-3f", category: "시설 고장", placeText: "본관 3층" }, reports).map((r) => r.id);
  check("같은 세부 장소가 맨 앞", found[0] === "same-place", found.join());
  check("처리 완료·공개 보류·다른 위치 유형은 제외", !found.includes("done") && !found.includes("held") && !found.includes("other-type"), found.join());
  check("최대 3건", found.length === 3, found.join());
  check("점수가 같으면 공감 많은 순", found.indexOf("popular") < found.indexOf("same-category"), found.join());
  const byText = findSimilarReports({ locationType: "화장실", category: null, placeText: "본관 3층 남자" }, reports).map((r) => r.id);
  check("문제 종류를 안 골라도 장소 단어가 2개 겹치면 찾음", byText.join() === "same-place", byText.join());
  const weak = findSimilarReports({ locationType: "화장실", category: null, placeText: "체육관 옆" }, reports).map((r) => r.id);
  check("장소 단어 1개만 겹치면 보여 주지 않음", weak.length === 0, weak.join());
  check("위치 유형을 안 고르면 찾지 않음", findSimilarReports({ locationType: "" }, reports).length === 0);
}

console.log("\n=== 7) 내 신고 새 소식 ===\n");
{
  const r = { id: "R1", status: "reviewing", moderationStatus: "approved", reporterReplyAt: null };
  const seen = snapshotOf(r);
  check("처음 보는 신고는 새 소식 아님", changesSince(undefined, r).length === 0);
  check("바뀐 게 없으면 새 소식 아님", changesSince(seen, r).length === 0);
  check("상태가 바뀌면 '상태 변경'", changesSince(seen, { ...r, status: "completed" }).join() === "status");
  check("학교 답변이 달리면 '학교 답변'", changesSince(seen, { ...r, reporterReplyAt: "2026-10-10T01:00:00Z" }).join() === "reply");
  check("보류 신고가 공개되면 '공개됨'", changesSince(snapshotOf({ ...r, moderationStatus: "held" }), r).join() === "published");
}

console.log("\n=== 8) 확인 코드로 내 신고 불러오기 ===\n");
{
  const { code, hash } = issueRecoveryCode();
  check("코드 형식 XXXXX-XXXXX", /^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(code), code);
  check("헷갈리는 글자(0 O 1 I L) 없음", ![..."01OIL"].some((ch) => code.includes(ch)) && [...code.replace("-", "")].every((ch) => RECOVERY_CODE_ALPHABET.includes(ch)), code);
  const normalized = normalizeRecoveryCode(code);
  check("발급한 코드를 그대로 넣으면 같은 해시", normalized !== null && hashRecoveryCode(normalized) === hash);
  check("소문자·공백·하이픈 없이 넣어도 인정", normalizeRecoveryCode(` ${code.toLowerCase().replace("-", " ")} `) === normalized);
  check("길이가 틀리면 거부", normalizeRecoveryCode(code.slice(0, 9)) === null);
  check("쓰지 않는 글자(O)가 있으면 거부", normalizeRecoveryCode("OOOOO-22222") === null);
  check("문자열이 아니면 거부", normalizeRecoveryCode(12345) === null);
  const codes = new Set(Array.from({ length: 2000 }, () => issueRecoveryCode().code));
  check("2000번 발급해도 겹치지 않음", codes.size === 2000, String(codes.size));
  check("해시 비교: 같으면 true", safeHashEqual(hash, hash));
  check("해시 비교: 다르거나 없으면 false", !safeHashEqual(hash, hashRecoveryCode("2222222222")) && !safeHashEqual(null, hash) && !safeHashEqual(hash, "abc"));
  const token = "a".repeat(64);
  const hashes = ownerTokenHashes([token, "short", 42, "Z".repeat(64)]);
  check("소유 토큰은 64자리 16진수만 받음", hashes.size === 1);
}

console.log("\n=== 9) 학생 알림 (Web Push) ===\n");
{
  check("Chrome(FCM) 주소 허용", isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"));
  check("Firefox 주소 허용", isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"));
  check("Safari 주소 허용", isAllowedPushEndpoint("https://web.push.apple.com/abc"));
  check("Edge(WNS) 주소 허용", isAllowedPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=abc"));
  check("임의 서버 주소 거부", !isAllowedPushEndpoint("https://example.com/push"));
  check("비슷한 이름의 다른 도메인 거부", !isAllowedPushEndpoint("https://evilfcm.googleapis.com.attacker.io/x") && !isAllowedPushEndpoint("https://notfcm.googleapis.comx/x"));
  check("http 거부", !isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc"));
  check("다른 포트·계정 정보 거부", !isAllowedPushEndpoint("https://fcm.googleapis.com:8443/x") && !isAllowedPushEndpoint("https://user:pw@fcm.googleapis.com/x"));
  check("내부 주소 거부", !isAllowedPushEndpoint("https://127.0.0.1/x") && !isAllowedPushEndpoint("https://localhost/x"));

  const keys = { p256dh: "B".repeat(87), auth: "A".repeat(22) };
  const sub = parseSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys });
  check("정상 구독 정보 통과", sub !== null);
  check("키가 없으면 거부", parseSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/abc" }) === null);
  check("키에 이상한 글자가 있으면 거부", parseSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { ...keys, auth: "<script>alert(1)</script>" } }) === null);

  const first = upsertPushRecord([], sub!, ["h1"], "2026-10-11T00:00:00Z");
  check("처음 등록하면 저장", first.changed && first.list.length === 1);
  const same = upsertPushRecord(first.list, sub!, ["h1"]);
  check("같은 내용을 다시 보내면 저장하지 않음", !same.changed);
  const more = upsertPushRecord(first.list, sub!, ["h2"]);
  check("새 신고 토큰은 합쳐서 저장", more.changed && more.list.length === 1 && more.list[0].ownerTokenHashes.join() === "h2,h1");
  check("만든 시각은 유지", more.list[0].createdAt === "2026-10-11T00:00:00Z");
  const other = upsertPushRecord(more.list, { ...sub!, endpoint: "https://fcm.googleapis.com/fcm/send/other" }, ["h9"]);
  check("다른 기기는 따로 저장", other.list.length === 2);
  check("신고 주인 기기만 받음", recipientsFor(other.list, ["h1"]).length === 1 && recipientsFor(other.list, ["h9", "h2"]).length === 2);
  check("주인 정보가 없으면 아무도 안 받음", recipientsFor(other.list, []).length === 0);

  const report = { id: "REP-20261011-0001", schoolId: "cem-h" };
  const done = buildReportPush(report, { status: { from: "in_progress", to: "completed" } });
  check("처리 완료 알림", done?.title === "신고한 문제가 처리됐어요" && done.body.startsWith("REP-20261011-0001"), JSON.stringify(done));
  check("알림을 누르면 그 학교의 내 신고로", done?.url === "/?view=mine&school=cem-h");
  const reply = buildReportPush(report, { status: { from: "reviewing", to: "reviewing" }, reply: true });
  check("상태 그대로 + 답변이면 답변 알림", reply?.title === "학교에서 답변을 남겼어요");
  const both = buildReportPush(report, { status: { from: "pending", to: "assigned" }, reply: true });
  check("상태와 답변이 함께 바뀌면 한 번에", both?.title.includes("담당자 배정") === true && both.body.includes("답변"), JSON.stringify(both));
  check("바뀐 게 없으면 보내지 않음", buildReportPush(report, { status: { from: "reviewing", to: "reviewing" } }) === null);
  check("알림에 신고 내용은 싣지 않음", !JSON.stringify(buildReportPush({ ...report, title: "비밀 내용" }, { published: true })).includes("비밀 내용"));
}

console.log("\n=== 10) 운영진 개인 계정과 로그인 세션 ===\n");
{
  check("정상 아이디 통과", usernameError("kim.teacher") === null);
  check("공용 아이디 admin 은 개인 계정으로 못 씀", usernameError(MASTER_USERNAME) !== null);
  check("대문자·한글·짧은 아이디 거부", usernameError("Kim") !== null && usernameError("김선생") !== null && usernameError("ab") !== null);
  check("비밀번호 8자 미만 거부", passwordError("1234567") !== null && passwordError("12345678") === null);
  check("비밀번호 72자 초과 거부 (bcrypt 한계)", passwordError("x".repeat(73)) !== null);

  const account: StaffAccount = { id: "acc_1", username: "kim", displayName: "김선생", role: "teacher", schoolId: "cem-h", passwordHash: "$2b$12$secret", disabled: false, createdAt: "", updatedAt: "", lastLoginAt: null };
  check("화면용 계정 정보에 비밀번호 해시 없음", !("passwordHash" in publicAccount(account)) && !JSON.stringify(publicAccount(account)).includes("$2b$"));

  let saved: StaffSession[] = [];
  const store = new SessionStore(async (list) => { saved = list; });
  const t0 = Date.parse("2026-10-11T00:00:00Z");
  const token = store.create({ role: "teacher", accountId: "acc_1", name: "김선생", schoolId: "cem-h" }, t0);
  check("세션 토큰은 64자리 16진수", /^[a-f0-9]{64}$/.test(token));
  check("저장소에는 원본 토큰이 아닌 해시만", saved.length === 1 && saved[0].tokenHash === hashSessionToken(token) && !JSON.stringify(saved).includes(token));
  check("토큰으로 세션 확인", store.get(token, t0 + 1000)?.name === "김선생");
  check("8시간 뒤 만료", store.get(token, t0 + 8 * HOUR + 1) === null);

  const restarted = new SessionStore(async () => {});
  const t1 = Date.now();
  const live = store.create({ role: "staff", accountId: "acc_2", name: "박운영", schoolId: null }, t1);
  restarted.load(saved, t1 + 1000);
  check("서버가 재시작돼도 저장된 세션으로 로그인 유지", restarted.get(live, t1 + 2000)?.name === "박운영");
  check("만료된 세션은 불러오지 않음", restarted.get(token, t1 + 2000) === null);
  restarted.load([{ tokenHash: "not-a-hash", role: "admin", expiresAt: t1 + HOUR }, { ...saved[0], role: "root" }], t1);
  check("형식이 틀린 세션은 불러오지 않음", restarted.size() === 0);

  const s2 = new SessionStore(async () => {});
  const a = s2.create({ role: "staff", accountId: "acc_3", name: "A", schoolId: null });
  const b = s2.create({ role: "staff", accountId: "acc_3", name: "A", schoolId: null });
  const c = s2.create({ role: "staff", accountId: "acc_4", name: "C", schoolId: null });
  s2.revokeAccount("acc_3", a);
  check("비밀번호를 바꾸면 다른 기기 세션만 끝남", s2.get(a) !== null && s2.get(b) === null && s2.get(c) !== null);
  s2.renameAccount("acc_4", "C2", "admin", null);
  check("계정 이름·역할이 바뀌면 열린 세션에도 반영", s2.get(c)?.name === "C2" && s2.get(c)?.role === "admin");
  s2.revoke(c);
  check("로그아웃하면 세션 삭제", s2.get(c) === null);
  check("이상한 토큰은 조회하지 않음", s2.get("../../etc") === null && s2.get(null) === null);
}

console.log("\n=== 11) 총괄 (모든 계정 위의 1인자) ===\n");
{
  const owner = { role: "owner" as const };
  const admin = { role: "admin" as const };
  const staff = { role: "staff" as const };
  const teacher = { role: "teacher" as const };
  check("총괄·관리자만 관리자 기능", isAdminRole("owner") && isAdminRole("admin") && !isAdminRole("staff") && !isAdminRole("teacher"));
  check("총괄 유무 판단", hasOwner([staff, owner]) && !hasOwner([admin, staff]));

  check("총괄 계정은 관리자도 못 바꿈", !canManageAccount("admin", owner, true));
  check("총괄 계정은 총괄 본인 화면에서도 바꾸기 버튼 대상 아님(넘기기로만)", !canManageAccount("owner", owner, true));
  check("총괄이 있으면 관리자 계정은 총괄만 다룸", canManageAccount("owner", admin, true) && !canManageAccount("admin", admin, true));
  check("총괄이 없으면 관리자가 관리자 계정을 다룸 (예전 방식)", canManageAccount("admin", admin, false));
  check("운영진·교사 계정은 관리자 이상이면 다룸", canManageAccount("admin", staff, true) && canManageAccount("owner", teacher, true));
  check("운영진·교사는 계정을 못 다룸", !canManageAccount("staff", teacher, false) && !canManageAccount("teacher", staff, false));

  check("총괄은 관리자까지 줄 수 있음", assignableRoles("owner", true).join() === "admin,staff,teacher");
  check("총괄이 있으면 관리자는 관리자 역할을 못 줌", assignableRoles("admin", true).join() === "staff,teacher");
  check("총괄이 없으면 관리자가 관리자 역할을 줌", assignableRoles("admin", false).includes("admin"));
  check("총괄 역할은 직접 줄 수 없음(지정·넘기기로만)", !assignableRoles("owner", true).includes("owner"));
  check("운영진은 역할을 못 줌", assignableRoles("staff", false).length === 0);

  check("총괄이 없으면 관리자가 처음 지정 가능 (공용 비밀번호 포함)", canAssignOwner({ role: "admin", accountId: null }, null));
  check("총괄이 없어도 운영진은 지정 못 함", !canAssignOwner({ role: "staff", accountId: "acc_s" }, null));
  check("총괄이 있으면 총괄 본인만 넘김", canAssignOwner({ role: "owner", accountId: "acc_o" }, "acc_o"));
  check("총괄이 있으면 관리자는 넘기거나 빼앗지 못 함", !canAssignOwner({ role: "admin", accountId: null }, "acc_o") && !canAssignOwner({ role: "admin", accountId: "acc_a" }, "acc_o"));

  const store = new SessionStore(async () => {});
  const saved: StaffSession[] = [];
  const persisting = new SessionStore(async (list) => { saved.splice(0, saved.length, ...list); });
  const token = persisting.create({ role: "owner", accountId: "acc_o", name: "총괄", schoolId: null });
  store.load(saved);
  check("총괄 세션도 재시작 후 유지", store.get(token)?.role === "owner");

  // 다른 서버와 세션 합치기 (세 방향 비교)
  const a = new SessionStore(async () => {});
  const shared = a.create({ role: "staff", accountId: "acc_x", name: "X", schoolId: null });
  const persistedList = a.snapshot();
  a.markPersisted(persistedList);
  const b = new SessionStore(async () => {});
  b.load(persistedList);
  check("다른 서버에 저장된 세션을 불러옴", b.get(shared)?.name === "X");
  const onlyOnB = b.create({ role: "staff", accountId: "acc_y", name: "Y", schoolId: null });
  b.syncFromRemote([]);
  check("다른 서버에서 끝난 세션(저장소에서 사라짐)은 여기서도 끝남", b.get(shared) === null);
  check("여기서 새로 만들고 아직 저장하지 못한 세션은 남김", b.get(onlyOnB)?.name === "Y");
  const c = new SessionStore(async () => {});
  c.load([]);
  const revokedHere = c.create({ role: "staff", accountId: "acc_z", name: "Z", schoolId: null });
  const zList = c.snapshot();
  c.revoke(revokedHere);
  c.syncFromRemote(zList);
  check("여기서 로그아웃한 세션은 옛 목록과 합쳐도 되살아나지 않음", c.get(revokedHere) === null);
}

async function asyncSections() {
  console.log("\n=== 12) 서버 여러 대 저장 충돌 (storeSync) ===\n");
  {
    check("다음 버전은 이전보다 항상 뒤", Date.parse(nextStoreVersion("2026-10-11T03:00:00.500+00:00", Date.parse("2026-10-11T03:00:00.100Z"))) === Date.parse("2026-10-11T03:00:00.501Z"));
    check("처음 버전은 지금 시각", nextStoreVersion(null, Date.parse("2026-10-11T00:00:00Z")) === "2026-10-11T00:00:00.000Z");

    let refreshed = 0;
    const withLock = createDocLocks<string>(async () => { refreshed += 1; });
    let attempts = 0;
    const value = await withLock("reports", async () => {
      attempts += 1;
      if (attempts < 3) throw new StoreConflictError("reports");
      return "saved";
    });
    check("충돌하면 다시 읽고 재시도해 성공", value === "saved" && attempts === 3 && refreshed === 2, `${attempts}/${refreshed}`);

    let gaveUp = false;
    try {
      await withLock("reports", async () => { throw new StoreConflictError("reports"); });
    } catch (err) {
      gaveUp = err instanceof StoreConflictError;
    }
    check("계속 충돌하면 정해진 횟수 뒤 포기", gaveUp);

    let otherError = "";
    try {
      await withLock("reports", async () => { throw new Error("네트워크 오류"); });
    } catch (err) {
      otherError = err instanceof Error ? err.message : "";
    }
    check("충돌이 아닌 오류는 재시도하지 않고 그대로", otherError === "네트워크 오류");

    const order: string[] = [];
    const slow = withLock("doc", async () => { await new Promise((r) => setTimeout(r, 30)); order.push("first"); });
    const fast = withLock("doc", async () => { order.push("second"); });
    const elsewhere = withLock("other", async () => { order.push("other-doc"); });
    await Promise.all([slow, fast, elsewhere]);
    check("같은 문서는 차례대로", order.indexOf("first") < order.indexOf("second"), order.join());
    check("다른 문서는 기다리지 않음", order[0] === "other-doc", order.join());
  }

  console.log("\n=== 13) 백업 보관 (backupStore) ===\n");
  {
    check("한국 날짜 (UTC 15시 = 다음 날)", kstDate(new Date("2026-10-11T15:30:00Z")) === "2026-10-12");
    check("자동 백업 이름", backupName("auto", new Date("2026-10-11T15:30:00Z")) === "auto/2026-10-12.json");
    check("직접 만든 백업 이름", backupName("manual", new Date("2026-10-11T03:04:05.678Z")) === "manual/2026-10-11T03-04-05Z.json");
    check("이름 형식 통과", BACKUP_NAME_PATTERN.test("auto/2026-10-12.json") && BACKUP_NAME_PATTERN.test("before-restore/2026-10-11T03-04-05Z.json"));
    check("경로 넘나들기 이름 거부", !BACKUP_NAME_PATTERN.test("../secret.json") && !BACKUP_NAME_PATTERN.test("auto/../../x.json") && !BACKUP_NAME_PATTERN.test("other/2026-10-12.json"));
    const list = ["auto/2026-10-01.json", "auto/2026-10-03.json", "auto/2026-10-02.json"].map((name) => ({ name, size: 1, createdAt: null }));
    check("오래된 것부터 정리", expiredBackups(list, 2).join() === "auto/2026-10-01.json");

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schoolfix-backup-test-"));
    try {
      const store = localBackupStore(dir);
      await store.init();
      await store.put("auto/2026-10-01.json", "{\"a\":1}");
      await store.put("auto/2026-10-02.json", "{\"a\":2}");
      check("로컬 보관소 목록 (최신 순)", (await store.list("auto")).map((item) => item.name).join() === "auto/2026-10-02.json,auto/2026-10-01.json");
      check("로컬 보관소 읽기", (await store.get("auto/2026-10-01.json")) === "{\"a\":1}" && (await store.get("auto/2026-09-01.json")) === null);
      await store.remove(["auto/2026-10-01.json"]);
      check("로컬 보관소 지우기", (await store.list("auto")).length === 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log("\n=== 14) 첫 접속 지연 줄이기 (keepAwake) ===\n");
  {
    check("기본은 한국 시간 7~21시", JSON.stringify(parseKeepAwakeHours(undefined)) === JSON.stringify({ start: 7, end: 21 }));
    check("off 면 끔", parseKeepAwakeHours("off") === null);
    check("잘못된 값은 기본값", JSON.stringify(parseKeepAwakeHours("abc")) === JSON.stringify({ start: 7, end: 21 }));
    const day = { start: 7, end: 21 };
    check("한국 9시는 깨어 있음 (UTC 0시)", withinKeepAwake(day, Date.parse("2026-10-11T00:00:00Z")));
    check("한국 21시는 잠듦 (UTC 12시)", !withinKeepAwake(day, Date.parse("2026-10-11T12:00:00Z")));
    check("한국 6시는 잠듦 (UTC 21시)", !withinKeepAwake(day, Date.parse("2026-10-10T21:00:00Z")));
    const night = parseKeepAwakeHours("22-6")!;
    check("자정을 넘는 구간 (한국 23시)", withinKeepAwake(night, Date.parse("2026-10-11T14:00:00Z")) && !withinKeepAwake(night, Date.parse("2026-10-11T03:00:00Z")));
    check("https 공개 주소만 부름", keepAwakeUrl({ RENDER_EXTERNAL_URL: "https://schoolfix.onrender.com/" }) === "https://schoolfix.onrender.com/api/health" && keepAwakeUrl({ PUBLIC_BASE_URL: "http://x" }) === null && keepAwakeUrl({}) === null);
  }

  console.log("\n=== 15) 운영 기록 (auditLog) ===\n");
  {
    const entry = newAuditEntry("report.delete", { name: "김선생", role: "staff", accountId: "acc_1" }, "REP-1", "x".repeat(900));
    check("자세한 내용은 500자까지만", entry.detail?.length === 500);
    let list = [] as ReturnType<typeof newAuditEntry>[];
    for (let i = 0; i < 5; i++) list = appendAudit(list, newAuditEntry("login", null), 3);
    check("정해진 개수만 남기고 최신이 앞", list.length === 3);
    check("분류", auditCategory("owner.transfer") === "account" && auditCategory("report.purge") === "report" && auditCategory("backup.auto") === "backup" && auditCategory("login") === "login" && auditCategory("school.stop") === "etc");
  }
}

asyncSections()
  .catch((err) => {
    failed++;
    failures.push(`비동기 검사 중 오류: ${err instanceof Error ? err.stack : err}`);
  })
  .finally(() => {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`통과 ${passed} / 실패 ${failed}`);
    if (failures.length) {
      console.log("\n실패 목록:");
      failures.forEach((f) => console.log(`  - ${f}`));
    }
    console.log("=".repeat(60));

    process.exit(failed > 0 ? 1 : 0);
  });
