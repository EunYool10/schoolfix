/**
 * 운영 기능 검증 — 실행: npm run test:ops
 *
 *  1) 처리 기한(SLA) 계산
 *  2) 월별 통계 (한국 시간 월 경계, 평균 처리 시간)
 *  3) 긴급 신고 알림 (기준 위험도, 웹훅 형식)
 *  4) 반복 신고자 걸러내기
 */

import { computeSla, slaLabel } from "./src/utils/sla";
import { buildMonthlyReport, monthKey, monthlyTrend, shiftMonth } from "./src/utils/monthlyStats";
import { attachmentToFile, buildNewReportPayload, buildNewReportText, lastNotifyResult, sendNewReportNotification, summarizeWebhookError, type NewReportNotice } from "./notify";
import { buildApplicationText, buildMonthlyText, buildNotificationText, buildTextPayload, buildWebhookPayload, shouldNotify, webhookChannel, type UrgentNotice } from "./notify";
import { ABUSE_RULES, activeBlock, evaluateReporter, type BlockedReporter } from "./abuseGuard";

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
    held: false, heldReason: null, attachment: { dataUrl: png, name: "사진.png", size: 68 }, link: null,
  };
  const discordUrl = "https://discord.com/api/webhooks/1/abc";

  const normal = buildNewReportText(base, false);
  check("일반 신고는 🆕 + 위험도 + 접수번호", normal.startsWith("🆕 새 신고 [중간 40점] 테스트고") && normal.includes("REP-20261010-0007"));
  check("일반 신고 내용은 300자로 요약", normal.includes("…") && !normal.includes("가".repeat(301)));
  check("긴급 신고는 🚨", buildNewReportText({ ...base, riskLevel: "긴급", riskScore: 90 }, false).startsWith("🚨"));
  check("분석 전 신고 표시", buildNewReportText({ ...base, riskLevel: null, riskScore: null }, false).includes("[분석 전]"));
  const normalPayload = buildNewReportPayload(discordUrl, base);
  check("일반 신고는 사진 없이 텍스트로", !(normalPayload instanceof FormData) && typeof (normalPayload as Record<string, unknown>).content === "string");

  const held = { ...base, held: true, heldReason: "부적절한 표현 자동 감지" };
  const heldText = buildNewReportText(held, true);
  check("보류 신고는 ⏸️ + 보류 사유 + 검토 안내", heldText.startsWith("⏸️ 공개 보류 신고") && heldText.includes("보류 사유: 부적절한 표현 자동 감지") && heldText.includes("승인하거나 삭제"));
  check("보류 신고 내용은 1200자까지", heldText.includes("가".repeat(1200)) && !heldText.includes("가".repeat(1201)));
  const heldPayload = buildNewReportPayload(discordUrl, held);
  check("Discord 보류 신고는 사진을 multipart 로 첨부", heldPayload instanceof FormData && (heldPayload as FormData).has("files[0]") && (heldPayload as FormData).has("payload_json"));
  const payloadJson = heldPayload instanceof FormData ? JSON.parse(String(heldPayload.get("payload_json"))) : {};
  check("첨부 메시지에도 멘션 차단·파일명은 접수번호", JSON.stringify(payloadJson.allowed_mentions) === '{"parse":[]}' && payloadJson.attachments?.[0]?.filename === "REP-20261010-0007.png", payloadJson);
  check("Slack 은 사진 없이 '운영진 화면에서 확인' 안내", String((buildNewReportPayload("https://hooks.slack.com/services/x", held) as Record<string, unknown>).text).includes("운영진 화면에서 확인"));

  check("PNG 데이터 → 파일 변환", attachmentToFile(base.attachment!, "REP-1")?.blob.type === "image/png");
  check("이미지가 아닌 data URL 은 거부", attachmentToFile({ dataUrl: "data:text/html;base64,PGgxPg==", name: null, size: null }, "REP-1") === null);
  const huge = "data:image/jpeg;base64," + "A".repeat(13 * 1024 * 1024);
  check("9MB 를 넘는 사진은 첨부하지 않음", attachmentToFile({ dataUrl: huge, name: null, size: null }, "REP-1") === null);
  check("너무 큰 사진은 텍스트로만 + 화면 확인 안내", !(buildNewReportPayload(discordUrl, { ...held, attachment: { dataUrl: huge, name: "큰사진.jpg", size: 9_900_000 } }) instanceof FormData));
}

console.log("\n=== 3-4) 디스코드가 사진을 거절할 때 ===\n");
{
  const discordBody = JSON.stringify({ message: "Explicit content cannot be sent to the desired recipient(s)", code: 20009, attachments: [{ id: "1", filename: "REP-1.jpg", url: "https://cdn.discordapp.com/attachments/x/y/REP-1.jpg?ex=abc" }] });
  const summary = summarizeWebhookError(discordBody);
  check("오류 요약은 message·code 만", summary.includes("Explicit content") && summary.includes("code 20009"), summary);
  check("첨부 파일 이름·주소는 남기지 않음", !summary.includes("cdn.discordapp") && !summary.includes("REP-1.jpg"), summary);
  check("JSON 이 아닌 응답의 주소도 지움", summarizeWebhookError("error at https://example.com/secret").includes("[url]"));

  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const heldNotice: NewReportNotice = {
    schoolName: "테스트고", reportId: "REP-20261010-0009", title: "제목", location: "복도", category: "기타",
    riskLevel: null, riskScore: null, description: "내용", held: true, heldReason: "안전성 검사에서 검토 필요 판정",
    attachment: { dataUrl: png, name: "photo.jpg", size: 1000 }, link: null,
  };
  const calls: { form: boolean; body: string }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const form = init?.body instanceof FormData;
    calls.push({ form, body: form ? "" : String(init?.body) });
    return form ? new Response(discordBody, { status: 400 }) : new Response(null, { status: 204 });
  }) as typeof fetch;
  const originalError = console.error;
  console.error = () => {};
  const sent = await sendNewReportNotification(heldNotice, { NOTIFY_WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc" });
  console.error = originalError;
  globalThis.fetch = realFetch;
  check("사진 업로드가 거절되면 사진 없이 다시 보내 알림은 전달", sent === true && calls.length === 2 && calls[0].form && !calls[1].form, JSON.stringify(calls.map((c) => c.form)));
  check("다시 보낸 메시지에 '민감한 이미지' 안내", calls[1]?.body.includes("민감한 이미지로 판단") ?? false, calls[1]?.body);
  check("마지막 결과는 성공(사진 제외)으로 기록", lastNotifyResult()?.ok === true && lastNotifyResult()?.label.includes("사진 제외"));
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

console.log(`\n${"=".repeat(60)}`);
console.log(`통과 ${passed} / 실패 ${failed}`);
if (failures.length) {
  console.log("\n실패 목록:");
  failures.forEach((f) => console.log(`  - ${f}`));
}
console.log("=".repeat(60));

process.exit(failed > 0 ? 1 : 0);
