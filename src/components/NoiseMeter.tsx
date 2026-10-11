import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, RotateCw, Volume2, X } from "lucide-react";
import { averageDb, formatNoise, NOISE_LIMITS, NOISE_REFERENCES, noiseLevelLabel, rmsToDb, type NoiseMeasurement } from "../utils/noise";

interface Props {
  value: NoiseMeasurement | null;
  onChange: (value: NoiseMeasurement | null) => void;
}

const SAMPLE_MS = 100;
const SCALE_MIN = 30;
const SCALE_MAX = 110;
const pct = (db: number) => `${Math.min(100, Math.max(0, ((db - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100))}%`;

/**
 * 소음 재기 — 휴대폰 마이크로 몇 초 동안 소리 크기를 재서 숫자만 신고에 붙인다.
 * 소리는 녹음하지 않는다. 마이크 신호의 세기만 0.1초마다 읽고, 끝나면 마이크를 바로 끈다.
 */
export function NoiseMeter({ value, onChange }: Props) {
  const [state, setState] = useState<"idle" | "starting" | "measuring">("idle");
  const [current, setCurrent] = useState<number | null>(null);
  const [left, setLeft] = useState(NOISE_LIMITS.defaultSeconds);
  const [error, setError] = useState("");
  const stopRef = useRef<(() => void) | null>(null);

  // 화면을 떠나면 마이크를 끈다.
  useEffect(() => () => stopRef.current?.(), []);

  const supported = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof window !== "undefined" && window.isSecureContext;

  const start = async () => {
    setError("");
    setState("starting");
    let stream: MediaStream;
    try {
      // 휴대폰이 소리를 자동으로 키우거나 줄이면 크기를 잴 수 없으므로 보정 기능을 끈다.
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch {
      setState("idle");
      setError("마이크를 쓸 수 없어요. 브라우저에서 이 사이트의 마이크를 허용한 뒤 다시 눌러 주세요.");
      return;
    }
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      stream.getTracks().forEach((track) => track.stop());
      setState("idle");
      setError("이 브라우저는 소음 재기를 지원하지 않아요.");
      return;
    }
    const context = new AudioCtx();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    context.createMediaStreamSource(stream).connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    const samples: number[] = [];
    const seconds = NOISE_LIMITS.defaultSeconds;
    const startedAt = Date.now();

    const stop = () => {
      window.clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      void context.close().catch(() => undefined);
      stopRef.current = null;
    };
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
      const db = rmsToDb(Math.sqrt(sum / buffer.length));
      samples.push(db);
      setCurrent(db);
      const elapsed = (Date.now() - startedAt) / 1000;
      setLeft(Math.max(0, Math.ceil(seconds - elapsed)));
      if (elapsed >= seconds) {
        stop();
        setState("idle");
        setCurrent(null);
        // 처음 0.3초는 마이크가 켜지며 튀는 값이 섞여 뺀다. (탭이 가려져 몇 번 못 쟀으면 그대로 쓴다)
        const usable = samples.length > 6 ? samples.slice(3) : samples;
        if (usable.length === 0) { setError("소리를 재지 못했어요. 화면을 켠 채로 다시 눌러 주세요."); return; }
        onChange({ avgDb: Math.round(averageDb(usable) * 10) / 10, maxDb: Math.round(Math.max(...usable) * 10) / 10, seconds, measuredAt: new Date().toISOString() });
      }
    }, SAMPLE_MS);
    stopRef.current = stop;
    setLeft(seconds);
    setState("measuring");
  };

  const cancel = () => {
    stopRef.current?.();
    setState("idle");
    setCurrent(null);
  };

  const shown = state === "measuring" ? current : value?.avgDb ?? null;

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5" data-testid="noise-meter">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold text-indigo-950"><Volume2 className="h-4 w-4 text-indigo-600" /> 소음 재기 <span className="text-xs font-normal text-indigo-700">(선택)</span></p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-indigo-900/80">휴대폰 마이크로 {NOISE_LIMITS.defaultSeconds}초 동안 소리 크기를 재서 신고에 붙여요. 녹음은 하지 않고 숫자만 남아요.</p>
        </div>
        {state === "measuring" ? (
          <button type="button" onClick={cancel} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-800"><X className="h-3.5 w-3.5" />그만 재기</button>
        ) : value ? (
          <div className="flex gap-1">
            <button type="button" onClick={() => void start()} disabled={!supported} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-800"><RotateCw className="h-3.5 w-3.5" />다시 재기</button>
            <button type="button" onClick={() => onChange(null)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white">빼기</button>
          </div>
        ) : (
          <button type="button" onClick={() => void start()} disabled={!supported || state === "starting"} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
            {state === "starting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />} 측정 시작
          </button>
        )}
      </div>

      {(state === "measuring" || value) && (
        <div className="mt-3">
          <div className="relative h-3 overflow-hidden rounded-full bg-white ring-1 ring-indigo-100" role="meter" aria-label="소리 크기" aria-valuemin={SCALE_MIN} aria-valuemax={SCALE_MAX} aria-valuenow={shown === null ? undefined : Math.round(shown)}>
            <div className={`h-full rounded-full transition-[width] duration-100 ${shown !== null && shown >= 85 ? "bg-rose-500" : shown !== null && shown >= 70 ? "bg-amber-500" : "bg-indigo-500"}`} style={{ width: shown === null ? "0%" : pct(shown) }} />
            {value && state !== "measuring" && <div className="absolute top-0 h-full w-0.5 bg-slate-900/60" style={{ left: pct(value.maxDb) }} title="최고" />}
          </div>
          <div className="relative mt-1 h-8 text-[10px] text-indigo-900/70">
            {NOISE_REFERENCES.map((ref) => (
              <span key={ref.db} className="absolute -translate-x-1/2 whitespace-nowrap text-center leading-tight" style={{ left: pct(ref.db) }}>{ref.db}<br />{ref.label.split("·")[0]}</span>
            ))}
          </div>
          {state === "measuring" ? (
            <p className="text-sm font-bold text-indigo-950" aria-live="polite">지금 {shown === null ? "-" : Math.round(shown)}dB · {left}초 남음</p>
          ) : value && (
            <p className="text-sm font-bold text-indigo-950">{formatNoise(value)} · {noiseLevelLabel(value.avgDb)}</p>
          )}
          <p className="mt-0.5 text-[11px] text-indigo-900/70">휴대폰마다 마이크가 달라 정확한 측정기는 아니에요. 소음이 날 때 재면 담당자가 판단하는 데 도움이 돼요.</p>
        </div>
      )}
      {!supported && <p className="mt-2 text-[11px] text-slate-500">이 브라우저에서는 마이크를 쓸 수 없어요 (https 주소에서만 돼요).</p>}
      {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
