/**
 * 작업 요청서 문서 검증 — 실행: npm run test:workorder
 *
 * 시설 담당자에게 넘기는 문서라, 필요한 내용은 들어가고
 * 학생에게만 보이는 답변·검토 전 설명·기기 정보는 빠지는지 브라우저 없이 확인한다.
 */

import { buildWorkOrderHtml } from "../src/utils/workOrder";
import type { StaffReport } from "../src/types";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`); }
}

const report: StaffReport = {
  id: "REP-20261127-0003",
  schoolName: "창의경영고등학교",
  title: "3층 화장실 세면대 누수",
  location: "화장실",
  locationType: "화장실",
  locationDetail: "3층 남자 화장실 왼쪽 세면대",
  buildingName: "본관",
  category: "시설 고장",
  description: "수도꼭지가 잠기지 않아요 <script>alert(1)</script>",
  photos: [{ url: "/api/photos/2026-11/a.webp", name: null, size: null }],
  status: "assigned",
  riskLevel: "높음",
  riskScore: 58.4,
  assignee: "행정실 김주무관",
  resolutionNote: "부품 주문함",
  reporterReply: "학생에게만 보이는 답변",
  meTooCount: 4,
  followups: [
    { id: "f1", at: "2026-11-27T01:00:00.000Z", text: "오늘도 물이 새요", held: false, heldReason: null, photos: [] },
    { id: "f2", at: "2026-11-27T02:00:00.000Z", text: "검토 전 설명", held: true, heldReason: "자동 검사", photos: [] },
  ],
  history: [],
  reporter: { deviceReportCount: 7, blocked: true },
  createdAt: "2026-11-26T00:00:00.000Z",
  updatedAt: "2026-11-27T00:00:00.000Z",
};

const html = buildWorkOrderHtml({ report, origin: "https://schoolfix.onrender.com", now: new Date("2026-11-27T03:00:00.000Z") });

check("완전한 HTML 문서", html.startsWith("<!DOCTYPE html>") && html.includes("</html>"));
check("접수번호", html.includes("REP-20261127-0003"));
check("학교 이름", html.includes("창의경영고등학교"));
check("위치를 모두 이어 붙임", html.includes("화장실 · 3층 남자 화장실 왼쪽 세면대 · 본관"));
check("위험도와 점수", html.includes("높음 (58점)"));
check("담당", html.includes("행정실 김주무관"));
check("공감 학생 수", html.includes("4명"));
check("사진은 절대 주소", html.includes('src="https://schoolfix.onrender.com/api/photos/2026-11/a.webp"'));
check("처리 메모", html.includes("부품 주문함"));
check("확인된 추가 설명은 넣음", html.includes("오늘도 물이 새요"));
check("검토 전 추가 설명은 뺌", !html.includes("검토 전 설명"));
check("학생 전용 답변은 뺌", !html.includes("학생에게만 보이는 답변"));
check("기기 정보는 뺌", !html.includes("같은 기기") && !html.includes("검토 대상 기기"));
check("신고 내용은 이스케이프", html.includes("&lt;script&gt;") && !html.includes("<script>alert"));
check("현장 작성 칸", html.includes("조치 내용") && html.includes("확인자 (서명)"));

const bare = buildWorkOrderHtml({ report: { ...report, photos: [{ url: "javascript:alert(1)", name: null, size: null }], followups: [], riskLevel: null, riskScore: null, noise: null, meTooCount: 0 } });
check("이상한 사진 주소는 넣지 않음", !bare.includes("javascript:"));
check("분석 전 위험도", bare.includes("분석 전"));
check("추가 설명이 없으면 섹션 없음", !bare.includes("학생이 덧붙인 설명"));

console.log(`\n통과 ${passed} / 실패 ${failed}`);
process.exit(failed > 0 ? 1 : 0);
