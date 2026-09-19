import React, { useState, useEffect } from "react";
import { Modal } from "./common/Modal";
import {
  SchoolReport,
  SCHOOL_LOCATIONS,
  ISSUE_CATEGORIES,
} from "../types";
import { AlertCircle, Save } from "lucide-react";

interface ReportEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: SchoolReport | null;
  onSave: (updatedData: {
    title: string;
    location: string;
    category: string;
    description: string;
    isAnonymous: boolean;
  }) => Promise<void>;
}

export function ReportEditModal({
  isOpen,
  onClose,
  report,
  onSave,
}: ReportEditModalProps) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (report && isOpen) {
      setTitle(report.title || `${report.location} ${report.category} 불편 신고`);
      setLocation(report.location);
      setCategory(report.category);
      setDescription(report.description);
      setIsAnonymous(report.isAnonymous);
      setError(null);
    }
  }, [report, isOpen]);

  if (!report) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.trim()) {
      setError("위치를 선택해주세요.");
      return;
    }
    if (!category.trim()) {
      setError("문제 종류를 선택해주세요.");
      return;
    }
    if (!description.trim()) {
      setError("상세 내용을 입력해주세요.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        location: location.trim(),
        category: category.trim(),
        description: description.trim(),
        isAnonymous,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "수정 사항을 저장하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span>신고 정보 수정</span>
          <span className="font-mono text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
            {report.id}
          </span>
        </div>
      }
      description="신고된 기본 정보(위치, 문제 종류, 상세 설명)를 수정합니다."
      maxWidth="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-semibold transition cursor-pointer shadow-xs disabled:opacity-50"
          >
            {isSaving ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>수정 저장</span>
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            신고 제목
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="신고 제목을 입력하세요"
            className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              발생 위치 <span className="text-rose-600">*</span>
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:border-blue-600 cursor-pointer"
            >
              <option value="">위치 선택</option>
              {SCHOOL_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              문제 분류 <span className="text-rose-600">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:border-blue-600 cursor-pointer"
            >
              <option value="">문제 종류 선택</option>
              {ISSUE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            상세 설명 <span className="text-rose-600">*</span>
          </label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-3 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
          />
        </div>

        <div className="pt-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 cursor-pointer"
            />
            <span className="text-xs font-medium text-slate-700">
              익명 신고로 유지
            </span>
          </label>
        </div>
      </form>
    </Modal>
  );
}
