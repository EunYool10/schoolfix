/**
 * 신고 작성 화면 예시 데이터 (폼 자동 채우기 전용)
 * 
 * 중요 규칙 (USER INTENT & SECURITY):
 * 1. 이 데이터는 학생이 폼을 쉽게 작성할 수 있도록 돕는 "추천 예시 문구" 전용입니다.
 * 2. 실제 신고 데이터나 데이터베이스와 절대로 혼합되지 않습니다.
 * 3. 접수번호, 상태, 생성일, AI 점수 등의 가짜 메타데이터를 포함하지 않습니다.
 * 4. 랜덤 선택(Math.random)은 오직 "어떤 추천 예시 버튼을 화면에 띄울지" 결정하는 UI 렌더링에만 사용됩니다.
 */

export interface FormExampleItem {
  key: string;
  label: string;
  summary: string;
  location: string;
  category: string;
  description: string;
  isAnonymous: boolean;
}

export const FORM_EXAMPLES: Record<string, FormExampleItem> = {
  classroom_facility: {
    key: "classroom_facility",
    label: "교실 시설 고장",
    summary: "교실 책걸상 및 사물함 시설 문제",
    location: "교실",
    category: "시설 고장",
    description:
      "교실 책걸상이 흔들리거나 사물함 경첩이 고장 나 수업 및 사용에 불편이 있습니다. 확인 후 수리 부탁드립니다.",
    isAnonymous: true,
  },
  restroom_hygiene: {
    key: "restroom_hygiene",
    label: "화장실 위생 문제",
    summary: "화장실 세면대 및 위생용품 부족",
    location: "화장실",
    category: "위생 문제",
    description:
      "화장실 세면대 배수가 원활하지 않고 비누 및 핸드타월이 비어 있습니다. 확인 후 보충 및 청소 부탁드립니다.",
    isAnonymous: true,
  },
  hallway_safety: {
    key: "hallway_safety",
    label: "복도 안전 문제",
    summary: "복도 바닥 타일 들뜸 및 미끄럼 위험",
    location: "복도",
    category: "안전 위험",
    description:
      "복도 바닥 타일이 들떠 있어 지나갈 때 발이 걸려 넘어질 위험이 있습니다. 학생들이 안전하게 이동할 수 있도록 점검 부탁드립니다.",
    isAnonymous: true,
  },
  cafeteria_inconvenience: {
    key: "cafeteria_inconvenience",
    label: "급식실 불편사항",
    summary: "급식실 대기 공간 및 식수대 불편",
    location: "급식실",
    category: "불편 사항",
    description:
      "급식실 배식 대기 줄 공간이 협소하여 혼잡하고 식수대 수압이 약해 이용하기 불편합니다. 점검 및 안내 부탁드립니다.",
    isAnonymous: true,
  },
  classroom_environment: {
    key: "classroom_environment",
    label: "교실 환경 문제",
    summary: "냉난방기 소음 및 환기창 개폐 불량",
    location: "교실",
    category: "환경 문제",
    description:
      "교실 냉난방기에서 이상 소음이 발생하고 환기창 잠금장치가 뻑뻑하여 열고 닫기가 어렵습니다. 확인 및 점검 부탁드립니다.",
    isAnonymous: true,
  },
  school_facility: {
    key: "school_facility",
    label: "학교 시설 불편",
    summary: "특별실 전원 및 기자재 연결 불량",
    location: "특별실",
    category: "시설 고장",
    description:
      "컴퓨터실 모니터 전원이 불안정하고 멀티탭 콘센트 접촉 불량이 발생합니다. 안전 및 사용을 위해 수리 부탁드립니다.",
    isAnonymous: true,
  },
  safety_issue: {
    key: "safety_issue",
    label: "안전 관련 불편",
    summary: "계단 미끄럼 방지 패드 마모 위험",
    location: "계단",
    category: "안전 위험",
    description:
      "중앙 계단 미끄럼 방지 패드가 일부 뜯겨 있어 이동 시 미끄러질 위험이 있습니다. 안전한 이동을 위해 보수 조치 부탁드립니다.",
    isAnonymous: true,
  },
  library_facility: {
    key: "library_facility",
    label: "도서관 시설 문제",
    summary: "도서관 열람실 조명 깜빡임 및 소음",
    location: "도서관",
    category: "소음 문제",
    description:
      "도서관 열람실 형광등이 계속 깜빡거리며 미세한 소음이 발생하여 학습에 집중하기 어렵습니다. 전등 교체 부탁드립니다.",
    isAnonymous: true,
  },
  gym_safety: {
    key: "gym_safety",
    label: "체육관 안전 문제",
    summary: "체육관 벽면 안전 보호 쿠션 파손",
    location: "체육관",
    category: "안전 위험",
    description:
      "체육관 벽면 안전 보호 쿠션이 일부 분리되어 떨어져 있습니다. 체육 수업 중 부상 방지를 위해 재고정 조치 부탁드립니다.",
    isAnonymous: true,
  },
  other_inconvenience: {
    key: "other_inconvenience",
    label: "기타 학교 불편사항",
    summary: "운동장 식수대 주변 배수로 막힘",
    location: "운동장",
    category: "기타",
    description:
      "운동장 식수대 주변 배수로에 낙엽과 모래가 쌓여 물이 잘 빠지지 않고 고여 있습니다. 환경 정비 부탁드립니다.",
    isAnonymous: true,
  },
};

export const FORM_EXAMPLE_LIST: FormExampleItem[] = Object.values(FORM_EXAMPLES);

/**
 * Fisher-Yates 알고리즘을 사용한 안전한 배열 셔플
 */
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 미리 정의된 예시 목록 중 중복 없이 count개를 무작위로 선택합니다.
 * 
 * 중요:
 * - 오직 "예시 추천 UI"에만 사용되며, 실제 신고 데이터 생성에는 일절 사용되지 않습니다.
 * - currentLocation이 지정되어 있다면 해당 위치와 일치하는 예시를 우선적으로 전면에 배치합니다.
 * - 이전 추천 목록(excludeKeys)과 가급적 겹치지 않는 새로운 조합을 제공합니다.
 */
export function getRandomFormExamples(
  count: number = 4,
  currentLocation?: string,
  excludeKeys: string[] = []
): FormExampleItem[] {
  const allList = [...FORM_EXAMPLE_LIST];
  if (allList.length <= count) {
    return allList;
  }

  // 1. 현재 선택된 위치(Location)와 일치하는 예시 분리 (추천 품질 개선)
  let priorityItems: FormExampleItem[] = [];
  let generalItems: FormExampleItem[] = [];

  if (currentLocation && currentLocation.trim() !== "") {
    priorityItems = allList.filter((item) => item.location === currentLocation);
    generalItems = allList.filter((item) => item.location !== currentLocation);
  } else {
    generalItems = allList;
  }

  // 2. excludeKeys를 고려하여 이전에 보이지 않았던 항목을 우선적으로 셔플
  const shuffledPriority = shuffleArray(priorityItems);
  const shuffledGeneral = shuffleArray(generalItems);

  let orderedGeneral = shuffledGeneral;
  if (excludeKeys.length > 0) {
    const fresh = shuffledGeneral.filter((item) => !excludeKeys.includes(item.key));
    const previouslyShown = shuffledGeneral.filter((item) => excludeKeys.includes(item.key));
    orderedGeneral = [...fresh, ...previouslyShown];
  }

  const selectedItems: FormExampleItem[] = [];
  const selectedKeys = new Set<string>();

  // 위치 연관 예시가 있다면 최대 1~2개 우선 추가
  for (const item of shuffledPriority) {
    if (selectedItems.length >= Math.min(2, count)) break;
    if (!selectedKeys.has(item.key)) {
      selectedItems.push(item);
      selectedKeys.add(item.key);
    }
  }

  // 나머지 슬롯을 일반 예시들로 채움
  for (const item of orderedGeneral) {
    if (selectedItems.length >= count) break;
    if (!selectedKeys.has(item.key)) {
      selectedItems.push(item);
      selectedKeys.add(item.key);
    }
  }

  // 만약 채우지 못했다면 남은 전체 목록에서 무작위 보충
  if (selectedItems.length < count) {
    for (const item of shuffleArray(allList)) {
      if (selectedItems.length >= count) break;
      if (!selectedKeys.has(item.key)) {
        selectedItems.push(item);
        selectedKeys.add(item.key);
      }
    }
  }

  return selectedItems;
}
