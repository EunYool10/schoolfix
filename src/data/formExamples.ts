import type { School } from "../types";

/** 추천 문구일 뿐 실제 학교 시설 현황이나 접수된 신고를 나타내지 않습니다. */
export interface FormExampleItem {
  key: string;
  label: string;
  summary: string;
  location: string;
  category: string;
  description: string;
  isAnonymous: boolean;
  levels?: SchoolLevel[];
  highSchoolTypes?: NonNullable<School["highSchoolType"]>[];
}

type SchoolLevel = "초등학교" | "중학교" | "고등학교";
type ExampleSeed = Omit<FormExampleItem, "isAnonymous">;

const shared: ExampleSeed[] = [
  { key: "desk", label: "책걸상 흔들림", summary: "책걸상 점검 요청", location: "교실", category: "시설 고장", description: "교실 책걸상이 흔들려 사용하기 불편합니다. 문제가 있는 위치를 확인하고 수리해 주세요." },
  { key: "light", label: "조명 이상", summary: "조명이 깜빡이거나 켜지지 않음", location: "교실", category: "시설 고장", description: "교실 조명이 깜빡이거나 켜지지 않습니다. 위치를 확인해 점검해 주세요." },
  { key: "temperature", label: "냉난방 불편", summary: "교실 온도 조절 문제", location: "교실", category: "환경 문제", description: "교실 냉난방이 원활하지 않아 수업 중 불편합니다. 작동 상태를 확인해 주세요." },
  { key: "window", label: "창문·문 문제", summary: "창문 또는 출입문 개폐 불편", location: "교실", category: "시설 고장", description: "창문 또는 문이 잘 열리거나 닫히지 않습니다. 끼임이나 안전 문제가 없는지 확인해 주세요." },
  { key: "restroom-water", label: "세면대 배수 문제", summary: "화장실 배수 점검", location: "화장실", category: "시설 고장", description: "화장실 세면대 물이 잘 빠지지 않습니다. 배수 상태를 확인해 주세요." },
  { key: "restroom-supply", label: "위생용품 보충", summary: "비누·휴지 등 보충 요청", location: "화장실", category: "위생 문제", description: "화장실 위생용품이 부족합니다. 비치 상태를 확인하고 보충해 주세요." },
  { key: "floor", label: "바닥 미끄럼 위험", summary: "바닥 상태 점검", location: "복도", category: "안전 위험", description: "바닥이 미끄럽거나 고르지 않아 넘어질 우려가 있습니다. 해당 구역을 확인하고 안전 조치를 해 주세요." },
  { key: "stairs", label: "계단 안전 점검", summary: "계단 손잡이·바닥 확인", location: "계단", category: "안전 위험", description: "계단을 오르내릴 때 안전상 우려가 있습니다. 손잡이와 바닥 상태를 점검해 주세요." },
  { key: "queue", label: "급식 대기 혼잡", summary: "대기 동선 개선 요청", location: "급식실", category: "불편 사항", description: "급식 시간에 대기 줄이 한 곳에 몰려 이동이 불편합니다. 안전한 대기 동선을 확인해 주세요." },
  { key: "water", label: "식수대 점검", summary: "식수대 사용 불편", location: "운동장", category: "시설 고장", description: "식수대가 원활하게 작동하지 않거나 주변이 정리되지 않아 이용하기 어렵습니다. 상태를 확인해 주세요." },
  { key: "noise", label: "반복 소음", summary: "수업·학습 공간 소음", location: "특별실", category: "소음 문제", description: "이 공간에서 반복적으로 큰 소음이 발생해 활동에 방해가 됩니다. 발생 시간대와 원인을 확인해 주세요." },
  { key: "access", label: "이동 통로 불편", summary: "통로 장애물 정리 요청", location: "복도", category: "안전 위험", description: "통로에 물건이 놓여 이동에 불편하고 안전사고가 우려됩니다. 통행 공간을 확인해 정리해 주세요." },
  { key: "cleaning", label: "청소·위생 요청", summary: "공용 공간 청결 확인", location: "급식실", category: "위생 문제", description: "공용 공간이 오염되어 이용에 불편이 있습니다. 청결 상태를 확인하고 필요한 조치를 부탁드립니다." },
  { key: "other", label: "직접 설명하기", summary: "목록에 없는 불편 사항", location: "기타", category: "기타", description: "문제가 발생한 장소와 상황을 확인해 주세요. 필요한 조치를 부탁드립니다." },
];

const elementary: ExampleSeed[] = [
  { key: "elementary-playground", label: "놀이 공간 안전", summary: "놀이 시설 주변 점검", location: "운동장", category: "안전 위험", description: "놀이 공간 주변에 다칠 수 있는 부분이 있는 것 같습니다. 정확한 위치를 확인해 안전하게 조치해 주세요.", levels: ["초등학교"] },
  { key: "elementary-class", label: "교실 문 끼임 주의", summary: "문 주변 안전 확인", location: "교실", category: "안전 위험", description: "교실 문을 여닫을 때 손이 끼일 우려가 있습니다. 문과 손 끼임 방지 상태를 확인해 주세요.", levels: ["초등학교"] },
  { key: "elementary-toilet", label: "화장실 잠금장치", summary: "문 잠금 상태 확인", location: "화장실", category: "시설 고장", description: "화장실 칸 문이 잘 잠기지 않거나 열리지 않습니다. 안전하게 사용할 수 있도록 점검해 주세요.", levels: ["초등학교"] },
  { key: "elementary-water", label: "식수 이용 불편", summary: "식수 공간 확인", location: "기타", category: "불편 사항", description: "물을 마시는 공간을 이용하기 어렵습니다. 위치와 불편한 점을 확인해 주세요.", levels: ["초등학교"] },
];

const middle: ExampleSeed[] = [
  { key: "middle-locker", label: "사물함 고장", summary: "사물함 문·잠금장치 점검", location: "복도", category: "시설 고장", description: "사물함 문이나 잠금장치가 제대로 작동하지 않습니다. 해당 사물함을 확인해 주세요.", levels: ["중학교"] },
  { key: "middle-crowd", label: "쉬는 시간 통행 혼잡", summary: "복도 이동 안전", location: "복도", category: "안전 위험", description: "쉬는 시간에 통행이 한 곳에 몰려 부딪힘 우려가 있습니다. 안전한 이동 방법을 확인해 주세요.", levels: ["중학교"] },
  { key: "middle-study", label: "학습 공간 불편", summary: "학습 공간 환경 점검", location: "도서관", category: "환경 문제", description: "학습 공간의 조명·온도·좌석 중 불편한 점이 있습니다. 구체적인 위치와 상태를 확인해 주세요.", levels: ["중학교"] },
  { key: "middle-sports", label: "체육 활동 공간 점검", summary: "체육 시설 안전 확인", location: "체육관", category: "안전 위험", description: "체육 활동 공간이나 기구에 안전상 우려가 있습니다. 사용 전 상태를 확인해 주세요.", levels: ["중학교"] },
];

const high: ExampleSeed[] = [
  { key: "high-lab", label: "실습 기자재 점검", summary: "실습 공간 기자재 불편", location: "특별실", category: "시설 고장", description: "실습에 사용하는 기자재가 정상적으로 작동하지 않습니다. 장비와 연결 상태를 확인해 주세요.", levels: ["고등학교"] },
  { key: "high-study", label: "자습 공간 환경", summary: "학습 집중을 방해하는 환경", location: "도서관", category: "환경 문제", description: "학습 공간의 조명, 온도 또는 소음 때문에 집중하기 어렵습니다. 발생 위치와 시간대를 확인해 주세요.", levels: ["고등학교"] },
  { key: "high-cafeteria", label: "급식 동선 불편", summary: "식사 시간 이동 동선", location: "급식실", category: "불편 사항", description: "식사 시간에 이동 경로가 혼잡해 불편하거나 부딪힘 우려가 있습니다. 동선을 확인해 주세요.", levels: ["고등학교"] },
  { key: "high-night", label: "늦은 시간 시설 이용", summary: "운영 시간대 시설 문제", location: "기타", category: "불편 사항", description: "시설 이용 가능 시간에 문제가 발생했습니다. 이용 시간과 장소를 확인해 안내해 주세요.", levels: ["고등학교"] },
];

const vocational: ExampleSeed[] = [
  { key: "vocational-equipment", label: "실습 장비 이상", summary: "실습 장비 안전·작동 확인", location: "특별실", category: "안전 위험", description: "실습 장비의 작동이나 보호 장치에 이상이 의심됩니다. 사용을 확인하고 필요한 안전 점검을 부탁드립니다.", levels: ["고등학교"], highSchoolTypes: ["특성화고"] },
  { key: "vocational-power", label: "실습실 전원 문제", summary: "전원·케이블 점검 요청", location: "특별실", category: "시설 고장", description: "실습 공간의 전원이나 케이블 연결에 문제가 있습니다. 감전·과열 위험이 없도록 점검해 주세요.", levels: ["고등학교"], highSchoolTypes: ["특성화고"] },
  { key: "vocational-storage", label: "실습 도구 정리", summary: "공용 도구 보관 상태", location: "특별실", category: "불편 사항", description: "공용 실습 도구의 보관 위치를 찾기 어렵거나 정리 상태가 불편합니다. 보관 방법을 확인해 주세요.", levels: ["고등학교"], highSchoolTypes: ["특성화고"] },
];

const special: ExampleSeed[] = [
  { key: "special-access", label: "이동 편의 점검", summary: "출입·이동 경로 확인", location: "기타", category: "불편 사항", description: "학교 시설을 이동하거나 출입할 때 불편이 있습니다. 필요한 위치와 상황을 확인해 개선해 주세요.", levels: ["고등학교"], highSchoolTypes: ["특목고"] },
  { key: "special-lab", label: "전문 학습 공간 점검", summary: "전용 학습 공간 환경 확인", location: "특별실", category: "환경 문제", description: "전문 학습 공간의 환경이나 기자재 사용에 불편이 있습니다. 해당 공간의 상태를 확인해 주세요.", levels: ["고등학교"], highSchoolTypes: ["특목고"] },
];

export const FORM_EXAMPLE_LIST: FormExampleItem[] = [...shared, ...elementary, ...middle, ...high, ...vocational, ...special].map((item) => ({ ...item, isAnonymous: true }));

function schoolLevel(school: School): SchoolLevel {
  if (school.schoolName.includes("초등학교")) return "초등학교";
  if (school.schoolName.includes("중학교")) return "중학교";
  return "고등학교";
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function getRandomFormExamples(count = 4, currentLocation?: string, excludeKeys: string[] = [], school?: School, availableLocations?: string[]): FormExampleItem[] {
  const level = school ? schoolLevel(school) : null;
  const eligible = FORM_EXAMPLE_LIST.filter((item) => {
    if (item.levels && level && !item.levels.includes(level)) return false;
    if (item.highSchoolTypes && (!school?.highSchoolType || !item.highSchoolTypes.includes(school.highSchoolType))) return false;
    if (availableLocations?.length && !availableLocations.includes(item.location)) return false;
    return true;
  });
  const fresh = eligible.filter((item) => !excludeKeys.includes(item.key));
  const pool = shuffle(fresh.length >= count ? fresh : [...fresh, ...eligible.filter((item) => excludeKeys.includes(item.key))]);
  const prioritized = currentLocation ? pool.filter((item) => item.location === currentLocation) : [];
  const rest = pool.filter((item) => item.location !== currentLocation);
  return [...prioritized.slice(0, Math.min(2, count)), ...rest, ...prioritized.slice(Math.min(2, count))].slice(0, count);
}
