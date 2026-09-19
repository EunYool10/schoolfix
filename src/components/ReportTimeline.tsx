import React from "react";
import { Check, Clock, Eye, Hammer, CheckCircle2 } from "lucide-react";
import { ReportStatus } from "../types";

interface ReportTimelineProps {
  status: ReportStatus;
  createdAt: string;
  reviewedAt?: string | null;
  inProgressAt?: string | null;
  completedAt?: string | null;
}

export function ReportTimeline({
  status,
  createdAt,
  reviewedAt,
  inProgressAt,
  completedAt,
}: ReportTimelineProps) {
  const steps: {
    key: ReportStatus;
    label: string;
    description: string;
    timestamp?: string | null;
    icon: React.ReactNode;
  }[] = [
    {
      key: "pending",
      label: "접수",
      description: "신고 접수 완료",
      timestamp: createdAt,
      icon: <Clock className="h-4 w-4" />,
    },
    {
      key: "reviewing",
      label: "확인 중",
      description: "담당 부서 현장 확인",
      timestamp: reviewedAt,
      icon: <Eye className="h-4 w-4" />,
    },
    {
      key: "in_progress",
      label: "처리 중",
      description: "시설 보수 및 조치 진행",
      timestamp: inProgressAt,
      icon: <Hammer className="h-4 w-4" />,
    },
    {
      key: "completed",
      label: "처리 완료",
      description: "조치 완료 및 안전 검증",
      timestamp: completedAt,
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
  ];

  const statusOrder: Record<ReportStatus, number> = {
    pending: 0,
    reviewing: 1,
    in_progress: 2,
    completed: 3,
  };

  const currentLevel = statusOrder[status];

  const formatTime = (iso?: string | null) => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch {
      return null;
    }
  };

  return (
    <div className="w-full py-2">
      <div className="relative flex items-center justify-between">
        {/* Continuous progress bar background */}
        <div className="absolute left-0 top-4 -translate-y-1/2 h-1 w-full bg-slate-200 z-0" />
        {/* Active progress bar */}
        <div
          className="absolute left-0 top-4 -translate-y-1/2 h-1 bg-blue-600 transition-all duration-300 z-0"
          style={{ width: `${(currentLevel / 3) * 100}%` }}
        />

        {steps.map((step, idx) => {
          const isPassed = idx <= currentLevel;
          const isCurrent = idx === currentLevel;
          const formatted = formatTime(step.timestamp);

          return (
            <div
              key={step.key}
              className="relative z-10 flex flex-col items-center text-center px-1"
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
                  isPassed
                    ? "bg-blue-700 border-blue-700 text-white shadow-xs"
                    : "bg-white border-slate-300 text-slate-400"
                } ${isCurrent ? "ring-4 ring-blue-100 scale-105" : ""}`}
              >
                {isPassed && idx < currentLevel ? (
                  <Check className="h-4 w-4 stroke-[2.5]" />
                ) : (
                  step.icon
                )}
              </div>

              <div className="mt-2 space-y-0.5 max-w-[80px] sm:max-w-[100px]">
                <p
                  className={`text-[11px] sm:text-xs font-bold leading-tight ${
                    isCurrent
                      ? "text-blue-700"
                      : isPassed
                      ? "text-slate-900"
                      : "text-slate-400"
                  }`}
                >
                  {step.label}
                </p>
                {formatted ? (
                  <p className="text-[10px] font-mono text-slate-500 font-medium">
                    {formatted}
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 hidden sm:block">
                    {isPassed ? "진행됨" : "대기"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
