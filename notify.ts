/**
 * 긴급 신고 알림 — 웹훅 전송
 *
 * 위험도가 높은 신고가 들어오면 운영진이 화면을 열어 보지 않아도 바로 알 수 있게
 * NOTIFY_WEBHOOK_URL 로 메시지를 보낸다.
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

export function buildWebhookPayload(url: string, n: UrgentNotice): Record<string, unknown> {
  const text = buildNotificationText(n);
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // 잘못된 주소는 전송 단계에서 실패한다.
  }
  if (/(^|\.)discord(app)?\.com$/.test(host)) {
    // 신고 내용에 @everyone 같은 멘션이 있어도 아무도 호출되지 않게 한다.
    return { content: text.slice(0, 1900), allowed_mentions: { parse: [] } };
  }
  if (/(^|\.)slack\.com$/.test(host)) return { text };
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
  if (!/^https:\/\//i.test(url)) {
    console.error("[notify] NOTIFY_WEBHOOK_URL 은 HTTPS 주소여야 합니다.");
    return false;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildWebhookPayload(url, n)),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    return true;
  } catch (err) {
    console.error("[notify] 긴급 신고 알림 전송 실패:", err instanceof Error ? err.message : err);
    return false;
  }
}
