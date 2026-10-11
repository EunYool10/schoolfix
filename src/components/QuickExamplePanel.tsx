import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, LayoutGrid, Lightbulb, PenLine, RotateCw, Undo2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { eligibleExamples, pickExamples, type FormExampleItem } from "../data/formExamples";
import { ISSUE_CATEGORIES, type School } from "../types";

export interface ExampleTask {
  key: string;
  label: string;
  onClick: () => void;
}

interface QuickExamplePanelProps {
  school: School;
  availableLocations: string[];
  /** 지금 고른 장소. 바뀌면 그 장소 예시를 먼저 보여 준다. */
  currentLocation: string;
  icons: Record<string, LucideIcon>;
  /** 지금 채워 둔 예시 (없으면 null) */
  applied: { key: string; label: string; canRestore: boolean } | null;
  tasks: ExampleTask[];
  onApply: (example: FormExampleItem) => void;
  onFreeWrite: () => void;
  onUndo: () => void;
}

const COUNT = 6;

/**
 * 빠른 작성 예시. 카드를 고르면 폼이 채워지고, 패널은 "남은 할 일" 로 접힌다.
 * 화면 전용이며 고른 예시는 어디에도 저장하지 않는다.
 */
export function QuickExamplePanel({ school, availableLocations, currentLocation, icons, applied, tasks, onApply, onFreeWrite, onUndo }: QuickExamplePanelProps) {
  const [category, setCategory] = useState<string | null>(null);
  const [shown, setShown] = useState<FormExampleItem[]>(() => pickExamples({ count: COUNT, location: currentLocation, school, availableLocations }));
  const [browsing, setBrowsing] = useState(false);
  const pickedLocation = useRef(currentLocation);
  const appliedRef = useRef<HTMLDivElement>(null);

  const eligible = eligibleExamples(school, availableLocations);
  const categories = ISSUE_CATEGORIES.map((name) => ({ name, count: eligible.filter((item) => item.category === name).length })).filter((entry) => entry.count > 0);
  const poolSize = category ? eligible.filter((item) => item.category === category).length : eligible.length;

  useEffect(() => {
    if (pickedLocation.current === currentLocation) return;
    pickedLocation.current = currentLocation;
    setShown(pickExamples({ count: COUNT, location: currentLocation, category, school, availableLocations }));
  }, [currentLocation]);

  useEffect(() => {
    if (applied && !browsing) appliedRef.current?.focus({ preventScroll: true });
  }, [applied?.key, browsing]);

  const changeCategory = (next: string | null) => {
    setCategory(next);
    setShown(pickExamples({ count: COUNT, location: currentLocation, category: next, school, availableLocations }));
  };
  const refresh = () => setShown(pickExamples({ count: COUNT, location: currentLocation, category, exclude: shown.map((item) => item.key), school, availableLocations }));

  if (applied && !browsing) {
    return (
      <div ref={appliedRef} tabIndex={-1} aria-live="polite" className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/60 p-3.5 outline-none sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"><Check className="h-3.5 w-3.5" /></span>
            ‘{applied.label}’ {applied.key === "free" ? "틀을 넣었어요" : "예시로 채웠어요"}
          </p>
          <div className="flex gap-1">
            <button type="button" onClick={onUndo} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white hover:text-slate-900">
              <Undo2 className="h-3.5 w-3.5" />{applied.canRestore ? "이전 내용으로" : "예시 지우기"}
            </button>
            <button type="button" onClick={() => setBrowsing(true)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-white">
              <LayoutGrid className="h-3.5 w-3.5" />다른 예시
            </button>
          </div>
        </div>
        {tasks.length > 0 ? (
          <div className="mt-2.5">
            <p className="text-xs text-slate-600">남은 일을 누르면 바로 그 칸으로 가요.</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tasks.map((task) => (
                <button key={task.key} type="button" onClick={task.onClick} className="inline-flex min-h-[34px] items-center gap-1 rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-800 hover:border-blue-400 hover:bg-blue-50">
                  <ArrowRight className="h-3 w-3" />{task.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs font-semibold text-emerald-700">빈칸을 모두 채웠어요. 내용을 한 번 더 읽어 보고 접수해 주세요.</p>
        )}
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900"><Lightbulb className="h-4 w-4 text-amber-500" />빠른 작성 예시</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            비슷한 상황을 고르면 제목·장소·분류·설명이 채워져요. 설명의 <span className="rounded bg-amber-100 px-1 font-semibold text-amber-900">[ ]</span> 빈칸만 실제 상황으로 바꾸면 돼요.
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {poolSize > COUNT && (
            <button type="button" onClick={refresh} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200/70 hover:text-blue-700 active:scale-95">
              <RotateCw className="h-3.5 w-3.5 text-slate-500" />다른 예시 보기
            </button>
          )}
          {applied && (
            <button type="button" onClick={() => setBrowsing(false)} className="rounded-md px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200/70">닫기</button>
          )}
        </div>
      </div>

      <div role="group" aria-label="문제 종류로 예시 거르기" className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {[{ name: null as string | null, count: eligible.length }, ...categories].map((entry) => {
          const active = category === entry.name;
          const Icon = entry.name ? icons[entry.name] : null;
          return (
            <button
              key={entry.name ?? "all"}
              type="button"
              aria-pressed={active}
              onClick={() => changeCategory(entry.name)}
              className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"}`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {entry.name ?? "전체"}
              <span className={`tabular-nums ${active ? "text-blue-100" : "text-slate-400"}`}>{entry.count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {shown.map((example, index) => {
          const Icon = icons[example.category];
          const selected = applied?.key === example.key;
          return (
            <button
              key={example.key}
              type="button"
              aria-pressed={selected}
              onClick={() => { setBrowsing(false); onApply(example); }}
              className={`group h-full flex-col items-start gap-1 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${index >= 4 ? "hidden sm:flex" : "flex"} ${selected ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm"}`}
            >
              <span className="flex w-full items-start gap-2">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-700"}`}>{Icon && <Icon className="h-3.5 w-3.5" />}</span>
                <span className="min-w-0 flex-1 pt-1 text-[13px] font-bold leading-snug text-slate-900">{example.label}</span>
                {selected && <Check className="mt-1 h-4 w-4 shrink-0 text-blue-700" />}
              </span>
              <span className="text-xs leading-snug text-slate-500">{example.summary}</span>
              <span className="mt-auto flex flex-wrap gap-1 pt-1">
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{example.location}</span>
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{example.category}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <button type="button" onClick={() => { setBrowsing(false); onFreeWrite(); }} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline">
          <PenLine className="h-3.5 w-3.5" />맞는 예시가 없나요? 직접 쓰기 틀로 시작
        </button>
        <span className="text-slate-400">{school.schoolName}에 맞는 예시 {poolSize}개</span>
      </div>
    </div>
  );
}
