import React from "react";
import {
  SchoolReport,
  ReportStatsResponse,
  AiSummaryResponse,
  STATUS_MAP,
  ReportStatus,
} from "../types";

interface ReportPdfDocumentProps {
  reports: SchoolReport[];
  stats: ReportStatsResponse;
  summary: AiSummaryResponse["summary"];
}

/**
 * 인쇄 / PDF 저장용 보고서 문서 (§35).
 *
 * 개인정보는 애초에 이 컴포넌트에 들어오지 않는다.
 * 서버의 공개 DTO 에 신고자 이름·이메일·IP·내부 식별자가 없기 때문이다(§36).
 *
 * 모든 수치는 서버가 계산해 내려준 stats 를 쓴다. 여기서 통계를 만들지 않는다.
 */
export function ReportPdfDocument({ reports, stats, summary }: ReportPdfDocumentProps) {
  const now = new Date();

  // 실제 데이터에 존재하는 항목만 표시한다 (§35 — 없는 카테고리/상태를 지어내지 않는다).
  const riskRows = Object.entries(stats.byRisk).sort((a, b) => b[1] - a[1]);
  const categoryRows = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]);
  const statusRows = Object.entries(stats.byStatus).sort((a, b) => b[1] - a[1]);

  const Section = ({ no, title, children }: { no: number; title: string; children: React.ReactNode }) => (
    <section className="mb-5 break-inside-avoid">
      <h2 className="text-[13px] font-bold text-slate-900 border-b border-slate-300 pb-1 mb-2">
        {no}. {title}
      </h2>
      {children}
    </section>
  );

  const Rows = ({ rows, empty }: { rows: [string, number][]; empty: string }) =>
    rows.length === 0 ? (
      <p className="text-[11px] text-slate-500">{empty}</p>
    ) : (
      <table className="w-full text-[11px]">
        <tbody>
          {rows.map(([label, count]) => (
            <tr key={label} className="border-b border-slate-100">
              <td className="py-1 text-slate-700">{label}</td>
              <td className="py-1 text-right font-mono font-bold text-slate-900 tabular-nums w-16">
                {count}건
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );

  return (
    <article className="bg-white text-slate-900 font-sans">
      <header className="border-b-2 border-slate-900 pb-2 mb-5">
        <h1 className="text-lg font-bold">SchoolFix AI — 학교 신고 현황 리포트</h1>
        <p className="text-[11px] text-slate-500 mt-1">
          생성 일시: {now.toLocaleString("ko-KR")}
        </p>
      </header>

      <Section no={1} title="신고 현황">
        <table className="w-full text-[11px]">
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-1 text-slate-700">전체 신고</td>
              <td className="py-1 text-right font-mono font-bold tabular-nums w-16">
                {stats.total}건
              </td>
            </tr>
            {stats.byRisk["긴급"] > 0 && (
              <tr className="border-b border-slate-100">
                <td className="py-1 text-slate-700">긴급 신고</td>
                <td className="py-1 text-right font-mono font-bold tabular-nums">
                  {stats.byRisk["긴급"]}건
                </td>
              </tr>
            )}
            {stats.byRisk["높음"] > 0 && (
              <tr className="border-b border-slate-100">
                <td className="py-1 text-slate-700">높은 위험도 신고</td>
                <td className="py-1 text-right font-mono font-bold tabular-nums">
                  {stats.byRisk["높음"]}건
                </td>
              </tr>
            )}
            {stats.unanalyzed > 0 && (
              <tr className="border-b border-slate-100">
                <td className="py-1 text-slate-500">위험도 미분석</td>
                <td className="py-1 text-right font-mono tabular-nums text-slate-500">
                  {stats.unanalyzed}건
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section no={2} title="위험도별 현황">
        <Rows rows={riskRows} empty="위험도가 분석된 신고가 없습니다." />
      </Section>

      <Section no={3} title="카테고리별 현황">
        <Rows rows={categoryRows} empty="등록된 신고가 없습니다." />
      </Section>

      <Section no={4} title="처리 상태">
        <Rows
          rows={statusRows.map(([k, v]) => [
            STATUS_MAP[k as ReportStatus]?.label ?? k,
            v,
          ])}
          empty="등록된 신고가 없습니다."
        />
      </Section>

      <Section no={5} title="AI 요약">
        {summary ? (
          <div className="space-y-1.5 text-[11px] leading-relaxed">
            <p className="font-semibold text-slate-900">{summary.headline}</p>
            {summary.keyIssues.length > 0 && (
              <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                {summary.keyIssues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            )}
            {summary.recommendation && (
              <p className="text-slate-700">{summary.recommendation}</p>
            )}
            <p className="text-[10px] text-slate-400 pt-1">
              실제 신고 데이터를 기반으로 생성된 참고용 요약입니다.
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">
            AI 요약이 생성되지 않았습니다. [AI 요약]을 실행한 뒤 다시 저장하세요.
          </p>
        )}
      </Section>

      <Section no={6} title={`신고 목록 (${reports.length}건)`}>
        {reports.length === 0 ? (
          <p className="text-[11px] text-slate-500">표시할 신고가 없습니다.</p>
        ) : (
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="border-b border-slate-300 text-left">
                <th className="py-1 pr-2 font-semibold w-28">접수번호</th>
                <th className="py-1 pr-2 font-semibold w-16">위치</th>
                <th className="py-1 pr-2 font-semibold w-20">유형</th>
                <th className="py-1 pr-2 font-semibold w-12">위험도</th>
                <th className="py-1 pr-2 font-semibold w-14">상태</th>
                <th className="py-1 font-semibold">내용</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 align-top">
                  <td className="py-1 pr-2 font-mono">{r.id}</td>
                  <td className="py-1 pr-2">{r.location}</td>
                  <td className="py-1 pr-2">{r.category}</td>
                  <td className="py-1 pr-2">{r.riskLevel ?? "-"}</td>
                  <td className="py-1 pr-2">{STATUS_MAP[r.status]?.label ?? r.status}</td>
                  <td className="py-1 leading-snug">{r.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <footer className="border-t border-slate-300 pt-2 mt-4 text-[10px] text-slate-400">
        SchoolFix AI · 이 리포트에는 신고자 개인정보가 포함되지 않습니다.
      </footer>
    </article>
  );
}
