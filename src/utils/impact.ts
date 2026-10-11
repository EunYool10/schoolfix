/**
 * "내가 바꾼 학교" — 이 기기에 남은 기록(내 신고, 공감, 확인 표)으로 내 덕분에 바뀐 것을 센다.
 * 서버에 따로 묻지 않는다. 이름 없이 이 기기에만 있는 기록이기 때문이다.
 */

import type { SchoolReport } from "../types";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 학년도 (3월 시작). 2027년 2월은 2026학년도다. */
export function schoolYearOf(iso: string): number {
  const kst = new Date(Date.parse(iso) + KST_OFFSET_MS);
  return kst.getUTCMonth() < 2 ? kst.getUTCFullYear() - 1 : kst.getUTCFullYear();
}

export interface FixedItem {
  id: string;
  title: string;
  place: string;
  completedAt: string;
  kind: "mine" | "metoo";
}

export interface ImpactSummary {
  myCount: number;
  myFixed: number;
  meTooCount: number;
  meTooFixed: number;
  verifyCount: number;
  fixed: FixedItem[];
}

/** 기간(학년도, null 이면 전체) 안의 기록을 센다. */
export function summarizeImpact(myReports: SchoolReport[], allReports: SchoolReport[], meTooIds: Set<string>, votes: Record<string, { at: string }>, year: number | null): ImpactSummary {
  const inScope = (iso: string | null | undefined) => Boolean(iso) && (year === null || schoolYearOf(iso as string) === year);
  const mine = myReports.filter((report) => inScope(report.createdAt) || inScope(report.completedAt));
  const myIds = new Set(myReports.map((report) => report.id));
  const meToo = allReports.filter((report) => meTooIds.has(report.id) && !myIds.has(report.id));
  const fixedMine = myReports.filter((report) => report.status === "completed" && inScope(report.completedAt));
  const fixedMeToo = meToo.filter((report) => report.status === "completed" && inScope(report.completedAt));
  const toItem = (report: SchoolReport, kind: FixedItem["kind"]): FixedItem => ({
    id: report.id,
    title: report.title || `${report.location} ${report.category}`,
    place: [report.locationType || report.location, report.locationDetail].filter(Boolean).join(" · "),
    completedAt: report.completedAt as string,
    kind,
  });
  return {
    myCount: mine.length,
    myFixed: fixedMine.length,
    meTooCount: meToo.filter((report) => year === null || inScope(report.createdAt) || inScope(report.completedAt)).length,
    meTooFixed: fixedMeToo.length,
    verifyCount: Object.values(votes).filter((vote) => inScope(vote.at)).length,
    fixed: [...fixedMine.map((report) => toItem(report, "mine")), ...fixedMeToo.map((report) => toItem(report, "metoo"))]
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
  };
}
