import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import type { StaffReport } from "../types";
import { STATUS_MAP } from "../types";
import { escapeHtml } from "../utils/reportDocument";
import { buildMonthlyReport, formatHours, monthKey, monthlyTrend, shiftMonth, type MonthlyStatsInput } from "../utils/monthlyStats";
import { computeSla } from "../utils/sla";

interface Props {
  schoolName: string;
  reports: StaffReport[];
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
export function StaffStatsPanel({ schoolName, reports }: Props) {
  const inputs = useMemo(() => reports.filter((r) => r.moderationStatus !== "held").map(toInput), [reports]);
  const currentMonth = monthKey(new Date().toISOString()) as string;
  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => shiftMonth(currentMonth, -i)), [currentMonth]);
  const [month, setMonth] = useState(currentMonth);
  const [error, setError] = useState("");

  const report = useMemo(() => buildMonthlyReport(inputs, month), [inputs, month]);
  const trend = useMemo(() => monthlyTrend(inputs, 6), [inputs]);
  const maxTrend = Math.max(1, ...trend.map((p) => Math.max(p.received, p.completed)));
  const openNow = reports.filter((r) => r.moderationStatus !== "held" && r.status !== "completed");
  const overdueNow = openNow.filter((r) => computeSla(r).overdue).length;

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
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <label className="text-sm font-semibold text-slate-700">
          보고 월{" "}
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="ml-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
        <button type="button" onClick={printReport} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
          <Printer className="h-4 w-4" /> 보고서 인쇄·PDF
        </button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-500">{c.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{c.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-900">최근 6개월 추이</h2>
        <div className="mt-3 space-y-2">
          {trend.map((p) => (
            <div key={p.month} className="grid grid-cols-[4.5rem_1fr] items-center gap-3 text-xs">
              <span className="font-semibold text-slate-600">{monthLabel(p.month).replace(/^\d+년 /, "")}</span>
              <div className="space-y-1">
                <div className="flex items-center gap-2"><div className="h-2.5 rounded-full bg-blue-600" style={{ width: `${(p.received / maxTrend) * 100}%`, minWidth: p.received ? 6 : 0 }} /><span className="tabular-nums text-slate-600">접수 {p.received}</span></div>
                <div className="flex items-center gap-2"><div className="h-2.5 rounded-full bg-emerald-500" style={{ width: `${(p.completed / maxTrend) * 100}%`, minWidth: p.completed ? 6 : 0 }} /><span className="tabular-nums text-slate-600">완료 {p.completed}</span></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {([["유형별", report.byCategory], ["위치별", report.byLocation.slice(0, 8)], ["위험도별", report.byRisk]] as [string, [string, number][]][]).map(([title, rows]) => (
          <section key={title} className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">{monthLabel(month)} {title} 접수</h2>
            {rows.length === 0 ? <p className="mt-3 text-xs text-slate-500">해당 신고가 없습니다.</p> : (
              <ul className="mt-3 space-y-1.5">
                {rows.map(([name, count]) => (
                  <li key={name} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate text-slate-700">{name}</span><span className="font-bold tabular-nums text-slate-900">{count}건</span></li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
