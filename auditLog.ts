/**
 * 운영 기록 — 운영진·교사가 한 중요한 일을 남긴다.
 *
 * 누가(계정 이름·역할) 언제 무엇을 했는지 기록해 "이 신고는 누가 지웠지?" 같은 질문에 답할 수 있게 한다.
 * 학생 정보는 넣지 않는다. 대상은 신고 접수번호·계정 아이디·백업 이름 정도만 적는다.
 * 틀린 비밀번호 같은 실패 시도는 넣지 않는다. 누군가 실패를 쏟아내 다른 기록을 밀어내지 못하게 하기 위해서다.
 */

export type AuditAction =
  | "login"
  | "account.create" | "account.update" | "account.disable" | "account.enable" | "account.password_reset" | "account.delete" | "account.password_change"
  | "owner.designate" | "owner.transfer" | "owner.reset"
  | "report.delete" | "report.spam" | "report.reject" | "report.approve" | "report.restore" | "report.purge"
  | "backup.create" | "backup.auto" | "backup.download" | "backup.restore"
  | "school.register" | "school.stop" | "device.unblock" | "settings.notifications";

export const AUDIT_LABEL: Record<AuditAction, string> = {
  login: "로그인",
  "account.create": "계정 만듦",
  "account.update": "계정 바꿈",
  "account.disable": "계정 사용 중지",
  "account.enable": "계정 다시 켬",
  "account.password_reset": "비밀번호 재설정",
  "account.delete": "계정 삭제",
  "account.password_change": "내 비밀번호 변경",
  "owner.designate": "총괄 지정",
  "owner.transfer": "총괄 넘김",
  "owner.reset": "총괄 비상 복구",
  "report.delete": "신고 삭제",
  "report.spam": "장난 신고 처리",
  "report.reject": "검토 대기 신고 삭제",
  "report.approve": "검토 대기 신고 공개",
  "report.restore": "삭제한 신고 되살림",
  "report.purge": "신고 영구 삭제",
  "backup.create": "백업 만듦",
  "backup.auto": "자동 백업",
  "backup.download": "백업 내려받음",
  "backup.restore": "백업으로 되돌림",
  "school.register": "학교 등록",
  "school.stop": "학교 지원 중지",
  "device.unblock": "검토 대상 기기 해제",
  "settings.notifications": "알림 설정 변경",
};

export type AuditCategory = "login" | "account" | "report" | "backup" | "etc";

export function auditCategory(action: AuditAction): AuditCategory {
  if (action === "login") return "login";
  if (action.startsWith("account.") || action.startsWith("owner.")) return "account";
  if (action.startsWith("report.")) return "report";
  if (action.startsWith("backup.")) return "backup";
  return "etc";
}

export interface AuditActor {
  name: string;
  role: string;
  accountId: string | null;
}

export interface AuditEntry {
  id: string;
  at: string;
  action: AuditAction;
  /** 시스템이 스스로 한 일(자동 백업, 비상 복구)은 null */
  actor: AuditActor | null;
  /** 접수번호·계정 아이디·백업 이름 등 */
  target: string | null;
  detail: string | null;
}

/** 저장해 둘 기록 수. 오래된 것부터 지운다. */
export const MAX_AUDIT_ENTRIES = 1000;

let sequence = 0;

export function newAuditEntry(action: AuditAction, actor: AuditActor | null, target: string | null = null, detail: string | null = null, now = new Date()): AuditEntry {
  sequence = (sequence + 1) % 1_000_000;
  return {
    id: `${now.getTime().toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: now.toISOString(),
    action,
    actor,
    target: target ? target.slice(0, 120) : null,
    detail: detail ? detail.slice(0, 500) : null,
  };
}

/** 새 기록을 맨 앞에 넣고 오래된 것을 잘라낸다. */
export function appendAudit(list: AuditEntry[], entry: AuditEntry, max = MAX_AUDIT_ENTRIES): AuditEntry[] {
  return [entry, ...list].slice(0, max);
}
