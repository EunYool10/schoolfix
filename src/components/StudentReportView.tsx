import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle, AlertCircle, Lock, Info, RotateCw, AlertTriangle, Wrench, ShieldAlert, Sparkles, Leaf, Volume2, Heart, CircleHelp, CloudCheck, Check, Upload, EyeOff, Plus } from "lucide-react";
import {
  SchoolReport,
  School,
  SchoolLocation,
  SchoolLocationType,
  ISSUE_CATEGORIES,
  SCHOOL_LOCATIONS,
} from "../types";
import { findTemplateBlanks, type TemplateBlank } from "../data/formExamples";
import { pickWritingExample } from "../data/writingExamples";
import { isDetailOptional } from "../data/locationRules";
import { PhotoRedactor } from "./PhotoRedactor";
import { NoiseMeter } from "./NoiseMeter";
import type { NoiseMeasurement } from "../utils/noise";
import { UnsavedChangesModal } from "./UnsavedChangesModal";
import { maskProfanity } from "../security/profanityFilter";
import { formatBytes, PHOTO_LIMITS, preparePhoto, type PreparedPhoto } from "../utils/imageCompress";
import { SimilarReportsPanel } from "./SimilarReportsPanel";

const REPORT_DRAFT_KEY = "schoolfix_report_draft_session_v2";
function clearSessionDraft(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* storage may be disabled */ }
}

const CATEGORY_ICONS = {
  "시설 고장": Wrench,
  "안전 위험": ShieldAlert,
  "위생 문제": Sparkles,
  "환경 문제": Leaf,
  "소음 문제": Volume2,
  "불편 사항": Heart,
  기타: CircleHelp,
} as const;

/** 문제 종류마다 색 하나 — 아이콘은 늘 그 색, 고르면 그 색으로 칠한다 */
const CATEGORY_COLORS: Record<string, { icon: string; picked: string }> = {
  "시설 고장": { icon: "text-blue-500", picked: "border-blue-400 bg-blue-50 text-blue-800" },
  "안전 위험": { icon: "text-rose-500", picked: "border-rose-300 bg-rose-50 text-rose-800" },
  "위생 문제": { icon: "text-teal-500", picked: "border-teal-300 bg-teal-50 text-teal-800" },
  "환경 문제": { icon: "text-emerald-500", picked: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  "소음 문제": { icon: "text-violet-500", picked: "border-violet-300 bg-violet-50 text-violet-800" },
  "불편 사항": { icon: "text-amber-500", picked: "border-amber-300 bg-amber-50 text-amber-800" },
  기타: { icon: "text-slate-400", picked: "border-slate-400 bg-slate-100 text-slate-800" },
};

export interface SubmitReportPayload {
  schoolId: string;
  title?: string;
  location: string;
  locationId?: string | null;
  buildingName?: string | null;
  floor?: string | null;
  department?: string | null;
  grade?: string | null;
  className?: string | null;
  roomName?: string | null;
  /** 상세 위치 (선택). 위치 통계는 이 값을 함께 써서 장소를 구분한다. */
  locationDetail?: string | null;
  category: string;
  description: string;
  /** 브라우저에서 줄인 사진들 */
  photos?: Array<{ dataUrl: string; name: string }>;
  /** AI 사전 확인을 마친 세션 id. 있으면 서버가 확인을 다시 하지 않는다. */
  clarifySessionId?: string | null;
  /** 소음 문제일 때 휴대폰으로 잰 소음 (숫자만) */
  noise?: NoiseMeasurement | null;
}

export interface SubmitReportResult {
  success: boolean;
  report?: SchoolReport;
  heldForReview?: boolean;
  /** 다른 기기에서 내 신고를 다시 불러올 때 쓰는 확인 코드. 이 화면에서 한 번만 받는다. */
  recoveryCode?: string | null;
  error?: string;
  /** 서버가 추가 확인이 필요하다고 판단한 경우 */
  needsMoreInfo?: boolean;
  question?: string | null;
  sessionId?: string | null;
}

interface StudentReportViewProps {
  school: School;
  locations: SchoolLocation[];
  locationTypes: SchoolLocationType[];
  locationsLoading: boolean;
  locationsError: string;
  onSubmitReport: (data: SubmitReportPayload) => Promise<SubmitReportResult>;
  isSubmitting: boolean;
  onSuccessNavToMyReports?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  /** 비슷한 신고를 찾을 우리 학교 공개 신고 목록 */
  existingReports?: SchoolReport[];
  onOpenReport?: (report: SchoolReport) => void;
  onReportsChanged?: () => void;
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
  school,
  locations,
  locationTypes,
  locationsLoading,
  locationsError,
  onSubmitReport,
  isSubmitting,
  onSuccessNavToMyReports,
  onDirtyChange,
  existingReports = [],
  onOpenReport,
  onReportsChanged,
}: StudentReportViewProps) {
  // Problem fields
  const [title, setTitle] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [locationDetail, setLocationDetail] = useState<string>("");
  const [buildingName, setBuildingName] = useState("");
  const [floor, setFloor] = useState("");
  const [department, setDepartment] = useState("");
  const [grade, setGrade] = useState("");
  const [className, setClassName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [copiedReceipt, setCopiedReceipt] = useState(false);

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

  // 첨부 사진 — 고르는 즉시 브라우저에서 줄여 둔다.
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [preparingCount, setPreparingCount] = useState(0);

  // Client-side validation errors per field
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [completedReport, setCompletedReport] = useState<SchoolReport | null>(null);
  const [completedRecoveryCode, setCompletedRecoveryCode] = useState<string | null>(null);
  const [copiedRecoveryCode, setCopiedRecoveryCode] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Unsaved changes dialog state
  const [showResetConfirmModal, setShowResetConfirmModal] = useState<boolean>(false);
  const [showLocationInfoModal, setShowLocationInfoModal] = useState(false);

  useEffect(() => {
    if (!showLocationInfoModal) return;
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, [showLocationInfoModal]);

  // 작성 중인 내용에 가려질 표현이 있는지 미리 알려 준다.
  // 차단이 아니라 안내이므로 제출은 그대로 가능하다.
  const profanityPreview = useMemo(() => {
    const t = maskProfanity(title);
    const d = maskProfanity(description);
    return { willMask: t.masked || d.masked, preview: d.masked ? d.text : null };
  }, [title, description]);

  // 소음 문제일 때 잰 소음, 가리기 도구로 여는 사진
  const [noise, setNoise] = useState<NoiseMeasurement | null>(null);
  const [redactKey, setRedactKey] = useState<string | null>(null);

  // Field element refs for auto-focusing on invalid input
  const locationRef = useRef<HTMLSelectElement>(null);
  const categoryRef = useRef<HTMLButtonElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportDraftKey = `${REPORT_DRAFT_KEY}_${school.id}`;
  const availableLocationTypes = useMemo(() => locationTypes.length ? locationTypes : [...new Set([...locations.map((item) => item.type), ...SCHOOL_LOCATIONS])].map((type) => ({ type, verificationStatus: type === "기타" ? "user_entered" as const : "needs_review" as const })), [locationTypes, locations]);
  const matchingLocations = useMemo(() => locations.filter((item) => item.type === location), [locations, location]);
  const officialLocationCount = locations.filter((item) => item.verificationStatus === "official").length;
  const [placeExtrasOpen, setPlaceExtrasOpen] = useState(false);
  // 작성 예시(회색 안내 문구) — 신고서에 들어올 때마다 새로 뽑고, 장소 종류를 고르면 그 장소 예시로 바꾼다.
  const [exampleSeed, setExampleSeed] = useState(() => Math.random());
  const writingExample = useMemo(() => pickWritingExample(location, exampleSeed), [location, exampleSeed]);
  // 세부 위치 없이도 접수되는 장소 (창의경영고 복도·운동장)
  const detailOptional = isDetailOptional(school.id, location);
  const showPlaceExtras = placeExtrasOpen || Boolean(buildingName || floor || roomName);

  // Keep a lightweight draft in this tab only. Attachments and AI clarification are never stored.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(reportDraftKey);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<{
          title: string;
          location: string;
          locationDetail: string;
          locationId: string;
          buildingName: string; floor: string; department: string; grade: string; className: string; roomName: string;
          category: string;
          description: string;
          savedAt: number;
        }>;
        if ([draft.title, draft.location, draft.locationDetail, draft.locationId, draft.buildingName, draft.floor, draft.department, draft.grade, draft.className, draft.roomName, draft.category, draft.description].some(Boolean)) {
          setTitle(typeof draft.title === "string" ? draft.title : "");
          setLocation(typeof draft.location === "string" ? draft.location : "");
          setLocationDetail(typeof draft.locationDetail === "string" ? draft.locationDetail : "");
          setLocationId(typeof draft.locationId === "string" ? draft.locationId : "");
          setBuildingName(typeof draft.buildingName === "string" ? draft.buildingName : "");
          setFloor(typeof draft.floor === "string" ? draft.floor : "");
          setDepartment(typeof draft.department === "string" ? draft.department : "");
          setGrade(typeof draft.grade === "string" ? draft.grade : "");
          setClassName(typeof draft.className === "string" ? draft.className : "");
          setRoomName(typeof draft.roomName === "string" ? draft.roomName : "");
          setCategory(typeof draft.category === "string" ? draft.category : "");
          setDescription(typeof draft.description === "string" ? draft.description : "");
          setDraftRestored(true);
          setDraftSavedAt(typeof draft.savedAt === "number" ? draft.savedAt : null);
        }
      }
    } catch {
      clearSessionDraft(reportDraftKey);
    } finally {
      setDraftReady(true);
    }
  }, [reportDraftKey]);

  useEffect(() => {
    if (!draftReady) return;
    if (completedReport) {
      // 접수 직후 이전 렌더의 정리 함수가 방금 접수한 내용을 초안으로 다시 써 넣는다.
      // 지우지 않으면 신고 화면에 다시 들어왔을 때 접수한 신고가 초안으로 복구돼 중복 접수된다.
      clearSessionDraft(reportDraftKey);
      return;
    }
    const hasText = Boolean(title || location || locationDetail || locationId || buildingName || floor || department || grade || className || roomName || category || description);
    if (!hasText) {
      clearSessionDraft(reportDraftKey);
      setDraftSavedAt(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const savedAt = Date.now();
      try {
        sessionStorage.setItem(reportDraftKey, JSON.stringify({
          title, location, locationId, locationDetail, buildingName, floor, department, grade, className, roomName, category, description, savedAt,
        }));
        setDraftSavedAt(savedAt);
      } catch {
        setDraftSavedAt(null);
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
      const hasText = Boolean(title || location || locationDetail || locationId || buildingName || floor || department || grade || className || roomName || category || description);
      if (draftReady && hasText && !completedReport) {
        try {
          sessionStorage.setItem(reportDraftKey, JSON.stringify({ title, location, locationId, locationDetail, buildingName, floor, department, grade, className, roomName, category, description, savedAt: Date.now() }));
        } catch {
          // Draft storage is a convenience; it must never block navigation.
        }
      }
    };
  }, [title, location, locationId, locationDetail, buildingName, floor, department, grade, className, roomName, category, description, draftReady, completedReport, reportDraftKey]);

  const descriptionBlanks = useMemo(() => findTemplateBlanks(description), [description]);
  const descriptionReady = description.trim().length >= 5 && descriptionBlanks.length === 0;
  const hasPlace = Boolean(locationId) || [locationDetail, buildingName, floor, location === "교실" ? className : "", roomName].some((value) => value.trim());

  // Detect whether form contains unsaved user input
  const isFormDirty = Boolean(
    !completedReport &&
      (title.trim().length > 0 ||
        location.length > 0 ||
        locationId.length > 0 ||
        locationDetail.trim().length > 0 ||
        buildingName.trim().length > 0 || floor.trim().length > 0 || department.length > 0 || grade.length > 0 || className.trim().length > 0 || roomName.trim().length > 0 ||
        category.length > 0 ||
        description.trim().length > 0 ||
        photos.length > 0)
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
        e.returnValue = "탭을 닫으면 임시 저장된 신고 내용이 삭제됩니다. 새로고침하면 이 탭에서 복구할 수 있습니다.";
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

  /**
   * 사진 여러 장을 받는다. 고르는 즉시 한 장씩 줄여 두고(utils/imageCompress),
   * 남은 칸보다 많이 고르면 앞에서부터 채우고 나머지는 알린다.
   */
  const handleFiles = async (fileList?: FileList | File[] | null) => {
    const files = Array.from(fileList ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (files.length === 0) return;

    const room = PHOTO_LIMITS.maxPhotos - photos.length - preparingCount;
    const accepted = files.slice(0, Math.max(0, room));
    const problems: string[] = [];
    if (files.length > accepted.length) problems.push(`사진은 ${PHOTO_LIMITS.maxPhotos}장까지 첨부할 수 있어 ${files.length - accepted.length}장은 빼고 올렸습니다.`);
    clearFieldError("attachment");

    setPreparingCount((n) => n + accepted.length);
    for (const file of accepted) {
      try {
        const prepared = await preparePhoto(file);
        setPhotos((prev) => (prev.length >= PHOTO_LIMITS.maxPhotos ? prev : [...prev, prepared]));
      } catch (err) {
        problems.push(err instanceof Error ? err.message : `${file.name}: 사진을 준비하지 못했습니다.`);
      } finally {
        setPreparingCount((n) => n - 1);
      }
    }
    if (problems.length) setFieldErrors((prev) => ({ ...prev, attachment: problems.join(" ") }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleFiles(e.target.files);
  };

  const removePhoto = (key: string) => {
    setPhotos((prev) => prev.filter((photo) => photo.key !== key));
    clearFieldError("attachment");
  };

  const handleRemoveFile = () => {
    setPhotos([]);
    clearFieldError("attachment");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  /** 비슷한 신고 찾기에 쓰는 지금까지 적은 위치·문제 종류 */
  const similarDraft = useMemo(() => ({
    locationType: location,
    locationId: locationId || null,
    category: category || null,
    placeText: [locations.find((item) => item.id === locationId)?.name, locationDetail, buildingName, floor, location === "교실" ? className : "", roomName].filter(Boolean).join(" "),
  }), [location, locationId, category, locations, locationDetail, buildingName, floor, className, roomName]);

  const handleResetForm = () => {
    setTitle("");
    setLocation("");
    setLocationId("");
    setLocationDetail("");
    setBuildingName(""); setFloor(""); setDepartment(""); setGrade(""); setClassName(""); setRoomName("");
    setCategory("");
    setDescription("");
    resetClarify();
    handleRemoveFile();
    setFieldErrors({});
    setGlobalError(null);
    setSubmitError(null);
    setCompletedReport(null);
    setCompletedRecoveryCode(null);
    setNoise(null);
    setExampleSeed(Math.random());
    clearSessionDraft(reportDraftKey);
    setDraftSavedAt(null);
    setDraftRestored(false);
  };

  /** 가리기 도구에서 바꾼 사진으로 갈아 끼운다. */
  const replacePhoto = (key: string, next: PreparedPhoto) => {
    setPhotos((prev) => prev.map((photo) => (photo.key === key ? next : photo)));
    setRedactKey(null);
  };

  const scrollToField = (el: HTMLElement | null) => {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  /** 설명 칸에서 빈칸을 골라 둔다. 바로 타이핑하면 빈칸이 바뀐다. */
  const selectBlank = (blank: TemplateBlank) => {
    const el = descriptionRef.current;
    if (!el) return;
    scrollToField(el);
    el.setSelectionRange(blank.start, blank.end);
  };

  const validateForm = (): boolean => {
    const errors: FieldErrors = {};

    // 1. Location Validation
    const hasManualLocation = [locationDetail, buildingName, floor, location === "교실" ? className : "", roomName].some((value) => value.trim());
    if (!location || !location.trim() || (!locationId && !hasManualLocation && !isDetailOptional(school.id, location))) {
      errors.location = "위치 유형을 선택하고 세부 위치를 선택하거나 직접 입력해주세요.";
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
    } else if (descriptionBlanks.length > 0) {
      errors.description = `예시의 [ ] 빈칸 ${descriptionBlanks.length}개를 실제 상황으로 바꿔 주세요.`;
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
        if (descriptionBlanks[0]) descriptionRef.current.setSelectionRange(descriptionBlanks[0].start, descriptionBlanks[0].end);
        setGlobalError(errors.description);
      }
      return false;
    }

    setGlobalError(null);
    return true;
  };

  /** 실제 접수. 사전 확인이 끝난 뒤에만 호출된다 (§16) */
  const submitReport = async (sessionId: string | null) => {
    // 학과·학년·반은 교실 신고에만 허용된다(서버도 거부한다). 다른 위치로 바꾼 뒤 남은 값은 보내지 않는다.
    const isClassroom = location.trim() === "교실";
    const res = await onSubmitReport({
      schoolId: school.id,
      title: title.trim() || undefined,
      location: location.trim(),
      locationId: locationId || null,
      locationDetail: (locations.find((item) => item.id === locationId)?.name || locationDetail).trim() || null,
      buildingName: buildingName.trim() || null,
      floor: floor.trim() || null,
      department: (isClassroom && department) || null,
      grade: (isClassroom && grade) || null,
      className: (isClassroom && className.trim()) || null,
      roomName: roomName.trim() || null,
      category: category.trim(),
      description: description.trim(),
      photos: photos.map((photo) => ({ dataUrl: photo.dataUrl, name: photo.name })),
      clarifySessionId: sessionId,
      // 소음은 "소음 문제" 를 골랐을 때만 보낸다. 다른 종류로 바꿨으면 화면에도 보이지 않으므로 보내지 않는다.
      noise: category.trim() === "소음 문제" ? noise : null,
    });

    if (res.success && res.report) {
      setCompletedReport(res.report);
      setCompletedRecoveryCode(res.recoveryCode ?? null);
      clearSessionDraft(reportDraftKey);
      setDraftSavedAt(null);
      setDraftRestored(false);
      handleRemoveFile();
      setTitle("");
      setDescription("");
      setCategory("");
      setLocation("");
      setLocationId(""); setLocationDetail(""); setBuildingName(""); setFloor(""); setDepartment(""); setGrade(""); setClassName(""); setRoomName("");
      resetClarify();
      setFieldErrors({});
      setGlobalError(null);
      setNoise(null);
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
        body: JSON.stringify({ ...body, schoolId: school.id }),
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
    if (preparingCount > 0) {
      setSubmitError("사진을 준비하는 중입니다. 잠시 후 다시 눌러주세요.");
      return;
    }

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


  // Clean completion screen
  if (completedReport) {
    return (
      <div className="relative isolate w-full py-4 sm:py-8">
        <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-7 text-center sm:p-12">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle className="h-8 w-8" strokeWidth={2.5} />
          </div>

          <p className="font-hand text-2xl leading-none text-emerald-700">접수 완료!</p>
          <h2 className="mt-3 break-keep font-display text-2xl text-slate-900 sm:text-[28px]">
            {completedReport.moderationStatus === "held" ? "운영진 확인을 기다리고 있어요" : "제보가 학교에 전달됐어요"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
            {completedReport.moderationStatus === "held" ? "안전성 확인이 필요한 내용이나 이미지가 포함되어 공개가 보류됐습니다. 운영진 검토 후 처리되며, 접수번호로 상태를 확인할 수 있어요." : "보내주신 내용은 담당자가 확인합니다. 접수번호를 저장해 두면 진행 상황을 다시 확인할 수 있어요."}
          </p>

          <div className="mx-auto mt-7 max-w-sm rounded-2xl border border-blue-100 bg-blue-50/80 px-5 py-4 text-center">
            <span className="text-xs font-semibold text-slate-500">내 접수번호</span>
            <div className="mt-1 font-mono text-xl font-extrabold tracking-wide text-blue-800">
              {completedReport.id}
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(completedReport.id);
                  setCopiedReceipt(true);
                  window.setTimeout(() => setCopiedReceipt(false), 1800);
                } catch {
                  setCopiedReceipt(false);
                }
              }}
              className="mt-2 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
            >{copiedReceipt ? "복사했어요" : "접수번호 복사"}</button>
          </div>

          {completedRecoveryCode && (
            <div className="mx-auto mt-3 max-w-sm rounded-2xl border border-amber-200 bg-amber-50/80 px-5 py-4 text-center">
              <span className="text-xs font-semibold text-amber-900">확인 코드 · 다른 기기에서 불러올 때 필요해요</span>
              <div className="mt-1 font-mono text-xl font-extrabold tracking-[0.12em] text-amber-900">
                {completedRecoveryCode}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                휴대폰을 바꾸거나 브라우저 기록을 지우면 "내 신고" 가 비어요. 접수번호와 이 코드를 캡처하거나 적어 두면 신고 목록 → 내 신고 → "신고 불러오기" 에서 다시 연결할 수 있어요. 이 코드는 다른 사람에게 알려 주지 마세요.
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`${completedReport.id} ${completedRecoveryCode}`);
                    setCopiedRecoveryCode(true);
                    window.setTimeout(() => setCopiedRecoveryCode(false), 1800);
                  } catch {
                    setCopiedRecoveryCode(false);
                  }
                }}
                className="mt-2 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
              >{copiedRecoveryCode ? "복사했어요" : "접수번호와 코드 복사"}</button>
            </div>
          )}

          <div className="mt-7 flex flex-col items-center justify-center gap-3 border-t border-slate-100 pt-6 sm:flex-row">
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
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {/* Title & Introduction */}
      <div>
        <p className="font-hand text-[22px] leading-none text-blue-600">{school.schoolName}</p>
        <h1 className="mt-3 break-keep text-[28px] leading-snug text-slate-900 sm:text-[34px]">
          학교에서 발견한 문제를<br className="sm:hidden" /> 함께 고쳐요
        </h1>
        <p className="mt-2 max-w-2xl break-keep text-[15px] leading-relaxed text-slate-600">
          장소와 상황을 알려 주면 담당 선생님이 확인하고 고쳐요. <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><Lock className="h-3.5 w-3.5" />익명 접수</span> — 이름·학번·연락처는 받지 않아요.
        </p>
      </div>

      {/* Main Form Box */}
      <div className="sf-form-card rounded-3xl border border-slate-200 bg-white p-5 sm:p-8">
        {/* 임시 저장 상태 — 작성 중일 때만 한 줄로 보여 준다 */}
        {isFormDirty && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
            <span className="flex min-w-0 items-center gap-2">
              <CloudCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              {draftRestored ? "작성하던 내용을 이 탭에서 복구했어요." : "작성 내용은 이 탭에 임시 저장돼요."}
            </span>
            <button
              type="button"
              onClick={() => setShowResetConfirmModal(true)}
              className="shrink-0 rounded px-1.5 py-1 font-bold text-slate-700 underline hover:bg-slate-100 hover:text-slate-950"
            >
              처음부터 다시
            </button>
          </div>
        )}

        {redactKey && photos.some((photo) => photo.key === redactKey) && (
          <PhotoRedactor
            photo={photos.find((photo) => photo.key === redactKey)!}
            onApply={(next) => replacePhoto(redactKey, next)}
            onClose={() => setRedactKey(null)}
          />
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

        <form onSubmit={handleSubmit} noValidate className="divide-y divide-slate-100">
          {/* 1. Problem Location */}
          <div className="pb-7">
            <StepHeading step={1} done={Boolean(location) && (hasPlace || detailOptional)} title="어디인가요?" htmlFor="field-location" />
            <select
              ref={locationRef}
              id="field-location"
              value={location}
              onChange={(e) => {
                const newLoc = e.target.value;
                const selectedLabel = e.currentTarget.selectedOptions[0]?.textContent ?? "";
                const locationNeedsReview = selectedLabel.includes("세부 시설 확인 필요")
                  || availableLocationTypes.some((entry) => entry.type === newLoc && entry.verificationStatus === "needs_review");
                // Close the native select popup before showing the location details prompt.
                e.currentTarget.blur();
                setLocation(newLoc);
                setShowLocationInfoModal(false);
                // 세부 위치 없이도 되는 장소(창의경영고 복도·운동장)는 묻지 않는다.
                if (locationNeedsReview && !isDetailOptional(school.id, newLoc)) window.setTimeout(() => setShowLocationInfoModal(true), 0);
                setLocationId("");
                setLocationDetail("");
                if (newLoc !== "교실") { setDepartment(""); setGrade(""); setClassName(""); }
                clearFieldError("location");
                resetClarify();
              }}
              aria-invalid={Boolean(fieldErrors.location)}
              aria-describedby={fieldErrors.location ? "location-error" : undefined}
              className={`w-full h-11 min-h-[44px] rounded-lg border px-3.5 text-sm text-slate-900 outline-none transition cursor-pointer ${
                fieldErrors.location
                  ? "border-rose-400 bg-rose-50/20 focus:border-rose-500 focus:ring-1 focus:ring-rose-400"
                  : "border-slate-300 bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              }`}
            >
              <option value="">{locationsLoading ? "학교 위치 정보를 불러오는 중…" : "장소 종류를 골라 주세요"}</option>
              {availableLocationTypes.map((entry) => (
                <option key={entry.type} value={entry.type}>
                  {entry.type}{entry.verificationStatus === "user_entered" ? " · 직접 입력" : ""}
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
            <p role={locationsError ? "alert" : "status"} className={`mt-1.5 text-[11px] ${locationsError ? "text-rose-700" : "text-slate-500"}`}>{locationsLoading ? "학교별 위치 목록을 불러오는 중…" : locationsError ? `${locationsError} 직접 입력 위치를 이용할 수 있습니다.` : <>공식 확인된 장소 항목 {officialLocationCount}개{locations.length > officialLocationCount ? ` · 확인 필요 ${locations.length - officialLocationCount}개` : ""} · 학교별 정보 기준 {school.verifiedAt} · <a href={school.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">출처</a></>}</p>

            {location && matchingLocations.length > 0 && <div className="mt-4">
              <label htmlFor="field-verified-location" className="mb-1 block text-xs font-semibold text-slate-700">세부 장소 목록 <span className="font-normal text-slate-500">(선택)</span></label>
              <select id="field-verified-location" value={locationId} onChange={(e) => { setLocationId(e.target.value); if (e.target.value) setLocationDetail(""); clearFieldError("location"); }} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm"><option value="">목록에서 선택하거나 아래에 직접 입력</option>{matchingLocations.map((item) => <option key={item.id} value={item.id}>{item.name}{item.count ? ` (${item.count}실)` : ""}{item.verificationStatus === "official" ? " · 공식 확인" : " · 확인 필요"}</option>)}</select>
            </div>}
            {location && <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="field-location-detail"
                  className="block text-xs font-semibold text-slate-700"
                >
                  {location === "기타" ? "목록에 없는 위치를 설명해 주세요" : "세부 위치"} <span className="font-normal text-slate-500">{locationId ? "(목록에서 선택됨)" : detailOptional ? "(선택)" : "(직접 입력)"}</span>
                </label>
                <span className="text-[11px] text-slate-400">{locationDetail.length}/150자</span>
              </div>
              <input
                id="field-location-detail"
                type="text"
                maxLength={150}
                value={locationDetail}
                disabled={Boolean(locationId)}
                onChange={(e) => { setLocationDetail(e.target.value); clearFieldError("location"); }}
                placeholder={`예: ${writingExample.detail}`}
                className="w-full h-11 px-3.5 text-sm rounded-lg border border-slate-300 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
              />
            </div>}
            {location === "교실" && <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
              <label className="text-xs font-semibold text-slate-700">학과(선택)<select value={department} onChange={(e) => setDepartment(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"><option value="">선택 안 함</option>{school.departments.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-700">학년(선택)<select value={grade} onChange={(e) => setGrade(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"><option value="">선택 안 함</option>{[1, 2, 3].map((year) => <option key={year} value={String(year)}>{year}학년</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-700">반(직접 입력)<input value={className} onChange={(e) => setClassName(e.target.value)} maxLength={40} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm" placeholder="예: 2반" /></label>
              {department && grade && <p className="col-span-2 text-[11px] leading-relaxed text-slate-500 sm:col-span-3">공식 학교 현황에는 {department} {grade}학년 {school.departments.find((item) => item.name === department)?.classesByGrade[Number(grade) - 1] ?? ""}학급으로 기재되어 있습니다. 실제 반 이름은 공개 자료에서 확인되지 않아 직접 입력하도록 했습니다.</p>}
            </div>}
            {/* 건물·층·호실은 아는 사람만 적도록 접어 둔다 */}
            {location && (showPlaceExtras ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <label className="text-xs font-semibold text-slate-700">건물<input value={buildingName} onChange={(e) => setBuildingName(e.target.value)} maxLength={100} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm" placeholder="건물 이름" /></label>
              <label className="text-xs font-semibold text-slate-700">층<input value={floor} onChange={(e) => setFloor(e.target.value)} maxLength={40} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm" placeholder="예: 2층" /></label>
              <label className="col-span-2 text-xs font-semibold text-slate-700 sm:col-span-1">호실·구역<input value={roomName} onChange={(e) => setRoomName(e.target.value)} maxLength={100} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm" placeholder="번호를 아는 경우" /></label>
            </div> : <button type="button" onClick={() => setPlaceExtrasOpen(true)} className="mt-2 inline-flex items-center gap-1 rounded-md px-1 py-1 text-xs font-semibold text-blue-700 hover:underline">
              <Plus className="h-3.5 w-3.5" />건물·층·호실도 적기
            </button>)}
          </div>

          {/* 2. Problem Category */}
          <div className="py-7">
            <StepHeading step={2} done={Boolean(category)} title="어떤 문제인가요?" />
            <div id="field-category" role="group" aria-label="문제 종류" aria-invalid={Boolean(fieldErrors.category)} aria-describedby={fieldErrors.category ? "category-error" : undefined} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ISSUE_CATEGORIES.map((cat, index) => {
                const Icon = CATEGORY_ICONS[cat as keyof typeof CATEGORY_ICONS];
                const selected = category === cat;
                const tone = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS["기타"];
                return (
                  <button
                    key={cat}
                    ref={index === 0 ? categoryRef : undefined}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setCategory(cat);
                      clearFieldError("category");
                      resetClarify();
                    }}
                    className={`flex min-h-12 items-center gap-2.5 rounded-2xl border px-3.5 py-2 text-left text-[15px] font-semibold transition ${selected ? tone.picked : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"} ${fieldErrors.category && !selected ? "border-rose-300" : ""}`}
                  >
                    <Icon className={`h-[18px] w-[18px] shrink-0 ${tone.icon}`} />
                    <span className="min-w-0 flex-1 truncate">{cat}</span>
                    {selected && <Check className="h-4 w-4 shrink-0" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
            {fieldErrors.category && (
              <p
                id="category-error"
                className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{fieldErrors.category}</span>
              </p>
            )}
            {category === "소음 문제" && <div className="mt-4"><NoiseMeter value={noise} onChange={setNoise} /></div>}
            <SimilarReportsPanel draft={similarDraft} reports={existingReports} schoolId={school.id} onOpenReport={onOpenReport} onReportsChanged={onReportsChanged} />
          </div>

          {/* 3. Problem Description */}
          <div className="py-7">
            <StepHeading step={3} done={descriptionReady} title="무슨 일인지 알려주세요" htmlFor="field-description" hint="무엇이, 언제부터, 얼마나 불편한지 적어 주면 담당자가 빨리 파악해요." />
            <textarea
              ref={descriptionRef}
              id="field-description"
              rows={4}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                clearFieldError("description");
                resetClarify();
              }}
              placeholder={writingExample.description}
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={[fieldErrors.description && descriptionBlanks.length === 0 ? "description-error" : "", descriptionBlanks.length ? "description-blanks" : ""].filter(Boolean).join(" ") || undefined}
              className={`w-full min-h-[140px] rounded-lg border p-3.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition resize-y leading-relaxed ${
                fieldErrors.description
                  ? "border-rose-400 bg-rose-50/20 focus:border-rose-500 focus:ring-1 focus:ring-rose-400"
                  : "border-slate-300 bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              }`}
            />
            <p className="mt-1 text-right text-[11px] text-slate-400">{description.length}자</p>
            {descriptionBlanks.length > 0 && (
              <div id="description-blanks" className={`mt-1 rounded-lg border px-3 py-2.5 text-xs ${fieldErrors.description ? "border-rose-300 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50/80 text-amber-900"}`}>
                <p className="font-semibold">[ ] 빈칸 {descriptionBlanks.length}개를 실제 상황으로 바꿔 주세요.</p>
                <p className="mt-0.5 opacity-80">빈칸을 누르면 그 부분이 선택돼서 바로 고쳐 쓸 수 있어요.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {descriptionBlanks.map((blank) => (
                    <button key={blank.start} type="button" onClick={() => selectBlank(blank)} className="min-h-[32px] rounded-full border border-current/20 bg-white px-3 py-1 font-bold hover:bg-amber-100">{blank.prompt}</button>
                  ))}
                </div>
              </div>
            )}
            {fieldErrors.description && descriptionBlanks.length === 0 && (
              <p
                id="description-error"
                className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{fieldErrors.description}</span>
              </p>
            )}
            {/* 제목은 비워 두면 서버가 "장소 + 문제 종류"로 만든다 */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="field-title" className="block text-xs font-semibold text-slate-700">
                  제목 <span className="font-normal text-slate-500">(선택 · 비워 두면 자동으로 붙여요)</span>
                </label>
                <span className="text-[11px] text-slate-400">{title.length}/60자</span>
              </div>
              <input
                id="field-title"
                type="text"
                maxLength={60}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`예: ${writingExample.title}`}
                className="w-full h-11 px-3.5 text-sm rounded-lg border border-slate-300 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
              />
            </div>
          </div>

          {/* 4. 사진 — 여러 장, 고르는 즉시 브라우저에서 줄인다 */}
          <div className="py-7">
            <StepHeading step={4} done={photos.length > 0} optional title="현장 사진" hint="얼굴·이름표는 나오지 않게 찍어 주세요. 올릴 때 크기를 줄이고 촬영 위치 정보는 지워요." />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            {fieldErrors.attachment && (
              <div className="mb-2.5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{fieldErrors.attachment}</span>
              </div>
            )}

            <div
              onDragOver={(event) => { event.preventDefault(); setIsDraggingFile(true); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDraggingFile(false); }}
              onDrop={(event) => { event.preventDefault(); setIsDraggingFile(false); void handleFiles(event.dataTransfer.files); }}
              className={`rounded-2xl border-2 border-dashed p-2.5 transition ${isDraggingFile ? "border-blue-500 bg-blue-50 ring-4 ring-blue-100" : "border-slate-200 bg-slate-50/70 hover:border-blue-300 hover:bg-blue-50/40"}`}
            >
              {photos.length + preparingCount > 0 && (
                <ul className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {photos.map((photo, index) => (
                    <li key={photo.key} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <img src={photo.dataUrl} alt={`첨부 사진 ${index + 1}`} className="aspect-square w-full object-cover" />
                      <span className="absolute bottom-0 left-0 right-0 truncate bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-medium text-white" title={`원본 ${formatBytes(photo.originalSize)} → ${formatBytes(photo.size)}`}>
                        {formatBytes(photo.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.key)}
                        aria-label={`사진 ${index + 1} 빼기`}
                        className="absolute right-1 top-1 rounded-full bg-slate-900/70 p-1 text-white hover:bg-rose-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRedactKey(photo.key)}
                        aria-label={`사진 ${index + 1} 가리기`}
                        className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-slate-900"
                      >
                        <EyeOff className="h-3 w-3" />가리기
                      </button>
                    </li>
                  ))}
                  {Array.from({ length: preparingCount }, (_, i) => (
                    <li key={`preparing-${i}`} className="flex aspect-square items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] text-slate-500">
                      <RotateCw className="mr-1 h-3.5 w-3.5 animate-spin" /> 줄이는 중
                    </li>
                  ))}
                </ul>
              )}
              {photos.length + preparingCount < PHOTO_LIMITS.maxPhotos && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-14 w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 transition hover:text-blue-800"
                >
                  <Upload className="h-4 w-4 text-blue-700" />
                  <span>{isDraggingFile ? "여기에 놓아 첨부하세요" : photos.length ? "사진 더 추가하기" : "사진 고르기 (끌어 놓아도 돼요)"}</span>
                  <span className="text-[11px] font-medium text-slate-400">{photos.length + preparingCount}/{PHOTO_LIMITS.maxPhotos}장</span>
                </button>
              )}
            </div>
          </div>

          {/*
            익명 선택 체크박스는 제거했다.
            로그인이 없어 신고자 신원을 수집하지 않으므로 모든 신고가 익명이며,
            사용자에게 선택지를 주면 실제와 다른 인상을 줄 수 있다(§32).
          */}

          <div className="space-y-4 pt-7">
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
            <button
              id="btn-submit-report"
              type="submit"
              /* 확인 중·접수 중에는 중복 제출을 막는다 (§20) */
              disabled={isSubmitting || isChecking || Boolean(clarify)}
              className="w-full flex items-center justify-center h-12 min-h-[48px] rounded-xl bg-blue-700 text-sm sm:text-base font-bold text-white hover:bg-blue-800 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-xs"
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
            <p className="flex items-start justify-center gap-1.5 text-center text-[11px] leading-relaxed text-amber-800">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>바로 조치가 필요한 위험은 신고와 함께 교무실이나 행정실에도 직접 알려주세요.</span>
            </p>
          </div>
        </form>
      </div>

      {/* Unsaved Changes Confirmation Modal */}
      <UnsavedChangesModal
        isOpen={showResetConfirmModal}
        title="작성 중인 내용 초기화"
        message="작성 중인 신고 내용과 이 탭에 임시 저장된 초안이 모두 삭제됩니다. 정말 초기화하시겠습니까?"
        confirmText="초기화하기"
        cancelText="계속 작성하기"
        onConfirm={() => {
          handleResetForm();
          setShowResetConfirmModal(false);
        }}
        onCancel={() => setShowResetConfirmModal(false)}
      />

      {showLocationInfoModal && (
        createPortal(<div
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setShowLocationInfoModal(false); }}
          className="fixed inset-0 z-[2147483000] flex min-h-screen min-h-[100dvh] items-center justify-center bg-slate-900/50 p-4"
        >
          <section role="dialog" aria-modal="true" aria-labelledby="location-info-title" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div>
                <h2 id="location-info-title" className="font-display text-xl text-slate-900">세부 위치를 알려 주세요</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">이 장소의 세부 시설 정보는 확인되지 않았어요. 알고 있는 건물·층·시설명을 아래에 적어 주세요. 모르는 정보는 추측해서 입력하지 않아도 됩니다.</p>
              </div>
            </div>
            <button type="button" autoFocus onClick={() => setShowLocationInfoModal(false)} className="mt-5 min-h-11 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">확인</button>
          </section>
        </div>, document.body)
      )}

      {/* Helpful Guidance Footer */}
      <div className="text-center text-xs text-slate-400 leading-relaxed py-1">
        신고된 내용은 안전한 학교 환경 조성을 위해 사용되며, 허위 사실 기재는 자제해 주시기 바랍니다.
      </div>
    </div>
  );
}

/** 신고 폼의 단계 제목. 채우면 번호가 체크로 바뀐다. */
function StepHeading({ step, done, title, htmlFor, optional = false, hint }: { step: number; done: boolean; title: string; htmlFor?: string; optional?: boolean; hint?: string }) {
  const text = <>{title} {optional ? <span className="text-xs font-semibold text-slate-400">(선택)</span> : <span className="text-rose-600">*</span>}</>;
  return (
    <div className="mb-3.5 flex items-start gap-3">
      <span aria-hidden="true" className={`flex h-7 w-6 shrink-0 items-center justify-center font-display text-xl leading-none transition ${done ? "text-emerald-600" : "text-blue-500"}`}>
        {done ? <Check className="h-5 w-5" strokeWidth={3} /> : step}
      </span>
      <div className="min-w-0">
        {htmlFor ? <label htmlFor={htmlFor} className="block text-[17px] font-bold text-slate-900">{text}</label> : <h2 className="text-[17px] font-bold text-slate-900">{text}</h2>}
        {hint && <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}
