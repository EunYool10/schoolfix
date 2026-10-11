/**
 * 학생 알림 (Web Push) — 브라우저 쪽
 *
 * "알림 받기" 를 켜면 서비스 워커(/sw.js)를 등록하고 브라우저 푸시를 구독한 뒤,
 * 구독 정보와 이 기기의 "내 신고" 소유 토큰을 서버에 보낸다. 서버는 그 신고가 바뀌면 이 기기로 알림을 보낸다.
 * 새 신고를 접수하거나 확인 코드로 신고를 불러오면 syncPush 로 토큰 목록을 다시 보낸다.
 */

import { getDeviceToken, loadOwnerTokens } from "./clientTokens";

export interface PushConfig {
  enabled: boolean;
  publicKey: string | null;
}

let configPromise: Promise<PushConfig> | null = null;

export function getPushConfig(): Promise<PushConfig> {
  configPromise ??= fetch("/api/push/config")
    .then((res) => res.json())
    .then((json) => ({ enabled: Boolean(json.enabled && json.publicKey), publicKey: json.publicKey ?? null }))
    .catch(() => ({ enabled: false, publicKey: null }));
  return configPromise;
}

/** 이 브라우저가 웹 푸시를 지원하는지. iPhone 은 홈 화면에 추가한 앱에서만 true 가 된다. */
export function pushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window
    && window.isSecureContext;
}

/** iPhone·iPad 의 일반 Safari 탭인지 (홈 화면에 추가해야 알림을 받을 수 있다) */
export function isIosBrowserTab(): boolean {
  if (typeof navigator === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function sendSubscription(subscription: PushSubscription): Promise<void> {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // 기기 토큰은 "나도 겪었어요" 한 신고가 처리 완료되면 "진짜 고쳐졌나요?" 를 묻는 데 쓴다.
    body: JSON.stringify({ subscription: subscription.toJSON(), tokens: loadOwnerTokens(), deviceToken: getDeviceToken() }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error || "알림을 설정하지 못했습니다.");
}

/** 알림 켜기. 권한을 묻고, 구독을 만들어 서버에 등록한다. */
export async function enablePush(): Promise<void> {
  const config = await getPushConfig();
  if (!config.enabled || !config.publicKey) throw new Error("이 서비스에서 알림 기능이 아직 설정되지 않았습니다.");
  if (!pushSupported()) throw new Error("이 브라우저는 알림을 지원하지 않습니다.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("알림 권한이 허용되지 않았습니다. 브라우저 설정에서 이 사이트의 알림을 허용해주세요.");
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const subscription = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(config.publicKey) }));
  await sendSubscription(subscription);
}

/** 알림 끄기. 서버에서 지우고 브라우저 구독도 해제한다. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);
  await subscription.unsubscribe();
}

/** 이 기기에서 알림이 켜져 있는지 */
export async function pushIsOn(): Promise<boolean> {
  try {
    const config = await getPushConfig();
    if (!config.enabled || !pushSupported()) return false;
    return Boolean(await currentSubscription()) && Notification.permission === "granted";
  } catch {
    return false;
  }
}

/** 알림이 켜져 있으면 지금 가진 소유 토큰으로 다시 등록한다(새로 접수한 신고도 알림을 받도록). */
export async function syncPush(): Promise<void> {
  try {
    const config = await getPushConfig();
    if (!config.enabled) return;
    const subscription = await currentSubscription();
    if (subscription && Notification.permission === "granted") await sendSubscription(subscription);
  } catch {
    // 알림 갱신 실패는 접수·조회를 막지 않는다.
  }
}
