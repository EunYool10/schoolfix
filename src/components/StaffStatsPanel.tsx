import { useMemo, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight, Inbox, Loader2, Printer, Send, Table2 } from "lucide-react";
import type { StaffReport } from "../types";
import { STATUS_MAP } from "../types";
import { escapeHtml } from "../utils/reportDocument";
import { buildMonthlyReport, formatHours, monthKey, monthlyTrend, shiftMonth, type MonthlyStatsInput } from "../utils/monthlyStats";
import { computeSla } from "../utils/sla";
import { BreakdownBars, CHART, ChartLegend, MonthlyTrendChart, RISK_COLORS, StageStack, StatTile, type BreakdownRow } from "./StatsCharts";

const RISK_ORDER = ["긴급", "높음", "중간", "낮음", "미분석"];
const OPEN_STAGES = ["pending", "reviewing", "assigned", "scheduled", "in_progress"] as const;
/** 위치는 종류가 많아 상위 몇 곳만 막대로 보이고 나머지는 한 줄로 묶는다 */
const TOP_LOCATIONS = 6;

interface Props {
  schoolId: string;
  schoolName: string;
  reports: StaffReport[];
  /** 운영진만 디스코드로 월간 보고를 보낼 수 있다 */
  canNotify?: boolean;
}

function toInput(r: StaffReport): MonthlyStatsInput {
  return {
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    status: r.status,
    category: r.category,
    location: [r.locationType || r.location, r.locationDetail].filter(Boolean).join(" · "),
    riskLevel: r.riskLevel,
  };
}

function monthLabel(month: string) {
  const [y, m] = month.split("-");
  return `${y}년 ${Number(m)}월`;
}

/**
 * 월별 통계와 보고서 — 학교에 보고할 때 바로 쓸 수 있는 월간 수치.
 * 공개 보류 신고는 아직 처리 대상이 아니므로 제외한다.
 */
export function StaffStatsPanel({ schoolId, schoolName, reports, canNotify = false }: Props) {
  const inputs = useMemo(() => reports.filter((r) => r.moderationStatus !== "held").map(toInput), [reports]);
  const currentMonth = monthKey(new Date().toISOString()) as string;
  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => shiftMonth(currentMonth, -i)), [currentMonth]);
  const [month, setMonth] = useState(currentMonth);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);

  const sendToDiscord = async () => {
    setSending(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/staff/notifications/monthly", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, schoolId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "월간 보고를 보내지 못했습니다.");
      setNotice(`${monthLabel(month)} 월간 보고를 디스코드로 보냈습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "월간 보고를 보내지 못했습니다.");
    } finally {
      setSending(false);
    }
  };

  const report = useMemo(() => buildMonthlyReport(inputs, month), [inputs, month]);
  const previous = useMemo(() => buildMonthlyReport(inputs, shiftMonth(month, -1)), [inputs, month]);
  const trend = useMemo(() => monthlyTrend(inputs, 6), [inputs]);
  const trend12 = useMemo(() => monthlyTrend(inputs, 12).map((p) => ({ ...p, label: `${Number(p.month.slice(5))}월` })), [inputs]);
  const [showTable, setShowTable] = useState(false);
  const openNow = reports.filter((r) => r.moderationStatus !== "held" && r.status !== "completed");
  const overdueNow = openNow.filter((r) => computeSla(r).overdue).length;
  const monthIndex = monthOptions.indexOf(month);
  const stages = OPEN_STAGES.map((status) => ({ label: STATUS_MAP[status].label, value: openNow.filter((r) => r.status === status).length }));
  const riskRows: BreakdownRow[] = RISK_ORDER
    .map((level) => ({ label: level, value: report.byRisk.find(([k]) => k === level)?.[1] ?? 0, color: RISK_COLORS[level] }))
    .filter((row) => row.value > 0);
  const locationRows: BreakdownRow[] = [
    ...report.byLocation.slice(0, TOP_LOCATIONS).map(([label, value]) => ({ label, value })),
    ...(report.byLocation.length > TOP_LOCATIONS
      ? [{ label: `그 외 ${report.byLocation.length - TOP_LOCATIONS}곳`, value: report.byLocation.slice(TOP_LOCATIONS).reduce((sum, [, v]) => sum + v, 0), color: CHART.muted }]
      : []),
  ];
  const deltaOf = (a: number | null, b: number | null) => (a === null || b === null ? null : Math.round((a - b) * 10) / 10);

  const cards = [
    { label: "접수", value: `${report.received}건` },
    { label: "접수분 완료율", value: report.completionRate === null ? "-" : `${report.completionRate}%` },
    { label: "이 달 처리 완료", value: `${report.completedInMonth}건` },
    { label: "평균 처리 시간", value: formatHours(report.avgResolutionHours) },
    { label: "기한 넘겨 완료", value: `${report.completedLate}건` },
    { label: "현재 기한 초과", value: `${overdueNow}건` },
  ];

  const printReport = () => {
    const table = (title: string, rows: [string, number][]) =>
      `<h2>${escapeHtml(title)}</h2>${rows.length ? `<table>${rows.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td class="num">${v}건</td></tr>`).join("")}</table>` : `<p class="empty">해당 신고가 없습니다.</p>`}`;
    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(schoolName)} ${escapeHtml(monthLabel(month))} 신고 처리 보고서</title>
<style>@page{size:A4;margin:14mm}body{font-family:"Pretendard","Malgun Gothic",sans-serif;color:#0f172a;font-size:12px;line-height:1.5;margin:0;padding:16px}
h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;margin:18px 0 6px;border-bottom:1px solid #cbd5e1;padding-bottom:3px}
.meta{color:#64748b;font-size:10px}table{width:100%;border-collapse:collapse}td,th{padding:4px 6px;border-bottom:1px solid #e2e8f0;text-align:left}
.num{text-align:right;font-weight:700;width:90px}.grid td{width:33%}.empty{color:#64748b}</style></head><body>
<h1>${escapeHtml(schoolName)} — ${escapeHtml(monthLabel(month))} 신고 처리 보고서</h1>
<p class="meta">생성 ${escapeHtml(new Date().toLocaleString("ko-KR"))} · SchoolFix · 신고자 개인정보는 포함되지 않습니다.</p>
<h2>요약</h2><table class="grid"><tr>${cards.slice(0, 3).map((c) => `<td>${escapeHtml(c.label)}<br><b>${escapeHtml(c.value)}</b></td>`).join("")}</tr><tr>${cards.slice(3).map((c) => `<td>${escapeHtml(c.label)}<br><b>${escapeHtml(c.value)}</b></td>`).join("")}</tr></table>
<h2>최근 6개월 추이</h2><table><tr><th>월</th><th class="num">접수</th><th class="num">완료</th></tr>${trend.map((p) => `<tr><td>${escapeHtml(monthLabel(p.month))}</td><td class="num">${p.received}건</td><td class="num">${p.completed}건</td></tr>`).join("")}</table>
${table("유형별 접수", report.byCategory)}${table("위치별 접수", report.byLocation.slice(0, 15))}${table("위험도별 접수", report.byRisk)}
<h2>현재 미완료 신고 상태</h2>${(() => {
      const byStatus = new Map<string, number>();
      for (const r of openNow) byStatus.set(STATUS_MAP[r.status]?.label ?? r.status, (byStatus.get(STATUS_MAP[r.status]?.label ?? r.status) || 0) + 1);
      const rows = [...byStatus.entries()];
      return rows.length ? `<table>${rows.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td class="num">${v}건</td></tr>`).join("")}</table>` : `<p class="empty">미완료 신고가 없습니다.</p>`;
    })()}
</body></html>`;
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      setError("팝업이 차단되어 보고서를 열 수 없습니다. 팝업 차단을 해제한 뒤 다시 시도해주세요.");
      return;
    }
    setError("");
    win.document.open();
    win.document.write(html);
    win.document.close();
    const start = () => { try { win.focus(); win.print(); } catch { /* 창이 닫힌 경우 */ } };
    if (win.document.readyState === "complete") start();
    else win.addEventListener("load", start, { once: true });
  };

  return (
    <div className="space-y-4">
      {/* 필터는 한 줄, 화면 맨 위 — 아래 모든 숫자와 차트가 이 달 기준으로 바뀐다 */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-1" role="group" aria-label="보고 월 선택">
          <button type="button" aria-label="이전 달" disabled={monthIndex >= monthOptions.length - 1} onClick={() => setMonth(monthOptions[monthIndex + 1])} className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="보고 월" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">
            {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <button type="button" aria-label="다음 달" disabled={monthIndex <= 0} onClick={() => setMonth(monthOptions[monthIndex - 1])} className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            <ChevronRight className="h-4 w-4" />
          </button>
          {month !== currentMonth && (
            <button type="button" onClick={() => setMonth(currentMonth)} className="ml-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">이번 달</button>
          )}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {canNotify && (
            <button type="button" onClick={sendToDiscord} disabled={sending} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800 disabled:opacity-60">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} 디스코드로 보내기
            </button>
          )}
          <button type="button" onClick={printReport} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
            <Printer className="h-4 w-4" /> 보고서 인쇄·PDF
          </button>
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

      {inputs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <Inbox className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-slate-700">아직 통계를 낼 신고가 없어요</p>
          <p className="mt-1 text-xs text-slate-500">신고가 접수되면 월별 접수·처리 현황이 여기에 자동으로 집계됩니다.</p>
        </div>
      ) : <>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="접수" value={`${report.received}건`} delta={deltaOf(report.received, previous.received)} formatDelta={(v) => `${v}건`} upIsGood={null} />
        <StatTile label="접수분 완료율" value={report.completionRate === null ? "-" : `${report.completionRate}%`} delta={deltaOf(report.completionRate, previous.completionRate)} formatDelta={(v) => `${v}%p`} upIsGood hint="이 달 접수된 신고 중 처리 완료 비율" />
        <StatTile label="처리 완료" value={`${report.completedInMonth}건`} delta={deltaOf(report.completedInMonth, previous.completedInMonth)} formatDelta={(v) => `${v}건`} upIsGood hint="이 달에 완료 처리한 신고" />
        <StatTile label="평균 처리 시간" value={formatHours(report.avgResolutionHours)} delta={deltaOf(report.avgResolutionHours, previous.avgResolutionHours)} formatDelta={(v) => formatHours(v)} upIsGood={false} hint="접수부터 완료까지" />
        <StatTile label="기한 넘겨 완료" value={`${report.completedLate}건`} delta={deltaOf(report.completedLate, previous.completedLate)} formatDelta={(v) => `${v}건`} upIsGood={false} />
        <StatTile label="지금 기한 초과" value={`${overdueNow}건`} status={overdueNow > 0 ? "alert" : "ok"} hint={overdueNow > 0 ? "신고 관리 → '기한 초과' 필터로 확인" : "기한을 넘긴 미완료 신고가 없어요"} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">최근 12개월 접수·처리 추이</h2>
            <p className="text-xs text-slate-500">막대를 누르면 그 달의 통계로 바뀝니다.</p>
          </div>
          <div className="flex items-center gap-3">
            <ChartLegend items={[{ label: "접수", color: CHART.series1 }, { label: "처리 완료", color: CHART.series2 }]} />
            <button type="button" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              {showTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}{showTable ? "차트로 보기" : "표로 보기"}
            </button>
          </div>
        </div>
        {showTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-2 font-semibold">월</th><th className="py-2 text-right font-semibold">접수</th><th className="py-2 text-right font-semibold">처리 완료</th></tr></thead>
              <tbody>
                {[...trend12].reverse().map((p) => (
                  <tr key={p.month} className={`border-b border-slate-100 ${p.month === month ? "bg-blue-50/60 font-semibold" : ""}`}>
                    <td className="py-1.5"><button type="button" onClick={() => setMonth(p.month)} className="text-left hover:underline">{monthLabel(p.month)}</button></td>
                    <td className="py-1.5 text-right tabular-nums">{p.received}건</td>
                    <td className="py-1.5 text-right tabular-nums">{p.completed}건</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <MonthlyTrendChart points={trend12} selected={month} onSelect={setMonth} />
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-bold text-slate-900">{monthLabel(month)} 유형별 접수</h2>
          <BreakdownBars rows={report.byCategory.map(([label, value]) => ({ label, value }))} total={report.received} />
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-bold text-slate-900">{monthLabel(month)} 위치별 접수</h2>
          <BreakdownBars rows={locationRows} total={report.received} />
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-bold text-slate-900">{monthLabel(month)} 위험도별 접수</h2>
          <BreakdownBars rows={riskRows} total={report.received} />
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">지금 처리 중인 신고 <span className="font-normal text-slate-500">{openNow.length}건 · 단계별</span></h2>
          <p className="text-xs text-slate-500">보고 월과 관계없이 현재 상태입니다.</p>
        </div>
        <StageStack stages={stages} />
      </section>
      </>}
    </div>
  );
}
