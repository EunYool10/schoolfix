import { useEffect, useRef } from "react";
import { ArrowUpRight, X } from "lucide-react";

interface Props {
  onClose: () => void;
}

// 은율이 만든 다른 앱. icon은 각 앱의 아이콘 사본(public/apps).
// note: 이름 옆에 붙는 짧은 안내 (예: 서비스 종료)
const APPS: { name: string; about: string; url: string; icon: string; note?: string }[] = [
  {
    name: "마지막 방",
    about: "고인이 남긴 방을 치우고, 남겨진 물건으로 마지막 이야기를 듣는 1인칭 추리 게임",
    url: "https://eunyool10.github.io/LastRoom/",
    icon: "/apps/lastroom.png",
  },
  {
    name: "AI Hub",
    about: "분야별로 정리한 AI 도구를 검색하고 비교하는 AI 도구 모음",
    url: "https://eunyool10.github.io/AI-Hub-By-EunYool/",
    icon: "/apps/aihub.png",
  },
  {
    name: "창의경영고 학사 달력",
    about: "시험, 학교 일정, 휴일을 한눈에 보는 창의경영고등학교 학사 달력",
    url: "https://eunyool10.github.io/changui-academic-calendar/",
    icon: "/apps/changui-calendar.png",
  },
  {
    name: "창의경영고 분실물 센터",
    about: "분실물·습득물을 사진과 함께 올리고, 주인과 주운 사람이 바로 채팅하는 앱",
    url: "https://eunyool10.github.io/changui-lost-found/",
    icon: "/apps/changui-lost-found.png",
  },
  {
    name: "상큼 과일 아케이드 존",
    about: "과일 메모리, 수박 게임, 과일 자르기… 오늘의 미션에 도전하는 과일 미니게임 모음",
    url: "https://eunyool10.github.io/FruitArcade/",
    icon: "/apps/fruitarcade.png",
  },
  {
    name: "논리 미궁: 대우의 열쇠",
    about: "원래 명제의 대우를 골라 다섯 개의 방을 탈출하는 논리 퀴즈 게임",
    url: "https://eunyool10.github.io/LogicMaze/",
    icon: "/apps/logicmaze.svg",
  },
  {
    name: "계란이의 모험",
    about: "현대·고대·미래, 세 시대의 계란이가 엄마 품을 찾아 떠나는 선택형 텍스트 어드벤처",
    url: "https://eunyool10.github.io/Egggame/",
    icon: "/apps/egggame.png",
    note: "서비스 종료",
  },
];

export function OtherAppsDialog({ onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // 열릴 때 한 번만 닫기 버튼에 포커스를 준다.
  useEffect(() => { closeRef.current?.focus(); }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="other-apps-title" className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <header className="flex items-start justify-between gap-4 px-6 pb-3 pt-6">
          <div>
            <p className="font-hand text-xl leading-none text-blue-600">이것도 만들었어요</p>
            <h2 id="other-apps-title" className="mt-2 font-display text-2xl text-slate-900">은율이의 다른 앱</h2>
            <p className="mt-1 text-sm text-slate-500">누르면 새 탭에서 열려요.</p>
          </div>
          <button ref={closeRef} type="button" aria-label="닫기" onClick={onClose} className="-mr-2 rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>
        <ul className="divide-y divide-slate-100 overflow-y-auto px-3 pb-4">
          {APPS.map((app) => (
            <li key={app.url}>
              <a href={app.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3.5 rounded-2xl px-3 py-3.5 text-left hover:bg-slate-50">
                <img src={app.icon} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-[14px] border border-slate-200" />
                <span className="min-w-0 flex-1 break-keep">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[15px] font-bold text-slate-900">{app.name}</span>
                    {app.note && <span className="text-xs font-semibold text-slate-400">{app.note}</span>}
                  </span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-slate-600">{app.about}</span>
                </span>
                <ArrowUpRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-blue-600" aria-label="새 탭에서 열기" />
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
