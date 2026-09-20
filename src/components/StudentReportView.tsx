import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Camera,
  X,
  CheckCircle,
  AlertCircle,
  Paperclip,
  Lock,
  Info,
  RotateCw,
  AlertTriangle,
} from "lucide-react";
import {
  SchoolReport,
  SCHOOL_LOCATIONS,
  ISSUE_CATEGORIES,
} from "../types";
import {
  FORM_EXAMPLE_LIST,
  FormExampleItem,
  getRandomFormExamples,
} from "../data/formExamples";
import { UnsavedChangesModal } from "./UnsavedChangesModal";
import { maskProfanity } from "../security/profanityFilter";

export interface SubmitReportPayload {
  title?: string;
  location: string;
  /** 상세 위치 (선택). 위치 통계는 이 값을 함께 써서 장소를 구분한다. */
  locationDetail?: string | null;
  category: string;
  description: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  /** AI 사전 확인을 마친 세션 id. 있으면 서버가 확인을 다시 하지 않는다. */
  clarifySessionId?: string | null;
}

export interface SubmitReportResult {
  success: boolean;
  report?: SchoolReport;
  error?: string;
  /** 서버가 추가 확인이 필요하다고 판단한 경우 */
  needsMoreInfo?: boolean;
  question?: string | null;
  sessionId?: string | null;
}

interface StudentReportViewProps {
  onSubmitReport: (data: SubmitReportPayload) => Promise<SubmitReportResult>;
  isSubmitting: boolean;
  onSuccessNavToMyReports?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

/** AI 사전 확인 진행 상태 (§8, §19) */
interface ClarifyState {
  sessionId: string;
  question: string;
  turns: { question: string; answer: string }[];
}

interface FieldErrors {
  title?: string;
  location?: string;
  category?: string;
  description?: string;
  attachment?: string;
}

export function StudentReportView({
  onSubmitReport,
  isSubmitting,
  onSuccessNavToMyReports,
  onDirtyChange,
}: StudentReportViewProps) {
  // Problem fields
  const [title, setTitle] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [locationDetail, setLocationDetail] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  /**
   * AI 사전 확인 (§8 ~ §19).
   *
   * 신고 내용이 애매하면 바로 접수하지 않고 가장 중요한 질문 하나를 받아 온다.
   * 서버가 대화 상태를 들고 있으므로 화면은 세션 id 와 현재 질문만 알면 된다 (§15).
   */
  const [clarify, setClarify] = useState<ClarifyState | null>(null);
  const [answer, setAnswer] = useState<string>("");
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [clarifyConfirmed, setClarifyConfirmed] = useState<boolean>(false);

  // Attachment state
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentSize, setAttachmentSize] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Client-side validation errors per field
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [completedReport, setCompletedReport] = useState<SchoolReport | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Unsaved changes dialog state
  const [showResetConfirmModal, setShowResetConfirmModal] = useState<boolean>(false);

  // 작성 중인 내용에 가려질 표현이 있는지 미리 알려 준다.
  // 차단이 아니라 안내이므로 제출은 그대로 가능하다.
  const profanityPreview = useMemo(() => {
    const t = maskProfanity(title);
    const d = maskProfanity(description);
    return { willMask: t.masked || d.masked, preview: d.masked ? d.text : null };
  }, [title, description]);

  // Example auto-fill notice banner state
  const [autoFillNotice, setAutoFillNotice] = useState<boolean>(false);

  // 33. 예시 추천 값 랜덤 제공 (화면 UI 전용, 실제 신고 DB와 완전히 분리)
  // 페이지 진입 시 미리 정의된 예시 중 4개를 무작위 중복 없이 선택
  const [displayedExamples, setDisplayedExamples] = useState<FormExampleItem[]>(() =>
    getRandomFormExamples(4)
  );
  // 현재 선택/적용된 추천 버튼 상태 추적
  const [selectedExampleKey, setSelectedExampleKey] = useState<string | null>(null);

  // Field element refs for auto-focusing on invalid input
  const locationRef = useRef<HTMLSelectElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detect whether form contains unsaved user input
  const isFormDirty = Boolean(
    !completedReport &&
      (title.trim().length > 0 ||
        location.length > 0 ||
        locationDetail.trim().length > 0 ||
        category.length > 0 ||
        description.trim().length > 0 ||
        previewUrl !== null ||
        attachmentName !== null)
  );

  // Notify parent component of dirty state changes
  useEffect(() => {
    onDirtyChange?.(isFormDirty);
  }, [isFormDirty, onDirtyChange]);

  // Window beforeunload event listener: warn on page reload or close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isFormDirty) {
        e.preventDefault();
        e.returnValue = "작성 중인 신고 내용이 유실될 수 있습니다. 창을 닫거나 새로고침하시겠습니까?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isFormDirty]);

  /**
   * 신고 내용이 바뀌면 이전 확인 결과는 더 이상 이 신고에 대한 판단이 아니다.
   * 서버도 같은 이유로 내용이 바뀐 세션을 인정하지 않으므로, 화면 상태도 함께 지운다.
   */
  const resetClarify = () => {
    setClarify(null);
    setAnswer("");
    setClarifyConfirmed(false);
  };

  const clearFieldError = (field: keyof FieldErrors) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    if (globalError) {
      setGlobalError(null);
    }
  };

  // 서버가 허용하는 형식과 반드시 일치해야 한다(serverSecurity.validateReportInput).
  // 목록이 어긋나면 사용자는 첨부가 된 줄 알았는데 조용히 사라지거나 400 을 받는다.
  const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setFieldErrors((prev) => ({
        ...prev,
        attachment: "사진은 PNG, JPG, GIF, WEBP 형식만 첨부할 수 있습니다.",
      }));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setFieldErrors((prev) => ({
        ...prev,
        attachment:
          "파일 크기는 8MB 이하만 첨부 가능합니다. (선택된 파일: " +
          formatFileSize(file.size) +
          ")",
      }));
      return;
    }

    setAttachmentName(file.name);
    setAttachmentSize(file.size);
    clearFieldError("attachment");

    const reader = new FileReader();
    reader.onload = (event) => {
      setPreviewUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = () => {
    setAttachmentName(null);
    setAttachmentSize(null);
    setPreviewUrl(null);
    clearFieldError("attachment");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // "다른 예시 보기 ↻" 버튼 클릭 시 새로운 예시 조합 랜덤 선택 (DB 저장 없음)
  const handleRefreshExamples = () => {
    const currentKeys = displayedExamples.map((ex) => ex.key);
    const nextExamples = getRandomFormExamples(4, location, currentKeys);
    setDisplayedExamples(nextExamples);
  };

  const handleResetForm = () => {
    setTitle("");
    setLocation("");
    setLocationDetail("");
    setCategory("");
    setDescription("");
    resetClarify();
    handleRemoveFile();
    setFieldErrors({});
    setGlobalError(null);
    setSubmitError(null);
    setCompletedReport(null);
    setAutoFillNotice(false);
    setSelectedExampleKey(null);
    // 폼 초기화 시 추천 예시도 새로운 조합으로 갱신
    setDisplayedExamples(getRandomFormExamples(4));
  };

  // Called when user clicks an example recommendation button
  // Note: Form fields are auto-filled ONLY; NO database submission occurs.
  const handleApplyExample = (example: FormExampleItem) => {
    setTitle(example.label);
    setLocation(example.location);
    setCategory(example.category);
    setDescription(example.description);
    setSelectedExampleKey(example.key);
    resetClarify();
    clearFieldError("title");
    clearFieldError("location");
    clearFieldError("category");
    clearFieldError("description");
    setAutoFillNotice(true);
  };

  const validateForm = (): boolean => {
    const errors: FieldErrors = {};

    // 1. Location Validation
    if (!location || !location.trim()) {
      errors.location = "문제 위치를 선택해주세요.";
    }

    // 2. Category Validation
    if (!category || !category.trim()) {
      errors.category = "문제 종류를 선택해주세요.";
    }

    // 3. Description Validation
    const trimmedDesc = description.trim();
    if (!trimmedDesc) {
      errors.description = "문제 내용을 입력해주세요.";
    } else if (trimmedDesc.length < 5) {
      errors.description = `상황을 구체적으로 파악할 수 있도록 최소 5자 이상 작성해주세요. (현재 ${trimmedDesc.length}자)`;
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      // Auto-focus on first invalid field
      if (errors.location && locationRef.current) {
        locationRef.current.focus();
        setGlobalError(errors.location);
      } else if (errors.category && categoryRef.current) {
        categoryRef.current.focus();
        setGlobalError(errors.category);
      } else if (errors.description && descriptionRef.current) {
        descriptionRef.current.focus();
        setGlobalError(errors.description);
      }
      return false;
    }

    setGlobalError(null);
    return true;
  };

  /** 실제 접수. 사전 확인이 끝난 뒤에만 호출된다 (§16) */
  const submitReport = async (sessionId: string | null) => {
    const res = await onSubmitReport({
      title: title.trim() || undefined,
      location: location.trim(),
      locationDetail: locationDetail.trim() || null,
      category: category.trim(),
      description: description.trim(),
      attachmentUrl: previewUrl || null,
      attachmentName: attachmentName || null,
      attachmentSize: attachmentSize || null,
      clarifySessionId: sessionId,
    });

    if (res.success && res.report) {
      setCompletedReport(res.report);
      handleRemoveFile();
      setTitle("");
      setDescription("");
      setCategory("");
      setLocation("");
      setLocationDetail("");
      resetClarify();
      setFieldErrors({});
      setGlobalError(null);
      setAutoFillNotice(false);
      return;
    }

    // 서버가 한 번 더 확인이 필요하다고 판단한 경우 — 질문을 그대로 이어받는다.
    if (res.needsMoreInfo && res.question && res.sessionId) {
      setClarify({ sessionId: res.sessionId, question: res.question, turns: [] });
      setAnswer("");
      setClarifyConfirmed(false);
      return;
    }

    setSubmitError(res.error || "신고를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
  };

  /**
   * AI 사전 확인 호출.
   * 실패하더라도 접수를 막지 않는다 — 서버도 같은 원칙이며, 내부 오류를 사용자에게 노출하지 않는다 (§20).
   */
  const runClarify = async (
    body: Record<string, unknown>
  ): Promise<{ ready: boolean; sessionId: string | null }> => {
    try {
      const res = await fetch("/api/reports/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        // 세션 만료 등 — 확인 과정을 처음부터 다시 시작한다.
        resetClarify();
        setSubmitError(
          json?.error || "신고 내용을 확인하는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요."
        );
        return { ready: false, sessionId: null };
      }

      if (json.status === "needs_more_information" && json.question) {
        setClarify({
          sessionId: json.sessionId,
          question: json.question,
          turns: Array.isArray(json.turns) ? json.turns : [],
        });
        setAnswer("");
        return { ready: false, sessionId: json.sessionId };
      }

      // 충분하다고 판단됨 — 바로 접수로 넘어간다.
      setClarify(null);
      setClarifyConfirmed(true);
      return { ready: true, sessionId: json.sessionId ?? null };
    } catch (err) {
      console.error("[clarify]", err);
      // 확인을 못 했다고 신고를 막지는 않는다. 서버가 접수 시 한 번 더 판단한다.
      return { ready: true, sessionId: null };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isChecking || isSubmitting) return; // 중복 제출 방지 (§20)
    setSubmitError(null);

    // Run detailed client-side field validation before sending to backend
    const isValid = validateForm();
    if (!isValid) {
      return;
    }

    setIsChecking(true);
    try {
      const { ready, sessionId } = await runClarify({
        location: location.trim(),
        category: category.trim(),
        description: description.trim(),
      });
      if (!ready) return;
      await submitReport(sessionId);
    } finally {
      setIsChecking(false);
    }
  };

  /** 추가 질문에 답하고 다시 판단받는다 (§8) */
  const handleAnswerSubmit = async () => {
    if (!clarify || isChecking || isSubmitting) return;

    const trimmed = answer.trim();
    if (!trimmed) {
      setSubmitError("답변을 입력해주세요.");
      return;
    }

    setSubmitError(null);
    setIsChecking(true);
    try {
      const { ready, sessionId } = await runClarify({
        sessionId: clarify.sessionId,
        answer: trimmed,
      });
      if (!ready) return;
      await submitReport(sessionId ?? clarify.sessionId);
    } finally {
      setIsChecking(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Clean completion screen
  if (completedReport) {
    return (
      <div className="w-full">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-700 mb-4">
            <CheckCircle className="h-8 w-8" />
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            신고가 정상 접수되었습니다.
          </h2>

          <div className="mt-4 inline-block rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-center">
            <span className="text-xs text-slate-500 font-medium">접수번호</span>
            <div className="font-mono text-base font-bold text-blue-700 mt-0.5">
              {completedReport.id}
            </div>
          </div>

          <p className="mt-4 text-xs sm:text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
            소중한 제보 감사합니다! 접수된 내용은 학교 시설 및 안전 담당 부서에 전달되었으며 실시간으로 처리 진행 상태가 업데이트됩니다.
          </p>

          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-center gap-3">
            {onSuccessNavToMyReports && (
              <button
                type="button"
                onClick={onSuccessNavToMyReports}
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg bg-blue-700 px-6 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-blue-800 transition active:scale-[0.99] cursor-pointer shadow-xs"
              >
                내 접수 내역 & 진행 현황 바로가기
              </button>
            )}
            <button
              type="button"
              onClick={handleResetForm}
              className={`w-full sm:w-auto inline-flex items-center justify-center rounded-lg px-6 py-2.5 text-xs sm:text-sm font-semibold transition active:scale-[0.99] cursor-pointer ${
                onSuccessNavToMyReports
                  ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  : "bg-blue-700 text-white hover:bg-blue-800"
              }`}
            >
              새로운 신고 작성하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Title & Introduction */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          학교에서 발견한 문제를 알려주세요
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-slate-500 leading-relaxed">
          교내 시설 고장, 안전 위험, 위생 문제 등 개선이 필요한 상황을 알려주시면
          학교 담당 부서에서 확인 후 조치합니다.
        </p>
      </div>

      {/* Unsaved changes notice banner when form has data */}
      {isFormDirty && (
        <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-900 animate-in fade-in shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="font-medium">
              신고 작성 중인 내용이 있습니다. 페이지를 새로고침하거나 닫으면 내용이 유실될 수 있습니다.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowResetConfirmModal(true)}
            className="text-amber-800 hover:text-amber-950 font-bold underline whitespace-nowrap cursor-pointer px-2 py-1 rounded hover:bg-amber-100/60 transition"
          >
            작성 초기화
          </button>
        </div>
      )}

      {/* Main Form Box */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-7 shadow-xs">
        {/* 빠른 작성 예시 (랜덤 추천 및 다른 예시 보기) */}
        <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-bold text-slate-900 tracking-tight">
              빠른 작성 예시
            </span>
            <button
              type="button"
              onClick={handleRefreshExamples}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-700 hover:bg-slate-200/70 active:scale-95 px-2.5 py-1 rounded-md transition cursor-pointer"
              title="새로운 예시 추천 목록으로 새로고침"
            >
              <RotateCw className="h-3.5 w-3.5 text-slate-500" />
              <span>다른 예시 보기</span>
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            자주 발생하는 상황을 선택하면 신고 내용이 자동으로 입력됩니다. (직접 수정 후 접수 가능)
          </p>
          <div className="flex flex-wrap gap-2">
            {displayedExamples.map((example) => {
              const isSelected = selectedExampleKey === example.key;
              return (
                <button
                  key={example.key}
                  type="button"
                  onClick={() => handleApplyExample(example)}
                  aria-pressed={isSelected}
                  className={`inline-flex items-center justify-center min-h-[38px] px-3.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
                    isSelected
                      ? "border-blue-600 bg-blue-50 text-blue-900 font-bold ring-1 ring-blue-600 shadow-2xs"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900 active:bg-slate-100"
                  }`}
                >
                  {isSelected && <span className="mr-1.5 text-blue-600 font-bold">✓</span>}
                  {example.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 접수 안내 — 로그인이 없으므로 신고자 개인정보를 수집하지 않는다(§32) */}
        <div className="mb-6 p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center gap-2.5 text-xs">
          <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <Lock className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="font-semibold text-slate-800">
              로그인 없이 접수되며, 이름·학번·연락처를 수집하지 않습니다.
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              접수한 신고는 이 브라우저의 [내 신고] 탭에서 처리 상태를 확인할 수 있습니다.
            </p>
          </div>
        </div>

        {/* Auto-fill Info Notice (Disappears when user edits or resets) */}
        {autoFillNotice && (
          <div
            role="status"
            className="mb-6 flex items-start justify-between gap-2.5 rounded-lg border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900"
          >
            <div className="flex items-start gap-2.5">
              <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900">예시 내용이 입력되었습니다.</p>
                <p className="mt-0.5 text-slate-600">
                  내용을 확인하고 수정한 후 제출해주세요.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAutoFillNotice(false)}
              className="text-slate-400 hover:text-slate-700 p-1 rounded cursor-pointer"
              aria-label="안내 닫기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Validation Summary Alert */}
        {globalError && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs sm:text-sm text-rose-800"
          >
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-900">입력하신 정보에 확인이 필요한 항목이 있습니다.</p>
              <p className="mt-0.5 text-rose-700">{globalError}</p>
            </div>
          </div>
        )}

        {/*
          작성 중 안내 — 제출을 막지 않는다.
          부적절한 표현은 접수 시 서버가 자동으로 가리며,
          사용자가 미리 알고 고칠 수 있도록 여기서 알려 준다.
        */}
        {profanityPreview.willMask && (
          <div
            role="status"
            className="mb-6 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-xs sm:text-sm text-amber-900"
          >
            <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-semibold">
                사용할 수 없는 표현이 포함되어 있어 접수 시 ####로 가려집니다.
              </p>
              {profanityPreview.preview && (
                <p className="mt-1 text-[11px] text-amber-800 break-keep leading-relaxed">
                  이렇게 저장됩니다: {profanityPreview.preview}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Server Submit Error Alert */}
        {submitError && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-2.5 rounded-lg border border-rose-300 bg-rose-50 p-3.5 text-xs sm:text-sm text-rose-900"
          >
            <AlertCircle className="h-4 w-4 text-rose-700 shrink-0 mt-0.5" />
            <p className="font-medium">{submitError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {/* 0. Report Title (Optional / Recommended) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="field-title"
                className="block text-sm font-semibold text-slate-900"
              >
                신고 제목 <span className="text-xs font-normal text-slate-500">(선택)</span>
              </label>
              <span className="text-[11px] text-slate-400">
                {title.length}/60자
              </span>
            </div>
            <input
              id="field-title"
              type="text"
              maxLength={60}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 3층 과학실 창문 잠금장치 파손, 체육관 입구 조명 깜빡임"
              className="w-full h-11 px-3.5 text-sm rounded-lg border border-slate-300 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
            />
          </div>

          {/* 1. Problem Location */}
          <div>
            <label
              htmlFor="field-location"
              className="block text-sm font-semibold text-slate-900 mb-1"
            >
              어디에서 문제가 발생했나요? <span className="text-rose-600">*</span>
            </label>
            <p className="text-xs text-slate-500 mb-2">
              문제가 발생한 교내 장소를 선택해주세요.
            </p>
            <select
              ref={locationRef}
              id="field-location"
              value={location}
              onChange={(e) => {
                const newLoc = e.target.value;
                setLocation(newLoc);
                clearFieldError("location");
                setAutoFillNotice(false);
                setSelectedExampleKey(null);
                resetClarify();
                if (newLoc) {
                  // 위치 선택 시 해당 장소와 연관된 예시를 우선 배치하는 스마트 추천
                  setDisplayedExamples(getRandomFormExamples(4, newLoc));
                }
              }}
              aria-invalid={Boolean(fieldErrors.location)}
              aria-describedby={fieldErrors.location ? "location-error" : undefined}
              className={`w-full h-11 min-h-[44px] rounded-lg border px-3.5 text-sm text-slate-900 outline-none transition cursor-pointer ${
                fieldErrors.location
                  ? "border-rose-400 bg-rose-50/20 focus:border-rose-500 focus:ring-1 focus:ring-rose-400"
                  : "border-slate-300 bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              }`}
            >
              <option value="">문제 위치를 선택해주세요</option>
              {SCHOOL_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
            {fieldErrors.location && (
              <p
                id="location-error"
                className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{fieldErrors.location}</span>
              </p>
            )}

            {/*
              상세 위치 (선택).
              같은 "화장실" 이라도 본관 3층인지 별관 2층인지에 따라 담당자가 가야 할 곳이 달라진다.
              이 값은 위치별 신고 현황 집계에도 함께 쓰인다.
            */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="field-location-detail"
                  className="block text-xs font-semibold text-slate-700"
                >
                  상세 위치 <span className="font-normal text-slate-500">(선택)</span>
                </label>
                <span className="text-[11px] text-slate-400">{locationDetail.length}/50자</span>
              </div>
              <input
                id="field-location-detail"
                type="text"
                maxLength={50}
                value={locationDetail}
                onChange={(e) => setLocationDetail(e.target.value)}
                placeholder="예: 본관 3층, 별관 2층 서편, 운동장 농구 골대 앞"
                className="w-full h-11 px-3.5 text-sm rounded-lg border border-slate-300 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
              />
              <p className="mt-1.5 text-[11px] text-slate-500">
                건물·층까지 적어 주시면 담당자가 바로 찾아갈 수 있고, 같은 장소의 신고가 모여
                현황으로 집계됩니다.
              </p>
            </div>
          </div>

          {/* 2. Problem Category */}
          <div>
            <label
              htmlFor="field-category"
              className="block text-sm font-semibold text-slate-900 mb-1"
            >
              어떤 문제인가요? <span className="text-rose-600">*</span>
            </label>
            <p className="text-xs text-slate-500 mb-2">
              가장 알맞은 문제 종류를 선택해주세요.
            </p>
            <select
              ref={categoryRef}
              id="field-category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                clearFieldError("category");
                setAutoFillNotice(false);
                resetClarify();
              }}
              aria-invalid={Boolean(fieldErrors.category)}
              aria-describedby={fieldErrors.category ? "category-error" : undefined}
              className={`w-full h-11 min-h-[44px] rounded-lg border px-3.5 text-sm text-slate-900 outline-none transition cursor-pointer ${
                fieldErrors.category
                  ? "border-rose-400 bg-rose-50/20 focus:border-rose-500 focus:ring-1 focus:ring-rose-400"
                  : "border-slate-300 bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              }`}
            >
              <option value="">문제 종류를 선택해주세요</option>
              {ISSUE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            {fieldErrors.category && (
              <p
                id="category-error"
                className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{fieldErrors.category}</span>
              </p>
            )}
          </div>

          {/* 3. Problem Description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="field-description"
                className="block text-sm font-semibold text-slate-900"
              >
                구체적인 상황을 알려주세요 <span className="text-rose-600">*</span>
              </label>
              <span className="text-xs text-slate-400 font-mono">
                {description.length}자
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-2">
              담당자가 정확히 파악할 수 있도록 언제, 어디서, 어떤 문제가 발생했는지 작성해주세요.
            </p>
            <textarea
              ref={descriptionRef}
              id="field-description"
              rows={4}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                clearFieldError("description");
                setAutoFillNotice(false);
                resetClarify();
              }}
              placeholder="예: 2학년 3반 앞 복도 천장 형광등이 깜빡거리며 소음이 발생합니다. 교체 부탁드립니다."
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={
                fieldErrors.description ? "description-error" : undefined
              }
              className={`w-full min-h-[140px] rounded-lg border p-3.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition resize-y leading-relaxed ${
                fieldErrors.description
                  ? "border-rose-400 bg-rose-50/20 focus:border-rose-500 focus:ring-1 focus:ring-rose-400"
                  : "border-slate-300 bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              }`}
            />
            {fieldErrors.description && (
              <p
                id="description-error"
                className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{fieldErrors.description}</span>
              </p>
            )}
          </div>

          {/* 4. Attachment */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1">
              사진이나 파일이 있나요?
            </label>
            <p className="text-xs text-slate-500 mb-2">
              현장 사진을 첨부해주시면 상태 파악과 빠른 조치에 도움이 됩니다. (선택사항, 최대 8MB)
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />

            {fieldErrors.attachment && (
              <div className="mb-2.5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{fieldErrors.attachment}</span>
              </div>
            )}

            {attachmentName ? (
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="첨부 미리보기"
                      className="h-12 w-12 rounded object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                      <Paperclip className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {attachmentName}
                    </p>
                    {attachmentSize && (
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {formatFileSize(attachmentSize)}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="rounded-md p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                  title="첨부 해제"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 h-11 min-h-[44px] rounded-lg border border-dashed border-slate-300 bg-slate-50/50 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:border-slate-400 transition cursor-pointer"
              >
                <Camera className="h-4 w-4 text-slate-500" />
                <span>사진 또는 파일 첨부하기</span>
              </button>
            )}
          </div>

          {/*
            익명 선택 체크박스는 제거했다.
            로그인이 없어 신고자 신원을 수집하지 않으므로 모든 신고가 익명이며,
            사용자에게 선택지를 주면 실제와 다른 인상을 줄 수 있다(§32).
          */}

          {/*
            AI 추가 확인 (§19).

            신고 내용이 애매하면 접수하지 않고 여기서 질문 하나를 보여 준다.
            별도 채팅 화면을 만들지 않고 기존 신고 폼 안에서 이어서 답하도록 한다.
          */}
          {clarify && (
            <div
              role="status"
              className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <div className="h-7 w-7 shrink-0 rounded-full bg-blue-600 text-white flex items-center justify-center">
                  <Info className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-blue-900">
                    신고를 접수하기 전에 한 가지만 더 알려주세요
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 break-keep leading-relaxed">
                    {clarify.question}
                  </p>
                </div>
              </div>

              {/* 이전에 주고받은 확인 내역 — 답변이 사라지지 않았음을 보여 준다 (§15) */}
              {clarify.turns.length > 0 && (
                <ul className="space-y-1.5 border-l-2 border-blue-200 pl-3">
                  {clarify.turns.map((turn, i) => (
                    <li key={i} className="text-[11px] text-slate-600 leading-relaxed">
                      <span className="text-slate-500">{turn.question}</span>
                      <br />
                      <span className="font-semibold text-slate-800">→ {turn.answer}</span>
                    </li>
                  ))}
                </ul>
              )}

              <textarea
                rows={2}
                maxLength={500}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={isChecking || isSubmitting}
                placeholder="여기에 답변을 적어주세요"
                className="w-full rounded-lg border border-blue-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition resize-y leading-relaxed focus:border-blue-600 focus:ring-1 focus:ring-blue-600 disabled:opacity-60"
              />

              <div className="flex flex-col sm:flex-row items-center gap-2">
                <button
                  type="button"
                  onClick={handleAnswerSubmit}
                  disabled={isChecking || isSubmitting || !answer.trim()}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 h-11 min-h-[44px] px-5 rounded-lg bg-blue-700 text-sm font-bold text-white hover:bg-blue-800 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isChecking ? (
                    <>
                      <RotateCw className="h-3.5 w-3.5 animate-spin" />
                      <span>신고 내용 확인 중…</span>
                    </>
                  ) : (
                    <span>계속하기</span>
                  )}
                </button>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  답변을 더하면 신고가 접수됩니다. 위의 신고 내용을 직접 고쳐서 다시 제출해도 됩니다.
                </p>
              </div>
            </div>
          )}

          {/* 확인이 끝난 뒤 접수가 진행 중일 때 (§19) */}
          {clarifyConfirmed && !clarify && (isChecking || isSubmitting) && (
            <div
              role="status"
              className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-900"
            >
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>신고 내용을 확인했습니다. 접수를 진행합니다.</span>
            </div>
          )}

          {/* 6. Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
            {isFormDirty && (
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(true)}
                className="w-full sm:w-auto px-5 h-12 min-h-[48px] rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition cursor-pointer shadow-xs active:scale-[0.99]"
              >
                초기화
              </button>
            )}
            <button
              id="btn-submit-report"
              type="submit"
              /* 확인 중·접수 중에는 중복 제출을 막는다 (§20) */
              disabled={isSubmitting || isChecking || Boolean(clarify)}
              className="flex-1 w-full flex items-center justify-center h-12 min-h-[48px] rounded-lg bg-blue-700 text-sm sm:text-base font-bold text-white hover:bg-blue-800 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {isChecking ? (
                <span>신고 내용 확인 중…</span>
              ) : isSubmitting ? (
                <span>신고를 접수하는 중입니다…</span>
              ) : clarify ? (
                <span>위 질문에 답변해주세요</span>
              ) : (
                <span>신고하기</span>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Unsaved Changes Confirmation Modal */}
      <UnsavedChangesModal
        isOpen={showResetConfirmModal}
        title="작성 중인 내용 초기화"
        message="작성 중인 신고 내용이 모두 지워집니다. 새로고침하거나 벗어날 경우에도 내용이 유실될 수 있습니다. 정말 초기화하시겠습니까?"
        confirmText="초기화하기"
        cancelText="계속 작성하기"
        onConfirm={() => {
          handleResetForm();
          setShowResetConfirmModal(false);
        }}
        onCancel={() => setShowResetConfirmModal(false)}
      />

      {/* Helpful Guidance Footer */}
      <div className="text-center text-xs text-slate-400 leading-relaxed py-1">
        신고된 내용은 안전한 학교 환경 조성을 위해 사용되며, 허위 사실 기재는 자제해 주시기 바랍니다.
      </div>
    </div>
  );
}
