/**
 * AI 사전 확인 검증
 *
 * 실행: npm run test:clarify
 *
 * 1부 — 순수 함수 검증 (API 호출 없음, 무료·즉시)
 *        응답 스키마 검증, 질문 1개 강제, 환각 차단, 대화 상태 유지
 * 2부 — 실제 모델 검증 (OPENAI_API_KEY 필요, 유료)
 *        §26 의 애매/명확 신고 시나리오
 */

import dotenv from "dotenv";
dotenv.config({ path: [".env.local", ".env"] });

import {
  analyzeClarity,
  composeDescription,
  createClarifySession,
  getClarifySession,
  dropClarifySession,
  hasInventedNumbers,
  isVerbatimFrom,
  toSingleQuestion,
  validateClarifyResponse,
  ClarifyValidationError,
  MAX_CLARIFY_QUESTIONS,
} from "./reportClarify";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (err) {
    return err instanceof ClarifyValidationError;
  }
}

// ===========================================================================
function runUnitTests() {
  console.log("\n[1] 질문은 한 번에 하나만 (§12)");

  check(
    "여러 질문이 오면 첫 질문만 남긴다",
    toSingleQuestion("어디인가요? 언제부터인가요? 어떤 문제인가요?") === "어디인가요?",
    toSingleQuestion("어디인가요? 언제부터인가요? 어떤 문제인가요?")
  );

  check(
    "줄바꿈으로 나열된 질문도 하나로 줄인다",
    toSingleQuestion("어느 장소인가요?\n몇 명이 불편한가요?") === "어느 장소인가요?",
    toSingleQuestion("어느 장소인가요?\n몇 명이 불편한가요?")
  );

  check(
    "물음표가 없어도 첫 문장만 쓴다",
    toSingleQuestion("장소를 알려주세요. 시간도 알려주세요.") === "장소를 알려주세요.",
    toSingleQuestion("장소를 알려주세요. 시간도 알려주세요.")
  );

  check("빈 문자열은 빈 문자열", toSingleQuestion("   ") === "");

  console.log("\n[2] 환각 차단 (§17)");

  check(
    "학생 문장에 있는 표현은 통과한다",
    isVerbatimFrom("본관 3층 화장실", "본관 3층 화장실 바닥에 물이 고여 있어요")
  );

  check(
    "띄어쓰기가 달라도 같은 표현으로 본다",
    isVerbatimFrom("본관3층화장실", "본관 3층 화장실 바닥에 물이 고여 있어요")
  );

  check(
    "학생이 쓰지 않은 위치는 거부한다",
    !isVerbatimFrom("별관 2층 화장실", "화장실이 더러워요")
  );

  check(
    "없던 숫자를 만들어내면 잡아낸다",
    hasInventedNumbers("오전 9시부터 학생 20명이 불편함", "화장실 바닥에 물이 고여 있어요")
  );

  check(
    "학생이 쓴 숫자는 문제 없다",
    !hasInventedNumbers("3층 화장실 바닥에 물이 고임", "3층 화장실 바닥에 물이 계속 고여 있어요")
  );

  console.log("\n[3] AI 응답 검증 (§13)");

  const source = "본관 3층 화장실 바닥에 물이 계속 고여 있어요";

  {
    const v = validateClarifyResponse(
      {
        status: "ready",
        question: null,
        missing_field: null,
        location_detail: "본관 3층 화장실",
        problem: "바닥에 물이 계속 고임",
      },
      source,
      "test"
    );
    check("충분한 신고는 ready", v.status === "ready");
    check("ready 면 질문이 없다", v.question === null && v.missing_field === null);
    check("발췌된 상세 위치는 유지된다", v.location_detail === "본관 3층 화장실");
  }

  {
    const v = validateClarifyResponse(
      {
        status: "ready",
        question: "그래도 언제부터인가요?",
        missing_field: "situation",
        location_detail: null,
        problem: null,
      },
      source,
      "test"
    );
    check("ready 인데 질문이 붙어 오면 질문을 버린다", v.question === null && v.missing_field === null);
  }

  {
    const v = validateClarifyResponse(
      {
        status: "ready",
        question: null,
        missing_field: null,
        // 학생 문장에 없는 위치를 만들어낸 경우
        location_detail: "별관 2층 남자화장실",
        problem: "오전 9시부터 학생 20명이 불편",
      },
      source,
      "test"
    );
    check("지어낸 상세 위치는 버린다", v.location_detail === null, String(v.location_detail));
    check("없던 숫자가 들어간 요약은 버린다", v.problem === null, String(v.problem));
  }

  {
    const v = validateClarifyResponse(
      {
        status: "needs_more_information",
        question: "어느 장소인가요? 언제부터인가요?",
        missing_field: "location",
        location_detail: null,
        problem: null,
      },
      "학교가 별로예요",
      "test"
    );
    check("추가 질문은 1개로 줄어든다", v.question === "어느 장소인가요?", String(v.question));
    check("missing_field 가 유지된다", v.missing_field === "location");
  }

  {
    const v = validateClarifyResponse(
      {
        status: "needs_more_information",
        question: "무엇이 문제인가요?",
        missing_field: "이상한값",
        location_detail: null,
        problem: null,
      },
      "여기 이상함",
      "test"
    );
    check("허용되지 않은 missing_field 는 기본값으로 대체한다", v.missing_field === "situation");
  }

  check(
    "알 수 없는 status 는 거부한다",
    throws(() =>
      validateClarifyResponse(
        { status: "maybe", question: null, missing_field: null, location_detail: null, problem: null },
        source,
        "test"
      )
    )
  );

  check(
    "질문 없이 추가 정보를 요구하면 거부한다",
    throws(() =>
      validateClarifyResponse(
        {
          status: "needs_more_information",
          question: "   ",
          missing_field: "location",
          location_detail: null,
          problem: null,
        },
        source,
        "test"
      )
    )
  );

  check("객체가 아니면 거부한다", throws(() => validateClarifyResponse("ready", source, "test")));

  console.log("\n[4] 대화 상태 유지 (§15)");

  {
    const session = createClarifySession("화장실", "위생 문제", "화장실이 이상해요.");
    check("세션이 조회된다", getClarifySession(session.id)?.id === session.id);

    session.turns.push({
      question: "화장실에서 구체적으로 어떤 문제가 있나요?",
      answer: "바닥에 물이 계속 고여 있어요.",
    });

    const composed = composeDescription(session);
    check("최초 신고 내용이 남아 있다", composed.includes("화장실이 이상해요."));
    check("AI 질문이 남아 있다", composed.includes("어떤 문제가 있나요?"));
    check("사용자 답변이 남아 있다", composed.includes("바닥에 물이 계속 고여 있어요."));

    dropClarifySession(session.id);
    check("접수 후 세션은 사라진다", getClarifySession(session.id) === null);
  }

  check("없는 세션 id 는 null", getClarifySession("없는값") === null);
  check("질문 한도가 정의되어 있다", MAX_CLARIFY_QUESTIONS >= 1 && MAX_CLARIFY_QUESTIONS <= 5);
}

// ===========================================================================
// 2부 — 실제 모델 (§26 시나리오)
// ===========================================================================

const AMBIGUOUS: [string, string, string][] = [
  // [설명, 고정 위치, 본문]
  ["학교가 불편해요", "기타", "학교가 불편해요."],
  ["화장실이 이상해요", "화장실", "화장실이 이상해요."],
  ["진짜 불편함", "기타", "진짜 불편함"],
];

const CLEAR: [string, string, string][] = [
  ["3층 화장실 물 고임", "화장실", "3층 화장실 바닥에 물이 계속 고여 있어요."],
  ["2층 복도 전등 깜빡임", "복도", "2층 복도 전등이 계속 깜빡여요."],
  ["운동장 바닥 파임 (날짜 없음)", "운동장", "운동장 바닥이 크게 파였어요."],
];

async function runLiveTests(apiKey: string) {
  console.log("\n[5] 실제 모델 — 애매한 신고는 추가 질문");

  for (const [label, location, description] of AMBIGUOUS) {
    try {
      const v = await analyzeClarity(
        { location, category: "불편 사항", description, turns: [] },
        apiKey
      );
      check(`"${label}" → 추가 질문`, v.status === "needs_more_information", `status=${v.status}`);
      check(
        `"${label}" → 질문이 정확히 1개`,
        Boolean(v.question) && (v.question!.match(/\?/g) || []).length <= 1,
        String(v.question)
      );
      check(
        `"${label}" → 위치를 지어내지 않는다`,
        v.location_detail === null,
        String(v.location_detail)
      );
    } catch (err) {
      check(`"${label}" 호출`, false, err instanceof Error ? err.message : String(err));
    }
  }

  console.log("\n[6] 실제 모델 — 명확한 신고는 바로 처리");

  for (const [label, location, description] of CLEAR) {
    try {
      const v = await analyzeClarity(
        { location, category: "시설 고장", description, turns: [] },
        apiKey
      );
      check(`"${label}" → 추가 질문 없음`, v.status === "ready", `status=${v.status}`);
      check(
        `"${label}" → 없던 숫자를 만들지 않는다`,
        v.problem === null || !hasInventedNumbers(v.problem, description),
        String(v.problem)
      );
    } catch (err) {
      check(`"${label}" 호출`, false, err instanceof Error ? err.message : String(err));
    }
  }

  console.log("\n[7] 실제 모델 — 답변을 받으면 다시 판단한다");

  try {
    const v = await analyzeClarity(
      {
        location: "화장실",
        category: "위생 문제",
        description: "화장실이 이상해요.",
        turns: [
          {
            question: "화장실에서 구체적으로 어떤 문제가 있나요?",
            answer: "본관 3층 화장실 바닥에 물이 계속 고여 있어요.",
          },
        ],
      },
      apiKey
    );
    check("답변 후에는 접수 가능해진다", v.status === "ready", `status=${v.status}`);
    check(
      "답변에서 상세 위치를 발췌한다",
      v.location_detail === null || isVerbatimFrom(v.location_detail, "본관 3층 화장실 바닥에 물이 계속 고여 있어요."),
      String(v.location_detail)
    );
  } catch (err) {
    check("재판단 호출", false, err instanceof Error ? err.message : String(err));
  }
}

// ===========================================================================
async function main() {
  runUnitTests();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("\n⚠ OPENAI_API_KEY 가 없어 2부(실제 모델 검증)를 건너뜁니다.");
  } else {
    await runLiveTests(apiKey);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`통과 ${passed} / 실패 ${failed}`);
  if (failures.length) {
    console.log("\n실패 목록:");
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log("=".repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main();
