import { House, ListChecks, PencilLine, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavView = "HOME" | "NEW_REPORT" | "REPORTS" | "STAFF";

const NAV_ITEMS: { view: NavView; label: string; short: string; Icon: LucideIcon }[] = [
  { view: "HOME", label: "홈", short: "홈", Icon: House },
  { view: "NEW_REPORT", label: "신고하기", short: "신고하기", Icon: PencilLine },
  { view: "REPORTS", label: "신고 목록", short: "목록", Icon: ListChecks },
  { view: "STAFF", label: "선생님·운영진", short: "운영진", Icon: UsersRound },
];

interface HeaderProps {
  view: NavView | null;
  onNavigate: (view: NavView) => void;
  /** 내 신고 새 소식 수 — 신고 목록 옆에 숫자로 보여 준다 */
  updatesCount: number;
  schoolName: string;
  onChangeSchool: () => void;
}

/**
 * 머리글. 큰 화면에서는 메뉴가 머리글 안에 있고, 휴대폰에서는 화면 아래 탭으로 내려간다.
 * SPA 이므로 location.href 로 전체 새로고침을 일으키지 않고 상위 상태만 바꾼다.
 */
export function Header({ view, onNavigate, updatesCount, schoolName, onChangeSchool }: HeaderProps) {
  const badge = (item: NavView) =>
    item === "REPORTS" && updatesCount > 0 ? (
      <span className="ml-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-[18px] text-white" aria-label={`내 신고 새 소식 ${updatesCount}건`}>
        {updatesCount}
      </span>
    ) : null;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-paper/95 backdrop-blur-sm print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-stretch gap-4 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => onNavigate("HOME")}
            aria-label="SchoolFix 홈으로"
            className="-ml-1 flex shrink-0 items-center gap-2.5 self-center rounded-xl px-1 py-1"
          >
            <img src="/icon-192.png" alt="" className="h-8 w-8 rounded-[9px]" />
            <span className="font-display text-[19px] leading-none text-slate-900">SchoolFix</span>
          </button>

          <nav aria-label="주요 메뉴" className="ml-4 hidden items-stretch md:flex">
            {NAV_ITEMS.map(({ view: item, label, Icon }) => (
              <button
                key={item}
                type="button"
                onClick={() => onNavigate(item)}
                aria-current={view === item ? "page" : undefined}
                className={`sf-nav-link inline-flex items-center gap-1.5 px-3.5 text-[15px] font-semibold ${view === item ? "text-blue-700" : "text-slate-600 hover:text-slate-900"}`}
              >
                <Icon className="h-[17px] w-[17px]" strokeWidth={2.1} />
                {label}
                {badge(item)}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={onChangeSchool}
            className="ml-auto flex min-w-0 items-center gap-2 self-center rounded-xl px-2 py-1.5 text-left hover:bg-white"
          >
            <span className="min-w-0 truncate text-sm font-semibold text-slate-800">{schoolName}</span>
            <span className="shrink-0 text-xs text-slate-500 underline decoration-slate-300 underline-offset-4">바꾸기</span>
          </button>
        </div>
      </header>

      <nav aria-label="주요 메뉴" className="sf-bottom-nav fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white md:hidden print:hidden">
        {NAV_ITEMS.map(({ view: item, short, Icon }) => (
          <button
            key={item}
            type="button"
            onClick={() => onNavigate(item)}
            aria-current={view === item ? "page" : undefined}
            className={`sf-tab-link flex h-16 flex-col items-center justify-center gap-1 text-[11px] ${view === item ? "font-bold text-blue-700" : "font-medium text-slate-500"}`}
          >
            <span className="relative">
              <Icon className="h-[21px] w-[21px]" strokeWidth={view === item ? 2.3 : 1.9} />
              {item === "REPORTS" && updatesCount > 0 && <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-rose-500" aria-label={`내 신고 새 소식 ${updatesCount}건`} />}
            </span>
            {short}
          </button>
        ))}
      </nav>
    </>
  );
}
