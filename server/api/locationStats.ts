/**
 * SchoolFix 위치 통계 — 정규화와 집계의 단일 출처
 *
 * "어느 장소에서 문제가 가장 많이 발생하는가" 를 실제 DB 의 신고 데이터로만 계산한다.
 * OpenAI 를 호출하지 않는다. 통계는 결정론적이어야 하고, 매 조회마다 비용이 들면 안 된다.
 *
 * 핵심 원칙
 *  1. 화면에 나가는 모든 숫자·날짜는 전달받은 신고 배열에서 계산한다. 하드코딩·추정값이 없다.
 *  2. 정규화는 "확실할 때만" 합친다. 애매하면 원래 표기를 별도 위치로 남긴다.
 *  3. 건물이 다르면(본관/별관) 절대 합치지 않는다.
 *  4. 화장실 성별 표기처럼 같은 곳인지 확인할 수 없는 차이도 합치지 않는다.
 *
 * 위치 문자열의 출처
 *  - location        : 신고 폼의 고정 선택값 (SCHOOL_LOCATIONS 중 하나). 항상 존재한다.
 *  - locationDetail  : 학생이 직접 적었거나, AI 사전 확인 단계가 학생 문장에서
 *                      그대로 발췌한 상세 위치. 없을 수 있다.
 *
 * 집계 대상은 `${location} ${locationDetail}` 이며, detail 이 없으면 location 뿐이다.
 */

/** 집계에 필요한 최소 형태. 공개 DTO(toPublicReport) 가 이 모양을 그대로 만족한다. */
export interface LocationStatInput {
  location: string;
  locationDetail?: string | null;
  category: string;
  riskLevel?: string | null;
  createdAt: string;
}

export interface LocationStatistic {
  /** 화면에 표시할 대표 위치명 */
  name: string;
  /** 대표 위치가 속한 고정 위치 분류 (SCHOOL_LOCATIONS 중 하나) */
  baseLocation: string;
  /** 이 위치의 총 신고 건수 */
  reportCount: number;
  /** 가장 많이 발생한 카테고리. 신고가 있으면 반드시 값이 있다. */
  mainCategory: string | null;
  mainCategoryCount: number;
  /** 긴급 + 높음 건수 */
  highRiskCount: number;
  /** 긴급 건수 */
  urgentCount: number;
  /** 가장 최근 신고의 createdAt (ISO). 실제 신고가 없으면 이 항목 자체가 없다. */
  latestReportAt: string;
  /**
   * 하나로 묶인 원본 표기들. 표기가 하나뿐이면 길이 1이다.
   * 왜 합쳐졌는지 사용자가 확인할 수 있도록 근거로 남긴다.
   */
  mergedFrom: string[];
}

// ---------------------------------------------------------------------------
// 1단계 — 명백한 문자열 정규화
// ---------------------------------------------------------------------------

/** 건물 이름으로 인정하는 표기. 여기에 없는 단어는 건물로 취급하지 않는다. */
const BUILDING_WORDS = [
  "본관",
  "별관",
  "신관",
  "구관",
  "후관",
  "동관",
  "서관",
  "남관",
  "북관",
  "제1별관",
  "제2별관",
];

/** "3동", "제2동" 처럼 번호로 구분되는 건물 */
const BUILDING_NUMBER_RE = /(?:제)?(\d+)\s*동(?![물작])/;

/** "지하 2층", "3층" */
const FLOOR_RE = /(지하)?\s*(\d+)\s*층/;

/** 화장실 성별 표기. 같은 층이어도 남/여는 서로 다른 장소다. */
const GENDER_PATTERNS: [RegExp, string][] = [
  [/남(자|학생)?\s*화장실/, "남"],
  [/여(자|학생)?\s*화장실/, "여"],
];

/**
 * 표기 흔들림을 없앤다.
 *  - 전각/호환 문자를 표준형으로 (NFKC)
 *  - 괄호·따옴표·구분자 등 의미 없는 특수문자를 공백으로
 *  - 연속 공백을 하나로
 *
 * 문장 전체의 공백을 지우지는 않는다. 토큰 경계가 사라지면
 * "본관3층" 과 "본관 3층" 을 같게 만드는 대신 엉뚱한 단어까지 붙어 버린다.
 * 공백 제거는 비교용 키를 만들 때만 국소적으로 적용한다.
 */
export function normalizeLocationText(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";

  return raw
    .normalize("NFKC")
    .replace(/[()[\]{}<>«»""'`~!@#$%^&*_+=|\\/:;,.?·‧・…\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface LocationParts {
  /** 건물. 확인되지 않으면 null (= 건물 정보 없음) */
  building: string | null;
  /** 층. "3층", "지하2층" 형태. 확인되지 않으면 null */
  floor: string | null;
  /** 화장실 성별. "남" | "여" | null */
  gender: string | null;
  /** 건물·층·성별을 제외한 나머지 (공백 제거) */
  place: string;
}

/**
 * 정규화된 문자열을 비교 가능한 조각으로 나눈다.
 * 추론하지 않는다. 문자열에 실제로 쓰여 있는 것만 읽는다.
 */
export function parseLocationParts(normalized: string): LocationParts {
  let rest = normalized;

  let building: string | null = null;
  for (const word of BUILDING_WORDS) {
    if (rest.includes(word)) {
      building = word;
      rest = rest.replace(word, " ");
      break;
    }
  }
  if (!building) {
    const m = rest.match(BUILDING_NUMBER_RE);
    if (m) {
      building = `${m[1]}동`;
      rest = rest.replace(m[0], " ");
    }
  }

  let floor: string | null = null;
  const floorMatch = rest.match(FLOOR_RE);
  if (floorMatch) {
    floor = `${floorMatch[1] ? "지하" : ""}${floorMatch[2]}층`;
    rest = rest.replace(floorMatch[0], " ");
  }

  let gender: string | null = null;
  for (const [pattern, label] of GENDER_PATTERNS) {
    if (pattern.test(rest)) {
      gender = label;
      // 성별 수식어만 떼어내고 "화장실" 은 장소 이름으로 남긴다.
      rest = rest.replace(/남(자|학생)?\s*(?=화장실)/, " ").replace(/여(자|학생)?\s*(?=화장실)/, " ");
      break;
    }
  }

  return {
    building,
    floor,
    gender,
    // 비교용이므로 여기서만 공백을 없앤다. "본관3층 화장실" 과 "본관 3층 화장실" 이 같아진다.
    place: rest.replace(/\s+/g, ""),
  };
}

/** 같은 장소로 볼 수 있는지 판단하는 비교 키 */
function partsKey(parts: LocationParts): string {
  return [parts.building ?? "", parts.floor ?? "", parts.gender ?? "", parts.place].join("|");
}

/** 건물 정보만 빠진 같은 장소를 찾기 위한 키 */
function buildinglessKey(parts: LocationParts): string {
  return [parts.floor ?? "", parts.gender ?? "", parts.place].join("|");
}

// ---------------------------------------------------------------------------
// 2단계 — 집계
// ---------------------------------------------------------------------------

/**
 * "기타" 는 목록에 없는 곳을 고른 값일 뿐 장소를 가리키지 않는다.
 * 상세 위치가 따로 있는데 앞에 붙이면 "기타 본관 3층 화장실" 처럼 읽히고,
 * 같은 장소를 적은 다른 신고와도 분리돼 버린다.
 */
const UNSPECIFIED_LOCATION = "기타";

/** 신고 1건의 표시용 위치 문자열. locationDetail 이 있으면 함께 쓴다. */
export function reportLocationLabel(report: LocationStatInput): string {
  const base = normalizeLocationText(report.location);
  const detail = normalizeLocationText(report.locationDetail);
  if (!detail) return base;
  if (base === UNSPECIFIED_LOCATION) return detail;
  // 상세가 이미 고정 위치를 포함하면 중복해서 붙이지 않는다. ("화장실" + "3층 화장실")
  if (detail.includes(base)) return detail;
  return `${base} ${detail}`;
}

interface Group {
  key: string;
  parts: LocationParts;
  baseLocation: string;
  /**
   * 학생이 상세 위치를 실제로 적은 신고가 하나라도 있는지.
   * 상세가 전혀 없는 그룹(= 고정 선택값만 있는 신고들)은 어느 건물인지 단서가 아예 없으므로
   * 건물 지정 그룹으로 흡수하지 않는다.
   */
  hasDetail: boolean;
  /** 원본 표기별 등장 횟수 — 대표 이름을 고를 때 쓴다 */
  labels: Map<string, number>;
  reports: LocationStatInput[];
}

function makeGroups(reports: LocationStatInput[]): Map<string, Group> {
  const groups = new Map<string, Group>();

  for (const report of reports) {
    const label = reportLocationLabel(report);
    if (!label) continue;

    const parts = parseLocationParts(label);
    const key = partsKey(parts);

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        parts,
        baseLocation: normalizeLocationText(report.location),
        hasDetail: false,
        labels: new Map(),
        reports: [],
      };
      groups.set(key, group);
    }

    // 같은 장소를 누구는 "기타" 로, 누구는 "화장실" 로 골랐다면 구체적인 쪽을 대표 분류로 삼는다.
    const reportBase = normalizeLocationText(report.location);
    if (group.baseLocation === UNSPECIFIED_LOCATION && reportBase !== UNSPECIFIED_LOCATION) {
      group.baseLocation = reportBase;
    }

    if (normalizeLocationText(report.locationDetail)) group.hasDetail = true;
    group.labels.set(label, (group.labels.get(label) || 0) + 1);
    group.reports.push(report);
  }

  return groups;
}

/**
 * 3단계 — 건물 정보가 빠진 표기를 흡수한다.
 *
 * "3층 화장실" 은 그 자체로는 어느 건물인지 알 수 없다.
 * 다만 같은 층·같은 장소 이름을 가진 건물 지정 그룹이 **정확히 하나뿐**이라면,
 * 그 건물을 가리킨다고 볼 근거가 충분하다.
 *
 * 후보가 둘 이상이면(본관 3층 화장실 / 별관 3층 화장실) 어느 쪽인지 알 수 없으므로
 * 합치지 않고 원래 표기를 독립된 위치로 남긴다. 이것이 §3 의 "불확실하면 통합 금지" 다.
 */
function absorbBuildinglessGroups(groups: Map<string, Group>): Map<string, Group> {
  const byBuildingless = new Map<string, Group[]>();
  for (const group of groups.values()) {
    if (!group.parts.building) continue;
    const k = buildinglessKey(group.parts);
    const list = byBuildingless.get(k);
    if (list) list.push(group);
    else byBuildingless.set(k, [group]);
  }

  const result = new Map<string, Group>();

  for (const group of groups.values()) {
    if (group.parts.building) {
      result.set(group.key, group);
      continue;
    }

    const candidates = byBuildingless.get(buildinglessKey(group.parts)) || [];
    // 근거가 하나뿐일 때만 합친다. 0개(비교 대상 없음)·2개 이상(모호함)은 그대로 둔다.
    const canMerge =
      candidates.length === 1 &&
      group.hasDetail &&
      group.parts.place.length > 0 &&
      candidates[0].baseLocation === group.baseLocation;

    if (!canMerge) {
      result.set(group.key, group);
      continue;
    }

    const target = candidates[0];
    for (const [label, count] of group.labels) {
      target.labels.set(label, (target.labels.get(label) || 0) + count);
    }
    target.reports.push(...group.reports);
  }

  return result;
}

/**
 * 대표 이름: 가장 구체적인 표기(건물·층 정보를 가진 쪽)를 고르고,
 * 동률이면 더 자주 쓰인 표기, 그래도 같으면 사전순으로 정한다.
 *
 * 마지막 사전순 규칙이 있어야 "본관 3층 화장실" 과 "본관3층 화장실" 처럼
 * 등가인 표기 중 무엇이 뽑힐지가 신고 입력 순서에 따라 달라지지 않는다.
 * (공백이 숫자보다 앞서므로 띄어 쓴 표기가 선택된다 — 읽기에도 낫다.)
 */
function pickDisplayName(group: Group): string {
  let best = "";
  let bestScore = -1;
  let bestCount = -1;

  for (const [label, count] of group.labels) {
    const parts = parseLocationParts(label);
    const score = (parts.building ? 2 : 0) + (parts.floor ? 1 : 0);

    const better =
      score > bestScore ||
      (score === bestScore &&
        (count > bestCount || (count === bestCount && label.localeCompare(best) < 0)));

    if (better) {
      best = label;
      bestScore = score;
      bestCount = count;
    }
  }

  return best;
}

function toStatistic(group: Group): LocationStatistic {
  const categoryCounts = new Map<string, number>();
  let highRiskCount = 0;
  let urgentCount = 0;
  let latest = "";

  for (const report of group.reports) {
    categoryCounts.set(report.category, (categoryCounts.get(report.category) || 0) + 1);

    if (report.riskLevel === "긴급") {
      urgentCount += 1;
      highRiskCount += 1;
    } else if (report.riskLevel === "높음") {
      highRiskCount += 1;
    }

    if (!latest || report.createdAt > latest) latest = report.createdAt;
  }

  let mainCategory: string | null = null;
  let mainCategoryCount = 0;
  for (const [category, count] of categoryCounts) {
    if (count > mainCategoryCount) {
      mainCategory = category;
      mainCategoryCount = count;
    }
  }

  return {
    name: pickDisplayName(group),
    baseLocation: group.baseLocation,
    reportCount: group.reports.length,
    mainCategory,
    mainCategoryCount,
    highRiskCount,
    urgentCount,
    latestReportAt: latest,
    mergedFrom: [...group.labels.keys()].sort(),
  };
}

/**
 * 위치별 통계를 건수 내림차순으로 반환한다.
 * 입력이 비어 있으면 빈 배열을 돌려준다. 절대 예시 데이터를 만들어 채우지 않는다.
 */
export function aggregateLocationStats(reports: LocationStatInput[]): LocationStatistic[] {
  if (!Array.isArray(reports) || reports.length === 0) return [];

  const groups = absorbBuildinglessGroups(makeGroups(reports));

  return [...groups.values()]
    .map(toStatistic)
    .sort((a, b) => {
      if (b.reportCount !== a.reportCount) return b.reportCount - a.reportCount;
      if (b.highRiskCount !== a.highRiskCount) return b.highRiskCount - a.highRiskCount;
      return b.latestReportAt.localeCompare(a.latestReportAt);
    });
}
