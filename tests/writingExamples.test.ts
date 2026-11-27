/**
 * 신고서 작성 예시·세부 위치 규칙 검증 — 실행: npm run test:writing
 */

import { WRITING_EXAMPLES, pickWritingExample } from "../src/data/writingExamples";
import { isDetailOptional } from "../src/data/locationRules";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`); }
}

const seeds = Array.from({ length: 200 }, (_, i) => (i + 0.5) / 200);

check("모든 예시에 {n} 이 남지 않음", WRITING_EXAMPLES.every((example) =>
  seeds.slice(0, 20).every((seed) => {
    const picked = pickWritingExample(example.type, seed);
    return ![picked.title, picked.detail, picked.description].some((text) => text.includes("{") || text.includes("}"));
  })
));
check("설명은 세 줄 (무엇이·언제부터·얼마나 불편한지)", seeds.every((seed) => {
  const lines = pickWritingExample("", seed).description.split("\n");
  return lines.length === 3 && lines[0].startsWith("무엇이: ") && lines[1].startsWith("언제부터: ") && lines[2].startsWith("얼마나 불편한지: ");
}));
check("층은 1~4층만", seeds.every((seed) => {
  const floors = [...pickWritingExample("", seed).description.matchAll(/(\d+)층/g)].map((m) => Number(m[1]));
  return floors.every((floor) => floor >= 1 && floor <= 4);
}));
check("장소를 고르면 그 장소 예시 (화장실)", seeds.every((seed) => pickWritingExample("화장실", seed).title.includes("화장실")));
check("장소를 고르면 그 장소 예시 (운동장)", seeds.every((seed) => pickWritingExample("운동장", seed).title.includes("운동장")));
check("예시가 없는 장소면 전체에서 고름", pickWritingExample("없는장소", 0.3).description.length > 0);
check("같은 seed·장소면 같은 예시", pickWritingExample("복도", 0.42).description === pickWritingExample("복도", 0.42).description);
check("들어올 때마다 다양하게 나옴", new Set(seeds.map((seed) => pickWritingExample("", seed).description)).size >= 20);
check("학교 기본 장소 종류마다 예시가 있음", ["교실", "복도", "화장실", "계단", "급식실", "체육관", "운동장", "도서관", "특별실", "기타"]
  .every((type) => WRITING_EXAMPLES.some((example) => example.type === type)));

check("창의경영고 복도는 세부 위치 선택", isDetailOptional("cem-h", "복도"));
check("창의경영고 운동장은 세부 위치 선택", isDetailOptional("cem-h", "운동장"));
check("창의경영고 화장실은 세부 위치 필요", !isDetailOptional("cem-h", "화장실"));
check("다른 학교 복도는 세부 위치 필요", !isDetailOptional("kmit-h", "복도"));
check("학교·장소가 없으면 필요", !isDetailOptional(null, "복도") && !isDetailOptional("cem-h", undefined));

console.log(`\n통과 ${passed} / 실패 ${failed}`);
process.exit(failed > 0 ? 1 : 0);
