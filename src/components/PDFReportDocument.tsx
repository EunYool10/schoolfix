import React from "react";
import {
  AIAnalysisReportData,
  SchoolReport,
  STATUS_MAP,
} from "../types";
import {
  Building2,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  FileText,
  MapPin,
  Tag,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface PDFReportDocumentProps {
  reportData: AIAnalysisReportData;
  rawReports: SchoolReport[];
  isPrintVersion?: boolean;
}

export function PDFReportDocument({
  reportData,
  rawReports,
  isPrintVersion = false,
}: PDFReportDocumentProps) {
  const safety = reportData.safetyTrends;

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${String(
        d.getHours()
      ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch {
      return iso;
    }
  };

  const priorityBadgeStyle = (priority: string) => {
    switch (priority) {
      case "긴급":
        return "bg-rose-100 text-rose-800 border-rose-300";
      case "높음":
        return "bg-amber-100 text-amber-800 border-amber-300";
      case "보통":
        return "bg-blue-100 text-blue-800 border-blue-300";
      default:
        return "bg-slate-100 text-slate-800 border-slate-300";
    }
  };

  const today = new Date();
  const docSerial = `SF-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div
      className={`bg-white text-slate-900 font-sans space-y-7 leading-relaxed ${
        isPrintVersion ? "p-0" : "max-w-4xl mx-auto"
      }`}
      style={{
        fontFamily:
          'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
      }}
    >
      {/* 1. Official Header & Approval Signature Block */}
      <div className="border-b-2 border-slate-900 pb-5 pdf-section-avoid-break">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded shrink-0">
                <Building2 className="h-3.5 w-3.5" />
                SchoolFix 학교 시설 안전 관리본부
              </span>
              <span className="text-xs text-slate-500 font-mono shrink-0">
                문서번호: {docSerial}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight break-keep">
              교내 시설 불편 및 안전 위험 종합 분석 리포트
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 break-keep">
              학생들이 직접 접수한 실제 신고 데이터 전수 기반 AI 안전 트렌드 및 우선 조치 권고
            </p>
          </div>

          {/* Official Administrative Approval Stamp Box */}
          <div className="border border-slate-300 rounded overflow-hidden text-center text-xs shrink-0 self-start bg-white">
            <table className="border-collapse">
              <tbody>
                <tr className="bg-slate-100 border-b border-slate-300 font-semibold text-slate-700">
                  <th className="py-1 px-3 border-r border-slate-300 text-[11px]">기안/담당자</th>
                  <th className="py-1 px-3 text-[11px]">시설안전책임자</th>
                </tr>
                <tr className="h-12">
                  <td className="w-20 border-r border-slate-300 text-slate-400 align-middle text-[11px]">
                    (서명)
                  </td>
                  <td className="w-24 text-slate-400 align-middle text-[11px]">
                    (인/서명)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 border-t border-slate-100 pt-2 font-mono">
          <span>분석 대상: 등록 신고 {rawReports.length}건 전수</span>
          <span>보고서 생성 일시: {formatDateTime(reportData.analyzedAt)}</span>
        </div>
      </div>

      {/* 2. 시설 안전 주요 트렌드 진단 (AI Safety Trends) */}
      {safety && (
        <section className="space-y-3 p-4 rounded-lg bg-blue-50/40 border border-blue-200 pdf-section-avoid-break">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-blue-700" />
              <span>1. 시설 안전 주요 트렌드 진단 (AI Safety Trends)</span>
            </h2>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                safety.overallRiskLevel === "dangerous"
                  ? "bg-rose-100 text-rose-800 border-rose-300"
                  : safety.overallRiskLevel === "warning"
                  ? "bg-amber-100 text-amber-800 border-amber-300"
                  : safety.overallRiskLevel === "caution"
                  ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                  : "bg-emerald-100 text-emerald-800 border-emerald-300"
              }`}
            >
              종합 안전 등급: {safety.overallRiskLevelLabel}
            </span>
          </div>

          <div className="bg-white rounded-md p-3 border border-blue-100 text-xs sm:text-sm text-slate-800 space-y-1.5">
            <p className="font-bold text-blue-950 text-sm">
              📌 {safety.trendHeadline}
            </p>
            <p className="text-slate-700 leading-relaxed">
              {safety.trendSummary}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-white p-3 rounded border border-slate-200">
              <span className="font-bold text-slate-900 block mb-1">
                📍 집중 취약 구역 (Hotspots)
              </span>
              {safety.hotspots.length === 0 ? (
                <p className="text-slate-500">특정 취약 구역이 집중되지 않았습니다.</p>
              ) : (
                <ul className="space-y-1 text-slate-700">
                  {safety.hotspots.map((h, idx) => (
                    <li key={idx} className="flex items-start gap-1">
                      <span className="font-semibold text-blue-700">[{h.location}]</span>
                      <span>{h.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white p-3 rounded border border-slate-200">
              <span className="font-bold text-slate-900 block mb-1">
                ⚠️ 빈발 위험 유형 (Frequent Risks)
              </span>
              {safety.frequentRisks.length === 0 ? (
                <p className="text-slate-500">특정 위험 유형이 편중되지 않았습니다.</p>
              ) : (
                <ul className="space-y-1 text-slate-700">
                  {safety.frequentRisks.map((f, idx) => (
                    <li key={idx} className="flex items-start gap-1">
                      <span className="font-semibold text-amber-700">[{f.category}]</span>
                      <span>{f.description}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 3. 종합 요약 및 처리 통계 */}
      <section className="space-y-3 pdf-section-avoid-break">
        <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5 border-b pb-1">
          <FileText className="h-4 w-4 text-slate-700" />
          <span>2. 교내 시설 종합 현황 및 처리 지표</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
          {reportData.overallSummary}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
          <div className="p-2.5 rounded border border-slate-200 bg-slate-50">
            <span className="block text-slate-500 text-[11px]">총 접수 건수</span>
            <strong className="text-base sm:text-lg font-bold text-slate-900 font-mono">
              {reportData.stats.total}건
            </strong>
          </div>
          <div className="p-2.5 rounded border border-slate-200 bg-slate-50">
            <span className="block text-slate-500 text-[11px]">접수 대기</span>
            <strong className="text-base sm:text-lg font-bold text-slate-700 font-mono">
              {reportData.stats.pending}건
            </strong>
          </div>
          <div className="p-2.5 rounded border border-amber-200 bg-amber-50/50">
            <span className="block text-amber-700 text-[11px]">처리 중</span>
            <strong className="text-base sm:text-lg font-bold text-amber-900 font-mono">
              {reportData.stats.inProgress}건
            </strong>
          </div>
          <div className="p-2.5 rounded border border-emerald-200 bg-emerald-50/50">
            <span className="block text-emerald-700 text-[11px]">처리 완료</span>
            <strong className="text-base sm:text-lg font-bold text-emerald-900 font-mono">
              {reportData.stats.completed}건
            </strong>
          </div>
        </div>
      </section>

      {/* 4. AI 판정 긴급 및 주요 우선 조치 대상 (Priority Matrix) */}
      <section className="space-y-3 pdf-section-avoid-break">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-1">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            <span>3. AI 판정 주요 우선 조치 대상 ({reportData.priorityItems.length}건)</span>
          </h2>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-rose-700 font-semibold">
              긴급: {reportData.priorityStats.urgent}건
            </span>
            <span className="text-amber-700 font-semibold">
              높음: {reportData.priorityStats.high}건
            </span>
            <span className="text-blue-700 font-semibold">
              보통: {reportData.priorityStats.medium}건
            </span>
          </div>
        </div>

        {reportData.priorityItems.length === 0 ? (
          <p className="text-xs text-slate-500 p-4 text-center border border-dashed rounded-lg">
            긴급 또는 우선 처리가 필요한 조치 대상이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                  <th className="py-2 px-2.5 w-24">접수번호</th>
                  <th className="py-2 px-2.5 w-16">우선순위</th>
                  <th className="py-2 px-2.5 w-20">위치</th>
                  <th className="py-2 px-2.5 w-20">문제 종류</th>
                  <th className="py-2 px-3">내용 요약 및 AI 판정 사유</th>
                  <th className="py-2 px-2.5 w-20 text-center">처리 상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {reportData.priorityItems.map((item) => (
                  <tr key={item.reportId} className="hover:bg-slate-50/80">
                    <td className="py-2 px-2.5 font-mono text-[11px] font-bold text-slate-800">
                      {item.reportId}
                    </td>
                    <td className="py-2 px-2.5">
                      <span
                        className={`inline-block px-1.5 py-0.5 text-[10px] font-bold rounded border ${priorityBadgeStyle(
                          item.priority
                        )}`}
                      >
                        {item.priority}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 font-medium text-slate-800">
                      {item.location}
                    </td>
                    <td className="py-2 px-2.5 text-slate-600">
                      {item.category}
                    </td>
                    <td className="py-2 px-3 space-y-1">
                      <div className="font-semibold text-slate-900 leading-snug">
                        {item.contentSummary}
                      </div>
                      <div className="text-[11px] text-blue-900 bg-blue-50/70 p-1.5 rounded border border-blue-100 leading-tight">
                        <strong>판정 근거:</strong> {item.rationale}
                      </div>
                    </td>
                    <td className="py-2 px-2.5 text-center">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                        {item.currentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 5. 장소별 및 종류별 요약 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 pdf-section-avoid-break text-xs">
        <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/40">
          <h3 className="font-bold text-slate-900 flex items-center gap-1 border-b pb-1">
            <MapPin className="h-3.5 w-3.5 text-blue-700" />
            <span>장소별 신고 분포</span>
          </h3>
          <ul className="space-y-1.5 text-slate-700">
            {reportData.locationSummaries.map((loc, idx) => (
              <li key={idx} className="flex items-start justify-between gap-2">
                <span className="font-semibold text-slate-900">
                  {loc.location} ({loc.count}건)
                </span>
                <span className="text-slate-600 text-right text-[11px] flex-1 truncate">
                  {loc.summary}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/40">
          <h3 className="font-bold text-slate-900 flex items-center gap-1 border-b pb-1">
            <Tag className="h-3.5 w-3.5 text-amber-700" />
            <span>문제 종류별 신고 분포</span>
          </h3>
          <ul className="space-y-1.5 text-slate-700">
            {reportData.categorySummaries.map((cat, idx) => (
              <li key={idx} className="flex items-start justify-between gap-2">
                <span className="font-semibold text-slate-900">
                  {cat.category} ({cat.count}건)
                </span>
                <span className="text-slate-600 text-right text-[11px] flex-1 truncate">
                  {cat.summary}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 6. 조치 권고사항 & 반복 이슈 */}
      <section className="space-y-3 pdf-section-avoid-break">
        <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5 border-b pb-1">
          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
          <span>4. 시설 안전 관리 권고사항 및 재발 방지 대책</span>
        </h2>

        {reportData.recommendations.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-800">
              📋 학교 안전 관리자 권고사항:
            </span>
            <ul className="space-y-1 text-xs text-slate-700 list-disc list-inside bg-white p-3 rounded border border-slate-200">
              {reportData.recommendations.map((rec, idx) => (
                <li key={idx} className="leading-relaxed">
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}

        {reportData.recurringIssues.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-rose-800">
              ⚠️ 반복/연속 발생 주의 시설 이슈:
            </span>
            <div className="space-y-2 text-xs">
              {reportData.recurringIssues.map((rec, idx) => (
                <div
                  key={idx}
                  className="bg-rose-50/50 p-2.5 rounded border border-rose-200 text-slate-800"
                >
                  <p className="font-bold text-rose-900">{rec.issue}</p>
                  <p className="text-slate-600 text-[11px] mt-0.5">{rec.evidence}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 7. 전체 실제 접수 내역 (전수 부록) */}
      <section className="space-y-3 pdf-section-avoid-break">
        <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5 border-b pb-1">
          <Building2 className="h-4 w-4 text-slate-700" />
          <span>5. 접수 신고 전수 목록 ({rawReports.length}건)</span>
        </h2>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                <th className="py-1.5 px-2.5 w-24">접수번호</th>
                <th className="py-1.5 px-2.5 w-20">위치</th>
                <th className="py-1.5 px-2.5 w-20">유형</th>
                <th className="py-1.5 px-3">신고 내용 원본</th>
                <th className="py-1.5 px-2 w-16 text-center">신고자</th>
                <th className="py-1.5 px-2 w-16 text-center">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-[11px]">
              {rawReports.map((r) => {
                const cfg = STATUS_MAP[r.status] || STATUS_MAP.pending;
                return (
                  <tr key={r.id}>
                    <td className="py-2 px-2.5 font-mono font-medium text-slate-800">
                      {r.id}
                    </td>
                    <td className="py-2 px-2.5">{r.location}</td>
                    <td className="py-2 px-2.5">{r.category}</td>
                    <td className="py-2 px-3 text-slate-700 leading-snug">
                      {r.description}
                    </td>
                    <td className="py-2 px-2 text-center text-slate-500">
                      {r.isAnonymous ? "익명" : "실명"}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${cfg.badgeClass}`}>
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Official Sign-off Footer */}
      <div className="pt-6 border-t-2 border-slate-300 text-center text-xs text-slate-500 space-y-1 pdf-section-avoid-break">
        <p className="font-bold text-slate-800 text-sm tracking-wide">
          SchoolFix 교내 시설 안전 모니터링 시스템
        </p>
        <p className="text-[11px] text-slate-500">
          본 문서는 학교 구성원의 안전과 교내 시설 편의 증진을 목적으로 실제 접수 데이터를 기반으로 자동 편성된 공식 보고서입니다.
        </p>
      </div>
    </div>
  );
}
