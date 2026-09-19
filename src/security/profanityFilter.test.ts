/**
 * 욕설 필터 검증 — 실행: npm run test:filter
 *
 * 두 방향을 모두 확인한다.
 *  1) 강한 욕설·패드립·성적 비속어와 그 우회 시도는 차단되는가
 *  2) 정상적인 학교 신고와 일반적인 감정 표현은 통과하는가 (오탐 방지)
 */

import { checkProfanity, normalizeText } from "./profanityFilter";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function expectBlocked(text: string, why = "") {
  const r = checkProfanity(text);
  if (r.blocked) {
    passed++;
    console.log(`  ✓ 차단  "${text}"  [${r.categories.join(",")}]`);
  } else {
    failed++;
    failures.push(`차단 실패: "${text}" ${why}`);
    console.log(`  ✗ 통과됨(차단되어야 함)  "${text}"`);
  }
}

function expectAllowed(text: string, why = "") {
  const r = checkProfanity(text);
  if (!r.blocked) {
    passed++;
    console.log(`  ✓ 허용  "${text}"`);
  } else {
    failed++;
    failures.push(`오탐: "${text}" -> ${r.categories.join(",")} ${why}`);
    console.log(`  ✗ 오탐(허용되어야 함)  "${text}"  [${r.categories.join(",")}]`);
  }
}

console.log("\n=== 1) 차단되어야 하는 입력 ===\n");

console.log("-- 심한 욕설 --");
expectBlocked("시발 학교 왜 이래");
expectBlocked("씨발 진짜 짜증나");
expectBlocked("지랄하지 마라");
expectBlocked("개새끼들아");

console.log("\n-- 심각한 모욕 --");
expectBlocked("이런 병신같은 시설");
expectBlocked("찐따같은 학교");

console.log("\n-- 패드립 --");
expectBlocked("니애미 어디갔냐");
expectBlocked("느금마 불러와");
expectBlocked("엄마뒤짐");

console.log("\n-- 노골적 성적 비속어 --");
expectBlocked("섹스하고 싶다");

console.log("\n-- 공백 우회 (§33) --");
expectBlocked("씨 발", "공백 삽입");
expectBlocked("시 발 진짜");
expectBlocked("병 신 같은");

console.log("\n-- 특수문자 우회 (§33) --");
expectBlocked("씨.발", "마침표 삽입");
expectBlocked("씨-발", "하이픈 삽입");
expectBlocked("씨_발");
expectBlocked("씨*발");
expectBlocked("병.신");

console.log("\n-- 자모 축약 --");
expectBlocked("ㅆㅂ 진짜");
expectBlocked("ㅂㅅ 같네");

// 알려진 한계: "씨이이이발" 처럼 모음 음절을 끼워 넣는 우회는 현재 잡지 못한다.
// 모음을 구분자로 허용하면 "보이지 않아요" 가 "보지" 로 오탐되므로 의도적으로 제외했다.
// (§19 — 정상 신고를 통과시키는 것을 우선한다)

console.log("\n\n=== 2) 허용되어야 하는 입력 (오탐 방지) ===\n");

console.log("-- 스펙에 명시된 정상 신고 (§15, §33) --");
expectAllowed("화장실이 미친 듯이 더워요.");
expectAllowed("시설이 너무 미친 것처럼 불편해요.");

console.log("\n-- 일반적인 불만·감정 표현 --");
expectAllowed("복도가 너무 시끄러워서 짜증나요.");
expectAllowed("에어컨이 고장나서 진짜 힘들어요.");
expectAllowed("너무 불편하고 화가 납니다.");
expectAllowed("최악입니다. 빨리 고쳐주세요.");

console.log("\n-- '보지/자지' 가 정상 단어의 일부인 경우 --");
expectAllowed("칠판이 잘 보지 못할 정도로 흐려요.");
expectAllowed("뒷자리에서는 화면을 보지 못합니다.");
expectAllowed("위험하니 만지지 말고 보지 마세요.");
expectAllowed("아이들이 놀라 자지러지게 울었어요.");

console.log("\n-- '새끼' 가 정상 문맥인 경우 --");
expectAllowed("학교에 고양이 새끼가 들어왔어요.");

console.log("\n-- 실제 신고 데이터 샘플 --");
expectAllowed("본관 2층 복도 바닥 타일이 심하게 들떠 있어 지나가는 학생들이 발에 걸려 넘어질 위험이 높습니다.");
expectAllowed("중앙 계단 3층 방향 논슬립 미끄럼 방지 패드가 마모되어 비 오는 날 낙상 사고 우려가 있습니다.");
expectAllowed("1층 남학생 화장실 세면대 배수관 누수로 바닥에 물이 고여 미끄럽고 비누가 떨어졌습니다.");
expectAllowed("도서관 열람실 형광등이 계속 깜빡거리며 미세한 소음이 발생하여 학습에 집중하기 어렵습니다.");
expectAllowed("급식실 배식 대기 줄 공간이 협소하여 혼잡하고 식수대 수압이 약해 이용하기 불편합니다.");
expectAllowed("체육관 벽면 안전 보호 쿠션이 일부 분리되어 떨어져 있습니다.");

console.log("\n-- 빈 값 처리 --");
expectAllowed("");
expectAllowed("   ");

console.log("\n\n=== 3) 정규화 동작 확인 ===\n");
const cases: [string, string][] = [
  ["  여러   공백   정리  ", "여러 공백 정리"],
  ["ＡＢＣ", "abc"],
];
for (const [input, expected] of cases) {
  const actual = normalizeText(input);
  if (actual === expected) {
    passed++;
    console.log(`  ✓ "${input}" -> "${actual}"`);
  } else {
    failed++;
    failures.push(`정규화: "${input}" -> "${actual}" (기대 "${expected}")`);
    console.log(`  ✗ "${input}" -> "${actual}" (기대 "${expected}")`);
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`통과 ${passed} / 실패 ${failed}`);
if (failures.length) {
  console.log("\n실패 목록:");
  failures.forEach((f) => console.log(`  - ${f}`));
}
console.log("=".repeat(60));

process.exit(failed > 0 ? 1 : 0);
