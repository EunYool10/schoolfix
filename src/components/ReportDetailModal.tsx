import React, { useState, useEffect } from "react";
import { Modal } from "./common/Modal";
import { ConfirmDialog } from "./common/ConfirmDialog";
import { ReportEditModal } from "./ReportEditModal";
import { ReportTimeline } from "./ReportTimeline";
import { ImageLightboxModal } from "./ImageLightboxModal";
import {
  SchoolReport,
  ReportStatus,
  ReportPriority,
  STATUS_MAP,
  PRIORITY_MAP,
  SCHOOL_ASSIGNEES,
} from "../types";
import {
  MapPin,
  Tag,
  Clock,
  User,
  ShieldCheck,
  Building2,
  FileText,
  Paperclip,
  Edit,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ZoomIn,
  AlertTriangle,
} from "lucide-react";

interface ReportDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: SchoolReport | null;
  isAdmin?: boolean;
  onUpdateStatus?: (reportId: string, status: ReportStatus) => Promise<void>;
  onProcessReport?: (
    reportId: string,
    data: {
      status?: ReportStatus;
      priority?: ReportPriority;
      assignee?: string | null;
      resolutionNote?: string | null;
      adminNote?: string;
    }
  ) => Promise<void>;
  onUpdateReport?: (
    reportId: string,
    updatedData: {
      title: string;
      location: string;
      category: string;
      description: string;
      isAnonymous: boolean;
    }
  ) => Promise<void>;
  onDeleteReport?: (reportId: string) => Promise<void>;
}

export function ReportDetailModal({
  isOpen,
  onClose,
  report,
  isAdmin = false,
  onUpdateStatus,
  onProcessReport,
  onUpdateReport,
  onDeleteReport,
}: ReportDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"DETAILS" | "PROCESS">("DETAILS");

  // Admin processing form state
  const [selectedStatus, setSelectedStatus] = useState<ReportStatus>("pending");
  const [selectedPriority, setSelectedPriority] = useState<ReportPriority>("medium");
  const [selectedAssignee, setSelectedAssignee] = useState<string>("");
  const [resolutionNote, setResolutionNote] = useState<string>("");
  const [adminNote, setAdminNote] = useState<string>("");
  const [isSavingProcess, setIsSavingProcess] = useState(false);
  const [processMessage, setProcessMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Sub-modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Synchronize state when report opens
  useEffect(() => {
    if (report && isOpen) {
      setSelectedStatus(report.status);
      setSelectedPriority(report.priority || "medium");
      setSelectedAssignee(report.assignee || "");
      setResolutionNote(report.resolutionNote || "");
      setAdminNote(report.adminNote || "");
      setProcessMessage(null);
      setActiveTab("DETAILS");
      setIsLightboxOpen(false);
    }
  }, [report, isOpen]);

  if (!report) return null;

  const statusCfg = STATUS_MAP[report.status] || STATUS_MAP.pending;
  const currentPriority: ReportPriority = report.priority || "medium";
  const priorityCfg = PRIORITY_MAP[currentPriority] || PRIORITY_MAP.medium;

  const formatDate = (iso?: string | null) => {
    if (!iso) return "-";
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch {
      return iso;
    }
  };

  // Handle saving admin process updates
  const handleSaveProcessing = async () => {
    if (!onProcessReport) return;
    setIsSavingProcess(true);
    setProcessMessage(null);
    try {
      await onProcessReport(report.id, {
        status: selectedStatus,
        priority: selectedPriority,
        assignee: selectedAssignee || null,
        resolutionNote: resolutionNote || null,
        adminNote: adminNote || undefined,
      });
      setProcessMessage({
        type: "success",
        text: "처리 정보가 성공적으로 저장되었습니다.",
      });
      setTimeout(() => setProcessMessage(null), 3000);
    } catch (err: any) {
      setProcessMessage({
        type: "error",
        text: err.message || "처리 정보를 저장하지 못했습니다.",
      });
    } finally {
      setIsSavingProcess(false);
    }
  };

  // Handle delete execution
  const handleDelete = async () => {
    if (!onDeleteReport) return;
    setIsDeleting(true);
    try {
      await onDeleteReport(report.id);
      setIsDeleteConfirmOpen(false);
      onClose();
    } catch (err: any) {
      alert(err.message || "신고를 삭제하지 못했습니다.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="2xl"
        title={
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
              {report.id}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusCfg.badgeClass}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dotClass}`} />
              <span>{statusCfg.label}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${priorityCfg.badgeClass}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${priorityCfg.dotClass}`} />
              <span>{priorityCfg.label}</span>
            </span>
            <span className="text-sm sm:text-base font-bold text-slate-900 truncate">
              {report.title || `${report.location} ${report.category} 불편 신고`}
            </span>
          </div>
        }
        description={
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>접수일: {formatDate(report.createdAt)}</span>
            <span>•</span>
            <span>신고자: {report.isAnonymous ? "익명 학생" : "실명 학생"}</span>
          </div>
        }
        footer={
          <div className="w-full flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {isAdmin && onDeleteReport && (
                <button
                  type="button"
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 bg-rose-50/50 hover:bg-rose-100 text-xs font-semibold transition cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>신고 삭제</span>
                </button>
              )}
              {isAdmin && onUpdateReport && (
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition cursor-pointer"
                >
                  <Edit className="h-3.5 w-3.5 text-slate-500" />
                  <span>내용 수정</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs sm:text-sm font-semibold transition cursor-pointer"
            >
              닫기
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Navigation Tabs (if admin) */}
          {isAdmin && (
            <div className="flex border-b border-slate-200 -mt-2">
              <button
                type="button"
                onClick={() => setActiveTab("DETAILS")}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition cursor-pointer ${
                  activeTab === "DETAILS"
                    ? "border-blue-700 text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                신고 상세 및 현황
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("PROCESS")}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "PROCESS"
                    ? "border-blue-700 text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>시설 처리 및 담당 배정</span>
                {report.status !== "completed" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                )}
              </button>
            </div>
          )}

          {/* TAB 1: DETAILS */}
          {(activeTab === "DETAILS" || !isAdmin) && (
            <div className="space-y-5">
              {/* Timeline Section */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <span className="text-xs font-bold text-slate-700 block mb-2">
                  처리 진행 단계
                </span>
                <ReportTimeline
                  status={report.status}
                  createdAt={report.createdAt}
                  reviewedAt={report.reviewedAt}
                  inProgressAt={report.inProgressAt}
                  completedAt={report.completedAt}
                />
              </div>

              {/* Basic Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>발생 위치</span>
                  </div>
                  <p className="mt-1 font-bold text-slate-900 text-sm">
                    {report.location}
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                    <Tag className="h-3.5 w-3.5" />
                    <span>문제 분류</span>
                  </div>
                  <p className="mt-1 font-bold text-slate-900 text-sm">
                    {report.category}
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                    <Building2 className="h-3.5 w-3.5" />
                    <span>담당 부서</span>
                  </div>
                  <p className="mt-1 font-bold text-slate-900 text-sm">
                    {report.assignee || "미배정 (검토중)"}
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                    <User className="h-3.5 w-3.5" />
                    <span>신고자</span>
                  </div>
                  <p className="mt-1 font-bold text-slate-900 text-sm">
                    {report.isAnonymous ? "익명 (보호됨)" : "실명 학생"}
                  </p>
                </div>
              </div>

              {/* Problem Description */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-700 block">
                  신고 상세 내용
                </span>
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {report.description}
                </div>
              </div>

              {/* Attachment preview */}
              {report.attachmentUrl && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">
                      현장 첨부 사진
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsLightboxOpen(true)}
                      className="text-xs text-blue-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                      <span>원본 크기 확대 보기</span>
                    </button>
                  </div>
                  <div
                    onClick={() => setIsLightboxOpen(true)}
                    className="relative rounded-xl border border-slate-200 bg-slate-100 overflow-hidden cursor-pointer group max-h-72 flex items-center justify-center"
                  >
                    <img
                      src={report.attachmentUrl}
                      alt="신고 첨부 사진"
                      referrerPolicy="no-referrer"
                      className="w-full h-auto max-h-72 object-contain transition group-hover:scale-[1.01]"
                    />
                    <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                      <span className="px-3 py-1.5 rounded-lg bg-slate-900/80 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md">
                        <ZoomIn className="h-3.5 w-3.5" /> 원본 크기 확대 보기
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Resolution / Processing Note */}
              {report.resolutionNote && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>시설 관리 부서 조치 결과</span>
                    {report.completedAt && (
                      <span className="text-emerald-700 font-mono text-[11px] ml-auto">
                        완료일: {formatDate(report.completedAt)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-emerald-950 whitespace-pre-wrap leading-relaxed pt-1">
                    {report.resolutionNote}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PROCESS (ADMIN ONLY) */}
          {activeTab === "PROCESS" && isAdmin && (
            <div className="space-y-4">
              {processMessage && (
                <div
                  className={`p-3 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
                    processMessage.type === "success"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : "bg-rose-50 border-rose-200 text-rose-800"
                  }`}
                >
                  {processMessage.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  )}
                  <span>{processMessage.text}</span>
                </div>
              )}

              {/* 1. Status Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  진행 상태 변경
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(["pending", "reviewing", "in_progress", "completed"] as const).map(
                    (st) => {
                      const cfg = STATUS_MAP[st];
                      const isSelected = selectedStatus === st;
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setSelectedStatus(st)}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer text-center ${
                            isSelected
                              ? `${cfg.badgeClass} ring-2 ring-blue-600 font-bold shadow-xs`
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {cfg.label}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* 2. Priority Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>안전 우선순위 등급 설정</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    관리자 목록 배지 및 조치 시급도에 반영됩니다
                  </span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["urgent", "medium", "low"] as const).map((pr) => {
                    const cfg = PRIORITY_MAP[pr];
                    const isSelected = selectedPriority === pr;
                    return (
                      <button
                        key={pr}
                        type="button"
                        onClick={() => setSelectedPriority(pr)}
                        className={`px-3 py-2.5 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? `${cfg.badgeClass} ring-2 ring-blue-600 font-bold shadow-xs`
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${cfg.dotClass}`} />
                        <span>{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Assignee Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  담당 부서 지정
                </label>
                <select
                  value={selectedAssignee}
                  onChange={(e) => setSelectedAssignee(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="">담당 부서 선택 (미지정)</option>
                  {SCHOOL_ASSIGNEES.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Resolution Note */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  조치 내용 및 처리 결과 기록 (학생 및 관리자 열람 가능)
                </label>
                <p className="text-[11px] text-slate-500 mb-1.5">
                  부품 교체, 수리 완료 내역, 청소 완료 등 처리된 구체적인 조치 사항을 작성해주세요.
                </p>
                <textarea
                  rows={3}
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="예: 2층 복도 들뜬 타일 보수 공사 완료 및 안전 테이프 철거 조치함."
                  className="w-full p-3 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
              </div>

              {/* 5. Internal Admin Note */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  관리자 내부 메모 (관리자 전용)
                </label>
                <input
                  type="text"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="예: 유지보수 예산 15만원 지출 건, 업체 담당자 연락처 기록 등"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm outline-none focus:border-blue-600"
                />
              </div>

              {/* Save Button */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={isSavingProcess}
                  onClick={handleSaveProcessing}
                  className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSavingProcess ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>처리 상태 및 담당 정보 저장</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Full Image Lightbox Modal */}
      {report.attachmentUrl && (
        <ImageLightboxModal
          isOpen={isLightboxOpen}
          onClose={() => setIsLightboxOpen(false)}
          imageUrl={report.attachmentUrl}
          imageName={report.attachmentName}
          imageSize={report.attachmentSize}
        />
      )}

      {/* Edit Modal */}
      <ReportEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        report={report}
        onSave={async (updatedData) => {
          if (onUpdateReport) {
            await onUpdateReport(report.id, updatedData);
          }
        }}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        isLoading={isDeleting}
        title="신고 내역 삭제 확인"
        type="danger"
        confirmText="삭제하기"
        cancelText="취소"
        message={
          <div>
            <p className="font-bold text-slate-900">
              신고 번호 [{report.id}]를 정말 삭제하시겠습니까?
            </p>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              삭제된 신고 내역은 영구히 제거되며 데이터베이스에서 복구할 수 없습니다. 계속 진행하시겠습니까?
            </p>
          </div>
        }
      />
    </>
  );
}
