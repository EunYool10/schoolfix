/**
 * 첫 접속 지연 줄이기 (Render 무료 플랜)
 *
 * 무료 플랜은 15분 동안 들어오는 요청이 없으면 서버를 재우고, 다음 접속에 30~60초를 기다리게 한다.
 * 학생이 신고하다 포기하지 않도록, 낮 시간(한국 시간)에는 서버가 스스로 10분마다 자기 주소를 불러 깨어 있게 한다.
 * 밤에는 부르지 않아 잠들게 둔다(무료 사용 시간 월 750시간을 아끼기 위해). 아침 첫 깨우기는 GitHub Actions 가 한다.
 *
 * KEEP_AWAKE_HOURS: "7-21" 처럼 시작-끝 시각(한국 시간, 끝 시각 직전까지). "off" 면 끈다. 기본 7-21.
 */

export interface KeepAwakeWindow {
  start: number;
  end: number;
}

export function parseKeepAwakeHours(value: string | undefined): KeepAwakeWindow | null {
  const raw = (value ?? "7-21").trim().toLowerCase();
  if (raw === "off" || raw === "false" || raw === "0") return null;
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (!match) return { start: 7, end: 21 };
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start > 23 || end > 24 || start === end) return { start: 7, end: 21 };
  return { start, end };
}

/** 이 시각(UTC 밀리초)이 깨어 있을 시간인지. 끝이 시작보다 작으면 자정을 넘는 구간이다(예: 22-6). */
export function withinKeepAwake(window: KeepAwakeWindow, now = Date.now()): boolean {
  const hour = new Date(now + 9 * 60 * 60 * 1000).getUTCHours();
  return window.start < window.end ? hour >= window.start && hour < window.end : hour >= window.start || hour < window.end;
}

/** 스스로 부를 주소. https 인 공개 주소만 쓴다. */
export function keepAwakeUrl(env: Record<string, string | undefined> = process.env): string | null {
  const base = (env.PUBLIC_BASE_URL || env.RENDER_EXTERNAL_URL || "").trim().replace(/\/+$/, "");
  return /^https:\/\//i.test(base) ? `${base}/api/health` : null;
}
