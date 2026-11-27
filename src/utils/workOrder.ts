import { STATUS_MAP } from "../types";
import type { ReportPhoto, StaffReport } from "../types";
import { escapeHtml } from "./reportDocument";
import { computeSla } from "./sla";
import { formatNoise } from "./noise";

/**
 * 신고 한 건의 작업 요청서 (인쇄 / PDF 저장용 독립 HTML).
 *
 * 운영진·교사가 시설 담당자나 업체에 넘길 때 쓴다. 장소·내용·사진·위험도와
 * 현장에서 손으로 적을 처리 기록 칸만 담는다.
 *
 * 넣지 않는 것: 신고한 학생에게만 보이는 답변, 기기 정보, 공개 보류 사유,
 * 아직 안전성 확인이 끝나지 않은 추가 설명. 신고자 개인정보는 애초에 없다.
 *
 * 순수 함수라 브라우저 없이 검증할 수 있다 (tests/workOrder.test.ts).
 */

export interface WorkOrderInput {
  report: StaffReport;
  schoolName?: string;
  /** 사진 주소를 절대 주소로 바꿀 기준 (예: window.location.origin). 새 창에서도 사진이 열리게 한다. */
  origin?: string;
  /** 발행 시각 (테스트용) */
  now?: Date;
}

function photoSrc(photo: ReportPhoto, origin: string): string | null {
  const url = photo.url || "";
  if (/^data:image\//i.test(url)) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return origin ? origin.replace(/\/$/, "") + url : url;
  return null;
}

function photoGrid(photos: ReportPhoto[], origin: string, label: string): string {
  const items = photos
    .map((photo, index) => ({ src: photoSrc(photo, origin), index }))
    .filter((item): item is { src: string; index: number } => Boolean(item.src));
  if (items.length === 0) return "";
  return `<div class="photos">${items
    .map(({ src, index }) => `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(`${label} ${index + 1}`)}" /><figcaption>${escapeHtml(`${label} ${index + 1}`)}</figcaption></figure>`)
    .join("")}</div>`;
}

export function reportPlace(report: Pick<StaffReport, "locationType" | "location" | "locationDetail" | "buildingName" | "floor" | "department" | "grade" | "className" | "roomName">): string {
  return [report.locationType || report.location, report.locationDetail, report.buildingName, report.floor, report.department, report.grade ? `${report.grade}학년` : null, report.className, report.roomName]
    .filter(Boolean)
    .join(" · ");
}

export function buildWorkOrderHtml({ report, schoolName, origin = "", now = new Date() }: WorkOrderInput): string {
  const school = schoolName || report.schoolName || "학교";
  const sla = computeSla(report, now.getTime());
  const due = new Date(sla.dueAt).toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const dueText = sla.overdue ? `${due} (기한 지남)` : due;
  const risk = report.riskLevel ? `${report.riskLevel}${typeof report.riskScore === "number" ? ` (${Math.round(report.riskScore)}점)` : ""}` : "분석 전";

  const info: [string, string][] = [
    ["접수번호", report.id],
    ["접수 일시", new Date(report.createdAt).toLocaleString("ko-KR")],
    ["처리 기한", dueText],
    ["위치", reportPlace(report) || "-"],
    ["문제 종류", report.category || "-"],
    ["위험도", risk],
    ["현재 상태", STATUS_MAP[report.status]?.label ?? report.status],
    ["담당", report.assignee || "미지정"],
  ];
  if ((report.meTooCount ?? 0) > 0) info.push(["같은 문제를 겪은 학생", `${report.meTooCount}명`]);
  if (report.noise) info.push(["소음 측정", `${formatNoise(report.noise)} · 휴대폰으로 잰 추정치`]);

  const followups = (report.followups ?? []).filter((item) => !item.held);
  const followupBlock = followups.length
    ? `<section><h2>학생이 덧붙인 설명 (${followups.length}건)</h2>${followups
        .map((item) => `<div class="followup"><p class="meta">${escapeHtml(new Date(item.at).toLocaleString("ko-KR"))}</p><p class="text">${escapeHtml(item.text)}</p>${photoGrid(item.photos, origin, "추가 사진")}</div>`)
        .join("")}</section>`
    : "";

  const photos = report.photos ?? [];
  const photoBlock = photos.length ? `<section><h2>현장 사진 (${photos.length}장)</h2>${photoGrid(photos, origin, "사진")}</section>` : "";

  const reason = report.riskAnalysis?.reason?.trim();
  const reasonBlock = reason ? `<section><h2>위험도 판단 근거 (자동 분석)</h2><p class="text">${escapeHtml(reason)}</p></section>` : "";

  const noteBlock = report.resolutionNote?.trim()
    ? `<section><h2>지금까지의 처리 메모</h2><p class="text">${escapeHtml(report.resolutionNote)}</p></section>`
    : "";

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>작업 요청서 ${escapeHtml(report.id)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 14px 16px; font-family: "Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; color: #0f172a; font-size: 12px; line-height: 1.55; }
  @media print { body { padding: 0; } }
  header { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 14px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #64748b; font-size: 10px; margin: 0; }
  section { margin-bottom: 14px; }
  h2 { font-size: 13px; margin: 0 0 6px; padding-bottom: 4px; border-bottom: 1px solid #cbd5e1; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th { width: 120px; background: #f1f5f9; font-weight: 600; }
  .title { font-size: 14px; font-weight: 700; margin: 0 0 4px; }
  .text { white-space: pre-wrap; margin: 0; overflow-wrap: anywhere; }
  .followup { padding: 6px 0; border-bottom: 1px solid #e2e8f0; }
  .followup:last-child { border-bottom: 0; }
  .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
  figure { margin: 0; break-inside: avoid; page-break-inside: avoid; }
  img { display: block; width: 100%; max-height: 80mm; object-fit: contain; border: 1px solid #cbd5e1; background: #f8fafc; }
  figcaption { color: #64748b; font-size: 10px; margin-top: 2px; }
  .record td { height: 30px; }
  .record td.tall { height: 90px; }
  .record { break-inside: avoid; page-break-inside: avoid; }
  footer { border-top: 1px solid #cbd5e1; padding-top: 6px; color: #94a3b8; font-size: 10px; }
</style>
</head>
<body>
<header>
  <h1>시설 작업 요청서</h1>
  <p class="meta">${escapeHtml(school)} · 접수번호 ${escapeHtml(report.id)} · 발행 ${escapeHtml(now.toLocaleString("ko-KR"))}</p>
</header>

<section><h2>신고 정보</h2><table>${info.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</table></section>

<section><h2>신고 내용</h2><p class="title">${escapeHtml(report.title || "시설 문제 신고")}</p><p class="text">${escapeHtml(report.description)}</p></section>
${followupBlock}
${photoBlock}
${reasonBlock}
${noteBlock}
<section class="record"><h2>처리 기록 (현장에서 작성)</h2>
<table>
  <tr><th>조치 일시</th><td></td></tr>
  <tr><th>조치 내용</th><td class="tall"></td></tr>
  <tr><th>남은 문제 · 필요한 자재</th><td class="tall"></td></tr>
  <tr><th>조치자</th><td></td></tr>
  <tr><th>확인자 (서명)</th><td></td></tr>
</table>
</section>

<footer>SchoolFix · 이 요청서에는 신고자 개인정보가 포함되지 않습니다.</footer>
</body>
</html>`;
}
