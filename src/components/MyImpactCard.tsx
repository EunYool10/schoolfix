import { useMemo, useState } from "react";
import { Download, HandHeart, Loader2, Sprout, ThumbsUp, Wrench } from "lucide-react";
import type { SchoolReport } from "../types";
import { loadMeTooIds, loadVerifyVotes } from "../utils/clientTokens";
import { schoolYearOf, summarizeImpact, type ImpactSummary } from "../utils/impact";

interface Props {
  schoolName: string;
  myReports: SchoolReport[];
  allReports: SchoolReport[];
}

/** 카드 이미지 — 이름·접수번호 없이 학교 이름, 학년도, 숫자, 고쳐진 곳 제목만 담는다. */
async function drawCard(schoolName: string, yearLabel: string, summary: ImpactSummary): Promise<Blob> {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 만들지 못했어요.");
  const font = (weight: number, size: number) => `${weight} ${size}px Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
  const fit = (text: string, max: number) => {
    if (ctx.measureText(text).width <= max) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
    return `${cut}…`;
  };

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#064e3b");
  bg.addColorStop(0.55, "#0f766e");
  bg.addColorStop(1, "#1e3a8a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath(); ctx.arc(W - 120, 170, 260, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(80, H - 140, 220, 0, Math.PI * 2); ctx.fill();

  const left = 96;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = font(700, 38);
  ctx.fillText(fit(`${schoolName} · ${yearLabel}`, W - left * 2), left, 150);
  ctx.fillStyle = "#ffffff";
  ctx.font = font(800, 88);
  ctx.fillText("내가 바꾼 학교", left, 260);

  const total = summary.myFixed + summary.meTooFixed;
  ctx.font = font(800, 230);
  ctx.fillText(String(total), left, 520);
  const numberWidth = ctx.measureText(String(total)).width;
  ctx.font = font(700, 54);
  ctx.fillText("곳이 고쳐졌어요", left + numberWidth + 28, 515);

  ctx.font = font(600, 40);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(`내 신고 ${summary.myCount}건 · 공감 ${summary.meTooCount}건 · 확인 ${summary.verifyCount}건`, left, 600);

  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(left, 660, W - left * 2, 2);
  let y = 750;
  ctx.font = font(700, 44);
  const items = summary.fixed.slice(0, 5);
  if (items.length === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("아직 고쳐진 곳은 없지만, 시작했어요!", left, y);
  }
  for (const item of items) {
    ctx.fillStyle = "#6ee7b7";
    ctx.fillText("✓", left, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(fit(item.title, W - left * 2 - 70), left + 64, y);
    y += 92;
  }
  if (summary.fixed.length > items.length) {
    ctx.font = font(600, 36);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(`외 ${summary.fixed.length - items.length}곳`, left + 64, y - 20);
  }

  ctx.font = font(700, 34);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("SchoolFix · 학교를 함께 고쳐요", left, H - 90);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("이미지를 만들지 못했어요."))), "image/png"));
}

/** "내 신고" 탭 위 — 이 기기에서 한 신고·공감·확인으로 학교가 얼마나 바뀌었는지 보여 준다. */
export function MyImpactCard({ schoolName, myReports, allReports }: Props) {
  const thisYear = schoolYearOf(new Date().toISOString());
  const [scope, setScope] = useState<"year" | "all">("year");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const summary = useMemo(
    () => summarizeImpact(myReports, allReports, loadMeTooIds(), loadVerifyVotes(), scope === "year" ? thisYear : null),
    [myReports, allReports, scope, thisYear]
  );
  const yearLabel = scope === "year" ? `${thisYear}학년도` : "지금까지";
  const empty = summary.myCount === 0 && summary.meTooCount === 0 && summary.verifyCount === 0;

  const save = async () => {
    setSaving(true); setError("");
    try {
      const blob = await drawCard(schoolName, yearLabel, summary);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `schoolfix-${scope === "year" ? thisYear : "all"}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지를 만들지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  const stat = (Icon: typeof Wrench, label: string, value: number, sub: string) => (
    <div className="rounded-xl bg-white/80 p-3 ring-1 ring-emerald-100">
      <p className="flex items-center gap-1 text-[11px] font-bold text-emerald-800"><Icon className="h-3.5 w-3.5" />{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500">{sub}</p>
    </div>
  );

  return (
    <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-blue-50 p-4 print:hidden" aria-label="내가 바꾼 학교" data-testid="impact-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900"><Sprout className="h-4 w-4 text-emerald-600" />내가 바꾼 학교</h2>
        <div className="flex gap-1" role="group" aria-label="기간">
          {(["year", "all"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value)} className={`rounded-full px-3 py-1 text-xs font-bold ${scope === value ? "bg-emerald-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
              {value === "year" ? `${thisYear}학년도` : "전체"}
            </button>
          ))}
        </div>
      </div>

      {empty ? (
        <p className="mt-3 text-sm leading-relaxed text-slate-600">아직 기록이 없어요. 불편한 곳을 신고하거나 같은 문제에 ‘나도 겪었어요’를 누르면 여기에 쌓여요.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {stat(Wrench, "내 신고로 고쳐짐", summary.myFixed, `신고 ${summary.myCount}건 중`)}
            {stat(HandHeart, "공감한 문제 해결", summary.meTooFixed, `공감 ${summary.meTooCount}건 중`)}
            {stat(ThumbsUp, "확인에 참여", summary.verifyCount, "고쳐졌는지 확인")}
          </div>
          {summary.fixed.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {summary.fixed.slice(0, 4).map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-sm">
                  <span className="text-emerald-600">✓</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{item.title}</span>
                  <span className="shrink-0 text-[11px] text-slate-500">{item.kind === "mine" ? "내 신고" : "공감"} · {new Date(item.completedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} 해결</span>
                </li>
              ))}
              {summary.fixed.length > 4 && <li className="text-[11px] text-slate-500">외 {summary.fixed.length - 4}곳</li>}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">이 기기에 남은 기록으로 계산해요. 이름은 들어가지 않아요.</p>
            <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} 카드 이미지로 저장
            </button>
          </div>
        </>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
    </section>
  );
}
