/**
 * 신고서 작성 예시 — 설명 칸·제목·세부 위치 칸의 회색 안내 문구.
 *
 * 신고서에 들어올 때마다 하나를 무작위로 고르고, 장소 종류를 고르면 그 장소의 예시로 바꾼다.
 * 학교마다 층 배치가 달라 특정 실 이름은 쓰지 않고 'N층 복도'처럼 어느 학교에나 있는 위치로 적는다.
 * {n} 은 층 번호(1~4)로 바뀐다.
 */
export interface WritingExample {
  /** 이 예시가 어울리는 장소 종류 (학교 장소 종류 이름과 같아야 한다) */
  type: string;
  title: string;
  what: string;
  since: string;
  how: string;
  /** 세부 위치 칸 예시 */
  detail: string;
}

export const WRITING_EXAMPLES: readonly WritingExample[] = [
  { type: "복도", title: "{n}층 복도 형광등 깜빡임", what: "{n}층 복도 끝 천장 형광등이 계속 깜빡거려요", since: "지난주 월요일부터", how: "지나갈 때마다 눈이 부시고 어지러워요", detail: "{n}층 복도 끝, 계단 쪽" },
  { type: "복도", title: "{n}층 복도 창문 잠금 고장", what: "{n}층 복도 가운데 창문이 잠기지 않아요", since: "어제 청소 시간부터", how: "바람이 계속 들어와서 복도가 추워요", detail: "{n}층 복도 가운데 창문" },
  { type: "복도", title: "{n}층 복도 정수기 물 샘", what: "{n}층 복도 정수기 아래로 물이 새요", since: "오늘 아침부터", how: "정수기 앞 바닥이 젖어서 미끄러워요", detail: "{n}층 복도 정수기 앞" },
  { type: "화장실", title: "{n}층 여자 화장실 변기 막힘", what: "{n}층 여자 화장실 두 번째 칸 변기 물이 안 내려가요", since: "오늘 1교시 쉬는 시간부터", how: "쓸 수 있는 칸이 줄어서 쉬는 시간마다 줄이 길어요", detail: "{n}층 여자 화장실 두 번째 칸" },
  { type: "화장실", title: "{n}층 남자 화장실 수도꼭지 고장", what: "{n}층 남자 화장실 세면대 수도꼭지가 안 잠겨요", since: "이틀 전부터", how: "물이 계속 흘러서 바닥이 미끄러워요", detail: "{n}층 남자 화장실 왼쪽 세면대" },
  { type: "화장실", title: "{n}층 화장실 손 건조기 고장", what: "{n}층 남자 화장실 손 건조기가 안 켜져요", since: "지난주부터", how: "손을 말릴 데가 없어서 옷에 닦고 나와요", detail: "{n}층 남자 화장실 입구 쪽" },
  { type: "계단", title: "{n}층 계단 미끄럼 방지 테이프 떨어짐", what: "{n}층 계단의 미끄럼 방지 테이프가 떨어졌어요", since: "지난주부터", how: "비 오는 날 내려가다 미끄러질 뻔했어요", detail: "{n}층 계단 중간쯤" },
  { type: "계단", title: "{n}층 계단 손잡이 흔들림", what: "{n}층 계단 손잡이가 크게 흔들려요", since: "지난달부터", how: "잡고 내려가기가 무서워요", detail: "{n}층 계단참 손잡이" },
  { type: "교실", title: "{n}층 교실 앞문 손잡이 빠짐", what: "{n}층 맨 끝 교실 앞문 손잡이가 빠졌어요", since: "어제 점심시간부터", how: "문이 안 닫혀서 수업 중에 복도 소리가 다 들려요", detail: "{n}층 복도 맨 끝 교실 앞문" },
  { type: "교실", title: "{n}층 교실 에어컨 물 샘", what: "{n}층 교실 에어컨에서 물이 떨어져요", since: "이번 주 화요일부터", how: "창가 자리 책상이 젖어서 앉을 수가 없어요", detail: "{n}층 교실 창가 쪽 에어컨" },
  { type: "교실", title: "{n}층 교실 블라인드 줄 끊어짐", what: "{n}층 교실 창가 블라인드 줄이 끊어졌어요", since: "어제부터", how: "햇빛이 칠판에 비쳐서 글씨가 안 보여요", detail: "{n}층 교실 창가 두 번째 창문" },
  { type: "급식실", title: "급식실 바닥 타일 깨짐", what: "급식실 정수기 옆 바닥 타일이 깨져 있어요", since: "지난주 금요일부터", how: "식판 들고 지나가다 걸려 넘어질 뻔했어요", detail: "급식실 정수기 옆 바닥" },
  { type: "급식실", title: "급식실 식탁 흔들림", what: "급식실 창가 쪽 식탁 하나가 심하게 흔들려요", since: "이번 주 월요일부터", how: "국이 쏟아질까 봐 그 자리에 앉기 어려워요", detail: "급식실 창가 쪽 세 번째 식탁" },
  { type: "운동장", title: "운동장 축구 골대 그물 찢어짐", what: "운동장 축구 골대 그물이 찢어졌어요", since: "지난달부터", how: "체육 시간에 공이 자꾸 밖으로 나가서 주우러 다녀요", detail: "운동장 왼쪽 축구 골대" },
  { type: "운동장", title: "운동장 스탠드 계단 깨짐", what: "운동장 스탠드 맨 아래 계단 모서리가 깨졌어요", since: "지난주부터", how: "앉으려다 발이 걸려서 넘어질 것 같아요", detail: "운동장 스탠드 맨 아래 칸" },
  { type: "체육관", title: "체육관 바닥 마루 들뜸", what: "체육관 농구 골대 아래 바닥 마루가 들떠 있어요", since: "지난주부터", how: "뛰다가 발이 걸려서 다칠 것 같아요", detail: "체육관 농구 골대 아래" },
  { type: "도서관", title: "도서실 창가 형광등 나감", what: "도서실 창가 쪽 형광등이 나갔어요", since: "어제부터", how: "그 자리에서 책 읽기가 너무 어두워요", detail: "도서실 창가 쪽 열람석" },
  { type: "특별실", title: "{n}층 실습실 콘센트 불꽃", what: "{n}층 실습실 창가 쪽 콘센트에서 불꽃이 튀어요", since: "오늘 3교시부터", how: "노트북 충전하다가 놀라서 쓰기가 무서워요", detail: "{n}층 실습실 창가 쪽 콘센트" },
  { type: "특별실", title: "{n}층 실습실 컴퓨터 안 켜짐", what: "{n}층 실습실 뒷줄 컴퓨터 두 대가 안 켜져요", since: "지난주 수요일부터", how: "실습 시간에 둘이서 한 대를 같이 써요", detail: "{n}층 실습실 뒷줄 오른쪽" },
  { type: "보건·상담", title: "보건실 침대 커튼 빠짐", what: "보건실 침대 옆 커튼이 레일에서 빠졌어요", since: "이번 주부터", how: "누워 있을 때 밖에서 다 보여서 불편해요", detail: "보건실 안쪽 침대" },
  { type: "학습공간", title: "자습실 책상 조명 고장", what: "자습실 창가 쪽 책상 조명이 안 켜져요", since: "어제 방과후 시간부터", how: "저녁에 공부할 때 너무 어두워요", detail: "자습실 창가 쪽 자리" },
  { type: "공용공간", title: "{n}층 휴게 공간 의자 흔들림", what: "{n}층 휴게 공간 의자 다리가 흔들려요", since: "지난주부터", how: "앉으면 넘어질 것 같아서 아무도 못 앉아요", detail: "{n}층 휴게 공간 창가 의자" },
  { type: "기타", title: "1층 현관 우산꽂이 부서짐", what: "1층 현관 우산꽂이가 부서졌어요", since: "지난주 비 오던 날부터", how: "우산 둘 곳이 없어서 복도 바닥이 다 젖어요", detail: "1층 현관 신발장 옆" },
];

export interface PickedExample {
  title: string;
  detail: string;
  /** 설명 칸 예시 — "무엇이 / 언제부터 / 얼마나 불편한지" 세 줄 */
  description: string;
}

const fraction = (x: number) => x - Math.floor(x);

/**
 * seed(0 이상 1 미만, 들어올 때마다 새로 뽑는다)로 예시 하나를 고른다.
 * 같은 seed·같은 장소면 늘 같은 예시라서, 다시 그려도 글자가 바뀌지 않는다.
 * 고른 장소 종류의 예시가 없으면 전체에서 고른다.
 */
export function pickWritingExample(locationType: string, seed: number): PickedExample {
  const matching = WRITING_EXAMPLES.filter((example) => example.type === locationType);
  const pool = matching.length > 0 ? matching : WRITING_EXAMPLES;
  const s = fraction(Math.abs(seed));
  const example = pool[Math.floor(s * pool.length) % pool.length];
  const floor = 1 + (Math.floor(fraction(s * 7919 + 0.37) * 4) % 4);
  const fill = (text: string) => text.split("{n}").join(String(floor));
  return {
    title: fill(example.title),
    detail: fill(example.detail),
    description: `무엇이: ${fill(example.what)}\n언제부터: ${fill(example.since)}\n얼마나 불편한지: ${fill(example.how)}`,
  };
}
