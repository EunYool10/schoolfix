import type { School } from "../types";

/**
 * 신고 작성 "빠른 작성 예시"
 *
 * 추천 문구일 뿐 실제 학교 시설 현황이나 접수된 신고를 나타내지 않는다.
 * 설명에는 [무엇을 적을지 · 예: 보기] 꼴의 빈칸이 있다. 예시를 고른 학생은 빈칸만 실제 상황으로 바꾸면 되고,
 * 빈칸이 남아 있으면 접수하지 않는다(findTemplateBlanks). 그래서 모든 예시에 빈칸이 하나 이상 있다.
 * 빈칸을 보기로 바꿨을 때 문장이 자연스럽도록, 빈칸 바로 뒤에는 받침에 따라 바뀌는 조사(이/가, 을/를)를 두지 않는다.
 * 어디인지(세부 위치)는 설명이 아니라 따로 있는 "세부 위치" 칸에 적도록 detailHint 로 안내한다.
 */
export interface FormExampleItem {
  key: string;
  /** 카드 제목이자 신고 제목으로 들어가는 말 */
  label: string;
  /** 카드에 보이는 한 줄 설명 */
  summary: string;
  location: string;
  category: string;
  /** "세부 위치" 칸에 보여 줄 입력 예 */
  detailHint: string;
  description: string;
  levels?: SchoolLevel[];
  highSchoolTypes?: NonNullable<School["highSchoolType"]>[];
}

type SchoolLevel = "초등학교" | "중학교" | "고등학교";

const shared: FormExampleItem[] = [
  // --- 시설 고장 ---
  { key: "light", label: "형광등 깜빡임", summary: "조명이 깜빡이거나 안 켜져요", location: "교실", category: "시설 고장", detailHint: "예: 2학년 3반 교실 뒤쪽", description: "천장 형광등이 [증상 · 예: 계속 깜빡거립니다]. [언제부터 · 예: 오늘 아침]부터 그랬고 수업 중에 눈이 피로합니다. 교체나 점검 부탁드립니다." },
  { key: "desk", label: "책걸상 흔들림", summary: "책상·의자가 흔들리거나 부서졌어요", location: "교실", category: "시설 고장", detailHint: "예: 1학년 2반 창가 셋째 줄", description: "책상(의자) [몇 개 · 예: 2개]의 다리가 [증상 · 예: 흔들려서 앉으면 기울어집니다]. 넘어질까 걱정되니 수리나 교체 부탁드립니다." },
  { key: "projector", label: "전자칠판·빔 고장", summary: "수업용 화면이 안 켜져요", location: "교실", category: "시설 고장", detailHint: "예: 2학년 1반 앞쪽", description: "수업에 쓰는 [어떤 기기 · 예: 전자칠판]에 문제가 있습니다. [증상 · 예: 전원을 눌러도 화면이 켜지지 않습니다]. 수업에 쓰지 못하고 있어 점검 부탁드립니다." },
  { key: "outlet", label: "콘센트 불량", summary: "전기가 안 들어오거나 헐거워요", location: "교실", category: "시설 고장", detailHint: "예: 교실 뒤쪽 사물함 옆", description: "콘센트에 [증상 · 예: 플러그를 꽂아도 전기가 들어오지 않습니다]. 타는 냄새나 불꽃은 [있었는지 · 예: 없었습니다]. 확인 부탁드립니다." },
  { key: "window-lock", label: "창문 잠금 고장", summary: "창문이 잘 안 닫히거나 안 잠겨요", location: "교실", category: "시설 고장", detailHint: "예: 3학년 4반 복도 쪽 창문", description: "창문 잠금장치가 [증상 · 예: 헐거워서 잠기지 않습니다]. 바람이 들어오고 창문이 빠질까 걱정됩니다. 수리 부탁드립니다." },
  { key: "door", label: "문 손잡이 고장", summary: "손잡이가 헐겁거나 빠졌어요", location: "교실", category: "시설 고장", detailHint: "예: 2학년 5반 뒷문", description: "출입문 손잡이가 [증상 · 예: 헐거워서 곧 빠질 것 같습니다]. 문을 여닫기 불편하고 손이 끼일 수 있어 점검 부탁드립니다." },
  { key: "aircon", label: "냉난방기 작동 안 됨", summary: "켜도 바람이 안 나와요", location: "교실", category: "시설 고장", detailHint: "예: 1학년 3반 천장", description: "냉난방기를 켜도 [증상 · 예: 바람이 나오지 않습니다]. [언제부터 · 예: 이번 주 월요일]부터 그랬습니다. 점검 부탁드립니다." },
  { key: "blind", label: "블라인드·커튼 고장", summary: "가림막이 안 내려가요", location: "교실", category: "시설 고장", detailHint: "예: 2학년 2반 창가", description: "창가 블라인드(커튼)가 [증상 · 예: 줄이 끊어져 내려가지 않습니다]. 햇빛 때문에 칠판이 잘 보이지 않아 수리 부탁드립니다." },
  { key: "clock", label: "교실 시계 멈춤", summary: "시계가 멈췄거나 시간이 안 맞아요", location: "교실", category: "시설 고장", detailHint: "예: 1학년 1반 칠판 위", description: "교실 시계가 [증상 · 예: 10분 정도 늦게 갑니다]. 시간을 맞추거나 건전지 교체 부탁드립니다." },
  { key: "speaker", label: "방송 스피커 이상", summary: "교내 방송이 잘 안 들려요", location: "교실", category: "시설 고장", detailHint: "예: 2학년 4반 스피커", description: "교내 방송이 [증상 · 예: 지직거려서 잘 들리지 않습니다]. 안내 방송을 놓칠 수 있어 점검 부탁드립니다." },
  { key: "leak", label: "천장 물 샘", summary: "비가 오면 천장에서 물이 떨어져요", location: "교실", category: "시설 고장", detailHint: "예: 3학년 2반 창가 쪽 천장", description: "비가 오면 천장에서 물이 [어느 정도 · 예: 한 방울씩 계속] 떨어집니다. [언제부터 · 예: 지난주 비 온 날]부터 그랬습니다. 바닥이 젖어 미끄러우니 점검 부탁드립니다." },
  { key: "sink-drain", label: "세면대 배수 막힘", summary: "물이 잘 안 빠지고 고여요", location: "화장실", category: "시설 고장", detailHint: "예: 2층 여자 화장실 왼쪽 세면대", description: "세면대 물이 잘 빠지지 않고 고여 있습니다. [언제부터 · 예: 어제]부터 그랬습니다. 배수 점검 부탁드립니다." },
  { key: "toilet-clog", label: "변기 막힘", summary: "물이 안 내려가요", location: "화장실", category: "시설 고장", detailHint: "예: 3층 남자 화장실 세 번째 칸", description: "변기가 막혀서 물이 내려가지 않습니다. [지금 상태 · 예: 물이 넘치기 직전입니다]. 확인 부탁드립니다." },
  { key: "faucet", label: "수도꼭지 물 샘", summary: "잠가도 물이 계속 나와요", location: "화장실", category: "시설 고장", detailHint: "예: 1층 화장실 가운데 세면대", description: "수도꼭지를 잠가도 [증상 · 예: 물이 계속 똑똑 떨어집니다]. 물이 낭비되고 바닥이 젖어 미끄럽습니다. 수리 부탁드립니다." },
  { key: "stall-lock", label: "화장실 칸 잠금 고장", summary: "칸 문이 안 잠겨요", location: "화장실", category: "시설 고장", detailHint: "예: 2층 여자 화장실 두 번째 칸", description: "화장실 칸 문 잠금장치가 [증상 · 예: 돌아가지 않아 잠기지 않습니다]. 안심하고 쓰기 어려워 수리 부탁드립니다." },
  { key: "water-fountain", label: "정수기 고장", summary: "물이 안 나오거나 새요", location: "복도", category: "시설 고장", detailHint: "예: 2층 복도 계단 옆", description: "정수기에서 [증상 · 예: 물이 나오지 않습니다]. 쉬는 시간에 물을 마시기 어려워 점검 부탁드립니다." },
  { key: "locker", label: "사물함 고장", summary: "사물함 문이나 잠금이 망가졌어요", location: "복도", category: "시설 고장", detailHint: "예: 3층 복도 2학년 3반 앞", description: "사물함 [번호 · 예: 12번]의 [증상 · 예: 문이 떨어져 닫히지 않습니다]. 물건을 보관하기 어려워 수리 부탁드립니다." },
  { key: "gym-hoop", label: "농구 골대 파손", summary: "골대가 흔들리거나 그물이 찢어졌어요", location: "체육관", category: "시설 고장", detailHint: "예: 체육관 무대 쪽 골대", description: "농구 골대가 [증상 · 예: 그물이 찢어져 늘어져 있습니다]. 수업이나 경기 중에 다칠 수 있어 점검 부탁드립니다." },
  { key: "goal-post", label: "축구 골대 이상", summary: "골대가 흔들리거나 그물이 찢어졌어요", location: "운동장", category: "시설 고장", detailHint: "예: 운동장 동쪽 골대", description: "축구 골대가 [증상 · 예: 바닥에 고정되지 않아 흔들립니다]. 넘어지면 크게 다칠 수 있어 확인 부탁드립니다." },
  { key: "library-light", label: "열람석 조명 고장", summary: "책상 조명이 안 켜져요", location: "도서관", category: "시설 고장", detailHint: "예: 도서관 창가 열람석 3번", description: "열람석 조명이 [증상 · 예: 켜지지 않습니다]. 책 읽기가 어려워 점검 부탁드립니다." },
  { key: "computer", label: "컴퓨터실 PC 고장", summary: "컴퓨터가 안 켜지거나 멈춰요", location: "특별실", category: "시설 고장", detailHint: "예: 컴퓨터실 3번 자리", description: "컴퓨터실 PC가 [증상 · 예: 켜지지 않습니다]. 수업 중에 쓰지 못해 점검 부탁드립니다." },
  { key: "lab-bench", label: "실험대 설비 이상", summary: "실험대 수도·가스가 이상해요", location: "특별실", category: "시설 고장", detailHint: "예: 과학실 4번 실험대", description: "실험대의 [무엇 · 예: 수도꼭지]에서 [증상 · 예: 물이 새어 바닥이 젖습니다]. 실험 중 사고가 나지 않도록 점검 부탁드립니다." },
  { key: "elevator", label: "엘리베이터 고장", summary: "멈췄거나 문이 이상해요", location: "공용공간", category: "시설 고장", detailHint: "예: 본관 엘리베이터", description: "엘리베이터가 [증상 · 예: 2층에 멈춘 채 움직이지 않습니다]. 다리를 다친 학생이 이동하기 어려워 점검 부탁드립니다." },

  // --- 안전 위험 ---
  { key: "slippery-floor", label: "복도 바닥 미끄러움", summary: "물기나 왁스 때문에 미끄러워요", location: "복도", category: "안전 위험", detailHint: "예: 1층 급식실 가는 복도", description: "복도 바닥이 [이유 · 예: 물이 고여 있어서] 미끄럽습니다. 지나가다 넘어질 뻔했습니다. 안전 조치 부탁드립니다." },
  { key: "stair-tread", label: "계단 미끄럼방지 들뜸", summary: "계단 끝 패드가 떨어졌어요", location: "계단", category: "안전 위험", detailHint: "예: 본관 2층→3층 계단", description: "계단 끝의 미끄럼 방지 패드가 [증상 · 예: 들떠서 발이 걸립니다]. 넘어질 수 있어 수리 부탁드립니다." },
  { key: "railing", label: "계단 난간 흔들림", summary: "난간이 흔들리거나 나사가 빠졌어요", location: "계단", category: "안전 위험", detailHint: "예: 별관 가운데 계단", description: "계단 난간이 [증상 · 예: 손으로 잡으면 크게 흔들립니다]. 기대면 위험할 것 같아 점검 부탁드립니다." },
  { key: "stair-dark", label: "계단 조명 어두움", summary: "어두워서 발밑이 안 보여요", location: "계단", category: "안전 위험", detailHint: "예: 체육관 쪽 계단", description: "계단 조명이 [상태 · 예: 꺼져 있어서] 오르내릴 때 발밑이 잘 보이지 않습니다. 점검 부탁드립니다." },
  { key: "ceiling", label: "천장 마감재 들뜸", summary: "천장이 내려앉을 것 같아요", location: "복도", category: "안전 위험", detailHint: "예: 3층 복도 화장실 앞", description: "천장 마감재가 [상태 · 예: 한 장 들떠서 아래로 처져 있습니다]. 떨어지면 다칠 수 있어 빠른 확인 부탁드립니다." },
  { key: "broken-glass", label: "유리 깨짐", summary: "깨진 유리 조각이 있어요", location: "교실", category: "안전 위험", detailHint: "예: 2학년 3반 앞문", description: "[어디 · 예: 출입문]의 유리가 깨져 있습니다. 조각에 다칠 수 있으니 주변 정리와 교체 부탁드립니다." },
  { key: "exposed-wire", label: "전선 노출", summary: "전선이 벗겨져 드러나 있어요", location: "복도", category: "안전 위험", detailHint: "예: 2층 복도 끝", description: "[어디 · 예: 벽 아래쪽]에 피복이 벗겨진 전선이 드러나 있습니다. 감전 위험이 있어 빠른 조치 부탁드립니다." },
  { key: "fire-exit", label: "비상구 막힘", summary: "대피 통로에 물건이 쌓였어요", location: "복도", category: "안전 위험", detailHint: "예: 3층 동쪽 비상구", description: "비상구 앞 통로에 [무엇 · 예: 책상과 상자] 같은 물건이 쌓여 있어 지나가기 어렵습니다. 불이 나면 대피에 방해가 될 수 있어 정리 부탁드립니다." },
  { key: "extinguisher", label: "소화기 점검", summary: "소화기가 없거나 낡았어요", location: "복도", category: "안전 위험", detailHint: "예: 2층 계단 옆 소화기함", description: "소화기가 [상태 · 예: 제자리에 없습니다]. 불이 났을 때 쓸 수 있도록 확인 부탁드립니다." },
  { key: "playground-hole", label: "운동장 바닥 파임", summary: "패인 곳이나 돌 조각이 있어요", location: "운동장", category: "안전 위험", detailHint: "예: 운동장 철봉 옆", description: "운동장 바닥이 [상태 · 예: 깊게 패여 물웅덩이가 생겼습니다]. 뛰다가 발목을 다칠 수 있어 정비 부탁드립니다." },
  { key: "gym-equipment", label: "체육 기구 고정 불량", summary: "기구가 쓰러질 것 같아요", location: "체육관", category: "안전 위험", detailHint: "예: 체육관 창고 앞", description: "[어떤 기구 · 예: 매트 보관대]의 고정이 풀려 쓰러질 것 같습니다. 체육 시간에 다칠까 걱정되어 점검 부탁드립니다." },
  { key: "door-closer", label: "문이 세게 닫혀요", summary: "문에 손이 끼일 것 같아요", location: "공용공간", category: "안전 위험", detailHint: "예: 본관 현관 출입문", description: "출입문이 너무 세게 닫혀서 [있었던 일 · 예: 손가락이 끼일 뻔했습니다]. 문 닫힘 장치 조절 부탁드립니다." },

  // --- 위생 문제 ---
  { key: "restroom-supply", label: "휴지·비누 없음", summary: "위생용품이 떨어졌어요", location: "화장실", category: "위생 문제", detailHint: "예: 3층 여자 화장실", description: "화장실에 [없는 것 · 예: 휴지와 손 세정제] 보충이 필요합니다. [언제부터 · 예: 오늘 아침]부터 비어 있었습니다." },
  { key: "restroom-smell", label: "화장실 악취", summary: "냄새가 심하게 나요", location: "화장실", category: "위생 문제", detailHint: "예: 1층 남자 화장실", description: "화장실에서 [무슨 냄새 · 예: 하수구 같은] 냄새가 심하게 납니다. [언제 · 예: 점심시간 뒤]에 특히 심합니다. 환기나 청소 상태 확인 부탁드립니다." },
  { key: "trash", label: "쓰레기통 넘침", summary: "쓰레기가 넘쳐 지저분해요", location: "복도", category: "위생 문제", detailHint: "예: 2층 복도 분리수거함", description: "쓰레기통이 가득 차서 주변에 쓰레기가 흩어져 있습니다. [언제 · 예: 점심시간 뒤]에 특히 심합니다. 비우는 횟수를 늘리거나 쓰레기통을 더 놓아 주세요." },
  { key: "pests", label: "벌레가 나와요", summary: "바퀴벌레·날벌레가 보여요", location: "급식실", category: "위생 문제", detailHint: "예: 급식실 배식대 근처", description: "[어떤 벌레 · 예: 바퀴벌레] 여러 마리를 [언제 · 예: 오늘 점심시간]에 봤습니다. 위생이 걱정되어 방역 부탁드립니다." },
  { key: "table-clean", label: "식탁이 지저분해요", summary: "식탁이 끈적이고 음식물이 남아 있어요", location: "급식실", category: "위생 문제", detailHint: "예: 급식실 창가 쪽 식탁", description: "급식실 식탁이 [상태 · 예: 끈적거리고 음식물이 남아 있습니다]. 식사 전에 깨끗이 닦아 주시면 좋겠습니다." },
  { key: "tray", label: "식판·수저 얼룩", summary: "식판이나 수저가 덜 씻겼어요", location: "급식실", category: "위생 문제", detailHint: "예: 급식실 수저통", description: "[무엇 · 예: 숟가락]에 [상태 · 예: 음식물 자국이 남아 있었습니다]. [언제 · 예: 오늘 점심]에 봤습니다. 세척 상태 확인 부탁드립니다." },
  { key: "mold", label: "벽 곰팡이", summary: "벽·천장에 곰팡이가 생겼어요", location: "교실", category: "위생 문제", detailHint: "예: 1학년 4반 뒤쪽 모서리", description: "벽이나 천장 모서리에 곰팡이가 [크기 · 예: 손바닥만 하게] 피어 있습니다. 냄새가 나고 건강이 걱정되어 확인 부탁드립니다." },
  { key: "water-taste", label: "정수기 물맛 이상", summary: "물에서 냄새나 이상한 맛이 나요", location: "복도", category: "위생 문제", detailHint: "예: 3층 복도 정수기", description: "정수기 물맛이 이상합니다. [어떻게 · 예: 비린 냄새가 납니다]. 필터 교체나 위생 점검 부탁드립니다." },
  { key: "nurse-bed", label: "보건실 위생", summary: "침대·비품이 깨끗하지 않아요", location: "보건·상담", category: "위생 문제", detailHint: "예: 보건실 안쪽 침대", description: "보건실 [무엇 · 예: 침대 시트]에 [상태 · 예: 얼룩이 많습니다]. 아플 때 편히 쉴 수 있도록 교체나 청소 부탁드립니다." },
  { key: "playground-litter", label: "운동장 쓰레기", summary: "운동장에 쓰레기가 많아요", location: "운동장", category: "위생 문제", detailHint: "예: 운동장 스탠드 아래", description: "운동장에 [무엇 · 예: 과자 봉지와 음료수 캔] 같은 쓰레기가 많이 버려져 있습니다. 정리하고 쓰레기통을 더 놓아 주시면 좋겠습니다." },

  // --- 환경 문제 ---
  { key: "too-hot", label: "교실이 너무 더워요", summary: "더워서 집중하기 어려워요", location: "교실", category: "환경 문제", detailHint: "예: 3학년 2반 (4층 서쪽)", description: "교실이 너무 더워서 수업에 집중하기 어렵습니다. [언제 · 예: 오후 수업 시간]에 특히 심합니다. 냉방이나 환기 상태 확인 부탁드립니다." },
  { key: "too-cold", label: "교실이 너무 추워요", summary: "추워서 손이 시려요", location: "교실", category: "환경 문제", detailHint: "예: 1학년 6반 (1층 북쪽)", description: "교실이 너무 추워서 [불편한 점 · 예: 손이 시려 필기하기 어렵습니다]. 난방 상태 확인 부탁드립니다." },
  { key: "ventilation", label: "환기가 안 돼요", summary: "공기가 답답하고 창문이 안 열려요", location: "교실", category: "환경 문제", detailHint: "예: 2학년 6반", description: "창문이 [상태 · 예: 뻑뻑해서 열리지 않아] 환기가 안 되고 공기가 답답합니다. 확인 부탁드립니다." },
  { key: "glare", label: "햇빛 눈부심", summary: "햇빛 때문에 칠판이 안 보여요", location: "교실", category: "환경 문제", detailHint: "예: 3학년 1반 창가 자리", description: "[언제 · 예: 오후]에 햇빛이 칠판 쪽으로 들어와 눈이 부시고 글씨가 잘 보이지 않습니다. 블라인드나 커튼 확인 부탁드립니다." },
  { key: "dust", label: "공기가 탁해요", summary: "먼지가 많고 답답해요", location: "학습공간", category: "환경 문제", detailHint: "예: 2층 자습실", description: "공기가 탁하고 [상태 · 예: 책상에 먼지가 금방 쌓입니다]. 공기청정기나 환기 상태 확인 부탁드립니다." },
  { key: "library-dark", label: "도서관이 어두워요", summary: "책 읽기에 조명이 부족해요", location: "도서관", category: "환경 문제", detailHint: "예: 도서관 안쪽 서가", description: "도서관 일부가 어두워서 [불편한 점 · 예: 책 제목을 읽기 어렵습니다]. 조명 확인 부탁드립니다." },
  { key: "cafeteria-air", label: "급식실 환기", summary: "덥고 음식 냄새가 가득해요", location: "급식실", category: "환경 문제", detailHint: "예: 급식실 안쪽 자리", description: "급식실 안이 [상태 · 예: 덥고 음식 냄새가 가득합니다]. 환기 상태 확인 부탁드립니다." },
  { key: "stair-window", label: "계단 창문 안 닫힘", summary: "찬바람이나 빗물이 들어와요", location: "계단", category: "환경 문제", detailHint: "예: 본관 3층 계단참 창문", description: "계단 창문이 [상태 · 예: 고장 나서 닫히지 않습니다]. 찬바람과 빗물이 계속 들어와 확인 부탁드립니다." },

  // --- 소음 문제 ---
  { key: "construction-noise", label: "공사 소음", summary: "공사 소리 때문에 수업이 안 들려요", location: "기타", category: "소음 문제", detailHint: "예: 운동장 옆 공사장", description: "공사 소음 때문에 [언제 · 예: 3교시 수업] 중에 선생님 말씀이 잘 들리지 않습니다. 공사 시간을 조정할 수 있는지 확인 부탁드립니다." },
  { key: "hallway-noise", label: "복도 소음", summary: "복도가 시끄러워 수업에 방해돼요", location: "복도", category: "소음 문제", detailHint: "예: 2층 복도 계단 앞", description: "복도에서 [무슨 소리 · 예: 뛰어다니고 소리치는] 소리가 커서 옆 교실 수업에 방해가 됩니다. 확인 부탁드립니다." },
  { key: "machine-noise", label: "기계 소음", summary: "기계에서 큰 소리가 계속 나요", location: "교실", category: "소음 문제", detailHint: "예: 2학년 3반 천장 냉난방기", description: "[무엇 · 예: 냉난방기]에서 [무슨 소리 · 예: 덜컹거리는] 소리가 계속 나서 수업에 집중하기 어렵습니다. 점검 부탁드립니다." },
  { key: "speaker-loud", label: "방송 소리가 너무 커요", summary: "스피커 음량이 너무 커요", location: "교실", category: "소음 문제", detailHint: "예: 1학년 2반 스피커", description: "교내 방송 소리가 너무 커서 [불편한 점 · 예: 귀가 아플 정도입니다]. 음량 조절 부탁드립니다." },
  { key: "upstairs", label: "위층 소음", summary: "위층에서 쿵쿵 울려요", location: "교실", category: "소음 문제", detailHint: "예: 2학년 1반 교실 천장 쪽", description: "위층에서 [무슨 소리 · 예: 의자 끄는] 소리가 계속 울려 수업에 방해가 됩니다. [언제 · 예: 1교시]에 특히 심합니다. 확인 부탁드립니다." },
  { key: "gym-echo", label: "체육관 울림", summary: "소리가 울려 말이 잘 안 들려요", location: "체육관", category: "소음 문제", detailHint: "예: 체육관 무대 앞", description: "체육관에서 소리가 크게 울려 [불편한 점 · 예: 선생님 설명이 잘 들리지 않습니다]. 개선 방법을 검토해 주세요." },
  { key: "library-noise", label: "도서관 소음", summary: "조용히 공부하기 어려워요", location: "도서관", category: "소음 문제", detailHint: "예: 도서관 입구 근처 자리", description: "도서관에서 [무슨 소리 · 예: 출입문이 쾅 닫히는] 소리가 자주 나서 조용히 공부하기 어렵습니다. 확인 부탁드립니다." },

  // --- 불편 사항 ---
  { key: "lunch-queue", label: "급식 줄 혼잡", summary: "대기 줄이 길고 부딪혀요", location: "급식실", category: "불편 사항", detailHint: "예: 급식실 입구", description: "급식 시간에 줄이 [어디까지 · 예: 복도 계단 앞]까지 길어져 이동이 불편하고 부딪힐 뻔합니다. 대기 동선 확인 부탁드립니다." },
  { key: "restroom-queue", label: "화장실이 붐벼요", summary: "쉬는 시간에 줄이 너무 길어요", location: "화장실", category: "불편 사항", detailHint: "예: 2층 여자 화장실", description: "쉬는 시간마다 화장실 줄이 [어느 정도 · 예: 복도까지 이어질 만큼] 길어서 수업에 늦을 때가 있습니다. 쓸 수 없는 칸이 있는지 확인해 주세요." },
  { key: "umbrella", label: "우산꽂이 부족", summary: "비 오는 날 우산 둘 곳이 없어요", location: "공용공간", category: "불편 사항", detailHint: "예: 본관 현관", description: "비 오는 날 우산을 둘 곳이 부족해서 [불편한 점 · 예: 복도 바닥이 젖어 미끄럽습니다]. 우산꽂이를 더 놓아 주시면 좋겠습니다." },
  { key: "charging", label: "충전 콘센트 부족", summary: "노트북·태블릿 충전이 어려워요", location: "학습공간", category: "불편 사항", detailHint: "예: 2층 자습실", description: "쓸 수 있는 콘센트가 [몇 개 · 예: 2개]밖에 없어 노트북이나 태블릿을 충전하기 어렵습니다. 멀티탭이나 콘센트 추가를 검토해 주세요." },
  { key: "wifi", label: "와이파이 끊김", summary: "인터넷이 자주 끊겨요", location: "학습공간", category: "불편 사항", detailHint: "예: 3층 학습실", description: "와이파이가 [증상 · 예: 몇 분마다 끊깁니다]. [언제 · 예: 점심시간]에 특히 심해서 수업 자료를 열기 어렵습니다. 확인 부탁드립니다." },
  { key: "bike-rack", label: "자전거 거치대 부족", summary: "자전거 세울 곳이 부족해요", location: "운동장", category: "불편 사항", detailHint: "예: 후문 자전거 보관대", description: "자전거 거치대가 [상태 · 예: 아침마다 꽉 차서] 자전거를 세워 둘 곳이 없습니다. 거치대 추가를 검토해 주세요." },
  { key: "shade", label: "그늘·쉼터 부족", summary: "운동장에 쉴 그늘이 없어요", location: "운동장", category: "불편 사항", detailHint: "예: 운동장 스탠드 쪽", description: "운동장에 쉴 수 있는 그늘이 부족해서 [언제 · 예: 체육 시간]에 더위로 힘듭니다. 그늘막이나 쉼터를 검토해 주세요." },
  { key: "signage", label: "안내 표지 부족", summary: "가는 길을 찾기 어려워요", location: "공용공간", category: "불편 사항", detailHint: "예: 별관 1층 입구", description: "[찾기 어려운 곳 · 예: 별관 음악실] 가는 길을 찾기 어렵습니다. 안내 표지판이 있으면 좋겠습니다." },
  { key: "counseling", label: "보건·상담실 안내", summary: "운영 시간·이용 방법을 몰라요", location: "보건·상담", category: "불편 사항", detailHint: "예: 상담실 앞", description: "보건실(상담실) [모르는 것 · 예: 운영 시간과 이용 방법] 안내가 잘 보이지 않습니다. 잘 보이는 곳에 안내해 주세요." },
  { key: "desk-height", label: "책상 높이 불편", summary: "책상·의자 높이가 안 맞아요", location: "교실", category: "불편 사항", detailHint: "예: 1학년 5반", description: "책상과 의자 높이가 맞지 않아 [불편한 점 · 예: 오래 앉으면 허리가 아픕니다]. 높이 조절이나 교체를 검토해 주세요." },
  { key: "accessibility", label: "휠체어·부상 이동 불편", summary: "턱이나 계단 때문에 다니기 어려워요", location: "공용공간", category: "불편 사항", detailHint: "예: 본관 현관 출입구", description: "[걸리는 곳 · 예: 현관 출입구 턱] 때문에 휠체어를 타거나 다리를 다친 학생이 지나가기 어렵습니다. 경사로나 다른 이동 방법을 검토해 주세요." },
];

const elementary: FormExampleItem[] = [
  { key: "elementary-playground", label: "놀이기구 파손", summary: "놀이기구가 부서졌거나 날카로워요", location: "운동장", category: "안전 위험", detailHint: "예: 운동장 미끄럼틀", description: "[어떤 놀이기구 · 예: 미끄럼틀] [상태 · 예: 아래쪽 판이 깨져서 날카롭습니다]. 놀다가 다칠 것 같아 확인 부탁드립니다.", levels: ["초등학교"] },
  { key: "elementary-door", label: "문틈 손 끼임", summary: "문틈에 손가락이 끼일 것 같아요", location: "교실", category: "안전 위험", detailHint: "예: 2학년 1반 앞문", description: "교실 문을 여닫을 때 [있었던 일 · 예: 친구 손가락이 문틈에 끼일 뻔했습니다]. 손 끼임 방지 장치를 확인해 주세요.", levels: ["초등학교"] },
  { key: "elementary-shoe-rack", label: "신발장 고장", summary: "신발장 문이나 선반이 망가졌어요", location: "복도", category: "시설 고장", detailHint: "예: 1층 3학년 신발장", description: "신발장 [어디 · 예: 3학년 2반 칸]의 [상태 · 예: 선반이 내려앉았습니다]. 신발을 넣기 어려워 고쳐 주세요.", levels: ["초등학교"] },
  { key: "elementary-hook", label: "가방 걸이 빠짐", summary: "책상 옆 가방 걸이가 빠졌어요", location: "교실", category: "시설 고장", detailHint: "예: 1학년 3반", description: "책상 옆 가방 걸이가 [몇 개 · 예: 3개] 빠져서 가방을 걸 수 없습니다. 고쳐 주세요.", levels: ["초등학교"] },
  { key: "elementary-handwash", label: "손 씻기 불편", summary: "세면대가 높거나 비누가 없어요", location: "화장실", category: "불편 사항", detailHint: "예: 1층 저학년 화장실", description: "세면대에서 손을 씻기 불편합니다. [이유 · 예: 세면대가 높아서 손이 잘 닿지 않습니다]. 발판 같은 방법을 검토해 주세요.", levels: ["초등학교"] },
  { key: "elementary-sandbox", label: "모래놀이터 위생", summary: "모래에 쓰레기나 날카로운 게 있어요", location: "운동장", category: "위생 문제", detailHint: "예: 놀이터 모래밭", description: "모래놀이터 모래 속에 [무엇 · 예: 깨진 유리 조각] 같은 위험한 물건이 섞여 있습니다. 놀다가 다칠 것 같아 정리 부탁드립니다.", levels: ["초등학교"] },
];

const middle: FormExampleItem[] = [
  { key: "middle-crowd", label: "쉬는 시간 통행 혼잡", summary: "복도·계단에 학생이 몰려요", location: "복도", category: "안전 위험", detailHint: "예: 2층 계단 앞 복도", description: "쉬는 시간마다 학생이 몰려서 [있었던 일 · 예: 계단에서 밀려 넘어질 뻔했습니다]. 안전하게 다닐 수 있도록 방법을 검토해 주세요.", levels: ["중학교"] },
  { key: "middle-changing", label: "탈의 공간 부족", summary: "체육복 갈아입을 곳이 마땅치 않아요", location: "체육관", category: "불편 사항", detailHint: "예: 체육관 탈의실", description: "체육복으로 갈아입을 곳이 [상태 · 예: 따로 없어 화장실에서 갈아입습니다]. 탈의 공간을 마련해 주세요.", levels: ["중학교"] },
  { key: "middle-study", label: "열람실 공부 불편", summary: "조명·좌석이 불편해요", location: "도서관", category: "환경 문제", detailHint: "예: 도서관 열람실", description: "도서관 열람실에서 공부하기 불편합니다. [이유 · 예: 조명이 어둡고 의자가 삐걱거립니다]. 확인 부탁드립니다.", levels: ["중학교"] },
];

const high: FormExampleItem[] = [
  { key: "high-lab", label: "실습 기자재 점검", summary: "실습 기자재가 작동하지 않아요", location: "특별실", category: "시설 고장", detailHint: "예: 컴퓨터실 3번 자리", description: "실습 기자재에 문제가 있습니다. [기자재와 증상 · 예: 측정 장비 화면이 나오지 않습니다]. 실습 전에 점검 부탁드립니다.", levels: ["고등학교"] },
  { key: "high-study-room", label: "자습실 좌석 불편", summary: "자습실 의자·책상이 망가졌어요", location: "학습공간", category: "불편 사항", detailHint: "예: 4층 자습실 창가", description: "자습실 [문제 · 예: 의자 등받이가 부서져] 오래 공부하기 어렵습니다. 확인 부탁드립니다.", levels: ["고등학교"] },
  { key: "high-night-path", label: "야간 귀갓길 조명", summary: "야자 끝나고 나가는 길이 어두워요", location: "운동장", category: "안전 위험", detailHint: "예: 정문으로 가는 길", description: "야간 자율학습이 끝난 뒤 나가는 길이 어두워서 [불편한 점 · 예: 발밑이 보이지 않아 무섭습니다]. 가로등이나 조명 점검 부탁드립니다.", levels: ["고등학교"] },
];

const vocational: FormExampleItem[] = [
  { key: "vocational-guard", label: "실습 장비 보호장치", summary: "장비 덮개·안전장치가 빠졌어요", location: "특별실", category: "안전 위험", detailHint: "예: 기계실습실 탁상 드릴", description: "실습 장비 [장비 · 예: 탁상 드릴]의 보호 덮개가 [상태 · 예: 빠져 있습니다]. 다칠 수 있어 사용 전에 점검 부탁드립니다.", levels: ["고등학교"], highSchoolTypes: ["특성화고"] },
  { key: "vocational-power", label: "실습실 전원 문제", summary: "전원이 자꾸 차단되거나 뜨거워요", location: "특별실", category: "시설 고장", detailHint: "예: 전기실습실 5번 실습대", description: "실습대 전원이 [증상 · 예: 자주 차단됩니다]. 과열이나 감전 위험이 없는지 점검 부탁드립니다.", levels: ["고등학교"], highSchoolTypes: ["특성화고"] },
  { key: "vocational-ppe", label: "보호구 부족", summary: "보안경·장갑 등이 부족해요", location: "특별실", category: "안전 위험", detailHint: "예: 용접실습실", description: "실습 때 쓸 [보호구 · 예: 보안경과 장갑] 수가 부족하거나 낡았습니다. 보충 부탁드립니다.", levels: ["고등학교"], highSchoolTypes: ["특성화고"] },
  { key: "vocational-fumes", label: "실습실 환기", summary: "연기나 냄새가 빠지지 않아요", location: "특별실", category: "환경 문제", detailHint: "예: 전자실습실", description: "실습 중 생기는 [무엇 · 예: 납땜 연기] 때문에 머리가 아픕니다. 환기 장치 확인 부탁드립니다.", levels: ["고등학교"], highSchoolTypes: ["특성화고"] },
  { key: "vocational-storage", label: "실습 도구 정리", summary: "공용 도구를 찾기 어려워요", location: "특별실", category: "불편 사항", detailHint: "예: 공구 보관함", description: "공용 실습 도구가 [상태 · 예: 제자리에 없고 섞여 있어] 찾기 어렵습니다. 보관 방법을 정해 주시면 좋겠습니다.", levels: ["고등학교"], highSchoolTypes: ["특성화고"] },
];

const special: FormExampleItem[] = [
  { key: "special-lab", label: "전문 실험 기자재", summary: "실험 장비가 고장 났어요", location: "특별실", category: "시설 고장", detailHint: "예: 생물실험실", description: "실험 기자재에 문제가 있습니다. [기자재와 증상 · 예: 현미경 2대의 초점 조절이 안 됩니다]. 실험을 진행하기 어려워 점검 부탁드립니다.", levels: ["고등학교"], highSchoolTypes: ["특목고"] },
];

export const FORM_EXAMPLE_LIST: FormExampleItem[] = [...shared, ...elementary, ...middle, ...high, ...vocational, ...special];

/** 목록에 맞는 예시가 없을 때 쓰는 설명 틀. 장소·문제 종류·제목은 건드리지 않고 설명만 채운다. */
export const FREE_WRITING_TEMPLATE = "[무엇이 · 예: 강당 무대 조명]에 문제가 있습니다. [어떤 상태 · 예: 절반만 켜집니다]. [언제부터 · 예: 지난주]부터 그랬고, [불편한 점 · 예: 행사 연습을 하기 어렵습니다]. 확인 부탁드립니다.";

// ---------------------------------------------------------------------------
// 빈칸
// ---------------------------------------------------------------------------

/** [무엇을 적을지 · 예: 보기]. 학생이 보기만 고쳐 쓰고 대괄호를 남겨도 빈칸으로 본다. */
const BLANK_PATTERN = /\[([^[\]\n]{1,30}?) · 예: [^[\]\n]{0,60}\]/g;

export interface TemplateBlank {
  /** 빈칸 안의 질문 (예: "언제부터") */
  prompt: string;
  start: number;
  end: number;
}

/** 아직 실제 내용으로 바꾸지 않은 예시 빈칸들. 하나라도 있으면 접수하지 않는다. */
export function findTemplateBlanks(text: string): TemplateBlank[] {
  return [...text.matchAll(BLANK_PATTERN)].map((match) => ({
    prompt: match[1].trim(),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

// ---------------------------------------------------------------------------
// 고르기
// ---------------------------------------------------------------------------

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

/** 이 학교에 맞는 예시 전부 (학교급·고교 유형·학교에 있는 장소) */
export function eligibleExamples(school?: School, availableLocations?: string[]): FormExampleItem[] {
  const level = school ? schoolLevel(school) : null;
  return FORM_EXAMPLE_LIST.filter((item) => {
    if (item.levels && level && !item.levels.includes(level)) return false;
    if (item.highSchoolTypes && (!school?.highSchoolType || !item.highSchoolTypes.includes(school.highSchoolType))) return false;
    if (availableLocations?.length && !availableLocations.includes(item.location)) return false;
    return true;
  });
}

export interface PickOptions {
  count?: number;
  /** 지금 고른 장소. 그 장소 예시를 먼저(최대 절반) 보여 준다. */
  location?: string;
  /** 이 문제 종류만 */
  category?: string | null;
  /** 방금 보여 준 예시. 되도록 다른 것을 고른다. */
  exclude?: string[];
  school?: School;
  availableLocations?: string[];
}

/** 보여 줄 예시를 고른다. 장소를 골랐으면 그 장소 예시를 먼저, 나머지는 문제 종류가 고르게 섞이도록 고른다. */
export function pickExamples({ count = 6, location, category, exclude = [], school, availableLocations }: PickOptions = {}): FormExampleItem[] {
  const all = eligibleExamples(school, availableLocations);
  const pool = category ? all.filter((item) => item.category === category) : all;
  const fresh = shuffle(pool.filter((item) => !exclude.includes(item.key)));
  // 남은 예시가 모자라면 방금 보여 준 것도 다시 쓴다.
  const candidates = fresh.length >= count ? fresh : [...fresh, ...shuffle(pool.filter((item) => exclude.includes(item.key)))];
  const picked = location ? candidates.filter((item) => item.location === location).slice(0, Math.ceil(count / 2)) : [];
  const byCategory = new Map<string, FormExampleItem[]>();
  for (const item of candidates) {
    if (!picked.includes(item)) byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
  }
  while (picked.length < count && [...byCategory.values()].some((list) => list.length)) {
    for (const list of byCategory.values()) {
      const next = list.shift();
      if (next && picked.length < count) picked.push(next);
    }
  }
  return picked;
}
