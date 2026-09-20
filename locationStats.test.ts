/**
 * 위치 정규화·집계 검증
 *
 * 실행: npm run test:location
 *
 * OpenAI 를 쓰지 않는 기능이므로 전부 순수 함수 검증이다 (무료·즉시·결정론적).
 * 필터 연동(§6)도 여기서 함께 확인한다 — 목록과 통계가 같은 규칙을 써야 하기 때문이다.
 */

import {
  aggregateLocationStats,
  normalizeLocationText,
  parseLocationParts,
  reportLocationLabel,
  type LocationStatInput,
} from "./locationStats";
import { filterReports, INITIAL_FILTERS } from "./src/utils/reportFilter";

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

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

function report(
  location: string,
  locationDetail: string | null,
  extra: Partial<LocationStatInput> = {}
): LocationStatInput {
  return {
    location,
    locationDetail,
    category: "시설 고장",
    riskLevel: null,
    createdAt: daysAgo(1),
    ...extra,
  };
}

// ===========================================================================
console.log("\n[1] 문자열 정규화");
// ===========================================================================

check(
  "특수문자와 중복 공백을 정리한다",
  normalizeLocationText("  본관(3층)   화장실 ") === "본관 3층 화장실",
  normalizeLocationText("  본관(3층)   화장실 ")
);

check(
  "전각 문자를 표준형으로 바꾼다",
  normalizeLocationText("본관　３층 화장실") === "본관 3층 화장실",
  normalizeLocationText("본관　３층 화장실")
);

check("빈 값은 빈 문자열이 된다", normalizeLocationText(null) === "");

const parts = parseLocationParts("본관3층 남자화장실");
check(
  "건물·층·성별을 분리한다",
  parts.building === "본관" && parts.floor === "3층" && parts.gender === "남" && parts.place === "화장실",
  JSON.stringify(parts)
);

check(
  "지하층을 별도 층으로 읽는다",
  parseLocationParts("별관 지하1층 기계실").floor === "지하1층",
  parseLocationParts("별관 지하1층 기계실").floor ?? "null"
);

check(
  "'운동장' 을 건물 번호로 오인하지 않는다",
  parseLocationParts("운동장").building === null
);

check(
  "상세 위치가 고정 위치를 포함하면 중복해서 붙이지 않는다",
  reportLocationLabel(report("화장실", "본관 3층 화장실")) === "본관 3층 화장실",
  reportLocationLabel(report("화장실", "본관 3층 화장실"))
);

check(
  "상세 위치가 없으면 고정 위치만 쓴다",
  reportLocationLabel(report("운동장", null)) === "운동장"
);

// ===========================================================================
console.log("\n[2] 같은 장소 통합 — 근거가 있을 때만");
// ===========================================================================

{
  // §26 시나리오 1
  const stats = aggregateLocationStats([
    report("화장실", "본관 3층 화장실"),
    report("화장실", "본관3층 화장실"),
    report("화장실", "3층 화장실"),
  ]);

  check("표기가 다른 같은 장소를 하나로 묶는다", stats.length === 1, `그룹 ${stats.length}개`);
  check("묶인 건수가 실제 신고 수와 같다", stats[0]?.reportCount === 3, `${stats[0]?.reportCount}건`);
  check(
    "가장 구체적인 표기를 대표 이름으로 쓴다",
    stats[0]?.name === "본관 3층 화장실",
    stats[0]?.name
  );
  check(
    "어떤 표기들이 묶였는지 근거를 남긴다",
    stats[0]?.mergedFrom.length === 3,
    JSON.stringify(stats[0]?.mergedFrom)
  );
}

{
  // §26 시나리오 2 — 건물이 다르면 절대 합치지 않는다
  const stats = aggregateLocationStats([
    report("화장실", "본관 3층 화장실"),
    report("화장실", "별관 3층 화장실"),
  ]);
  check("건물이 다르면 분리한다", stats.length === 2, `그룹 ${stats.length}개`);
}

{
  // 건물 후보가 둘이면 건물 없는 표기를 어느 쪽으로도 보내지 않는다
  const stats = aggregateLocationStats([
    report("화장실", "본관 3층 화장실"),
    report("화장실", "별관 3층 화장실"),
    report("화장실", "3층 화장실"),
  ]);
  check("건물을 특정할 수 없으면 통합하지 않는다", stats.length === 3, `그룹 ${stats.length}개`);
}

{
  // 성별 표기가 다르면 같은 곳인지 확인할 수 없다
  const stats = aggregateLocationStats([
    report("화장실", "3층 화장실"),
    report("화장실", "3층 남자화장실"),
  ]);
  check("성별 표기가 다르면 분리한다", stats.length === 2, `그룹 ${stats.length}개`);
}

{
  // 상세 위치를 적지 않은 신고는 어느 건물인지 단서가 전혀 없다
  const stats = aggregateLocationStats([
    report("화장실", null),
    report("화장실", null),
    report("화장실", "본관 화장실"),
  ]);
  check(
    "상세가 없는 신고를 건물 그룹으로 흡수하지 않는다",
    stats.length === 2,
    JSON.stringify(stats.map((s) => `${s.name}:${s.reportCount}`))
  );
}

{
  const stats = aggregateLocationStats([
    report("화장실", "3층 화장실"),
    report("복도", "3층 화장실 앞 복도"),
  ]);
  check("고정 위치 분류가 다르면 통합하지 않는다", stats.length === 2, `그룹 ${stats.length}개`);
}

{
  // "기타" 는 장소를 가리키는 값이 아니다. 앞에 붙이면 이름이 이상해지고 같은 장소가 갈라진다.
  const stats = aggregateLocationStats([
    report("기타", "본관 3층 화장실"),
    report("화장실", "본관 3층 화장실"),
  ]);
  check(
    "'기타' 는 장소 이름에 붙이지 않는다",
    stats.length === 1 && stats[0].name === "본관 3층 화장실",
    JSON.stringify(stats.map((s) => s.name))
  );
  check("'기타' 로 고른 신고도 같은 장소로 합쳐진다", stats[0]?.reportCount === 2);
  check(
    "대표 분류는 구체적인 쪽을 쓴다",
    stats[0]?.baseLocation === "화장실",
    String(stats[0]?.baseLocation)
  );
}

{
  const stats = aggregateLocationStats([report("기타", null)]);
  check("상세가 없으면 '기타' 가 그대로 남는다", stats[0]?.name === "기타", String(stats[0]?.name));
}

// ===========================================================================
console.log("\n[3] 집계 값은 실제 신고에서만 나온다");
// ===========================================================================

{
  const stats = aggregateLocationStats([
    report("화장실", "본관 3층 화장실", {
      category: "위생 문제",
      riskLevel: "높음",
      createdAt: "2026-09-18T01:00:00.000Z",
    }),
    report("화장실", "본관 3층 화장실", {
      category: "위생 문제",
      riskLevel: "긴급",
      createdAt: "2026-09-20T02:00:00.000Z",
    }),
    report("화장실", "본관 3층 화장실", {
      category: "시설 고장",
      riskLevel: "낮음",
      createdAt: "2026-09-15T02:00:00.000Z",
    }),
  ]);

  const top = stats[0];
  check("총 신고 건수", top?.reportCount === 3, `${top?.reportCount}`);
  check("주요 카테고리", top?.mainCategory === "위생 문제", String(top?.mainCategory));
  check("주요 카테고리 건수", top?.mainCategoryCount === 2, `${top?.mainCategoryCount}`);
  check("높음 이상 위험도 건수", top?.highRiskCount === 2, `${top?.highRiskCount}`);
  check("긴급 건수", top?.urgentCount === 1, `${top?.urgentCount}`);
  check(
    "최근 신고 날짜는 실제 신고 중 가장 최근",
    top?.latestReportAt === "2026-09-20T02:00:00.000Z",
    String(top?.latestReportAt)
  );
}

{
  const stats = aggregateLocationStats([
    report("운동장", null),
    report("운동장", null),
    report("도서관", null),
  ]);
  check("건수 내림차순으로 정렬한다", stats[0]?.name === "운동장" && stats[1]?.name === "도서관");
}

check("신고가 없으면 빈 배열을 돌려준다", aggregateLocationStats([]).length === 0);
check("배열이 아니면 빈 배열을 돌려준다", aggregateLocationStats(null as never).length === 0);

// ===========================================================================
console.log("\n[4] 필터 연동 — 목록과 통계가 같은 규칙을 쓴다");
// ===========================================================================

interface Row {
  id: string;
  location: string;
  locationDetail: string | null;
  category: string;
  description: string;
  riskLevel: string | null;
  status: string;
  createdAt: string;
}

const rows: Row[] = [
  {
    id: "R1",
    location: "화장실",
    locationDetail: "본관 3층 화장실",
    category: "위생 문제",
    description: "세면대가 막혔어요",
    riskLevel: "높음",
    status: "pending",
    createdAt: daysAgo(2),
  },
  {
    id: "R2",
    location: "운동장",
    locationDetail: null,
    category: "안전 위험",
    description: "바닥이 파였어요",
    riskLevel: "긴급",
    status: "pending",
    createdAt: daysAgo(3),
  },
  {
    id: "R3",
    location: "화장실",
    locationDetail: "본관 3층 화장실",
    category: "위생 문제",
    description: "물이 고여요",
    riskLevel: "낮음",
    status: "completed",
    createdAt: daysAgo(20),
  },
];

const statsOf = (list: Row[]) =>
  aggregateLocationStats(
    list.map((r) => ({
      location: r.location,
      locationDetail: r.locationDetail,
      category: r.category,
      riskLevel: r.riskLevel,
      createdAt: r.createdAt,
    }))
  );

{
  const week = filterReports(rows, { ...INITIAL_FILTERS, dateRange: "WEEK" });
  const stats = statsOf(week);
  check("최근 7일 필터 — 대상 신고 수", week.length === 2, `${week.length}건`);
  check(
    "최근 7일 필터 — 위치별 건수가 줄어든다",
    stats.find((s) => s.name === "본관 3층 화장실")?.reportCount === 1,
    JSON.stringify(stats.map((s) => `${s.name}:${s.reportCount}`))
  );
}

{
  const stats = statsOf(filterReports(rows, { ...INITIAL_FILTERS, category: "위생 문제" }));
  check(
    "카테고리 필터 — 해당 카테고리만 집계",
    stats.length === 1 && stats[0].reportCount === 2,
    JSON.stringify(stats.map((s) => `${s.name}:${s.reportCount}`))
  );
}

{
  const stats = statsOf(filterReports(rows, { ...INITIAL_FILTERS, risk: "긴급" }));
  check(
    "위험도 필터 — 해당 등급만 집계",
    stats.length === 1 && stats[0].name === "운동장" && stats[0].urgentCount === 1,
    JSON.stringify(stats.map((s) => `${s.name}:${s.reportCount}`))
  );
}

{
  const stats = statsOf(
    filterReports(rows, { ...INITIAL_FILTERS, category: "위생 문제", risk: "긴급" })
  );
  check("조건에 맞는 신고가 없으면 빈 결과", stats.length === 0, `그룹 ${stats.length}개`);
}

{
  const stats = statsOf(filterReports(rows, { ...INITIAL_FILTERS, search: "세면대" }));
  check("검색어 필터도 통계에 반영된다", stats.length === 1 && stats[0].reportCount === 1);
}

// ===========================================================================
console.log(`\n${"=".repeat(60)}`);
console.log(`통과 ${passed} / 실패 ${failed}`);
if (failures.length) {
  console.log("\n실패 목록:");
  failures.forEach((f) => console.log(`  - ${f}`));
}
console.log("=".repeat(60));

process.exit(failed > 0 ? 1 : 0);
