import {
  SchoolReport,
  ReportStatsResponse,
  AiSummaryResponse,
  LocationStatistic,
  STATUS_MAP,
  ReportStatus,
} from "../types";

/**
 * 인쇄 / PDF 저장용 독립 HTML 문서를 만든다.
 *
 * 왜 화면을 그대로 인쇄하지 않는가:
 * 이전에는 메인 페이지에서 보고서만 남기고 나머지를 CSS 로 숨긴 뒤 인쇄했다.
 * 그 방식은 :has() 지원 여부, 숨긴 요소가 차지하는 공간, Tailwind 유틸리티와의
 * 우선순위에 전부 의존해서 출력이 비거나 빈 페이지가 붙기 쉬웠다.
 *
 * 지금은 보고서만 담은 완전한 HTML 을 만들어 새 창에서 인쇄한다.
 * 그 창에는 보고서 외에 아무것도 없으므로 숨길 것도, 어긋날 것도 없다.
 *
 * 이 함수는 순수 함수라 브라우저 없이도 검증할 수 있다.
 */

export interface ReportDocumentInput {
  reports: SchoolReport[];
  stats: ReportStatsResponse;
  summary: AiSummaryResponse["summary"];
  /** 어떤 조건으로 추린 목록인지 (예: "전체 신고 · 위험도 긴급") */
  scopeLabel?: string;
  /**
   * 서버가 집계한 위치별 통계. 같은 필터 조건으로 계산된 값만 넘긴다.
   * 없으면 해당 섹션을 "집계된 위치 데이터가 없습니다" 로 표시한다 — 만들어 채우지 않는다.
   */
  locations?: LocationStatistic[] | null;
}

/** HTML 특수문자를 무력화한다. 신고 내용은 사용자 입력이므로 반드시 거친다. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function rows(entries: [string, number][], emptyText: string): string {
  if (entries.length === 0) {
    return `<p class="empty">${escapeHtml(emptyText)}</p>`;
  }
  return `<table>${entries
    .map(([label, count]) => `<tr><td>${escapeHtml(label)}</td><td class="num">${count}건</td></tr>`)
    .join("")}</table>`;
}

export function buildReportHtml({
  reports,
  stats,
  summary,
  scopeLabel,
  locations,
}: ReportDocumentInput): string {
  const now = new Date().toLocaleString("ko-KR");

  const riskRows = Object.entries(stats.byRisk).sort((a, b) => b[1] - a[1]);
  const categoryRows = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]);
  const statusRows = Object.entries(stats.byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [STATUS_MAP[k as ReportStatus]?.label ?? k, v] as [string, number]);

  const overview: [string, number][] = [["전체 신고", stats.total]];
  if (stats.byRisk["긴급"]) overview.push(["긴급 신고", stats.byRisk["긴급"]]);
  if (stats.byRisk["높음"]) overview.push(["높은 위험도 신고", stats.byRisk["높음"]]);
  if (stats.unanalyzed) overview.push(["위험도 미분석", stats.unanalyzed]);

  const summaryBlock = summary
    ? `<p class="lead">${escapeHtml(summary.headline)}</p>` +
      (summary.keyIssues.length
        ? `<ul>${summary.keyIssues.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`
        : "") +
      (summary.recommendation ? `<p>${escapeHtml(summary.recommendation)}</p>` : "") +
      `<p class="note">실제 신고 데이터를 기반으로 생성된 참고용 요약입니다.</p>`
    : `<p class="empty">AI 요약이 생성되지 않았습니다. [AI 요약]을 실행한 뒤 다시 저장하세요.</p>`;

  /**
   * 위치별 현황.
   * 서버가 집계한 값만 쓴다. 넘어오지 않았으면 빈 안내를 남기고 아무것도 추정하지 않는다.
   */
  const locationBlock =
    !locations || locations.length === 0
      ? `<p class="empty">집계된 위치 데이터가 없습니다.</p>`
      : `<table class="list">
          <thead>
            <tr><th>순위</th><th>장소</th><th>신고</th><th>주요 문제</th><th>높음 이상</th><th>최근 신고</th></tr>
          </thead>
          <tbody>
            ${locations
              .map(
                (loc, i) => `<tr>
                  <td class="num">${i + 1}</td>
                  <td>${escapeHtml(loc.name)}</td>
                  <td class="num">${loc.reportCount}건</td>
                  <td>${escapeHtml(loc.mainCategory ?? "-")}</td>
                  <td class="num">${loc.highRiskCount}건</td>
                  <td>${escapeHtml(
                    loc.latestReportAt
                      ? new Date(loc.latestReportAt).toLocaleDateString("ko-KR")
                      : "-"
                  )}</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>`;

  const listBlock =
    reports.length === 0
      ? `<p class="empty">표시할 신고가 없습니다.</p>`
      : `<table class="list">
          <thead>
            <tr><th>접수번호</th><th>위치</th><th>유형</th><th>위험도</th><th>상태</th><th>내용</th></tr>
          </thead>
          <tbody>
            ${reports
              .map(
                (r) => `<tr>
                  <td class="mono">${escapeHtml(r.id)}</td>
                  <td>${escapeHtml(r.location)}</td>
                  <td>${escapeHtml(r.category)}</td>
                  <td>${escapeHtml(r.riskLevel ?? "-")}</td>
                  <td>${escapeHtml(STATUS_MAP[r.status]?.label ?? r.status)}</td>
                  <td>${escapeHtml(r.description)}</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>SchoolFix AI 신고 현황 리포트</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    color: #0f172a;
    font-size: 11px;
    line-height: 1.5;
  }
  header { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 18px; }
  h1 { font-size: 17px; margin: 0 0 4px; }
  .meta { color: #64748b; font-size: 10px; margin: 0; }
  section { margin-bottom: 18px; page-break-inside: avoid; }
  h2 { font-size: 13px; margin: 0 0 6px; padding-bottom: 4px; border-bottom: 1px solid #cbd5e1; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
  th { font-weight: 600; border-bottom: 1px solid #94a3b8; }
  .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; width: 70px; }
  .mono { font-family: ui-monospace, Menlo, Consolas, monospace; white-space: nowrap; }
  .list { font-size: 10px; }
  .list th:nth-child(1) { width: 96px; }
  .list th:nth-child(2) { width: 52px; }
  .list th:nth-child(3) { width: 64px; }
  .list th:nth-child(4) { width: 44px; }
  .list th:nth-child(5) { width: 54px; }
  .lead { font-weight: 600; margin: 0 0 6px; }
  ul { margin: 0 0 6px; padding-left: 16px; }
  li { margin-bottom: 2px; }
  .empty { color: #64748b; margin: 0; }
  .note { color: #94a3b8; font-size: 10px; margin: 6px 0 0; }
  footer { border-top: 1px solid #cbd5e1; padding-top: 6px; color: #94a3b8; font-size: 10px; }
</style>
</head>
<body>
<header>
  <h1>SchoolFix AI — 학교 신고 현황 리포트</h1>
  <p class="meta">생성 일시: ${escapeHtml(now)}${scopeLabel ? ` · 대상: ${escapeHtml(scopeLabel)}` : ""}</p>
</header>

<section><h2>1. 신고 현황</h2>${rows(overview, "등록된 신고가 없습니다.")}</section>
<section><h2>2. 위험도별 현황</h2>${rows(riskRows, "위험도가 분석된 신고가 없습니다.")}</section>
<section><h2>3. 카테고리별 현황</h2>${rows(categoryRows, "등록된 신고가 없습니다.")}</section>
<section><h2>4. 처리 상태</h2>${rows(statusRows, "등록된 신고가 없습니다.")}</section>
<section><h2>5. 위치별 신고 현황</h2>${locationBlock}</section>
<section><h2>6. AI 요약</h2>${summaryBlock}</section>
<section><h2>7. 신고 목록 (${reports.length}건)</h2>${listBlock}</section>

<footer>SchoolFix AI · 이 리포트에는 신고자 개인정보가 포함되지 않습니다.</footer>
</body>
</html>`;
}
