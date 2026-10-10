/**
 * 브라우저에만 보관하는 익명 토큰들.
 *
 *  - 소유 토큰: 신고 접수 때 서버가 발급한다. "내 신고" 조회와 만족도 응답에 쓴다.
 *  - 기기 토큰: 이 브라우저가 처음 만든다. "나도 겪었어요" 중복 방지와 반복 신고 판단에 쓴다.
 *
 * 서버에는 해시만 저장된다. 이름·학번 같은 개인 정보와 연결되지 않는다.
 * 저장소가 막힌 환경(시크릿 모드 등)에서도 화면이 깨지지 않도록 모든 접근을 try 로 감싼다.
 */

const OWNER_TOKENS_KEY = "schoolfix_owner_tokens_v1";
const DEVICE_TOKEN_KEY = "schoolfix_device_token_v1";
const ME_TOO_KEY = "schoolfix_me_too_v1";

export function loadOwnerTokens(): string[] {
  try {
    const raw = localStorage.getItem(OWNER_TOKENS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function saveOwnerToken(token: string) {
  try {
    const tokens = loadOwnerTokens();
    if (!tokens.includes(token)) {
      localStorage.setItem(OWNER_TOKENS_KEY, JSON.stringify([token, ...tokens].slice(0, 200)));
    }
  } catch (err) {
    console.warn("소유 토큰을 저장하지 못했습니다.", err);
  }
}

let memoryDeviceToken: string | null = null;

/** 이 브라우저의 기기 토큰(64자리 16진수). 저장소가 막혀 있으면 이번 탭에서만 유지된다. */
export function getDeviceToken(): string {
  try {
    const stored = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (stored && /^[a-f0-9]{64}$/.test(stored)) return stored;
  } catch {
    // 아래에서 새로 만든다.
  }
  if (!memoryDeviceToken) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    memoryDeviceToken = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  try {
    localStorage.setItem(DEVICE_TOKEN_KEY, memoryDeviceToken);
  } catch {
    // 저장하지 못해도 이번 탭에서는 같은 토큰을 쓴다.
  }
  return memoryDeviceToken;
}

/** 이 브라우저에서 "나도 겪었어요" 를 누른 신고 id 목록 */
export function loadMeTooIds(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(ME_TOO_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function setMeToo(reportId: string, joined: boolean) {
  try {
    const ids = loadMeTooIds();
    if (joined) ids.add(reportId);
    else ids.delete(reportId);
    localStorage.setItem(ME_TOO_KEY, JSON.stringify([...ids].slice(-500)));
  } catch {
    // 화면 표시용 기록일 뿐이다. 서버가 중복을 막는다.
  }
}
