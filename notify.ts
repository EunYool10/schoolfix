/**
 * 운영진 알림 — 웹훅 전송
 *
 * 운영진이 화면을 열어 보지 않아도 바로 알 수 있게 NOTIFY_WEBHOOK_URL 로 메시지를 보낸다.
 *  - 긴급 신고 접수 (위험도가 NOTIFY_MIN_RISK 이상)
 *  - 새 학교 추가 신청
 *  - 지난달 월간 보고 (매달 초 자동, 운영진 화면에서 수동 발송도 가능)
 *
 *  - Discord 웹훅(discord.com/api/webhooks/...) : { content, embeds } — 색상 띠·항목 칸이 있는 카드
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

/** 마지막 전송 결과 — 운영 중 알림이 안 올 때 원인을 바로 확인하기 위한 진단 정보 */
export interface NotifyResult {
  at: string;
  label: string;
  ok: boolean;
  /** 실패 사유 (HTTP 상태와 서비스가 돌려준 짧은 오류). 웹훅 주소는 담지 않는다. */
  error: string | null;
}

let lastResult: NotifyResult | null = null;
export function lastNotifyResult(): NotifyResult | null {
  return lastResult;
}

/**
 * 알림 전송 공통부. 실패해도 예외를 던지지 않고 false 를 돌려준다.
 * payload 가 FormData 면(사진 첨부) multipart 로 보낸다. Content-Type 은 fetch 가 경계값과 함께 정한다.
 */
export async function postWebhook(
  payload: Record<string, unknown> | FormData,
  env: Record<string, string | undefined> = process.env,
  label = "알림"
): Promise<boolean> {
  const url = env.NOTIFY_WEBHOOK_URL;
  if (!url) return false;
  if (!webhookChannel(url)) {
    console.error("[notify] NOTIFY_WEBHOOK_URL 은 HTTPS 주소여야 합니다.");
    lastResult = { at: new Date().toISOString(), label, ok: false, error: "NOTIFY_WEBHOOK_URL 이 HTTPS 주소가 아님" };
    return false;
  }
  const isForm = typeof FormData !== "undefined" && payload instanceof FormData;
  try {
    const response = await fetch(url.trim(), {
      method: "POST",
      headers: isForm ? undefined : { "Content-Type": "application/json" },
      body: isForm ? payload : JSON.stringify(payload),
      // 사진을 올릴 때는 시간이 더 걸린다.
      signal: AbortSignal.timeout(isForm ? 30000 : 10000),
    });
    if (!response.ok) {
      // Discord 는 {"message":"Unknown Webhook","code":10015} 처럼 원인을 알려 준다.
      const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
      throw new Error(`status ${response.status}${detail ? ` ${detail}` : ""}`);
    }
    console.log(`[notify] ${label} 전송 완료`);
    lastResult = { at: new Date().toISOString(), label, ok: true, error: null };
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[notify] ${label} 전송 실패:`, message);
    lastResult = { at: new Date().toISOString(), label, ok: false, error: message.slice(0, 240) };
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

// ---------------------------------------------------------------------------
// Discord 카드(임베드)
//
// Discord 에는 글자만 늘어놓는 대신 색상 띠·제목·항목 칸·사진·시각이 있는 카드로 보낸다.
// content 에는 휴대폰 푸시 미리보기용 한 줄만 둔다.
// 신고 내용은 사용자가 쓴 글이므로 마크다운으로 해석되지 않게 이스케이프한다.
// (그대로 두면 [여기](주소) 같은 숨은 링크를 운영진 채널에 심을 수 있다.)
// ---------------------------------------------------------------------------

export const EMBED_COLORS = {
  긴급: 0xe11d48,
  높음: 0xf97316,
  중간: 0xeab308,
  낮음: 0x64748b,
  unanalyzed: 0x94a3b8,
  held: 0xf59e0b,
  application: 0x2563eb,
  monthly: 0x10b981,
  test: 0x22c55e,
} as const;

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  author?: { name: string };
  fields?: DiscordEmbedField[];
  image?: { url: string };
  footer?: { text: string };
  timestamp?: string;
}

const EMBED_FOOTER = "SchoolFix 학교 신고 알림";

/** Discord 마크다운 기호를 글자 그대로 보이게 한다. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_~|>#[\]()]/g, "\\$&");
}

function embedField(name: string, value: string, inline = true): DiscordEmbedField {
  return { name: name.slice(0, 256), value: (value || "-").slice(0, 1024), inline };
}

function riskColor(level: string | null): number {
  return level && level in EMBED_COLORS ? EMBED_COLORS[level as keyof typeof EMBED_COLORS] : EMBED_COLORS.unanalyzed;
}

function riskLabel(level: string | null, score: number | null): string {
  if (!level) return "분석 전";
  const icon = level === "긴급" ? "🔴" : level === "높음" ? "🟠" : level === "중간" ? "🟡" : "⚪";
  return `${icon} ${level}${score !== null ? ` · ${score}점` : ""}`;
}

export function discordPayload(content: string, embeds: DiscordEmbed[]): Record<string, unknown> {
  return { content: content.slice(0, 1900), embeds: embeds.slice(0, 10), allowed_mentions: { parse: [] } };
}

export function buildTestEmbed(): DiscordEmbed {
  return {
    title: "✅ 알림 연결 테스트",
    description: "이 카드가 보이면 SchoolFix 알림을 받을 수 있습니다.\n새 신고 · 공개 보류 신고 · 긴급 신고 · 학교 추가 신청 · 월간 보고가 이 채널로 옵니다.",
    color: EMBED_COLORS.test,
    footer: { text: EMBED_FOOTER },
    timestamp: new Date().toISOString(),
  };
}

export function sendTestNotification(env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const url = env.NOTIFY_WEBHOOK_URL;
  if (!url) return Promise.resolve(false);
  const text = "✅ SchoolFix 알림 연결 테스트입니다. 이 메시지가 보이면 새 신고·긴급 신고·학교 신청·월간 보고 알림을 받을 수 있습니다.";
  return postWebhook(webhookChannel(url) === "discord" ? discordPayload("✅ SchoolFix 알림 연결 테스트", [buildTestEmbed()]) : buildTextPayload(url, text), env, "테스트 알림");
}

// ---------------------------------------------------------------------------
// 새 신고 알림 — 모든 신고. 공개 보류 신고는 보류 사유·전체 내용·첨부 사진까지 보낸다.
// ---------------------------------------------------------------------------

export interface ReportAttachment {
  /** data:image/...;base64,... — 신고 접수 때 서버가 검증한 형식만 들어온다 */
  dataUrl: string;
  name: string | null;
  size: number | null;
}

export interface NewReportNotice {
  schoolName: string;
  reportId: string;
  title: string;
  location: string;
  category: string;
  riskLevel: string | null;
  riskScore: number | null;
  description: string;
  held: boolean;
  heldReason: string | null;
  attachment: ReportAttachment | null;
  link: string | null;
}

/** Discord 웹훅 첨부 한도(10MB)보다 여유 있게 잡는다. 넘으면 사진 없이 보낸다. */
const MAX_ATTACHMENT_BYTES = 9 * 1024 * 1024;

function sizeLabel(bytes: number | null): string {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? ` (${Math.round(bytes / 1024)}KB)` : ` (${(bytes / 1024 / 1024).toFixed(1)}MB)`;
}

export function buildNewReportText(n: NewReportNotice, attachmentIncluded: boolean): string {
  const risk = n.riskLevel ? `${n.riskLevel}${n.riskScore !== null ? ` ${n.riskScore}점` : ""}` : "분석 전";
  const urgent = n.riskLevel === "긴급";
  const head = n.held
    ? `⏸️ 공개 보류 신고 — 운영진 검토 필요 [${risk}] ${n.schoolName}`
    : `${urgent ? "🚨" : "🆕"} 새 신고 [${risk}] ${n.schoolName}`;
  const lines = [head];
  if (n.held) lines.push(`보류 사유: ${n.heldReason || "자동 검사에서 검토 대상으로 분류"}`);
  lines.push(`위치: ${n.location}`, `분류: ${n.category}`, `제목: ${clip(n.title, 100)}`);
  // 보류 신고는 운영진이 디스코드에서 바로 판단할 수 있도록 내용을 길게 싣는다.
  lines.push(`내용: ${clip(n.description, n.held ? 1200 : 300)}`);
  if (n.attachment) {
    const name = clip(n.attachment.name || "첨부 사진", 80);
    lines.push(
      attachmentIncluded
        ? `첨부: ${name}${sizeLabel(n.attachment.size)} — 아래 사진`
        : `첨부: ${name}${sizeLabel(n.attachment.size)} — 운영진 화면에서 확인`
    );
  }
  lines.push(`접수번호: ${n.reportId}`);
  if (n.held) lines.push("운영진 화면 → 신고 관리에서 승인하거나 삭제할 수 있습니다.");
  if (n.link) lines.push(n.link);
  return lines.join("\n");
}

/** data URL → 파일. 형식이 맞지 않거나 너무 크면 null */
export function attachmentToFile(attachment: ReportAttachment, reportId: string): { blob: Blob; filename: string } | null {
  const match = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(attachment.dataUrl);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_ATTACHMENT_BYTES) return null;
  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  const type = `image/${match[1] === "jpg" ? "jpeg" : match[1]}`;
  // 파일 이름은 접수번호로 정한다. 사용자가 올린 원래 이름은 본문에만 쓴다.
  return { blob: new Blob([bytes], { type }), filename: `${reportId.replace(/[^A-Za-z0-9-]/g, "")}.${ext}` };
}

/** 푸시 알림 미리보기에 뜨는 한 줄 */
export function newReportHeadline(n: NewReportNotice): string {
  if (n.held) return `⏸️ 공개 보류 신고 · ${n.schoolName}`;
  return `${n.riskLevel === "긴급" ? "🚨 긴급 신고" : "🆕 새 신고"} · ${n.schoolName}`;
}

/**
 * 신고 카드.
 * 색상은 보류면 황색, 아니면 위험도별(긴급 빨강 · 높음 주황 · 중간 노랑 · 낮음 회색).
 * @param imageFilename 함께 올리는 사진 파일 이름. 있으면 카드 안에 크게 보여 준다.
 */
export function buildNewReportEmbed(n: NewReportNotice, imageFilename: string | null): DiscordEmbed {
  const urgent = n.riskLevel === "긴급";
  const fields: DiscordEmbedField[] = [];
  if (n.held) fields.push(embedField("🛑 보류 사유", escapeMarkdown(n.heldReason || "자동 검사에서 검토 대상으로 분류"), false));
  fields.push(
    embedField("📍 위치", escapeMarkdown(clip(n.location, 200))),
    embedField("🏷️ 분류", escapeMarkdown(n.category)),
    embedField("⚠️ 위험도", riskLabel(n.riskLevel, n.riskScore)),
    embedField("🔖 접수번호", `\`${n.reportId.replace(/`/g, "")}\``)
  );
  if (n.attachment) {
    const name = escapeMarkdown(clip(n.attachment.name || "첨부 사진", 80));
    fields.push(embedField("📎 첨부", imageFilename ? `${name}${sizeLabel(n.attachment.size)} — 아래 사진` : `${name}${sizeLabel(n.attachment.size)} — 운영진 화면에서 확인`, false));
  }
  if (n.held) fields.push(embedField("👉 처리", "운영진 화면 → 신고 관리에서 승인하거나 삭제할 수 있습니다.", false));

  return {
    title: n.held ? "⏸️ 공개 보류 신고 — 운영진 검토 필요" : urgent ? "🚨 긴급 신고" : "🆕 새 신고",
    url: n.link ?? undefined,
    author: { name: `🏫 ${clip(n.schoolName, 100)}` },
    // 보류 신고는 운영진이 디스코드에서 바로 판단할 수 있도록 내용을 길게 싣는다.
    description: `**${escapeMarkdown(clip(n.title, 100))}**\n${escapeMarkdown(clip(n.description, n.held ? 1200 : 300))}`,
    color: n.held ? EMBED_COLORS.held : riskColor(n.riskLevel),
    fields,
    image: imageFilename ? { url: `attachment://${imageFilename}` } : undefined,
    footer: { text: EMBED_FOOTER },
    timestamp: new Date().toISOString(),
  };
}

/**
 * 웹훅 요청 본문. Discord 는 카드로, 보류 신고에 사진이 있으면 multipart 로 사진을 함께 올린다.
 * Slack·일반 웹훅은 파일 업로드 방식이 달라 글자로만 보낸다.
 */
export function buildNewReportPayload(url: string, n: NewReportNotice): Record<string, unknown> | FormData {
  const channel = webhookChannel(url);
  if (channel !== "discord") return buildTextPayload(url, buildNewReportText(n, false));
  const file = n.held && n.attachment ? attachmentToFile(n.attachment, n.reportId) : null;
  const payload = discordPayload(newReportHeadline(n), [buildNewReportEmbed(n, file?.filename ?? null)]);
  if (!file) return payload;
  const form = new FormData();
  form.append("payload_json", JSON.stringify({ ...payload, attachments: [{ id: 0, filename: file.filename }] }));
  form.append("files[0]", file.blob, file.filename);
  return form;
}

export function sendNewReportNotification(n: NewReportNotice, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const url = env.NOTIFY_WEBHOOK_URL;
  if (!url) return Promise.resolve(false);
  return postWebhook(buildNewReportPayload(url, n), env, n.held ? "보류 신고 알림" : "새 신고 알림");
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

export function buildApplicationEmbed(n: ApplicationNotice): DiscordEmbed {
  return {
    title: "📮 새 학교 추가 신청",
    url: n.link ?? undefined,
    description: `**신청 사유**\n${escapeMarkdown(clip(n.reason, 600))}`,
    color: EMBED_COLORS.application,
    fields: [
      embedField("🏫 학교", escapeMarkdown(clip(n.schoolName, 100))),
      embedField("📍 주소", escapeMarkdown(clip(n.address, 200))),
      embedField("✉️ 회신 이메일", n.hasReplyEmail ? "있음 (메일함에서 확인)" : "없음"),
      // 주소는 글자 그대로 보여 준다. 숨은 링크로 바뀌지 않도록 꺾쇠로 감싸 미리보기도 끈다.
      embedField("🌐 홈페이지", `<${clip(n.website, 300).replace(/[<>\s]/g, "")}>`, false),
      embedField("👉 처리", "운영진 화면 → 학교 신청 메일함에서 \"승인하고 학교 등록\"을 누르면 바로 지원 학교에 추가됩니다.", false),
    ],
    footer: { text: EMBED_FOOTER },
    timestamp: new Date().toISOString(),
  };
}

export function sendApplicationNotification(n: ApplicationNotice, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const url = env.NOTIFY_WEBHOOK_URL;
  if (!url) return Promise.resolve(false);
  const payload = webhookChannel(url) === "discord"
    ? discordPayload(`📮 새 학교 추가 신청 · ${clip(n.schoolName, 100)}`, [buildApplicationEmbed(n)])
    : buildTextPayload(url, buildApplicationText(n));
  return postWebhook(payload, env, "학교 신청 알림");
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

/** 카드 한 장에 넣을 수 있는 칸은 25개다. 학교가 더 많으면 마지막 칸에 나머지 수를 적는다. */
const MAX_MONTHLY_FIELDS = 24;

export function buildMonthlyEmbed(month: string, schools: MonthlySchoolSummary[], link: string | null): DiscordEmbed {
  const [y, m] = month.split("-");
  const totalReceived = schools.reduce((sum, s) => sum + s.received, 0);
  const totalCompleted = schools.reduce((sum, s) => sum + s.completedInMonth, 0);
  const totalOverdue = schools.reduce((sum, s) => sum + s.overdueOpen, 0);
  const fields = schools.slice(0, MAX_MONTHLY_FIELDS).map((s) => embedField(
    `🏫 ${clip(s.schoolName, 100)}`,
    [
      `📥 접수 **${s.received}건** · 완료율 **${s.completionRate === null ? "-" : `${s.completionRate}%`}**`,
      `✅ 처리 완료 **${s.completedInMonth}건** · 평균 **${hoursLabel(s.avgResolutionHours)}**`,
      `⏰ 기한 넘겨 완료 ${s.completedLate}건 · 현재 기한 초과 ${s.overdueOpen}건`,
      s.topCategory || s.topLocation ? `🔝 ${escapeMarkdown(s.topCategory ?? "-")} · ${escapeMarkdown(clip(s.topLocation ?? "-", 60))}` : "",
    ].filter(Boolean).join("\n"),
    false
  ));
  if (schools.length > MAX_MONTHLY_FIELDS) {
    fields.push(embedField("…", `외 ${schools.length - MAX_MONTHLY_FIELDS}개 학교는 운영진 화면 → 월별 통계에서 확인하세요.`, false));
  }
  return {
    title: `📊 ${y}년 ${Number(m)}월 월간 보고`,
    url: link ?? undefined,
    description: schools.length === 0
      ? "이 달에 접수되거나 처리된 신고가 없습니다."
      : `학교 ${schools.length}곳 · 접수 **${totalReceived}건** · 처리 완료 **${totalCompleted}건** · 현재 기한 초과 **${totalOverdue}건**`,
    color: EMBED_COLORS.monthly,
    fields,
    footer: { text: `${EMBED_FOOTER} · 자세한 내용은 운영진 → 월별 통계` },
    timestamp: new Date().toISOString(),
  };
}

export function sendMonthlyNotification(month: string, schools: MonthlySchoolSummary[], link: string | null, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const url = env.NOTIFY_WEBHOOK_URL;
  if (!url) return Promise.resolve(false);
  const [y, m] = month.split("-");
  const payload = webhookChannel(url) === "discord"
    ? discordPayload(`📊 ${y}년 ${Number(m)}월 월간 보고`, [buildMonthlyEmbed(month, schools, link)])
    : buildTextPayload(url, buildMonthlyText(month, schools, link));
  return postWebhook(payload, env, "월간 보고");
}

export function buildWebhookPayload(url: string, n: UrgentNotice): Record<string, unknown> {
  const text = buildNotificationText(n);
  const channel = webhookChannel(url);
  if (channel === "discord") {
    // 접수 뒤 위험도 분석에서 긴급으로 판정된 신고 — 새 신고와 같은 카드 모양으로 보낸다.
    const notice: NewReportNotice = { ...n, held: n.held, heldReason: null, attachment: null };
    return discordPayload(`🚨 긴급 신고 · ${n.schoolName}`, [{ ...buildNewReportEmbed(notice, null), title: "🚨 긴급 신고 (위험도 분석 결과)" }]);
  }
  if (channel === "slack") return buildTextPayload(url, text);
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
