/**
 * 세부 위치를 안 적어도 접수되는 학교·장소 종류.
 *
 * 창의경영고는 복도·운동장을 따로 부르는 이름이 없어서, 장소 종류만 골라도 넘어가게 한다.
 * 신고서 화면과 서버의 접수 검사가 이 규칙을 함께 쓴다.
 */
const DETAIL_OPTIONAL: Record<string, readonly string[]> = {
  "cem-h": ["복도", "운동장"],
};

export function isDetailOptional(schoolId: string | null | undefined, locationType: string | null | undefined): boolean {
  if (!schoolId || typeof locationType !== "string") return false;
  return DETAIL_OPTIONAL[schoolId]?.includes(locationType.trim()) ?? false;
}
