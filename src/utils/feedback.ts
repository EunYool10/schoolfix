/**
 * 만족도 응답을 받을 차례인지 — 서버와 신고 상세 화면이 같은 규칙을 쓴다.
 *
 * 처리 완료된 신고에, 이번 완료 이후 아직 응답하지 않았을 때만 묻는다.
 * "아직 그대로예요" 로 다시 열린 신고가 또 완료되면 새로 응답할 수 있어야 한다.
 */
export interface FeedbackInput {
  status: string;
  completedAt?: string | null;
  feedback?: { at: string } | null;
}

export function feedbackPending(report: FeedbackInput): boolean {
  if (report.status !== "completed") return false;
  if (!report.feedback) return true;
  if (!report.completedAt) return false;
  return new Date(report.feedback.at).getTime() < new Date(report.completedAt).getTime();
}
