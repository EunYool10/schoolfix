import { useEffect, useRef } from "react";
import { ExternalLink, X } from "lucide-react";

interface Props {
  onClose: () => void;
}

// 은율이 만든 다른 앱. icon은 각 앱의 파비콘 사본(public/apps), color는 그 파비콘에서 딴 색.
// slow: 무료 서버라 처음 열 때 깨어나는 데 시간이 걸린다.
const APPS: { name: string; about: string; url: string; icon: string; color: string; slow?: boolean }[] = [
  {
    name: "계란이의 모험",
    about: "현대·고대·미래, 세 시대의 계란이가 엄마 품을 찾아 떠나는 선택형 텍스트 어드벤처",
    url: "https://egggame.onrender.com/",
    icon: "/apps/egggame.png",
    color: "#f0a830",
    slow: true,
  },
  {
    name: "상큼 과일 아케이드 존",
    about: "과일 메모리, 수박 게임, 과일 자르기… 오늘의 미션에 도전하는 과일 미니게임 모음",
    url: "https://eunyool10.github.io/FruitArcade/",
    icon: "/apps/fruitarcade.png",
    color: "#f2456f",
  },
  {
    name: "논리 미궁: 대우의 열쇠",
    about: "원래 명제의 대우를 골라 다섯 개의 방을 탈출하는 논리 퀴즈 게임",
    url: "https://eunyool10.github.io/LogicMaze/",
    icon: "/apps/logicmaze.svg",
    color: "#b8924a",
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="other-apps-title" className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div><p className="text-xs font-bold text-blue-700">SchoolFix AI</p><h2 id="other-apps-title" className="mt-1 text-xl font-extrabold text-slate-950">은율이의 다른 앱</h2><p className="mt-1 text-xs text-slate-500">누르면 새 탭에서 열립니다.</p></div>
          <button ref={closeRef} type="button" aria-label="닫기" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>
        <ul className="grid gap-3 overflow-y-auto p-5">
          {APPS.map((app) => (
            <li key={app.url}>
              <a
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md"
                style={{ borderLeft: `6px solid ${app.color}`, background: `color-mix(in srgb, ${app.color} 7%, white)` }}
              >
                <img src={app.icon} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl border border-slate-200" />
                <span className="min-w-0 flex-1 break-keep">
                  <span className="block text-sm font-extrabold text-slate-900">{app.name}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">{app.about}</span>
                  {app.slow && <span className="mt-1 block text-[11px] font-bold" style={{ color: app.color }}>무료 서버라 처음 열 때 30초쯤 걸릴 수 있어요</span>}
                </span>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white" style={{ background: app.color }}>
                  <ExternalLink className="h-4 w-4" aria-label="새 탭에서 열기" />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
