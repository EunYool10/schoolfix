import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

export type PolicySection = "guide" | "terms" | "privacy";

interface Props {
  section: PolicySection;
  onClose: () => void;
}

const CONTACT = "eunyool100208@gmail.com";
const EFFECTIVE_DATE = "2026년 10월 10일";

const TABS: { id: PolicySection; label: string }[] = [
  { id: "guide", label: "이용 방법" },
  { id: "terms", label: "이용약관" },
  { id: "privacy", label: "개인정보 안내" },
];

// ---------------------------------------------------------------------------
// 공통 조각
// ---------------------------------------------------------------------------

function Mail() {
  return <a className="font-semibold text-blue-700 underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>;
}

function Callout({ tone = "info", children }: { tone?: "info" | "warn" | "danger"; children: ReactNode }) {
  const cls = tone === "danger"
    ? "border-rose-200 bg-rose-50 text-rose-900"
    : tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-blue-100 bg-blue-50 text-blue-900";
  return <div className={`rounded-xl border p-3 text-xs leading-relaxed ${cls}`}>{children}</div>;
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-xs leading-relaxed">
        <thead><tr className="bg-slate-50">{head.map((h) => <th key={h} className="border border-slate-200 p-2 font-bold text-slate-800">{h}</th>)}</tr></thead>
        {/* 첫 칸은 항목 이름이라 글자 중간에서 줄이 바뀌지 않도록 최소 너비를 둔다 */}
        <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className={`border border-slate-200 p-2 align-top ${j === 0 ? "min-w-[6.5rem] break-keep font-semibold text-slate-800" : ""}`}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

interface DocSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** 목차 + 본문. 목차를 누르면 해당 절로 스크롤한다. */
function Doc({ title, subtitle, intro, sections, scrollRoot }: { title: string; subtitle: string; intro?: ReactNode; sections: DocSection[]; scrollRoot: React.RefObject<HTMLDivElement | null> }) {
  const jump = (id: string) => {
    const root = scrollRoot.current;
    const target = root?.querySelector<HTMLElement>(`[data-doc-section="${id}"]`);
    if (root && target) root.scrollTo({ top: target.offsetTop - root.offsetTop - 8, behavior: "smooth" });
  };
  return (
    <>
      <h3 className="text-lg font-extrabold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      {intro && <div className="mt-3">{intro}</div>}
      <nav aria-label="목차" className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <p className="mb-1.5 text-xs font-bold text-slate-500">목차</p>
        <ol className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          {sections.map((s) => (
            <li key={s.id}><button type="button" onClick={() => jump(s.id)} className="text-left text-blue-800 hover:underline">{s.title}</button></li>
          ))}
        </ol>
      </nav>
      <div className="mt-5 space-y-6">
        {sections.map((s) => (
          <section key={s.id} data-doc-section={s.id} className="scroll-mt-4">
            <h4 className="font-extrabold text-slate-900">{s.title}</h4>
            <div className="mt-1.5 space-y-2">{s.body}</div>
          </section>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 이용 방법 (서비스 설명서)
// ---------------------------------------------------------------------------

const GUIDE_SECTIONS: DocSection[] = [
  {
    id: "g-what",
    title: "1. SchoolFix는 어떤 서비스인가요",
    body: <>
      <p>학교에서 발견한 고장·위험·불편을 <strong>로그인 없이 익명으로</strong> 알리고, 학교가 확인하고 고치는 과정을 누구나 볼 수 있게 하는 서비스입니다. 이름·학번·연락처를 묻지 않습니다.</p>
      <Callout>SchoolFix는 학교·교육청의 공식 민원 창구나 긴급 신고 창구가 아닙니다. 신고가 바로 확인되거나 반드시 수리된다는 보장은 없습니다.</Callout>
    </>,
  },
  {
    id: "g-emergency",
    title: "2. 지금 위험한 상황이라면",
    body: <Callout tone="danger"><strong>화재·연기·감전 위험·부상·폭력·붕괴 우려</strong>처럼 지금 바로 대응이 필요하면 SchoolFix에만 신고하지 마세요. 가까운 선생님이나 교무실·행정실에 바로 알리고, 필요하면 <strong>119(화재·구조)</strong> 또는 <strong>112(범죄·폭력)</strong>에 직접 연락하세요. SchoolFix 신고는 그다음에 해도 됩니다.</Callout>,
  },
  {
    id: "g-school",
    title: "3. 학교 고르기",
    body: <>
      <ol className="list-decimal space-y-1 pl-5">
        <li>첫 화면 검색창에 학교 이름이나 주소 일부를 입력합니다.</li>
        <li>필요하면 ‘보기’에서 초·중·고, 특성화고·특목고·일반고, 즐겨찾기로 좁히고 ‘정렬’을 바꿉니다.</li>
        <li>학교 카드를 누른 뒤 아래쪽 <strong>‘학교에 입장’</strong>을 누릅니다. 별(☆)을 누르면 이 브라우저에 즐겨찾기로 저장됩니다.</li>
      </ol>
      <p>고른 학교는 이 브라우저에 기억되어, 다음에 접속하면 학교 선택 화면에 미리 선택되어 있습니다. ‘학교에 입장’만 누르면 됩니다. 다른 학교로 바꾸려면 화면 위쪽 학교 이름 옆의 <strong>‘학교 변경’</strong>을 누릅니다.</p>
      <p>우리 학교가 목록에 없다면 아래 <strong>‘10. 우리 학교 추가 신청’</strong>을 확인하세요.</p>
    </>,
  },
  {
    id: "g-write",
    title: "4. 신고 쓰기",
    body: <>
      <ol className="list-decimal space-y-1 pl-5">
        <li><strong>위치 유형</strong>(교실·화장실·복도 등)을 고르고, 공식 확인된 세부 장소가 있으면 선택합니다. 없으면 세부 위치를 직접 적습니다. <strong>세부 장소 선택이나 세부 위치·건물·층·반·호실 중 하나는 꼭 있어야</strong> 접수됩니다.</li>
        <li>위치 유형이 <strong>교실</strong>일 때만 학과·학년·반을 고를 수 있습니다. 학교 공식 현황과 맞지 않는 학과·학년은 접수되지 않습니다.</li>
        <li><strong>문제 종류</strong>(시설 고장·안전 위험·위생 등)를 고릅니다.</li>
        <li><strong>구체적인 상황</strong>을 적습니다. <em>어디서 · 무엇이 · 어떻게 · 언제부터</em>를 쓰면 빨리 처리됩니다.<br /><span className="text-slate-500">좋은 예: “본관 3층 남자 화장실 두 번째 칸 변기 물이 어제부터 계속 흘러요.” / 부족한 예: “화장실 이상해요.”</span></li>
        <li><strong>사진</strong>(선택)은 <strong>최대 6장</strong>까지 끌어 놓거나 눌러서 한꺼번에 고를 수 있습니다. 한 장에 30MB까지 고를 수 있고, 올리기 전에 브라우저가 긴 변 1920px·1.5MB 이하로 자동으로 줄입니다(움직이는 GIF는 4MB까지 그대로). 이때 촬영 위치(GPS) 같은 사진 속 정보도 지워집니다.</li>
        <li><strong>‘신고하기’</strong>를 누릅니다.</li>
      </ol>
      <Table head={["입력 칸", "필수 여부", "글자 수"]} rows={[
        ["제목", "선택 (비우면 ‘위치 유형 + 문제 종류 불편 신고’로 자동 작성)", "100자까지"],
        ["구체적인 상황", "필수", "5자 이상 2,000자까지"],
        ["세부 위치", "세부 장소를 고르지 않았다면 필수", "150자까지"],
        ["건물 · 층 · 호실", "선택", "건물·호실 100자, 층 40자까지"],
        ["사진", "선택", "6장까지, 한 장에 30MB까지 (자동으로 줄여서 올림)"],
      ]} />
      <p>‘빠른 작성 예시’를 누르면 내용이 자동으로 채워집니다. 실제 상황에 맞게 고친 뒤 접수하세요. 작성 중인 글은 이 탭에 자동 임시 저장되어 새로고침해도 복구되지만, <strong>사진과 AI 추가 질문 답변은 저장되지 않습니다.</strong></p>
    </>,
  },
  {
    id: "g-check",
    title: "5. 접수 전 확인과 자동 처리",
    body: <>
      <p><strong>AI 추가 질문:</strong> 내용만으로 장소나 문제를 알기 어려우면, 접수하기 전에 질문을 <strong>한 번에 하나</strong> 보여 줍니다(최대 3번, 답변은 500자까지). 3번을 채우면 더 묻지 않고 접수합니다. 신고 내용을 직접 고쳐 다시 제출해도 됩니다.</p>
      <Callout tone="warn">AI 질문과 내 답변은 <strong>신고 내용 끝에 ‘[추가 확인]’으로 덧붙여 함께 저장·공개</strong>됩니다. 답변에도 이름이나 연락처를 쓰지 마세요. 질문 대화는 서버 메모리에 30분 동안만 남고, 그 안에 접수하지 않으면 사라집니다.</Callout>
      <p><strong>부적절한 표현 가림:</strong> 욕설·비하 표현은 작성 중에 미리 알려 주고, 접수할 때 ####로 가립니다. 규칙 기반 필터가 먼저 가리고, AI가 추가로 찾은 표현도 가립니다. 신고는 거부되지 않으며 시설 문제 내용은 그대로 전달됩니다.</p>
      <p><strong>공개 보류(‘운영진 검토 대기’):</strong> 운영진이 승인하기 전까지 다른 사람에게 보이지 않고, 교사 화면에도 나오지 않습니다. 다음 경우에 보류됩니다.</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>글이나 사진이 자동 안전성 검사에서 확인이 필요하다고 판정된 경우</li>
        <li>사진을 첨부했는데 사진 안전성 검사를 할 수 없거나 검사에 실패한 경우</li>
        <li>같은 기기에서 짧은 시간에 여러 건을 보냈거나, 장난 신고로 처리된 기기에서 보낸 경우(이용약관 제8조)</li>
      </ul>
      <p><strong>위험도:</strong> AI가 신고 내용, 위치, 같은 장소·같은 유형의 미처리 신고 수를 보고 긴급·높음·중간·낮음과 점수, 판단 이유를 매깁니다. 판단 이유는 신고 상세에 공개됩니다. 분석에 실패해도 신고는 위험도 없이(미분석) 접수되고, 서버가 다시 시작될 때 다시 분석합니다. 참고용이며 학교의 공식 판단이 아닙니다.</p>
    </>,
  },
  {
    id: "g-after",
    title: "6. 접수 후 — 접수번호와 진행 상황",
    body: <>
      <p>접수가 끝나면 <strong>접수번호</strong>(REP-접수일(한국 시간)-그날의 일련번호, 예: REP-20261010-0001)가 나옵니다. ‘접수번호 복사’로 따로 보관하세요.</p>
      <p>위쪽 <strong>‘신고 목록’ → ‘내 신고’</strong> 탭에서 이 브라우저로 접수한 신고를 모아 볼 수 있습니다. 공개 보류 중인 내 신고도 여기서는 보입니다(사진은 검토 뒤 공개). 마지막으로 열어 본 뒤 <strong>처리 상태가 바뀌었거나 학교 답변이 달리거나 공개되면</strong> 메뉴와 신고에 빨간 <strong>‘NEW’</strong> 표시가 붙고, 신고를 열면 사라집니다. 다른 기기이거나 브라우저 데이터를 지웠다면 ‘메인 홈’ 검색창에 접수번호를 입력해 공개된 신고를 찾을 수 있지만, 학교 답변 확인과 만족도 응답은 신고한 브라우저에서만 할 수 있습니다.</p>
      <Table head={["상태", "뜻"]} rows={[
        ["접수 대기", "담당자가 아직 확인하기 전"],
        ["확인 중", "담당자가 내용을 보고 현장을 확인하는 중"],
        ["담당자 배정", "처리할 담당자나 부서가 정해짐"],
        ["조치 예정", "점검·수리 일정이 잡힘"],
        ["처리 중", "조치를 진행하는 중"],
        ["처리 완료", "담당자가 조치를 마쳤다고 표시함"],
      ]} />
      <p className="text-xs text-slate-500">학교 사정에 따라 단계가 생략되거나 오래 머무를 수 있습니다. 상태 표시는 학교의 공식 답변이나 수리 증명이 아닙니다.</p>
    </>,
  },
  {
    id: "g-reply",
    title: "7. 학교의 답변과 만족도 확인",
    body: <>
      <p><strong>학교의 답변:</strong> 담당자가 신고한 사람에게만 보이는 답변을 남길 수 있습니다. ‘내 신고’ 목록에 <em>학교 답변 있음</em>이 표시되면 신고를 눌러 확인하세요.</p>
      <p><strong>처리 결과:</strong> 신고 상세의 ‘처리 결과’는 모든 사람에게 공개되는 조치 내용입니다.</p>
      <p><strong>해결됐나요?</strong> 내 신고가 ‘처리 완료’가 되면 신고 상세에서 <strong>‘해결됐어요’</strong> 또는 <strong>‘아직 그대로예요’</strong>를 고를 수 있습니다. ‘아직 그대로예요’를 보내면 신고가 다시 <strong>‘확인 중’</strong>으로 돌아가 담당자가 다시 살펴봅니다. 응답은 처리 완료될 때마다 한 번씩 할 수 있어, 다시 처리 완료되면 새로 물어봅니다.</p>
    </>,
  },
  {
    id: "g-metoo",
    title: "8. 나도 겪었어요",
    body: <p>이미 같은 문제가 신고되어 있다면 새로 신고하지 말고, 그 신고를 열어 <strong>‘나도 겪었어요’</strong>를 눌러 주세요. 공감 수는 목록과 상세에 공개되고, 담당자는 ‘공감 많은 순’으로 정렬해 먼저 확인할 수 있습니다. 한 브라우저에서 한 번만 셀 수 있고, 다시 누르면 취소됩니다. 내가 접수한 신고, 처리 완료된 신고, 공개 보류된 신고에는 버튼이 나오지 않습니다.</p>,
  },
  {
    id: "g-browse",
    title: "9. 신고 목록 보기, AI 요약, 보고서",
    body: <>
      <p>위쪽 <strong>‘신고 목록’ → ‘전체 신고’</strong> 탭에서 우리 학교의 공개된 신고를 모두 볼 수 있습니다. 공개 보류·삭제된 신고는 나오지 않습니다.</p>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>검색·필터:</strong> 접수번호·위치·내용으로 검색하고, 문제 유형 · 위험도 · 처리 상태 · 기간(전체/오늘/최근 7일/최근 30일)으로 좁힙니다. 위험도 분포 막대를 눌러도 그 등급만 볼 수 있습니다.</li>
        <li><strong>위치별 신고 현황:</strong> 어느 장소에 신고가 많은지 지금 걸어 둔 필터 그대로 집계합니다.</li>
        <li><strong>AI 요약:</strong> 우리 학교 공개 신고 전체를 AI가 짧게 정리합니다. 신고 내용이 바뀌지 않았다면 저장된 요약을 다시 보여 주며, 새로 만드는 요약은 같은 네트워크에서 10분에 5번까지입니다. 참고용입니다.</li>
        <li><strong>PDF 저장·인쇄:</strong> 지금 화면의 목록과 통계를 보고서 창으로 엽니다. 인쇄 창에서 대상을 ‘PDF로 저장’으로 고르면 PDF 파일이 됩니다. 팝업이 막혀 있으면 이 사이트의 팝업을 허용하세요.</li>
      </ul>
      <p>신고 상세의 <strong>‘삭제하기’</strong>는 관리자 비밀번호가 있어야 쓸 수 있습니다. 내 신고를 지우고 싶다면 이메일로 요청하세요(‘13. 자주 묻는 질문’).</p>
    </>,
  },
  {
    id: "g-apply",
    title: "10. 우리 학교 추가 신청",
    body: <>
      <p>학교 선택 화면 아래 <strong>‘우리 학교 추가 신청’</strong>에서 아래 내용을 적고 약관과 개인정보 안내에 동의한 뒤 보냅니다.</p>
      <Table head={["항목", "필수 여부", "제한"]} rows={[
        ["학교 공식 명칭", "필수", "100자까지"],
        ["공식 홈페이지", "필수", "http:// 또는 https:// 주소, 500자까지"],
        ["주소 또는 지역", "필수", "200자까지"],
        ["신청 사유", "필수", "1,000자까지"],
        ["추가 요청", "선택", "1,000자까지"],
        ["회신 이메일", "선택", "결과를 받고 싶을 때만"],
      ]} />
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>웹 내부로 전달:</strong> 운영진 전용 ‘학교 신청 메일함’에 바로 저장됩니다. 같은 네트워크에서 1시간에 5건까지 보낼 수 있습니다.</li>
        <li><strong>메일로 전달:</strong> 내 메일 앱에 {CONTACT} 앞으로 쓴 초안만 열립니다. 메일 앱에서 직접 보내야 접수됩니다.</li>
      </ul>
      <p>운영진이 공식 정보를 확인해 승인하면 재배포 없이 학교 선택 화면에 바로 나타납니다. 새로 등록된 학교는 기본 위치 유형(교실·복도·화장실 등)으로 시작하며, 세부 장소 목록은 나중에 확인되면 추가됩니다. 등록 여부와 시점은 보장되지 않습니다.</p>
    </>,
  },
  {
    id: "g-staff",
    title: "11. 운영진·교사 화면",
    body: <>
      <p>위쪽 <strong>‘운영진’</strong> 메뉴에서 <strong>‘운영진’</strong> 또는 <strong>‘교사 전용’</strong>을 고르고 비밀번호로 로그인합니다. 교사 비밀번호는 학교마다 따로 있으며, 지금 입장한 학교의 비밀번호로만 로그인됩니다. 비밀번호는 15분에 5번까지 시도할 수 있고, 넘기면 10분 동안 막힙니다.</p>
      <p><strong>운영진</strong>은 모든 지원 학교의 신고(공개 보류 포함)와 신청함·알림을, <strong>교사</strong>는 소속 학교의 공개된 신고와 월별 통계만 관리합니다. 로그인은 8시간 유지되지만 서버가 다시 시작되면 다시 로그인해야 합니다. 공용 기기에서는 꼭 로그아웃하세요.</p>
      <Table head={["기능", "할 수 있는 일"]} rows={[
        ["신고 관리", "상태·담당자(100자)·처리 메모(공개, 1,000자)·학생 답변(비공개, 1,000자) 저장, 처리 이력(최근 100건) 확인, 위험도·기한 임박·공감 많은 순 정렬, CSV 내려받기"],
        ["처리 기한", "긴급 1일 · 높음 3일 · 중간 7일 · 낮음 14일(미분석 7일). 넘기면 빨간색으로 표시"],
        ["안전성 검토 (운영진)", "공개 보류 신고를 확인해 승인하거나 삭제. 보류 신고는 승인 전까지 상태를 바꿀 수 없음. 장난 신고는 ‘장난 신고로 처리’로 삭제하고 그 기기의 신고를 30일간 검토 대상으로 지정"],
        ["검토 대상 기기 (운영진)", "장난 신고로 지정된 기기 목록(기기 식별값 앞 12자리만 표시)과 만료일 확인, 지정 해제"],
        ["월별 통계", "접수·완료율·평균 처리 시간·기한 초과, 12개월 추이, 유형·위치·위험도별 현황, 보고서 인쇄·PDF"],
        ["학교 신청 메일함 (운영진)", "학교 추가 신청 확인·삭제, ‘승인하고 학교 등록’으로 바로 지원 학교에 추가"],
        ["알림 (운영진)", "Discord 등으로 새 신고·보류 신고·긴급 신고·학교 신청·월간 보고 알림 받기, 종류별 켜기·끄기, 테스트 발송(10분 5번). 월간 보고는 매달 1일 오전 9시(한국 시간) 이후 서버가 깨어 있을 때 지난달 것을 한 번 자동 발송"],
      ]} />
    </>,
  },
  {
    id: "g-privacy",
    title: "12. 개인정보를 지키며 신고하는 법",
    body: <ul className="list-disc space-y-1 pl-5">
      <li>글에 <strong>본인이나 다른 사람의 이름·학번·연락처·건강 정보</strong>를 쓰지 마세요.</li>
      <li>사진은 고장 난 시설만 나오게 찍고, <strong>얼굴·이름표·화면 속 개인정보</strong>는 빼거나 가리세요.</li>
      <li>공개된 신고는 누구나 볼 수 있습니다. 구체적인 사건 설명만으로도 특정인이 드러날 수 있으니 주의하세요.</li>
      <li>공용 컴퓨터에서는 ‘내 신고’ 연결 정보가 그 브라우저에 남습니다. 필요하면 사용 후 브라우저 데이터를 지우세요.</li>
    </ul>,
  },
  {
    id: "g-faq",
    title: "13. 자주 묻는 질문",
    body: <dl className="space-y-2">
      {[
        ["‘내 신고’에 신고가 안 보여요.", "신고한 브라우저·기기에서만 보입니다. 학교를 바꿨다면 신고한 학교로 다시 입장하세요. 다른 기기라면 메인 홈 검색창에 접수번호를 입력하세요. 공개 보류 중인 신고는 다른 기기의 검색에는 보이지 않습니다."],
        ["신고를 지우고 싶어요.", "화면에서 직접 지울 수는 없습니다. 접수번호와 이유를 이메일로 보내 주세요. 운영진이 확인 후 공개 화면에서 내립니다(약관 제9조)."],
        ["신고 내용을 고치고 싶어요.", "접수 뒤에는 화면에서 고칠 수 없습니다. 접수번호와 고칠 내용을 이메일로 보내거나, 잘못 적은 신고 삭제를 요청한 뒤 새로 신고하세요."],
        ["‘운영진 검토 대기’가 계속돼요.", "운영진이 확인한 뒤 공개되거나 삭제됩니다. 사진을 붙인 신고는 사진 검사를 할 수 없을 때도 보류됩니다. 잘못 보류된 것 같으면 접수번호와 함께 이메일로 알려 주세요."],
        ["‘짧은 시간에 너무 많은 신고’라고 나와요.", "학교는 여러 명이 같은 인터넷 주소를 쓰는 경우가 많아, 같은 네트워크에서 10분에 60건이 넘으면 5분 동안 신고가 제한됩니다. 잠시 뒤 다시 시도하세요. 작성 중인 글은 임시 저장되어 있습니다."],
        ["AI 요약이 안 돼요.", "같은 네트워크에서 새 요약은 10분에 5번까지 만들 수 있습니다. 공개된 신고가 없으면 요약을 만들지 않습니다."],
        ["사진이 안 올라가요.", "사진은 6장까지, 한 장에 30MB까지 고를 수 있습니다. 아이폰의 HEIC 사진이 열리지 않는 브라우저도 있으니 그럴 때는 JPG로 바꾸거나 카메라 설정을 ‘높은 호환성’으로 바꿔 주세요. ‘줄이는 중’이 끝난 뒤에 신고하기를 누르세요."],
        ["같은 문제가 이미 있다고 나와요.", "신고를 쓰는 중에 같은 장소의 처리 중 신고가 있으면 보여 줍니다. 같은 문제라면 ‘나도 겪었어요’를 누르고, 다른 문제라면 그대로 계속 작성하면 됩니다."],
        ["‘해결됐나요?’가 안 보여요.", "신고한 브라우저에서, 신고가 ‘처리 완료’일 때만 보입니다. 이번 완료에 이미 응답했다면 다시 나오지 않고, ‘아직 그대로예요’ 뒤 다시 처리 완료되면 새로 나옵니다."],
      ].map(([q, a]) => (
        <div key={q} className="rounded-lg bg-slate-50 p-2.5"><dt className="font-bold text-slate-900">Q. {q}</dt><dd className="mt-0.5">A. {a}</dd></div>
      ))}
    </dl>,
  },
  {
    id: "g-contact",
    title: "14. 문의",
    body: <p>서비스 이용, 신고 삭제·정정, 개인정보 요청은 <Mail />로 보내 주세요. 신고는 접수번호를, 학교 신청은 학교 이름과 신청한 날짜를 함께 적어 주시면 빨리 찾을 수 있습니다.</p>,
  },
];

// ---------------------------------------------------------------------------
// 이용약관
// ---------------------------------------------------------------------------

const TERMS_SECTIONS: DocSection[] = [
  {
    id: "t-purpose",
    title: "제1조 (목적)",
    body: <p>이 약관은 SchoolFix AI(이하 “서비스”)를 이용해 학교 시설 문제를 신고하고, 처리 상황을 확인하고, 학교 추가 지원을 신청할 때 서비스와 이용자가 지켜야 할 기본 사항을 정합니다.</p>,
  },
  {
    id: "t-terms",
    title: "제2조 (용어)",
    body: <ul className="list-disc space-y-1 pl-5">
      <li><strong>신고:</strong> 이용자가 학교·장소·문제 종류와 설명(사진 포함)을 서비스에 제출하는 것</li>
      <li><strong>이용자:</strong> 로그인 없이 신고·조회·공감·만족도 응답·학교 추가 신청을 하는 사람</li>
      <li><strong>운영진:</strong> 모든 지원 학교의 신고, 안전성 검토, 학교 신청함, 알림 설정을 관리하는 서비스 관리자</li>
      <li><strong>교사 계정:</strong> 설정된 학교 한 곳의 신고 상태·담당자·메모·학생 답변만 관리하는 계정</li>
      <li><strong>공개 보류:</strong> 운영진이 승인하기 전까지 신고를 다른 이용자에게 보이지 않게 하는 상태</li>
      <li><strong>접수번호:</strong> 신고마다 부여되는 번호(예: REP-20261010-0001)</li>
    </ul>,
  },
  {
    id: "t-nature",
    title: "제3조 (서비스의 성격과 한계)",
    body: <>
      <p>① 서비스는 신고를 학교 시설 확인과 안전 개선을 위한 참고 자료로 전달합니다. <strong>학교·교육청의 공식 민원, 시설 점검, 긴급 신고 창구가 아니며</strong>, 학교의 조치나 답변을 대신하지 않습니다.</p>
      <p>② 서비스는 신고의 즉시 확인, 현장 출동, 수리, 처리 기한 준수, 답변을 보장하지 않습니다. 화면의 ‘처리 완료’는 담당자가 상태를 바꿨다는 뜻이며 서비스가 조치 결과를 따로 검증했다는 뜻이 아닙니다.</p>
      <p>③ 운영진 화면의 처리 기한(긴급 1일·높음 3일·중간 7일·낮음 14일)은 내부 관리 목표이며 이용자에 대한 약속이 아닙니다.</p>
    </>,
  },
  {
    id: "t-emergency",
    title: "제4조 (긴급 상황)",
    body: <p>다치거나 즉각적인 위험(화재·감전·붕괴 우려·폭력 등)이 있으면 서비스 신고를 기다리지 말고 교직원·보호자에게 알리고 <strong>119·112</strong> 등 관계 기관에 먼저 연락해야 합니다. 긴급 상황을 서비스에만 신고해 생긴 결과에 대해 서비스는 책임지지 않습니다.</p>,
  },
  {
    id: "t-use",
    title: "제5조 (이용 방법과 브라우저 정보)",
    body: <>
      <p>① 신고·조회·공감·만족도 응답에는 회원가입이나 로그인이 필요하지 않습니다.</p>
      <p>② ‘내 신고’ 조회와 만족도 응답은 신고한 브라우저에 저장된 확인 정보로, ‘나도 겪었어요’와 반복 신고 판단은 브라우저마다 만들어지는 기기 정보로 연결됩니다(개인정보 안내 참고). 브라우저 데이터를 지우거나 기기를 바꾸면 연결이 끊길 수 있으니 접수번호를 따로 보관하세요.</p>
      <p>③ 운영진·교사 계정의 비밀번호를 다른 사람과 공유하면 안 되며, 공용 기기에서는 사용 후 로그아웃해야 합니다.</p>
    </>,
  },
  {
    id: "t-duty",
    title: "제6조 (이용자가 지켜야 할 것)",
    body: <>
      <p>① 직접 확인한 사실을 구체적으로 작성해야 합니다.</p>
      <p>② 다음 행위를 해서는 안 됩니다.</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>허위 신고, 장난 신고, 같은 내용의 반복 신고</li>
        <li>다른 사람의 이름·연락처·얼굴·학번·건강 정보 등 개인정보를 쓰거나 첨부하는 것</li>
        <li>특정인을 비방·모욕·협박·괴롭히는 내용 (「형법」 제307조 명예훼손, 제311조 모욕)</li>
        <li>동의 없는 신체 촬영물·성적 이미지 (「성폭력범죄의 처벌 등에 관한 특례법」 제14조), 아동·청소년 성착취물</li>
        <li>다른 사람의 저작물·초상을 권리 없이 올리는 것 (「저작권법」 등)</li>
        <li>자동화된 대량 요청, 보안 기능 우회, 다른 사람의 접수 정보·기기 정보를 도용하는 것</li>
      </ol>
      <p>③ 서비스를 이용했다는 사실이 위법 행위를 정당화하지 않습니다.</p>
    </>,
  },
  {
    id: "t-review",
    title: "제7조 (자동 처리, 검토와 공개)",
    body: <>
      <p>① 신고 내용은 접수 전 추가 질문, 부적절한 표현 가림(####), 위험도 분류, 안전성 검사, 요약을 위해 자동으로 처리될 수 있습니다(개인정보 안내 ‘외부 제공자’ 참고). 자동 처리 결과는 참고용이며 오류가 있을 수 있고, 학교의 사실 확인이나 공식 판단이 아닙니다. AI 추가 질문에 대한 이용자의 답변은 신고 내용의 일부로 저장·공개됩니다.</p>
      <p>② 글이나 사진이 자동 검사에서 확인이 필요하다고 판단되면 신고는 공개 보류되며, 운영진이 승인하면 공개되고 그렇지 않으면 삭제됩니다.</p>
      <p>③ 공개된 신고의 제목·위치·내용·사진·처리 상태·처리 결과·공감 수는 누구나 볼 수 있습니다. 학생 답변과 만족도 응답은 신고한 사람과 운영진·교사만 볼 수 있습니다.</p>
      <p>④ 운영진은 신고와 학교 신청 내용을 운영진 알림 채널(Discord 등)로 받아 볼 수 있습니다. 공개 보류 신고는 보류 사유와 첨부 사진까지 운영진 채널로 전달될 수 있습니다.</p>
    </>,
  },
  {
    id: "t-abuse",
    title: "제8조 (반복 신고 검토와 이용 제한)",
    body: <>
      <p>① 학교는 여러 학생이 같은 인터넷 주소를 함께 쓰는 경우가 많아, 서비스는 신고를 거부하는 대신 다음 신고를 <strong>공개 보류</strong>로 접수해 운영진이 확인하게 합니다.</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>같은 기기에서 10분 안에 3건을 넘게 보낸 경우</li>
        <li>같은 기기에서 24시간 안에 10건을 넘게 보낸 경우</li>
        <li>운영진이 ‘장난 신고’로 처리한 신고를 보낸 기기에서 30일 안에 보낸 신고</li>
      </ul>
      <p>② 자동화된 대량 요청을 막기 위해, 같은 네트워크(인터넷 주소)에서 아래 한도를 넘으면 표시된 시간 동안 요청이 제한됩니다. 같은 학교 안에서는 여러 이용자의 요청이 함께 계산될 수 있습니다.</p>
      <Table head={["기능", "한도", "넘었을 때"]} rows={[
        ["신고 접수", "10분에 60건", "5분 제한"],
        ["AI 추가 질문", "10분에 40번", "5분 제한"],
        ["AI 요약 새로 만들기", "10분에 5번", "10분 제한"],
        ["나도 겪었어요", "10분에 120번", "5분 제한"],
        ["만족도 응답", "10분에 30번", "5분 제한"],
        ["학교 추가 신청(웹)", "1시간에 5건", "1시간 제한"],
        ["운영진·교사 로그인, 관리자 삭제 비밀번호", "15분에 5번", "10분 제한"],
      ]} />
      <p>③ 제6조를 어긴 신고는 공개 보류·비공개·삭제될 수 있습니다.</p>
    </>,
  },
  {
    id: "t-delete",
    title: "제9조 (신고 삭제·정정과 권리 침해 신고)",
    body: <>
      <p>① 신고 상세의 ‘삭제하기’는 관리자 비밀번호가 있어야 쓸 수 있어, 이용자는 화면에서 직접 신고를 지우거나 고칠 수 없습니다. 삭제나 정정을 원하면 접수번호와 사유를 <Mail />로 보내 주세요. 운영진이 확인 후 처리합니다.</p>
      <p>② 신고로 권리를 침해당했다고 생각하는 사람은 접수번호(또는 화면 주소), 침해된 권리, 요청 사유를 이메일로 보낼 수 있습니다. 운영진은 확인에 필요한 최소한의 정보를 요청할 수 있고, 검토하는 동안 해당 신고를 임시로 비공개할 수 있습니다.</p>
      <p>③ 삭제된 신고는 모든 공개 화면·통계·AI 요약에서 제외됩니다. 기록 확인을 위해 저장소에는 ‘삭제됨’ 표시와 함께 남을 수 있습니다(개인정보 안내 ‘보유 기간’ 참고).</p>
    </>,
  },
  {
    id: "t-objection",
    title: "제10조 (이의 제기)",
    body: <p>잘못된 공개 보류·삭제·위험도 분류·이용 제한에 대해 접수번호와 사유를 이메일로 보내 이의를 제기할 수 있습니다. 운영진이 직접 확인해 공개·수정·유지 여부를 판단하고 회신합니다.</p>,
  },
  {
    id: "t-apply",
    title: "제11조 (학교 추가 신청)",
    body: <p>학교 추가 신청은 지원 검토를 요청하는 것이며, 신청만으로 학교가 등록되지 않습니다. 운영진은 공식 정보를 확인해 지원 여부를 정하고, 승인하면 학교 선택 화면에 바로 추가합니다. 등록 시점과 회신은 보장되지 않으며, 회신 이메일을 적지 않으면 결과를 따로 알리지 않습니다. ‘메일로 전달’은 이용자의 메일 앱에서 직접 보내야 접수됩니다.</p>,
  },
  {
    id: "t-change",
    title: "제12조 (서비스 변경·중단과 자료 보관)",
    body: <>
      <p>① 서비스는 점검, 장애, 외부 제공자 사정으로 일시 중단되거나 기능이 바뀔 수 있습니다.</p>
      <p>② 신고와 신청 자료는 외부 데이터베이스(Supabase)에 저장되어 서버 재시작·재배포에도 유지되지만, 외부 서비스 장애나 운영 사정으로 인한 유실이 전혀 없다고 보장하지는 않습니다. 중요한 내용과 접수번호는 따로 보관하세요.</p>
    </>,
  },
  {
    id: "t-liability",
    title: "제13조 (책임의 한계)",
    body: <p>서비스는 이용자가 작성한 신고 내용의 정확성, 학교의 조치 여부와 결과, 자동 처리 결과의 정확성에 대해 책임지지 않습니다. 다만 서비스의 고의 또는 중대한 과실로 생긴 손해는 관련 법령에 따릅니다.</p>,
  },
  {
    id: "t-revise",
    title: "제14조 (약관 변경)",
    body: <p>서비스 기능이나 처리 방식이 바뀌면 약관을 고치고, 바뀐 내용과 시행일을 이 화면에 표시합니다. 이용자에게 불리한 중요한 변경은 시행 전에 서비스 화면으로 알립니다.</p>,
  },
  {
    id: "t-contact",
    title: "제15조 (문의)",
    body: <p>약관과 서비스 이용 문의는 <Mail />로 보내 주세요.</p>,
  },
];

// ---------------------------------------------------------------------------
// 개인정보 안내
// ---------------------------------------------------------------------------

const PRIVACY_SECTIONS: DocSection[] = [
  {
    id: "p-summary",
    title: "1. 한눈에 보기",
    body: <>
      <Table head={["구분", "처리하는 정보", "목적과 공개 범위"]} rows={[
        ["시설 신고", "학교, 위치(유형·세부 위치·건물·층·학과·학년·반·호실), 문제 종류, 제목, 내용(AI 추가 질문과 답변 포함), 첨부 사진(최대 6장, 줄인 사본)과 파일 이름·크기, AI 위험도 분석 결과(등급·점수·이유), 공개 보류 여부와 사유, 접수·상태 변경 시각, 담당자, 처리 메모", "신고 접수·검토·처리·통계. 승인된 신고는 누구나 볼 수 있고, 보류 신고는 운영진만 볼 수 있음"],
        ["신고 확인 정보", "브라우저에 저장되는 소유 토큰과, 서버에 저장되는 그 토큰의 해시", "‘내 신고’ 조회, 학생 답변 확인, 만족도 응답. 원본 토큰은 서버에 저장하지 않음"],
        ["기기 정보", "브라우저마다 만들어지는 무작위 기기 토큰의 해시(신고·공감 용도별로 따로 계산)", "‘나도 겪었어요’ 중복 방지, 반복·장난 신고 판단(제8조). 공개 화면에는 공감 수만 표시"],
        ["학생 답변·만족도", "학교가 남긴 답변, 이용자의 해결 여부와 의견", "신고한 사람과 운영진·교사만 확인"],
        ["처리 이력", "상태·담당자·학생 답변 변경, 공개 보류 승인·삭제, 장난 신고 처리, 만족도 응답의 시각과 역할(운영진·교사·신고자). 신고마다 최근 100건", "처리 과정 관리. 운영진·교사 화면에만 표시. 개인 계정·이름은 기록하지 않음"],
        ["학교 추가 신청", "학교명, 홈페이지, 주소·지역, 신청 사유, 추가 요청(선택), 회신 이메일(선택)", "지원 검토와 회신. 운영진만 확인"],
        ["AI 추가 질문 대화", "접수 전 위치 유형, 문제 종류, 내용, 질문과 답변 (서버 메모리)", "접수 전 내용 확인. 접수되면 즉시, 접수하지 않으면 30분 뒤 지움"],
        ["보안·운영", "접속 IP에서 만든 해시(서버 메모리), 운영진·교사 로그인 세션 쿠키", "요청 횟수 제한과 로그인 유지. 서비스는 원본 IP를 신고 기록·알림에 저장하지 않음 (호스팅 사업자의 접속 기록은 아래 5번 Render 정책을 따름)"],
      ]} />
      <Callout tone="warn">신고 글이나 사진에 본인 또는 다른 사람의 이름·얼굴·학번·연락처·건강·상담 정보가 들어가면 서비스가 그 정보까지 받게 됩니다. 꼭 필요한 경우가 아니면 쓰거나 첨부하지 마세요.</Callout>
    </>,
  },
  {
    id: "p-controller",
    title: "2. 처리자와 문의 창구",
    body: <p><strong>개인정보 처리자:</strong> SchoolFix AI 서비스 운영자. <strong>문의:</strong> <Mail />. 열람·정정·삭제·처리정지 요청, 유출 우려 신고, 불만은 이메일로 받습니다. 신고는 접수번호를, 학교 신청은 학교 이름과 신청한 날짜를 함께 적어 주세요.</p>,
  },
  {
    id: "p-report",
    title: "3. 신고에서 처리·공개되는 정보",
    body: <>
      <p>계정·실명·학번·연락처는 요구하지 않습니다. 신고는 접수 시 부적절한 표현이 가려진(####) 상태로 저장됩니다.</p>
      <p><strong>공개:</strong> 승인된 신고의 학교, 위치, 문제 종류, 제목, 내용, 첨부 사진, 처리 상태, 담당자, 처리 결과(처리 메모), 위험도와 분석 이유, ‘나도 겪었어요’ 수, 접수·처리 시각은 누구나 볼 수 있습니다.</p>
      <p><strong>비공개:</strong> 공개 보류 신고, 학생 답변, 만족도 응답, 처리 이력, 보류 사유, 기기 정보는 공개 화면에 나오지 않습니다.</p>
      <p><strong>브라우저 저장:</strong> 작성 중인 초안은 현재 탭(sessionStorage)에만 임시 저장되며 사진과 AI 추가 질문 답변은 제외됩니다. 선택한 학교, 소유 토큰, 기기 토큰, 공감한 신고 목록, 즐겨찾기 학교, 마지막으로 확인한 내 신고 상태(‘새 소식’ 표시용)는 이 브라우저(localStorage)에 저장되며, 브라우저 데이터를 지우면 사라집니다.</p>
    </>,
  },
  {
    id: "p-apply",
    title: "4. 학교 추가 신청에서 처리하는 정보",
    body: <>
      <p><strong>필수:</strong> 학교명, 공식 홈페이지, 주소 또는 지역, 신청 사유. <strong>선택:</strong> 추가 요청, 회신 이메일. 지원 검토와 회신에만 사용합니다.</p>
      <p>‘웹 내부로 전달’은 운영진 신청함에 저장되고, 운영진 알림 채널에는 <strong>회신 이메일을 뺀</strong> 내용(학교명·주소·홈페이지·신청 사유)이 전달될 수 있습니다. ‘메일로 전달’은 이용자가 선택한 메일 서비스로 보내지며 그 서비스의 정책을 따릅니다.</p>
      <p>신청 폼은 약관과 이 안내에 대한 동의를 필수로 받습니다. 동의하지 않으면 웹 내부 신청을 보낼 수 없고, 회신 이메일은 입력하지 않아도 신청할 수 있습니다.</p>
    </>,
  },
  {
    id: "p-third",
    title: "5. 외부 제공자(처리 위탁)와 국외 이전",
    body: <>
      <p>서비스 운영을 위해 아래 외부 사업자가 정보를 처리합니다. 대부분 해외에서 처리되며, 각 기능을 이용하는 시점에 인터넷(HTTPS)으로 전송됩니다.</p>
      <Table head={["제공자", "처리하는 정보", "목적", "처리 국가·문의"]} rows={[
        [<><strong>Supabase</strong><br />(Supabase, Inc.)</>, "신고, 첨부 사진(비공개 Storage), 학교 신청, 운영진이 등록한 학교, 검토 대상 기기 해시, 알림 설정", "데이터 저장(데이터베이스·파일 저장소)", "운영자가 선택한 Supabase 프로젝트 리전 · supabase.com/privacy"],
        [<><strong>Render</strong><br />(Render Services, Inc.)</>, "서비스 화면과 서버 요청 전체", "웹 서비스 호스팅", "싱가포르 리전 · privacy@render.com"],
        [<><strong>OpenAI</strong><br />(OpenAI OpCo, LLC)</>, "아래 ‘OpenAI로 보내는 정보’ 표 참고", "추가 질문, 위험도 분류, 안전성 검사, AI 요약 (운영자가 API 키를 설정한 경우)", "미국 등 · privacy@openai.com"],
        [<><strong>Discord</strong><br />(Discord Inc.)</>, "아래 ‘운영진 알림으로 보내는 정보’ 표 참고", "운영진 알림 (운영자가 웹훅을 연결하고 알림을 켠 경우)", "미국 등 · discord.com/privacy"],
      ]} />
      <p className="pt-2 font-bold text-slate-900">OpenAI로 보내는 정보</p>
      <Table head={["기능", "언제", "보내는 정보"]} rows={[
        ["AI 추가 질문", "‘신고하기’를 누를 때, 답할 때마다", "위치 유형, 문제 종류, 신고 내용, 앞선 질문과 답변"],
        ["위험도 분류", "접수할 때 1번 (실패한 건은 서버 재시작 때 다시)", "학교 이름과 위치(유형·세부 장소·건물·층), 문제 종류, 표현을 가린 신고 내용, 같은 장소·같은 유형의 미처리 신고 수와 그중 최대 3건의 내용"],
        ["안전성 검사", "접수할 때 1번", "표현을 가린 제목과 내용, 첨부 사진"],
        ["AI 요약", "누군가 ‘AI 요약’을 눌러 새 요약이 필요할 때", "그 학교의 공개 신고 전체: 학교·상세 위치(학과·학년·반·호실 포함), 문제 종류, 위험도, 처리 상태, 내용, 접수 시각"],
      ]} />
      <p className="pt-2 font-bold text-slate-900">운영진 알림(Discord)으로 보내는 정보</p>
      <Table head={["알림", "보내는 정보"]} rows={[
        ["새 신고", "학교, 접수번호, 제목, 상세 위치(학과·학년·반·호실 포함), 문제 종류, 위험도, 내용 앞부분 300자, 첨부 사진이 있으면 파일 이름·크기 (사진 자체는 보내지 않음)"],
        ["공개 보류 신고", "새 신고 항목 + 보류 사유, 내용 1,200자까지, 첨부 사진 파일 (운영진이 Discord에서 바로 판단할 수 있도록)"],
        ["긴급 신고", "학교, 접수번호, 제목, 위치, 문제 종류, 위험도, 내용 앞부분 (‘모든 신고’ 알림을 끈 경우나 접수 뒤 긴급으로 판정된 경우)"],
        ["학교 추가 신청", "학교명, 주소, 홈페이지, 신청 사유(600자까지), 회신 이메일 입력 여부 (이메일 주소 자체는 보내지 않음)"],
        ["월간 보고", "학교별 접수·완료 수, 완료율, 평균 처리 시간, 기한 초과 수, 가장 많은 유형·위치 (개별 신고 내용 없음)"],
      ]} />
      <p>OpenAI API로 보낸 내용은 기본적으로 모델 학습에 쓰이지 않지만, 남용 감시를 위해 일정 기간 보관될 수 있습니다. Discord 알림 채널은 운영진만 들어갈 수 있도록 비공개로 운영해야 합니다.</p>
      <p>현재 신고 양식에는 외부 처리를 끄는 선택란이 없습니다. 외부 처리에 동의하지 않는다면 식별정보나 민감정보가 담긴 내용을 쓰거나 첨부하지 말고, 온라인 신고 대신 학교에 직접 알려 주세요. 제공자, 전달 항목, 처리 국가가 바뀌면 이 안내를 갱신합니다.</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        <a className="font-semibold text-blue-700 underline" href="https://supabase.com/privacy" target="_blank" rel="noreferrer">Supabase 개인정보 처리방침</a>
        <a className="font-semibold text-blue-700 underline" href="https://render.com/privacy" target="_blank" rel="noreferrer">Render 개인정보 처리방침</a>
        <a className="font-semibold text-blue-700 underline" href="https://openai.com/policies/sub-processor-list/" target="_blank" rel="noreferrer">OpenAI 처리 하위사업자</a>
        <a className="font-semibold text-blue-700 underline" href="https://discord.com/privacy" target="_blank" rel="noreferrer">Discord 개인정보 처리방침</a>
      </div>
    </>,
  },
  {
    id: "p-retention",
    title: "6. 보유 기간과 삭제",
    body: <>
      <Table head={["정보", "보유 기간", "삭제 방법"]} rows={[
        ["신고", "자동 만료 기간 없음. 서비스 운영에 필요한 동안", "이메일로 요청 → 운영진이 공개 화면에서 내림. 저장소에는 ‘삭제됨’ 표시로 남을 수 있으며, 완전 삭제가 필요하면 이메일에 함께 적어 주세요"],
        ["학교 신청", "자동 만료 없음", "운영진이 신청함에서 삭제(완전 삭제). 이메일로 요청 가능"],
        ["검토 대상 기기", "지정일로부터 30일 (지나면 효력이 없어지고 목록에서 제외)", "운영진이 해제 가능"],
        ["첨부 사진", "신고와 같은 기간", "반려·장난 신고 처리·삭제 시 저장소에서 바로 지움. 이메일로 사진만 삭제 요청도 가능"],
        ["처리 이력", "신고와 같은 기간. 신고마다 최근 100건만 남고 오래된 것부터 지워짐", "신고 삭제 요청 때 함께 처리"],
        ["AI 추가 질문 대화", "서버 메모리 최대 30분. 접수되면 바로 지움", "자동 정리 (서버 재시작 때도 사라짐)"],
        ["로그인 세션", "8시간, 서버 재시작 시 즉시 소멸", "로그아웃"],
        ["IP 해시(요청 제한)", "서버 메모리에서 제한 시간이 끝난 뒤 10분 안에 정리 (최대 1시간 남짓)", "자동 정리"],
        ["Discord에 보낸 알림", "Discord 채널에 남음", "운영진이 Discord에서 메시지 삭제"],
        ["브라우저 저장 정보", "이용자가 지울 때까지 (내 신고 연결 정보는 최근 200건, 공감 목록은 최근 500건까지)", "브라우저의 사이트 데이터 삭제"],
      ]} />
      <p className="text-xs text-slate-500">법령에 따라 보존해야 하는 경우에는 그 근거와 기간에 맞춰 필요한 자료만 따로 보관합니다(「개인정보 보호법」 제21조).</p>
    </>,
  },
  {
    id: "p-rights",
    title: "7. 정보주체의 권리와 요청 방법",
    body: <>
      <p>본인 또는 법정대리인은 「개인정보 보호법」에 따라 개인정보 열람, 정정·삭제, 처리정지를 요청할 수 있습니다. <Mail />로 접수번호(신고) 또는 학교 이름과 신청 날짜(학교 신청), 요청 내용을 보내 주세요.</p>
      <p>다른 사람의 자료를 함부로 지우지 못하도록 요청 권한을 확인할 수 있습니다. 신분증 사본이나 주민등록번호를 먼저 보내지 마세요. 필요하면 최소한의 확인 방법을 따로 안내합니다. 법령상 처리할 수 없는 경우에는 그 이유를 알려 드립니다.</p>
      <p>개인정보 침해 상담·분쟁 조정은 개인정보보호위원회, 개인정보침해 신고센터(국번 없이 118) 등에 문의할 수 있습니다.</p>
    </>,
  },
  {
    id: "p-child",
    title: "8. 만 14세 미만 이용자",
    body: <p>서비스는 이름·연락처 같은 개인정보를 받지 않도록 설계되어 있습니다. 만 14세 미만 이용자는 신고 글이나 사진에 자신이나 다른 사람의 개인정보를 넣기 전에 보호자와 상의해 주세요. 만 14세 미만 아동의 개인정보 처리에 동의가 필요한 경우 법정대리인의 동의를 받아야 합니다(「개인정보 보호법」 제22조의2).</p>,
  },
  {
    id: "p-security",
    title: "9. 안전 조치",
    body: <ul className="list-disc space-y-1 pl-5">
      <li>운영진·교사 기능은 로그인 후에만 쓸 수 있고, 교사는 소속 학교 신고만 볼 수 있습니다.</li>
      <li>운영진·교사·관리자 비밀번호는 원문 없이 bcrypt 해시로만 서버 설정에 보관합니다. 로그인은 자바스크립트로 읽을 수 없는 HttpOnly·SameSite=Strict·Secure 쿠키로 8시간 유지하며, 로그인 시도는 15분에 5번으로 제한합니다.</li>
      <li>관리자 삭제는 비밀번호 확인 뒤 그 신고 하나에만 쓸 수 있는 2분짜리 1회용 토큰으로만 실행됩니다.</li>
      <li>소유 토큰과 기기 토큰은 원본 대신 해시만 서버에 저장합니다. 알림·상태 확인 화면에도 웹훅 주소 같은 비밀값을 내보내지 않습니다.</li>
      <li>데이터베이스는 서버 전용 키로만 접근하고, 브라우저에서 직접 읽거나 쓸 수 없게 막았습니다.</li>
      <li>첨부는 PNG·JPG·GIF·WEBP 이미지만 받고, 파일 앞부분으로 실제 이미지인지 확인합니다. 외부 이미지 주소는 받지 않아 신고를 보는 사람의 접속 정보가 다른 사이트로 새지 않습니다.</li>
      <li>사진은 신고 기록과 따로 비공개 저장소에 보관하고 서비스 서버를 거쳐서만 보여 줍니다. 공개 보류 신고의 사진은 운영진만 열 수 있고, 반려·장난 신고 처리·삭제된 신고의 사진은 저장소에서 지웁니다.</li>
      <li>요청 횟수 제한(이용약관 제8조), 서버 측 입력값 검증, HTTPS 강제(HSTS)와 콘텐츠 보안 정책(CSP) 등 보안 헤더를 적용하고, 오류 화면에는 내부 정보를 내보내지 않습니다. 다만 인터넷 전송과 외부 서비스의 위험을 완전히 없앨 수는 없습니다.</li>
    </ul>,
  },
  {
    id: "p-change",
    title: "10. 안내 변경과 참고",
    body: <>
      <p>이 안내는 현재 서비스 코드와 운영 설정을 바탕으로 작성했습니다. 기능이나 외부 제공자가 바뀌면 내용을 고치고 시행일을 갱신합니다.</p>
      <Callout tone="warn">이 안내는 법률 자문이 아닙니다. 운영 주체의 정확한 명칭, 처리 근거, 보유 기간, 국외 이전 방식은 실제 운영 실태와 대조해 확정해야 합니다.</Callout>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        <a className="font-semibold text-blue-700 underline" href="https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1034516739" target="_blank" rel="noreferrer">개인정보 보호법 제21조(파기)</a>
        <a className="font-semibold text-blue-700 underline" href="https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1020398523" target="_blank" rel="noreferrer">제22조의2(아동)</a>
        <a className="font-semibold text-blue-700 underline" href="https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1034292881" target="_blank" rel="noreferrer">제28조의8(국외 이전)</a>
        <a className="font-semibold text-blue-700 underline" href="https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1034292763" target="_blank" rel="noreferrer">제30조(처리방침)</a>
      </div>
    </>,
  },
];

// ---------------------------------------------------------------------------

export function ServicePolicyDialog({ section, onClose }: Props) {
  const [activeSection, setActiveSection] = useState<PolicySection>(section);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // 탭을 바꾸면 맨 위부터 보여 준다.
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [activeSection]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="service-policy-title" className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
          <div><p className="text-xs font-bold text-blue-700">SchoolFix AI</p><h2 id="service-policy-title" className="mt-1 text-xl font-extrabold text-slate-950">이용 안내 및 운영 정책</h2></div>
          <button type="button" aria-label="닫기" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>
        <nav aria-label="안내 종류" className="flex gap-2 border-b border-slate-100 px-5 pt-3 sm:px-6">
          {TABS.map((tab) => (
            <button key={tab.id} type="button" aria-pressed={activeSection === tab.id} onClick={() => setActiveSection(tab.id)} className={`border-b-2 px-2 pb-3 text-sm font-bold ${activeSection === tab.id ? "border-blue-700 text-blue-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{tab.label}</button>
          ))}
        </nav>
        <div ref={bodyRef} className="relative overflow-y-auto p-5 text-sm leading-7 text-slate-700 sm:p-6">
          {activeSection === "guide" ? (
            <Doc scrollRoot={bodyRef} title="SchoolFix AI 이용 방법" subtitle={`학교 시설 문제를 신고하고 처리 상황을 확인하는 방법 · 최종 수정 ${EFFECTIVE_DATE}`} sections={GUIDE_SECTIONS} />
          ) : activeSection === "terms" ? (
            <Doc scrollRoot={bodyRef} title="SchoolFix AI 서비스 이용약관" subtitle={`시행일 ${EFFECTIVE_DATE}`} intro={<Callout>SchoolFix는 학교 시설의 불편·위험 신고를 접수하고 처리 상황을 공유하는 서비스입니다. 학교·교육청의 공식 민원·긴급 신고 창구가 아니며, 학교의 조치나 답변을 대신하지 않습니다.</Callout>} sections={TERMS_SECTIONS} />
          ) : (
            <Doc scrollRoot={bodyRef} title="개인정보 수집·이용 안내" subtitle={`시행일 ${EFFECTIVE_DATE}`} intro={<Callout>SchoolFix는 로그인 없이 쓰는 서비스로, 이름·학번·연락처를 받지 않습니다. 아래는 서비스가 실제로 처리하는 정보와 그 이유입니다.</Callout>} sections={PRIVACY_SECTIONS} />
          )}
        </div>
        <footer className="border-t border-slate-100 p-4 text-right"><button type="button" onClick={onClose} className="min-h-10 rounded-lg bg-blue-700 px-5 py-2 text-sm font-bold text-white">닫기</button></footer>
      </section>
    </div>
  );
}
