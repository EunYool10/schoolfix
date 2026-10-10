import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Minus } from "lucide-react";

/**
 * 운영진 통계 화면의 차트 조각들.
 *
 * 색은 역할로만 쓴다 (dataviz 기준, scripts/validate_palette.js 로 검증):
 *  - 두 계열(접수·처리 완료): 범주형 1·2번 슬롯 파랑·주황 — 인접 CVD ΔE 24.7, 대비 3:1 이상
 *  - 위험도: 상태 색(심각·주의·경고) — 항상 글자 라벨과 함께 쓴다
 *  - 처리 단계(순서가 있는 값): 파랑 한 가지 색의 진하기 — ordinal 검사 통과
 * 글자는 데이터 색을 입지 않는다. 값·라벨은 잉크 색, 색은 옆의 표시가 맡는다.
 */

export const CHART = {
  series1: "#2a78d6",
  series2: "#eb6834",
  ink: "#0b0b0b",
  inkSecondary: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  baseline: "#c3c2b7",
  track: "#f1f0ec",
  surface: "#ffffff",
  good: "#006300",
  critical: "#d03b3b",
  /** 처리 단계 순서용 파랑 한 가지 색의 진하기 (밝음 → 진함) */
  ordinal: ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"],
} as const;

/** 위험도는 상태 의미를 가진 값이라 상태 색을 쓴다. 미분석은 회색. */
export const RISK_COLORS: Record<string, string> = {
  긴급: "#d03b3b",
  높음: "#ec835a",
  중간: "#fab219",
  낮음: "#898781",
  미분석: "#c3c2b7",
};

function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** 0 부터 시작하는 깔끔한 눈금 (1·2·5 × 10ⁿ) */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? pow * 10;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v));
  return ticks;
}

/** 위쪽 두 모서리만 둥근 막대 (바닥은 직각, 기준선에서 자란다) */
function columnPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

// ---------------------------------------------------------------------------
// 지표 타일
// ---------------------------------------------------------------------------

export interface StatTileProps {
  label: string;
  value: string;
  /** 지난달 대비 변화량. null 이면 비교하지 않는다 */
  delta?: number | null;
  /** 변화량의 표시 형식 (예: v => `${v}건`) */
  formatDelta?: (value: number) => string;
  /** 늘어나는 게 좋은 지표인지. null 이면 좋고 나쁨 없이 회색으로 */
  upIsGood?: boolean | null;
  hint?: string;
  /** 지금 상태를 나타내는 타일 (예: 기한 초과) — 값이 있으면 경고 아이콘·문구를 붙인다 */
  status?: "ok" | "alert";
}

export function StatTile({ label, value, delta = null, formatDelta = (v) => String(v), upIsGood = null, hint, status }: StatTileProps) {
  let deltaNode: ReactNode = null;
  if (delta !== null && delta !== undefined) {
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    const good = direction === "flat" || upIsGood === null ? null : (direction === "up") === upIsGood;
    const color = good === null ? CHART.muted : good ? CHART.good : CHART.critical;
    const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
    // 짧게 쓴다: 방향 아이콘 + 변화량 + "지난달 대비". 줄바꿈되면 숫자와 단위가 갈라진다.
    deltaNode = (
      <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs" title={direction === "flat" ? "지난달과 같음" : `지난달보다 ${formatDelta(Math.abs(delta))} ${direction === "up" ? "늘었어요" : "줄었어요"}`}>
        <span className="inline-flex items-center gap-0.5 whitespace-nowrap font-bold" style={{ color }}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {direction === "flat" ? "변화 없음" : `${direction === "up" ? "+" : "−"}${formatDelta(Math.abs(delta))}`}
        </span>
        <span className="whitespace-nowrap" style={{ color: CHART.muted }}>지난달 대비</span>
      </p>
    );
  }
  return (
    <div className={`rounded-xl border bg-white p-4 ${status === "alert" ? "border-rose-200" : "border-slate-200"}`}>
      <p className="flex items-center gap-1 text-xs font-semibold" style={{ color: CHART.inkSecondary }}>
        {status === "alert" && <AlertTriangle className="h-3.5 w-3.5" style={{ color: CHART.critical }} aria-hidden />}
        {status === "ok" && <CheckCircle2 className="h-3.5 w-3.5" style={{ color: CHART.good }} aria-hidden />}
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold" style={{ color: status === "alert" ? CHART.critical : CHART.ink }}>{value}</p>
      {deltaNode}
      {hint && <p className="mt-1 text-[11px] leading-snug" style={{ color: CHART.muted }}>{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 월별 추이 — 묶음 세로 막대 (접수 · 처리 완료)
// ---------------------------------------------------------------------------

export interface TrendPointView {
  month: string;
  label: string;
  received: number;
  completed: number;
}

interface TrendChartProps {
  points: TrendPointView[];
  selected: string;
  onSelect: (month: string) => void;
}

const PLOT_HEIGHT = 170;
const PAD_TOP = 22;
const AXIS_BAND = 26;
const AXIS_LEFT = 30;

export function MonthlyTrendChart({ points, selected, onSelect }: TrendChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const ticks = niceTicks(Math.max(0, ...points.map((p) => Math.max(p.received, p.completed))));
  const top = ticks[ticks.length - 1] || 1;
  const plotW = Math.max(0, width - AXIS_LEFT);
  const groupW = points.length ? plotW / points.length : 0;
  const barW = Math.max(4, Math.min(16, (groupW - 10) / 2));
  const y = (v: number) => PAD_TOP + PLOT_HEIGHT - (v / top) * PLOT_HEIGHT;
  const height = PAD_TOP + PLOT_HEIGHT + AXIS_BAND;
  const active = hover ?? points.findIndex((p) => p.month === selected);
  const activePoint = active >= 0 ? points[active] : null;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="월별 접수·처리 완료 추이" className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={AXIS_LEFT} x2={width} y1={y(t)} y2={y(t)} stroke={t === 0 ? CHART.baseline : CHART.grid} strokeWidth={1} />
              <text x={AXIS_LEFT - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={CHART.muted} style={{ fontVariantNumeric: "tabular-nums" }}>{t}</text>
            </g>
          ))}
          {points.map((p, i) => {
            const cx = AXIS_LEFT + groupW * i + groupW / 2;
            const isSelected = p.month === selected;
            const dim = !isSelected && hover !== i;
            const x1 = cx - barW - 1;
            const x2 = cx + 1;
            return (
              <g key={p.month}>
                <g opacity={dim ? 0.45 : 1}>
                  <path d={columnPath(x1, y(p.received), barW, PAD_TOP + PLOT_HEIGHT - y(p.received))} fill={CHART.series1} />
                  <path d={columnPath(x2, y(p.completed), barW, PAD_TOP + PLOT_HEIGHT - y(p.completed))} fill={CHART.series2} />
                </g>
                {/* 선택한 달만 막대 위에 값을 적는다. 나머지는 눈금·툴팁·표가 맡는다. */}
                {isSelected && (
                  <>
                    <text x={x1 + barW / 2} y={y(p.received) - 5} textAnchor="middle" fontSize={11} fontWeight={700} fill={CHART.ink}>{p.received}</text>
                    <text x={x2 + barW / 2} y={y(p.completed) - 5} textAnchor="middle" fontSize={11} fontWeight={700} fill={CHART.ink}>{p.completed}</text>
                  </>
                )}
                {/* 좁은 화면에서는 달 이름이 붙어 보이므로 한 달 건너 하나씩 적는다. 선택한 달은 항상 적는다. */}
                {(isSelected || groupW >= 34 || (points.length - 1 - i) % 2 === 0) && (
                  <text x={cx} y={PAD_TOP + PLOT_HEIGHT + 17} textAnchor="middle" fontSize={11} fontWeight={isSelected ? 700 : 400} fill={isSelected ? CHART.ink : CHART.muted}>{p.label}</text>
                )}
                {/* 막대보다 넓은 투명 영역이 마우스·키보드 대상이다. 누르면 그 달로 이동한다. */}
                <rect
                  x={AXIS_LEFT + groupW * i}
                  y={PAD_TOP}
                  width={groupW}
                  height={PLOT_HEIGHT + AXIS_BAND}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.label}: 접수 ${p.received}건, 처리 완료 ${p.completed}건${isSelected ? " (선택됨)" : ""}`}
                  className="cursor-pointer outline-none focus-visible:stroke-blue-600"
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  onClick={() => onSelect(p.month)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(p.month); } }}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && activePoint && width > 0 && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(AXIS_LEFT + groupW * active + groupW / 2 - 70, 0), Math.max(0, width - 140)), top: 0, width: 140 }}
        >
          <p className="mb-1 font-semibold" style={{ color: CHART.inkSecondary }}>{activePoint.label}</p>
          {[["접수", activePoint.received, CHART.series1], ["처리 완료", activePoint.completed, CHART.series2]].map(([name, value, color]) => (
            <p key={name as string} className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: color as string }} aria-hidden />
              <span className="font-bold" style={{ color: CHART.ink }}>{value as number}건</span>
              <span style={{ color: CHART.inkSecondary }}>{name as string}</span>
            </p>
          ))}
          <p className="mt-1 text-[10px]" style={{ color: CHART.muted }}>눌러서 이 달 보기</p>
        </div>
      )}
    </div>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: CHART.inkSecondary }}>
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} aria-hidden />
          {item.label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 항목별 가로 막대 (유형·위치·위험도)
// ---------------------------------------------------------------------------

export interface BreakdownRow {
  label: string;
  value: number;
  /** 지정하지 않으면 범주형 1번 색 */
  color?: string;
}

export function BreakdownBars({ rows, total, emptyText = "해당 신고가 없습니다." }: { rows: BreakdownRow[]; total: number; emptyText?: string }) {
  if (rows.length === 0 || total === 0) {
    return <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-xs" style={{ color: CHART.muted }}>{emptyText}</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const pct = Math.round((row.value / total) * 100);
        return (
          <li key={row.label} title={`${row.label}: ${row.value}건 (${pct}%)`}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                {row.color && <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden />}
                <span className="truncate" style={{ color: CHART.ink }}>{row.label}</span>
              </span>
              <span className="shrink-0 text-xs" style={{ color: CHART.inkSecondary, fontVariantNumeric: "tabular-nums" }}>
                <b style={{ color: CHART.ink }}>{row.value}건</b> · {pct}%
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: CHART.track }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(3, (row.value / max) * 100)}%`, background: row.color ?? CHART.series1 }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// 처리 단계별 누적 막대 (지금 미완료 신고)
// ---------------------------------------------------------------------------

export function StageStack({ stages }: { stages: { label: string; value: number }[] }) {
  const total = stages.reduce((sum, s) => sum + s.value, 0);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => setHover(null), [total]);
  if (total === 0) {
    return (
      <p className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-50 px-3 py-6 text-xs" style={{ color: CHART.inkSecondary }}>
        <CheckCircle2 className="h-4 w-4" style={{ color: CHART.good }} aria-hidden /> 처리 중인 신고가 없어요.
      </p>
    );
  }
  return (
    <div>
      {/* 조각 사이 2px 흰 틈으로 구분한다. 테두리는 그리지 않는다. */}
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={stages.map((s) => `${s.label} ${s.value}건`).join(", ")}>
        {stages.map((s, i) => s.value > 0 && (
          <div
            key={s.label}
            className="h-full transition-opacity"
            style={{ flexGrow: s.value, flexBasis: 0, background: CHART.ordinal[i % CHART.ordinal.length], opacity: hover === null || hover === i ? 1 : 0.45 }}
            title={`${s.label}: ${s.value}건`}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
        {stages.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1.5 whitespace-nowrap" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CHART.ordinal[i % CHART.ordinal.length] }} aria-hidden />
            <span style={{ color: CHART.inkSecondary }}>{s.label}</span>
            <b style={{ color: CHART.ink }}>{s.value}건</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
