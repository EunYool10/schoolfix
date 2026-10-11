/**
 * 휴대폰으로 잰 소음 — 화면(측정)과 서버(검사)가 같은 규칙을 쓴다.
 *
 * 브라우저 마이크로 몇 초 동안 소리 크기를 재서 숫자만 신고에 붙인다. 소리 자체는 녹음하지도, 보내지도 않는다.
 * 휴대폰 마이크마다 감도가 달라 정밀 측정기가 아니다. 화면과 운영진 화면 모두 "추정치" 로 보여 준다.
 */

export interface NoiseMeasurement {
  /** 측정 시간 동안의 평균 (에너지 평균) */
  avgDb: number;
  /** 0.1초 단위로 잰 값 중 가장 큰 값 */
  maxDb: number;
  seconds: number;
  measuredAt: string;
}

export const NOISE_LIMITS = {
  minDb: 20,
  maxDb: 130,
  minSeconds: 3,
  maxSeconds: 30,
  /** 기본 측정 시간 */
  defaultSeconds: 10,
};

/** 비교용 기준 (대략적인 생활 소음) */
export const NOISE_REFERENCES = [
  { db: 40, label: "조용한 도서관" },
  { db: 60, label: "보통 대화" },
  { db: 70, label: "시끄러운 교실" },
  { db: 85, label: "공사장·큰 기계" },
];

/**
 * 마이크 신호 세기(RMS, 0~1)를 대략적인 dB 로 바꾼다.
 * 휴대폰 마이크는 보통 0 dBFS ≈ 94 dB 근처라 그 값을 더한다(추정치).
 */
export function rmsToDb(rms: number, offset = 94): number {
  if (!Number.isFinite(rms) || rms <= 0) return NOISE_LIMITS.minDb;
  const db = 20 * Math.log10(rms) + offset;
  return Math.min(NOISE_LIMITS.maxDb, Math.max(NOISE_LIMITS.minDb, db));
}

/** 여러 dB 값의 평균. 소리는 에너지로 더해야 하므로 산술 평균을 쓰지 않는다. */
export function averageDb(values: number[]): number {
  if (values.length === 0) return NOISE_LIMITS.minDb;
  const energy = values.reduce((sum, db) => sum + 10 ** (db / 10), 0) / values.length;
  return 10 * Math.log10(energy);
}

/** "시끄러운 교실 정도" 처럼 가장 가까운 기준 */
export function noiseLevelLabel(db: number): string {
  let nearest = NOISE_REFERENCES[0];
  for (const ref of NOISE_REFERENCES) if (Math.abs(ref.db - db) < Math.abs(nearest.db - db)) nearest = ref;
  if (db < NOISE_REFERENCES[0].db - 5) return "아주 조용한 편";
  if (db > NOISE_REFERENCES[NOISE_REFERENCES.length - 1].db + 5) return "공사장보다 시끄러운 편";
  return `${nearest.label} 정도`;
}

export function formatNoise(m: Pick<NoiseMeasurement, "avgDb" | "maxDb" | "seconds">): string {
  return `평균 ${Math.round(m.avgDb)}dB · 최고 ${Math.round(m.maxDb)}dB (${m.seconds}초 측정)`;
}

/**
 * 신고에 붙어 온 측정값을 검사한다. 없으면 null, 형식이 틀리면 "invalid".
 * 측정 시각이 이상하면(미래, 하루 넘게 지난 값) 받은 시각으로 바꾼다.
 */
export function parseNoiseMeasurement(value: unknown, now = new Date()): NoiseMeasurement | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return "invalid";
  const { avgDb, maxDb, seconds, measuredAt } = value as Record<string, unknown>;
  const inRange = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= NOISE_LIMITS.minDb && n <= NOISE_LIMITS.maxDb;
  if (!inRange(avgDb) || !inRange(maxDb) || maxDb + 0.5 < avgDb) return "invalid";
  if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < NOISE_LIMITS.minSeconds || seconds > NOISE_LIMITS.maxSeconds) return "invalid";
  const at = typeof measuredAt === "string" ? Date.parse(measuredAt) : NaN;
  const fresh = Number.isFinite(at) && at <= now.getTime() + 5 * 60 * 1000 && at >= now.getTime() - 24 * 60 * 60 * 1000;
  return {
    avgDb: Math.round(avgDb * 10) / 10,
    maxDb: Math.round(Math.max(avgDb, maxDb) * 10) / 10,
    seconds,
    measuredAt: fresh ? new Date(at).toISOString() : now.toISOString(),
  };
}
