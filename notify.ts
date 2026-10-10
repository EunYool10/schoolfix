/**
 * 운영진 알림 — 웹훅 전송
 *
 * 운영진이 화면을 열어 보지 않아도 바로 알 수 있게 NOTIFY_WEBHOOK_URL 로 메시지를 보낸다.
 *  - 긴급 신고 접수 (위험도가 NOTIFY_MIN_RISK 이상)
 *  - 새 학교 추가 신청
 *  - 지난달 월간 보고 (매달 초 자동, 운영진 화면에서 수동 발송도 가능)
 *
 *  - Discord 웹훅(discord.com/api/webhooks/...) : { content }
 *  - Slack 호환 웹훅(hooks.slack.com/...)        : { text }
 *  - 그 밖의 주소                                 : { text, content, report } (자동화 도구 연동용)
 *
 * 카카오톡·이메일은 직접 보내지 않는다. 카카오는 비즈니스 채널 심사가 필요하고
 * 이메일은 SMTP 계정이 필요해서, Make·Zapier 같은 도구에 일반 웹훅을 연결해 전달하는 편이 간단하다.
 *
 * 알림 실패는 신고 접수를 막지 않는다. 로그만 남긴다.
 */

export const RISK_ORDER = ["낮음", "중간", "높음", "긴급"] as const;

export interface UrgentNotice {
  schoolName: string;
  reportId: string;
  title: string;
  location: string;
  category: string;
  riskLevel: string;
  riskScore: number | null;
  description: string;
  /** 자동 검사로 공개가 보류된 신고인지 */
  held: boolean;
  /** 운영진 화면 주소 (PUBLIC_BASE_URL 이 있을 때만) */
  link: string | null;
}

/** 알림 기준 위험도 이상인지. 기준값이 잘못되면 "긴급" 만 보낸다. */
export function shouldNotify(level: string | null | undefined, minLevel: string | undefined): boolean {
  if (!level) return false;
  const min = RISK_ORDER.indexOf((minLevel || "긴급") as (typeof RISK_ORDER)[number]);
  const threshold = min === -1 ? RISK_ORDER.indexOf("긴급") : min;
  const index = RISK_ORDER.indexOf(level as (typeof RISK_ORDER)[number]);
  return index !== -1 && index >= threshold;
}

export function buildNotificationText(n: UrgentNotice): string {
  const body = n.description.replace(/\s+/g, " ").trim();
  const lines = [
    `🚨 [${n.riskLevel}${n.riskScore !== null ? ` ${n.riskScore}점` : ""}] ${n.schoolName} 신고 접수`,
    `위치: ${n.location}`,
    `분류: ${n.category}`,
    `제목: ${n.title}`,
    `내용: ${body.length > 200 ? `${body.slice(0, 200)}…` : body}`,
    `접수번호: ${n.reportId}`,
  ];
  if (n.held) lines.push("※ 자동 검사로 공개 보류 중 — 운영진 검토가 필요합니다.");
  if (n.link) lines.push(n.link);
  return lines.join("\n");
}

export type WebhookChannel = "discord" | "slack" | "webhook";

/** 웹훅 주소가 어느 서비스인지. HTTPS 가 아니거나 해석할 수 없으면 null */
export function webhookChannel(url: string | undefined): WebhookChannel | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (/(^|\.)discord(app)?\.com$/.test(parsed.hostname)) return "discord";
    if (/(^|\.)slack\.com$/.test(parsed.hostname)) return "slack";
    return "webhook";
  } catch {
    return null;
  }
}

/** 서비스별 메시지 형식. Discord 는 2000자 제한이 있고, 사용자 입력 속 멘션이 호출되지 않게 막는다. */
export function buildTextPayload(url: string, text: string): Record<string, unknown> {
  const channel = webhookChannel(url);
  if (channel === "discord") return { content: text.slice(0, 1900), allowed_mentions: { parse: [] } };
  if (channel === "slack") return { text };
  return { text, content: text };
}

/** 알림 전송 공통부. 실패해도 예외를 던지지 않고 false 를 돌려준다. */
export async function postWebhook(
  payload: Record<string, unknown>,
  env: Record<string, string | undefined> = process.env,
  label = "알림"
): Promise<boolean> {
  const url = env.NOTIFY_WEBHOOK_URL;
  if (!url) return false;
  if (!webhookChannel(url)) {
    console.error("[notify] NOTIFY_WEBHOOK_URL 은 HTTPS 주소여야 합니다.");
    return false;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    return true;
  } catch (err) {
    console.error(`[notify] ${label} 전송 실패:`, err instanceof Error ? err.message : err);
    return false;
  }
}

export function sendText(text: string, env: Record<string, string | undefined> = process.env, label = "알림"): Promise<boolean> {
  const url = env.NOTIFY_WEBHOOK_URL;
  if (!url) return Promise.resolve(false);
  return postWebhook(buildTextPayload(url, text), env, label);
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export interface ApplicationNotice {
  schoolName: string;
  address: string;
  website: string;
  reason: string;
  /** 회신 이메일은 개인정보라 알림에 싣지 않고 있는지만 알린다. */
  hasReplyEmail: boolean;
  link: string | null;
}

export function buildApplicationText(n: ApplicationNotice): string {
  const lines = [
    `📮 새 학교 추가 신청: ${clip(n.schoolName, 100)}`,
    `주소: ${clip(n.address, 200)}`,
    `홈페이지: ${clip(n.website, 300)}`,
    `신청 사유: ${clip(n.reason, 300)}`,
    n.hasReplyEmail ? "회신 이메일: 있음 (운영진 메일함에서 확인)" : "회신 이메일: 없음",
  ];
  if (n.link) lines.push(`운영진 화면 → 학교 신청 메일함에서 승인할 수 있습니다: ${n.link}`);
  return lines.join("\n");
}

export interface MonthlySchoolSummary {
  schoolName: string;
  received: number;
  completedInMonth: number;
  completionRate: number | null;
  avgResolutionHours: number | null;
  completedLate: number;
  /** 지금 기한을 넘긴 미완료 신고 수 */
  overdueOpen: number;
  topCategory: string | null;
  topLocation: string | null;
}

function hoursLabel(hours: number | null): string {
  if (hours === null) return "-";
  return hours < 24 ? `${hours}시간` : `${Math.round((hours / 24) * 10) / 10}일`;
}

/** "YYYY-MM" 월간 요약. 학교가 여럿이면 학교마다 한 덩어리씩 쓴다. */
export function buildMonthlyText(month: string, schools: MonthlySchoolSummary[], link: string | null): string {
  const [y, m] = month.split("-");
  const lines = [`📊 ${y}년 ${Number(m)}월 신고 처리 월간 보고`];
  if (schools.length === 0) {
    lines.push("이 달에 접수되거나 처리된 신고가 없습니다.");
  }
  for (const s of schools) {
    lines.push(
      "",
      `🏫 ${s.schoolName}`,
      `• 접수 ${s.received}건 · 접수분 완료율 ${s.completionRate === null ? "-" : `${s.completionRate}%`}`,
      `• 이 달 처리 완료 ${s.completedInMonth}건 · 평균 처리 ${hoursLabel(s.avgResolutionHours)} · 기한 넘겨 완료 ${s.completedLate}건`,
      `• 현재 기한 초과 미완료 ${s.overdueOpen}건`
    );
    if (s.topCategory || s.topLocation) {
      lines.push(`• 가장 많은 유형: ${s.topCategory ?? "-"} · 가장 많은 위치: ${s.topLocation ?? "-"}`);
    }
  }
  if (link) lines.push("", `자세한 통계·보고서: ${link} (운영진 → 월별 통계)`);
  // Discord 2000자 제한 — 학교가 많으면 뒷부분을 줄인다.
  const text = lines.join("\n");
  return text.length > 1900 ? `${text.slice(0, 1880)}\n… (일부 생략)` : text;
}

export function buildWebhookPayload(url: string, n: UrgentNotice): Record<string, unknown> {
  const text = buildNotificationText(n);
  const channel = webhookChannel(url);
  if (channel === "discord" || channel === "slack") return buildTextPayload(url, text);
  return {
    text,
    content: text,
    report: {
      id: n.reportId,
      school: n.schoolName,
      location: n.location,
      category: n.category,
      riskLevel: n.riskLevel,
      riskScore: n.riskScore,
      held: n.held,
    },
  };
}

export async function sendUrgentNotification(
  n: UrgentNotice,
  env: Record<string, string | undefined> = process.env
): Promise<boolean> {
  const url = env.NOTIFY_WEBHOOK_URL;
  if (!url || !shouldNotify(n.riskLevel, env.NOTIFY_MIN_RISK)) return false;
  return postWebhook(buildWebhookPayload(url, n), env, "긴급 신고 알림");
}
