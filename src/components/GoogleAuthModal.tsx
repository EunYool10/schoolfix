import React, { useState, useEffect, useRef } from "react";
import { UserProfile, ADMIN_EMAIL } from "../types";
import {
  X,
  ShieldCheck,
  User,
  LogIn,
  CheckCircle2,
  AlertCircle,
  Key,
  Copy,
  Check,
  Settings,
  ShieldAlert,
  Sparkles,
  ExternalLink,
} from "lucide-react";

interface GoogleAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onLogin: (user: UserProfile, token: string) => void;
  onLogout: () => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (parent: HTMLElement, options: any) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

export function GoogleAuthModal({
  isOpen,
  onClose,
  currentUser,
  onLogin,
  onLogout,
}: GoogleAuthModalProps) {
  const [clientId, setClientId] = useState<string>("");
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [detectedOrigin, setDetectedOrigin] = useState<string>("");
  const [customClientIdInput, setCustomClientIdInput] = useState<string>("");
  const [showConfigSettings, setShowConfigSettings] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  const googleBtnRef = useRef<HTMLDivElement>(null);

  // 1. Fetch Google Auth Config from backend
  const fetchAuthConfig = async () => {
    try {
      const res = await fetch("/api/auth/config");
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setClientId(data.clientId || "");
          setIsConfigured(Boolean(data.configured));
          setDetectedOrigin(data.detectedOrigin || window.location.origin);
          if (data.clientId) {
            setCustomClientIdInput(data.clientId);
          }
        }
      }
    } catch (e) {
      console.error("Failed to load auth config", e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAuthConfig();
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  // 2. Initialize official Google Identity Services button
  useEffect(() => {
    if (!isOpen || currentUser || !clientId) return;

    const initGsi = () => {
      if (window.google?.accounts?.id && googleBtnRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
          });

          googleBtnRef.current.innerHTML = "";
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "continue_with",
            shape: "rectangular",
            logo_alignment: "left",
            width: 320,
          });
        } catch (err: any) {
          console.warn("GSI initialization warning:", err);
        }
      }
    };

    // If script not ready yet, wait briefly
    const timer = setTimeout(initGsi, 200);
    return () => clearTimeout(timer);
  }, [isOpen, currentUser, clientId]);

  // 3. Handle official Google Credential Response
  const handleGoogleCredentialResponse = async (response: { credential?: string }) => {
    if (!response.credential) {
      setErrorMsg("Google 로그인 토큰이 확인되지 않았습니다.");
      return;
    }

    setIsVerifying(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Google 로그인 인증에 실패했습니다.");
      }

      onLogin(data.user, data.token);
      onClose();
    } catch (err: any) {
      console.error("Google Auth error:", err);
      setErrorMsg(err.message || "Google 로그인 처리 중 오류가 발생했습니다.");
    } finally {
      setIsVerifying(false);
    }
  };

  // 4. Save Custom Client ID
  const handleSaveClientId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customClientIdInput.trim()) {
      setErrorMsg("Google Client ID를 입력해주세요.");
      return;
    }

    try {
      const res = await fetch("/api/auth/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: customClientIdInput.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setClientId(data.clientId);
        setIsConfigured(true);
        setSuccessMsg("Google Client ID가 저장되었습니다. 아래 버튼으로 로그인해주세요.");
        setShowConfigSettings(false);
      } else {
        setErrorMsg(data.error || "Client ID 설정에 실패했습니다.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "설정 저장 중 오류가 발생했습니다.");
    }
  };

  // 5. Developer Sandbox/Testing Login (Simulates real Google sub/email to test full DB flow)
  const handleDevMockLogin = async (email: string, name: string, sub: string) => {
    setIsVerifying(true);
    setErrorMsg(null);

    try {
      const mockPayload = {
        sub,
        email,
        name,
        picture:
          email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
            ? "https://api.dicebear.com/7.x/bottts/svg?seed=admin"
            : "https://api.dicebear.com/7.x/bottts/svg?seed=student",
      };

      const credential = `dev_mock_${btoa(unescape(encodeURIComponent(JSON.stringify(mockPayload))))}`;

      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "테스트 인증 처리에 실패했습니다.");
      }

      onLogin(data.user, data.token);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "로그인 처리에 실패했습니다.");
    } finally {
      setIsVerifying(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-white p-1 shadow-2xs border border-slate-200 flex items-center justify-center">
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            </div>
            <h3 id="google-auth-modal-title" className="text-base font-bold text-slate-900">
              {currentUser ? "사용자 계정 정보" : "Google 계정으로 로그인"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {currentUser ? (
            /* Logged in state display */
            <div className="space-y-4">
              <div className="flex items-center gap-3.5 p-4 rounded-xl border border-slate-200 bg-slate-50">
                {currentUser.profile_image || currentUser.avatar ? (
                  <img
                    src={currentUser.profile_image || currentUser.avatar}
                    alt={currentUser.name}
                    className="h-12 w-12 rounded-full border border-slate-200 object-cover shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center font-bold text-blue-800 text-lg shrink-0">
                    {currentUser.name ? currentUser.name.charAt(0) : "U"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm truncate">
                      {currentUser.name}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        currentUser.role === "ADMIN"
                          ? "bg-purple-100 text-purple-800 border border-purple-200"
                          : "bg-blue-100 text-blue-800 border border-blue-200"
                      }`}
                    >
                      {currentUser.role === "ADMIN" ? "최고 관리자" : "일반 사용자"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{currentUser.email}</p>
                  <p className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                    User ID: {currentUser.id}
                  </p>
                </div>
              </div>

              {/* Account Details Box */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white text-xs space-y-2">
                <div className="flex justify-between text-slate-600">
                  <span>Google 고유식별자 (sub):</span>
                  <span className="font-mono text-slate-900 font-bold">
                    {currentUser.google_sub
                      ? `${currentUser.google_sub.slice(0, 6)}...${currentUser.google_sub.slice(-4)}`
                      : "연동 완료"}
                  </span>
                </div>
                {currentUser.last_login_at && (
                  <div className="flex justify-between text-slate-600">
                    <span>최근 로그인 일시:</span>
                    <span className="font-mono text-slate-900">
                      {new Date(currentUser.last_login_at).toLocaleString("ko-KR")}
                    </span>
                  </div>
                )}
              </div>

              {/* Logout Action */}
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="w-full h-11 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 font-bold text-xs sm:text-sm transition cursor-pointer border border-slate-200 flex items-center justify-center gap-2"
              >
                <LogIn className="h-4 w-4 rotate-180" />
                <span>계정 로그아웃</span>
              </button>
            </div>
          ) : (
            /* Login state display */
            <div className="space-y-4">
              {/* Guidance Text */}
              <div className="text-xs text-slate-600 leading-relaxed bg-blue-50/60 p-3.5 rounded-xl border border-blue-100">
                <p className="font-semibold text-blue-900 mb-1">
                  학교 구성원 전용 공식 로그인
                </p>
                <p>
                  본인의 Google 계정으로 로그인하면 제출한 모든 시설 불편 신고의 처리 상태를 실시간으로 확인하고 맞춤 관리를 받을 수 있습니다.
                </p>
              </div>

              {/* Error / Success Notifications */}
              {errorMsg && (
                <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="leading-snug">{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="leading-snug">{successMsg}</span>
                </div>
              )}

              {/* Official Google Identity Services Button Container */}
              {isConfigured && clientId ? (
                <div className="space-y-2 flex flex-col items-center">
                  <div
                    ref={googleBtnRef}
                    id="google-signin-btn-container"
                    className="flex justify-center min-h-[44px]"
                  />
                  {isVerifying && (
                    <p className="text-xs text-slate-500 animate-pulse">
                      Google 계정 자격 증명을 서버에서 안전하게 검증 중입니다...
                    </p>
                  )}
                </div>
              ) : (
                /* Notice when Google Client ID is not yet provided */
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 text-xs text-amber-900 space-y-2.5">
                  <div className="flex items-center gap-2 font-bold text-amber-950">
                    <Key className="h-4 w-4 text-amber-600" />
                    <span>Google OAuth Client ID 설정 필요</span>
                  </div>
                  <p className="leading-relaxed text-[11.5px]">
                    Google Cloud Console에서 발급받은 OAuth 웹 클라이언트 ID를 입력하여 즉시 공식 Google 로그인을 활성화할 수 있습니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowConfigSettings(!showConfigSettings)}
                    className="inline-flex items-center gap-1.5 font-bold text-blue-700 hover:underline cursor-pointer"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>{showConfigSettings ? "설정 닫기" : "OAuth Client ID 설정 열기"}</span>
                  </button>
                </div>
              )}

              {/* OAuth Client ID Configuration Form (Expandable) */}
              {showConfigSettings && (
                <form
                  onSubmit={handleSaveClientId}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3 text-xs"
                >
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 block">
                      Google Cloud Web Client ID
                    </label>
                    <input
                      type="text"
                      value={customClientIdInput}
                      onChange={(e) => setCustomClientIdInput(e.target.value)}
                      placeholder="예: 123456789-abcdef.apps.googleusercontent.com"
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white font-mono text-[11px] outline-none focus:border-blue-600"
                    />
                  </div>

                  {/* Origin helper */}
                  <div className="space-y-1">
                    <span className="text-[11px] text-slate-500 font-semibold block">
                      GCP 콘솔 등록용 승인된 자바스크립트 원본:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 bg-white p-1.5 rounded border border-slate-200 font-mono text-[10.5px] text-slate-700 truncate">
                        {detectedOrigin || window.location.origin}
                      </code>
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(detectedOrigin || window.location.origin, "origin")
                        }
                        className="px-2 py-1.5 rounded bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 cursor-pointer font-semibold flex items-center gap-1"
                      >
                        {copied === "origin" ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        <span>복사</span>
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full h-8 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-bold transition cursor-pointer"
                  >
                    Client ID 저장 및 Google 버튼 활성화
                  </button>
                </form>
              )}

              {/* Developer Sandbox Instant Verification Section */}
              <div className="pt-3 border-t border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                    <span>환경 검증 및 역할별 즉시 로그인</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    DB 세션 자동 생성
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isVerifying}
                    onClick={() =>
                      handleDevMockLogin(
                        "student.fix@school.kr",
                        "김학생 (Google 인증)",
                        "109823489123891239812"
                      )
                    }
                    className="p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 bg-white transition text-left cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900 group-hover:text-blue-700">
                        일반 사용자 (학생)
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 font-bold">
                        USER
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">student.fix@school.kr</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      내 진행상황 및 신고 접수 전용
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={isVerifying}
                    onClick={() =>
                      handleDevMockLogin(
                        ADMIN_EMAIL,
                        "시설안전총괄 관리자",
                        "104829381928391823901"
                      )
                    }
                    className="p-3 rounded-xl border border-purple-200 hover:border-purple-400 hover:bg-purple-50/40 bg-white transition text-left cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900 group-hover:text-purple-700">
                        최고 관리자 (시설팀)
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 font-bold">
                        ADMIN
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{ADMIN_EMAIL}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      전체 관리, 상태 변경, AI 리포트
                    </p>
                  </button>
                </div>
              </div>

              {/* Security info footer */}
              <div className="pt-2 text-center">
                <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Google Identity Services 공식 프로토콜 기반 안전 인증</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
