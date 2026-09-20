/**
 * 보고서 문서 생성 검증 — 실행: npm run test:report
 *
 * PDF/인쇄 출력이 비는 문제를 겪었기 때문에,
 * "실제로 내용이 들어간 문서가 만들어지는가"를 브라우저 없이 확인한다.
 */

import { buildReportHtml, escapeHtml } from "./reportDocument";
import { SchoolReport, ReportStatsResponse } from "../types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const sample: SchoolReport[] = [
  {
    id: "REP-20260919-0001",
    title: "복도 타일 들뜸",
    location: "복도",
    category: "시설 고장",
    description: "본관 2층 복도 바닥 타일이 들떠 있어 걸려 넘어질 위험이 있습니다.",
    status: "completed",
    riskLevel: "높음",
    riskScore: 68,
    createdAt: "2026-09-19T03:36:07.842Z",
    updatedAt: "2026-09-19T05:30:00.000Z",
  },
  {
    id: "REP-20260919-0002",
    location: "계단",
    category: "안전 위험",
    description: "중앙 계단 미끄럼 방지 패드가 마모되었습니다.",
    status: "pending",
    riskLevel: "긴급",
    riskScore: 88,
    createdAt: "2026-09-19T03:36:10.626Z",
    updatedAt: "2026-09-19T04:00:00.000Z",
  },
];

const stats: ReportStatsResponse = {
  total: 2,
  byRisk: { 높음: 1, 긴급: 1 },
  byCategory: { "시설 고장": 1, "안전 위험": 1 },
  byStatus: { completed: 1, pending: 1 },
  byLocation: { 복도: 1, 계단: 1 },
  unanalyzed: 0,
};

console.log("\n=== 1) 문서가 실제로 생성되는가 ===\n");

const html = buildReportHtml({
  reports: sample,
  stats,
  summary: {
    headline: "계단과 복도의 낙상 위험을 우선 확인할 필요가 있습니다.",
    keyIssues: ["계단 미끄럼 방지 패드 마모", "복도 바닥 타일 들뜸"],
    recommendation: "해당 구역의 현장 점검을 권장합니다.",
    generatedAt: "2026-09-19T12:00:00.000Z",
    model: "gpt-5.6-terra",
  },
  scopeLabel: "전체 신고 · 위험도 긴급",
  locations: [
    {
      name: "본관 2층 복도",
      baseLocation: "복도",
      reportCount: 2,
      mainCategory: "시설 고장",
      mainCategoryCount: 2,
      highRiskCount: 1,
      urgentCount: 0,
      latestReportAt: "2026-09-19T03:00:00.000Z",
      mergedFrom: ["본관 2층 복도", "2층 복도"],
    },
  ],
});

check("HTML 문서 형식", html.startsWith("<!DOCTYPE html>") && html.includes("</html>"));
check("문서가 비어 있지 않음", html.length > 1500, `${html.length}자`);
check("제목 포함", html.includes("SchoolFix AI — 학교 신고 현황 리포트"));
check("대상 범위 표시", html.includes("전체 신고 · 위험도 긴급"));

console.log("\n  --- 7개 섹션 ---");
for (const s of [
  "1. 신고 현황",
  "2. 위험도별 현황",
  "3. 카테고리별 현황",
  "4. 처리 상태",
  "5. 위치별 신고 현황",
  "6. AI 요약",
  "7. 신고 목록",
]) {
  check(`섹션 "${s}"`, html.includes(s));
}

console.log("\n  --- 실제 데이터 반영 ---");
check("접수번호", html.includes("REP-20260919-0001") && html.includes("REP-20260919-0002"));
check("신고 내용", html.includes("본관 2층 복도 바닥 타일이 들떠"));
check("위험도 등급", html.includes("긴급") && html.includes("높음"));
check("상태 라벨(한글 변환)", html.includes("처리 완료") && html.includes("접수 대기"));
check("AI 요약 반영", html.includes("계단과 복도의 낙상 위험"));
check("위치별 통계 반영", html.includes("본관 2층 복도"));
check("통계 수치", html.includes("전체 신고") && html.includes("2건"));

console.log("\n=== 2) XSS — 신고 내용이 HTML 로 실행되지 않는가 ===\n");

const xssHtml = buildReportHtml({
  reports: [
    {
      ...sample[0],
      description: '<script>alert("XSS")</script><img src=x onerror=alert(1)>',
      title: '<b>굵게</b>',
    },
  ],
  stats,
  summary: null,
});

check("script 태그가 이스케이프됨", !xssHtml.includes("<script>alert"));
check("이스케이프된 형태로 존재", xssHtml.includes("&lt;script&gt;"));
check("onerror 속성이 살아있지 않음", !xssHtml.includes("<img src=x onerror"));
check("escapeHtml 단위 동작", escapeHtml('<a href="x">&\'') === "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");

console.log("\n=== 3) 빈 데이터에서도 문서가 나오는가 ===\n");

const emptyHtml = buildReportHtml({
  reports: [],
  stats: { total: 0, byRisk: {}, byCategory: {}, byStatus: {}, byLocation: {}, unanalyzed: 0 },
  summary: null,
});

check("빈 상태에서도 문서 생성", emptyHtml.startsWith("<!DOCTYPE html>"));
check("빈 목록 안내 문구", emptyHtml.includes("표시할 신고가 없습니다."));
check("AI 요약 없음 안내", emptyHtml.includes("AI 요약이 생성되지 않았습니다."));
check("빈 위치 통계 안내", emptyHtml.includes("집계된 위치 데이터가 없습니다."));
check("가짜 통계를 만들지 않음", !emptyHtml.includes("긴급 신고"));

console.log("\n=== 4) 위험도 미분석 신고 처리 ===\n");

const unanalyzedHtml = buildReportHtml({
  reports: [{ ...sample[0], riskLevel: null, riskScore: null }],
  stats: { ...stats, byRisk: {}, unanalyzed: 1 },
  summary: null,
});
check("미분석은 '-' 로 표시", unanalyzedHtml.includes("<td>-</td>"));
check("미분석 건수 표시", unanalyzedHtml.includes("위험도 미분석"));
check("위험도 섹션 빈 안내", unanalyzedHtml.includes("위험도가 분석된 신고가 없습니다."));

console.log(`\n${"=".repeat(60)}`);
console.log(`통과 ${passed} / 실패 ${failed}`);
if (failures.length) {
  console.log("\n실패 목록:");
  failures.forEach((f) => console.log(`  - ${f}`));
}
console.log("=".repeat(60));

process.exit(failed > 0 ? 1 : 0);
