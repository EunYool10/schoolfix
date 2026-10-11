/**
 * 빠른 작성 예시 검증 — 실행: npm run test:examples
 *
 * 예시 문구는 손으로 쓰는 데이터라 틀리기 쉽다. 학교에 없는 장소, 없는 문제 종류, 짝이 안 맞는 빈칸,
 * 빈칸을 채웠을 때 어색해지는 조사, 어떤 학교에는 예시가 거의 안 보이는 경우를 여기서 걸러 낸다.
 */

import fs from "fs";
import { eligibleExamples, findTemplateBlanks, FORM_EXAMPLE_LIST, FREE_WRITING_TEMPLATE, pickExamples } from "./formExamples";
import { ISSUE_CATEGORIES, type School } from "../types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

type SeedSchool = School & { locationTypes?: Array<{ type: string }>; locations?: Array<{ type: string }> };
const seed = JSON.parse(fs.readFileSync(new URL("../../schools.seed.json", import.meta.url), "utf8")) as SeedSchool[];
const locationTypesOf = (school: SeedSchool) => [...new Set([...(school.locationTypes ?? []).map((entry) => entry.type), ...(school.locations ?? []).map((entry) => entry.type)])];
const seedLocationTypes = new Set(seed.flatMap(locationTypesOf));

/** 빈칸을 보기 내용으로 바꾼 문장 */
const fillWithHints = (text: string) => text.replace(/\[[^[\]\n]+? · 예: ([^[\]\n]*)\]/g, "$1");

console.log("\n[데이터]");
const keys = FORM_EXAMPLE_LIST.map((item) => item.key);
check(`예시 ${FORM_EXAMPLE_LIST.length}개 (60개 이상)`, FORM_EXAMPLE_LIST.length >= 60);
check("key 가 겹치지 않음", new Set(keys).size === keys.length, keys.filter((key, index) => keys.indexOf(key) !== index).join(", "));
const badCategory = FORM_EXAMPLE_LIST.filter((item) => !(ISSUE_CATEGORIES as readonly string[]).includes(item.category) || item.category === "기타");
check("문제 종류는 '기타'가 아닌 실제 분류", badCategory.length === 0, badCategory.map((item) => item.key).join(", "));
const badLocation = FORM_EXAMPLE_LIST.filter((item) => !seedLocationTypes.has(item.location));
check("장소는 학교 위치 유형 중 하나", badLocation.length === 0, badLocation.map((item) => `${item.key}:${item.location}`).join(", "));
for (const location of seedLocationTypes) {
  if (location === "기타") continue;
  check(`'${location}' 예시가 있음`, FORM_EXAMPLE_LIST.some((item) => item.location === location));
}
for (const category of ISSUE_CATEGORIES.filter((name) => name !== "기타")) {
  check(`'${category}' 예시 5개 이상`, FORM_EXAMPLE_LIST.filter((item) => item.category === category).length >= 5);
}
const longLabel = FORM_EXAMPLE_LIST.filter((item) => item.label.length > 12);
check("카드 제목은 12자 이하 (휴대폰 두 줄 카드)", longLabel.length === 0, longLabel.map((item) => item.label).join(", "));
const longSummary = FORM_EXAMPLE_LIST.filter((item) => item.summary.length > 20);
check("카드 설명은 20자 이하", longSummary.length === 0, longSummary.map((item) => item.summary).join(", "));
const badHint = FORM_EXAMPLE_LIST.filter((item) => !/^예: \S/.test(item.detailHint));
check("세부 위치 안내는 '예: ' 로 시작", badHint.length === 0, badHint.map((item) => item.key).join(", "));

console.log("\n[빈칸]");
const noBlank = FORM_EXAMPLE_LIST.filter((item) => findTemplateBlanks(item.description).length === 0);
check("모든 예시에 빈칸이 하나 이상 (그대로 접수되지 않게)", noBlank.length === 0, noBlank.map((item) => item.key).join(", "));
const strayBracket = FORM_EXAMPLE_LIST.filter((item) => {
  const rest = findTemplateBlanks(item.description).reduceRight((text, blank) => text.slice(0, blank.start) + text.slice(blank.end), item.description);
  return /[[\]]/.test(rest);
});
check("빈칸 꼴이 아닌 대괄호가 없음", strayBracket.length === 0, strayBracket.map((item) => item.key).join(", "));
// 빈칸 뒤에 받침에 따라 바뀌는 조사가 오면 학생이 바꿔 쓴 말과 어긋난다 (예: "[무엇]이" 에 "창문" → "창문이" 지만 "의자" → "의자이").
const particleAfterBlank = FORM_EXAMPLE_LIST.filter((item) => findTemplateBlanks(item.description).some((blank) => /^[이가을를은는와과로]/.test(item.description.slice(blank.end))));
check("빈칸 바로 뒤에 이/가·을/를·은/는·와/과·로 가 없음", particleAfterBlank.length === 0, particleAfterBlank.map((item) => item.key).join(", "));
const badFill = FORM_EXAMPLE_LIST.filter((item) => {
  const filled = fillWithHints(item.description);
  return findTemplateBlanks(filled).length > 0 || /[[\]]|\s{2}|\.\./.test(filled) || filled.trim().length < 20;
});
check("보기로 채우면 빈칸·대괄호·겹친 공백 없이 문장이 됨", badFill.length === 0, badFill.map((item) => `${item.key}: ${fillWithHints(item.description)}`).join(" | "));
const longPrompt = FORM_EXAMPLE_LIST.flatMap((item) => findTemplateBlanks(item.description)).filter((blank) => blank.prompt.length > 8);
check("빈칸 질문은 8자 이하 (버튼 이름으로 씀)", longPrompt.length === 0, longPrompt.map((blank) => blank.prompt).join(", "));

const sample = "형광등이 [증상 · 예: 계속 깜빡거립니다]. [언제부터 · 예: 오늘 아침]부터 그랬습니다.";
const blanks = findTemplateBlanks(sample);
check("빈칸 두 개를 찾음", blanks.length === 2);
check("빈칸 위치가 대괄호 처음부터 끝까지", blanks.every((blank) => sample[blank.start] === "[" && sample[blank.end - 1] === "]"));
check("빈칸 질문", blanks.map((blank) => blank.prompt).join(",") === "증상,언제부터");
check("보기만 고쳐 쓰고 대괄호를 남겨도 빈칸", findTemplateBlanks("형광등이 [증상 · 예: 아예 안 켜짐]. 교체해 주세요.").length === 1);
check("학생이 쓴 대괄호는 빈칸이 아님", findTemplateBlanks("[3반] 형광등이 [중요] 깜빡거립니다.").length === 0);
check("다 채우면 빈칸 없음", findTemplateBlanks("형광등이 계속 깜빡거립니다. 오늘 아침부터 그랬습니다.").length === 0);
check("직접 쓰기 틀에 빈칸 네 개", findTemplateBlanks(FREE_WRITING_TEMPLATE).length === 4);
check("직접 쓰기 틀도 보기로 채우면 문장이 됨", !/[[\]]/.test(fillWithHints(FREE_WRITING_TEMPLATE)));

console.log("\n[학교별]");
const schoolLevel = (school: School) => school.schoolName.includes("초등학교") ? "초등학교" : school.schoolName.includes("중학교") ? "중학교" : "고등학교";
let thinSchools: string[] = [];
let narrowSchools: string[] = [];
let wrongLevel: string[] = [];
let wrongLocation: string[] = [];
for (const school of seed) {
  const types = locationTypesOf(school);
  const list = eligibleExamples(school, types);
  if (list.length < 24) thinSchools.push(`${school.schoolName}(${list.length})`);
  if (new Set(list.map((item) => item.category)).size < 6) narrowSchools.push(school.schoolName);
  if (list.some((item) => item.levels && !item.levels.includes(schoolLevel(school)))) wrongLevel.push(school.schoolName);
  if (list.some((item) => item.highSchoolTypes && !item.highSchoolTypes.includes(school.highSchoolType as never))) wrongLevel.push(school.schoolName);
  if (list.some((item) => !types.includes(item.location))) wrongLocation.push(school.schoolName);
}
check(`학교 ${seed.length}곳 모두 예시 24개 이상`, thinSchools.length === 0, thinSchools.join(", "));
check("학교마다 여섯 가지 문제 종류 예시가 모두 있음", narrowSchools.length === 0, narrowSchools.join(", "));
check("다른 학교급·고교 유형 예시가 섞이지 않음", wrongLevel.length === 0, wrongLevel.join(", "));
check("학교에 없는 장소의 예시는 보이지 않음", wrongLocation.length === 0, wrongLocation.join(", "));
const elementarySchool = seed.find((school) => schoolLevel(school) === "초등학교")!;
const vocationalSchool = seed.find((school) => school.highSchoolType === "특성화고")!;
const generalHigh = seed.find((school) => school.highSchoolType === "일반고")!;
check("초등학교에는 초등 예시가 보임", eligibleExamples(elementarySchool, locationTypesOf(elementarySchool)).some((item) => item.key.startsWith("elementary-")));
check("특성화고에는 실습 예시가 보임", eligibleExamples(vocationalSchool, locationTypesOf(vocationalSchool)).some((item) => item.key.startsWith("vocational-")));
check("일반고에는 특성화고 예시가 안 보임", !eligibleExamples(generalHigh, locationTypesOf(generalHigh)).some((item) => item.key.startsWith("vocational-")));

console.log("\n[고르기]");
const school = generalHigh;
const types = locationTypesOf(school);
let sizeOk = true, uniqueOk = true, spreadOk = true, categoryOk = true, excludeOk = true, locationOk = true;
for (let i = 0; i < 300; i++) {
  const picked = pickExamples({ count: 6, school, availableLocations: types });
  if (picked.length !== 6) sizeOk = false;
  if (new Set(picked.map((item) => item.key)).size !== picked.length) uniqueOk = false;
  if (new Set(picked.map((item) => item.category)).size < 5) spreadOk = false;

  const safety = pickExamples({ count: 6, category: "안전 위험", school, availableLocations: types });
  if (safety.length !== 6 || safety.some((item) => item.category !== "안전 위험")) categoryOk = false;

  const next = pickExamples({ count: 6, exclude: picked.map((item) => item.key), school, availableLocations: types });
  if (next.some((item) => picked.some((prev) => prev.key === item.key))) excludeOk = false;

  const inRestroom = pickExamples({ count: 6, location: "화장실", school, availableLocations: types });
  if (inRestroom.filter((item) => item.location === "화장실").length < 3 || inRestroom.length !== 6) locationOk = false;
}
check("여섯 개를 고름", sizeOk);
check("같은 예시가 두 번 나오지 않음", uniqueOk);
check("문제 종류가 고르게 섞임 (다섯 종류 이상)", spreadOk);
check("문제 종류로 거르기", categoryOk);
check("'다른 예시 보기' 는 방금 본 예시를 빼고 고름", excludeOk);
check("장소를 고르면 그 장소 예시가 절반 이상", locationOk);
const fewNoise = pickExamples({ count: 6, category: "소음 문제", exclude: FORM_EXAMPLE_LIST.map((item) => item.key), school, availableLocations: types });
check("남은 예시가 모자라면 방금 본 것도 다시 보여 줌", fewNoise.length === Math.min(6, eligibleExamples(school, types).filter((item) => item.category === "소음 문제").length));

console.log(`\n${"=".repeat(60)}`);
console.log(`통과 ${passed} / 실패 ${failed}`);
if (failures.length) {
  console.log("\n실패 목록:");
  failures.forEach((f) => console.log(`  - ${f}`));
}
console.log("=".repeat(60));

process.exit(failed > 0 ? 1 : 0);
