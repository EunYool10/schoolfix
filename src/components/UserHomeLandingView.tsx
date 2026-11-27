import { useState } from "react";
import { ArrowRight, Check, Search, X } from "lucide-react";
import { SchoolReport, STATUS_MAP } from "../types";

interface UserHomeLandingViewProps {
  reports: SchoolReport[];
  onNavigateNewReport: () => void;
  onNavigateReports: (tab?: "MINE" | "ALL") => void;
  onOpenReportDetail: (report: SchoolReport) => void;
}

function placeOf(report: SchoolReport): string {
  return [report.locationType || report.location, report.locationDetail, report.buildingName, report.floor, report.department, report.grade ? `${report.grade}학년` : null, report.className, report.roomName]
    .filter(Boolean)
    .join(" · ");
}

function shortDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

/** 상태를 점 하나와 글자로 — 알약 모양 배지는 쓰지 않는다 */
function StatusText({ report }: { report: SchoolReport }) {
  const s = STATUS_MAP[report.status] ?? STATUS_MAP.pending;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold ${s.textColor}`}>
      <span className={`h-2 w-2 rounded-full ${s.dotClass}`} />
      {s.label}
    </span>
  );
}

const TIPS = [
  { lead: "자리를 콕 집어서", body: "“본관 3층 서쪽 남자 화장실 두 번째 세면대”처럼 적으면 담당 선생님이 바로 찾아가요.", color: "text-blue-700" },
  { lead: "사진 한 장 같이", body: "어디가 어떻게 망가졌는지 보이면 필요한 부품과 공구를 미리 챙길 수 있어요.", color: "text-emerald-700" },
  { lead: "이름은 안 받아요", body: "로그인도, 이름·학번·연락처도 없어요. 내 신고는 이 기기에서만 다시 볼 수 있어요.", color: "text-rose-600" },
];

export function UserHomeLandingView({ reports, onNavigateNewReport, onNavigateReports, onOpenReportDetail }: UserHomeLandingViewProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const total = reports.length;
  const completed = reports.filter((r) => r.status === "completed").length;
  const inProgress = reports.filter((r) => r.status !== "pending" && r.status !== "completed").length;
  const waiting = total - completed - inProgress;

  const topLocations = Object.entries(
    reports.reduce<Record<string, number>>((counts, report) => {
      const name = placeOf(report);
      counts[name] = (counts[name] || 0) + 1;
      return counts;
    }, {})
  )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, 4);

  const q = searchQuery.trim().toLowerCase();
  const found = q
    ? reports.filter((r) =>
        [r.id, r.location, r.schoolName, r.locationDetail, r.buildingName, r.floor, r.department, r.grade, r.className, r.roomName, r.category, r.title, r.description]
          .some((value) => value?.toLowerCase().includes(q))
      )
    : [];

  const recentFixed = reports
    .filter((r) => r.status === "completed")
    .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt))
    .slice(0, 4);

  return (
    <div className="space-y-14 sm:space-y-16">
      {/* 첫 화면 — 한 문장으로 무엇을 하는 곳인지, 바로 할 일 두 개 */}
      <section className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div>
          <p className="font-hand text-[22px] leading-none text-blue-600 sm:text-2xl">우리 학교, 같이 고쳐요</p>
          <h1 className="mt-4 break-keep text-[32px] leading-[1.28] text-slate-900 sm:text-[44px]">
            불편한 곳을 알려 주면
            <br />
            <span className="sf-mark">선생님이 확인하고</span> 고쳐요
          </h1>
          <p className="mt-5 max-w-lg break-keep text-[15px] leading-relaxed text-slate-600 sm:text-base">
            고장 난 시설, 위험한 곳, 불편한 점을 알려 주세요. 이름·학번·연락처는 받지 않고, 어떻게 처리되는지는 누구나 볼 수 있어요.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button type="button" onClick={onNavigateNewReport} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3.5 text-base font-bold text-white hover:bg-blue-700 active:translate-y-px">
              신고하러 가기 <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => onNavigateReports("MINE")} className="rounded-2xl border border-slate-300 bg-white px-5 py-3.5 text-base font-semibold text-slate-800 hover:border-slate-400">
              내 신고 보기
            </button>
          </div>
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-7">
          <h2 className="font-display text-lg text-slate-900">우리 학교 신고 현황</h2>
          <dl className="mt-5 grid grid-cols-3">
            {[
              { label: "기다리는 중", value: waiting, dot: "bg-slate-400" },
              { label: "고치는 중", value: inProgress, dot: "bg-amber-400" },
              { label: "고쳤어요", value: completed, dot: "bg-emerald-500" },
            ].map((item, index) => (
              <div key={item.label} className={index > 0 ? "border-l border-slate-200 pl-4" : "pr-4"}>
                <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <span className={`h-2 w-2 rounded-full ${item.dot}`} />
                  {item.label}
                </dt>
                <dd className="mt-1.5 font-display text-[28px] leading-none text-slate-900">
                  {item.value}
                  <span className="ml-0.5 font-sans text-sm font-medium text-slate-500">건</span>
                </dd>
              </div>
            ))}
          </dl>

          <h3 className="mt-7 text-sm font-bold text-slate-800">자주 신고된 곳</h3>
          {topLocations.length > 0 ? (
            <ol className="mt-2 divide-y divide-slate-100">
              {topLocations.map(([name, count], index) => (
                <li key={name} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-4 shrink-0 font-display text-slate-400">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-800">{name}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">{count}건</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 font-hand text-xl text-slate-500">아직 신고가 없어요. 첫 번째로 알려 주세요!</p>
          )}
          <button type="button" onClick={() => onNavigateReports("ALL")} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline">
            전체 신고 보기 <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </aside>
      </section>

      {/* 찾아보기 */}
      <section>
        <label htmlFor="user-report-search" className="font-display text-xl text-slate-900">
          접수번호나 장소로 찾아보기
        </label>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            id="user-report-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="예: REP-2026…, 3층 복도, 급식실, 정수기"
            className="h-14 w-full rounded-2xl pl-12 pr-12 text-base"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery("")} aria-label="검색어 지우기" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {q && (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white">
            {found.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">찾는 신고가 없어요. 접수번호를 다시 확인해 주세요.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {found.slice(0, 8).map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => onOpenReportDetail(r)} className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-slate-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-slate-900">{r.title || `${r.location} ${r.category}`}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">{placeOf(r)} · <span className="font-mono">{r.id}</span></span>
                      </span>
                      <StatusText report={r} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {found.length > 8 && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">{found.length}건 중 8건만 보여요. 신고 목록에서 더 자세히 찾을 수 있어요.</p>}
          </div>
        )}
      </section>

      {/* 최근에 고쳐진 곳 */}
      {recentFixed.length > 0 && (
        <section>
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-xl text-slate-900">최근에 고쳐진 곳</h2>
            <button type="button" onClick={() => onNavigateReports("ALL")} className="text-sm font-semibold text-slate-600 hover:text-slate-900">더 보기</button>
          </div>
          <ul className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {recentFixed.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => onOpenReportDetail(item)} className="flex w-full items-start gap-3.5 px-5 py-4 text-left hover:bg-slate-50">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-slate-900">{item.title || `${item.location} ${item.category}`}</span>
                    <span className="mt-0.5 block truncate text-sm text-slate-600">{item.resolutionNote || item.description}</span>
                    <span className="mt-1 block truncate text-xs text-slate-400">{placeOf(item)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{shortDate(item.completedAt) || "최근"}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 이렇게 알려 주면 더 빨리 고쳐져요 */}
      <section>
        <h2 className="font-display text-xl text-slate-900">이렇게 알려 주면 더 빨리 고쳐져요</h2>
        <div className="mt-5 grid gap-6 sm:grid-cols-3 sm:gap-8">
          {TIPS.map((tip) => (
            <div key={tip.lead} className="border-t-2 border-slate-200 pt-4">
              <p className={`font-hand text-[22px] leading-tight ${tip.color}`}>{tip.lead}</p>
              <p className="mt-2 break-keep text-sm leading-relaxed text-slate-600">{tip.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
