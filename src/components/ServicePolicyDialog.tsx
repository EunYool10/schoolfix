import { useEffect, useState } from "react";
import { X } from "lucide-react";

export type PolicySection = "guide" | "terms" | "privacy";




interface Props {
  section: PolicySection;
  onClose: () => void;
}




export function ServicePolicyDialog({ section, onClose }: Props) {
  const [activeSection, setActiveSection] = useState<PolicySection>(section);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);




  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="service-policy-title" className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
          <div><p className="text-xs font-bold text-blue-700">SchoolFix AI</p><h2 id="service-policy-title" className="mt-1 text-xl font-extrabold text-slate-950">운영규정 및 서비스 안내</h2></div>
          <button type="button" aria-label="닫기" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>
        <nav aria-label="서비스 안내 종류" className="flex gap-2 border-b border-slate-100 px-5 pt-3 sm:px-6">
          <button type="button" aria-pressed={activeSection === "terms"} onClick={() => setActiveSection("terms")} className={`border-b-2 px-2 pb-3 text-sm font-bold ${activeSection === "terms" ? "border-blue-700 text-blue-800" : "border-transparent text-slate-500"}`}>서비스 이용약관</button>
          <button type="button" aria-pressed={activeSection === "privacy"} onClick={() => setActiveSection("privacy")} className={`border-b-2 px-2 pb-3 text-sm font-bold ${activeSection === "privacy" ? "border-blue-700 text-blue-800" : "border-transparent text-slate-500"}`}>개인정보 안내</button>
                  <button type="button" aria-pressed={activeSection === "guide"} onClick={() => setActiveSection("guide")} className={`border-b-2 px-2 pb-3 text-sm font-bold ${activeSection === "guide" ? "border-blue-700 text-blue-800" : "border-transparent text-slate-500"}`}>서비스 설명서</button>
</nav>
        <div className="overflow-y-auto p-5 text-sm leading-7 text-slate-700 sm:p-6">
          {activeSection === "guide" ? <>
            <h3 className="text-lg font-extrabold text-slate-900">SchoolFix AI 서비스 설명서</h3>
            <p className="mt-1 text-xs text-slate-500">학교 시설 문제를 제보하고 진행 상황을 확인하는 방법</p>
            <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">SchoolFix AI는 학교 시설의 불편·위험 제보를 접수해 운영진이 검토하고 진행 상태를 공유하도록 돕습니다. 학교·교육청의 공식 민원 창구가 아니며, 상시 모니터링·즉시 출동·수리 완료를 보장하지 않습니다.</p>
            <div className="mt-4 space-y-5">
              <section><h4 className="font-extrabold text-slate-900">1. 학교 찾기와 입장</h4><p>첫 화면의 검색창에 학교 이름 일부를 입력해 찾으세요. 초·중·고 학교급과 고등학교 유형으로 필터링하고 가나다순으로 정렬할 수 있습니다. 학교 카드의 별표는 이 브라우저에 저장됩니다. 학교를 선택한 뒤 ‘학교에 입장’을 누르세요. 목록에 없는 학교는 ‘우리 학교 추가 신청’에서 검토를 요청할 수 있습니다.</p></section>
              <section><h4 className="font-extrabold text-slate-900">2. 신고 작성과 제출</h4><p>신고 화면에서 장소와 문제 종류를 선택하고, 언제부터·어느 지점에서·무엇이 어떻게 불편하거나 위험한지 적으세요. 건물명·층·주변 시설처럼 위치를 찾는 데 필요한 정보가 도움이 됩니다. 필수 항목을 채우고 ‘신고하기’를 누르면 서버 검토 후 접수번호가 표시됩니다. ‘기타’ 직접 입력은 공식 시설 목록을 새로 등록하는 기능이 아닙니다.</p></section>
              <section><h4 className="font-extrabold text-slate-900">3. 임시 저장·사진·개인정보</h4><p>작성 중인 글은 같은 탭의 세션 저장소에 자동 임시 저장되어 새로고침 후 복구될 수 있습니다. 첨부 사진과 AI 추가 질문 답변은 임시 저장되지 않습니다. 사진은 선택 사항이며 JPG·PNG·GIF·WEBP, 최대 8MB입니다. 시설에 필요한 범위만 촬영하고 얼굴·이름표·학번·연락처·계정 정보·문서 속 개인정보는 제외하거나 가리세요. 타인이 포함된 사진은 제출 권한과 동의를 확인하세요.</p></section>
              <section><h4 className="font-extrabold text-slate-900">4. 접수번호와 진행 상태</h4><p>제출 성공 화면의 접수번호를 복사하거나 따로 기록하세요. ‘내 신고’에서 접수번호로 이 브라우저의 신고 상태를 확인할 수 있습니다. 접수 대기는 담당자 확인 전, 확인 중은 내용 검토, 담당자 배정은 확인 담당자 지정, 조치 예정은 후속 조치 계획, 처리 중은 조치 진행, 처리 완료는 담당자가 완료로 갱신한 상태입니다. 업무 사정에 따라 단계가 생략되거나 오래 유지될 수 있으며, 이는 학교 공식 답변이나 수리 증명서가 아닙니다.</p></section>
              <section><h4 className="font-extrabold text-slate-900">5. 학교 추가 신청</h4><p>학교 공식 명칭·홈페이지·주소·신청 사유를 입력하고 약관과 개인정보 안내를 확인하세요. ‘웹 내부로 전달’은 운영진 전용 신청함에 저장됩니다. ‘메일로 전달’은 메일 앱에 초안만 열므로 앱에서 직접 전송해야 접수됩니다. 회신 이메일은 선택 항목이며, 신청은 학교 등록이나 회신 시점을 보장하지 않습니다.</p></section>
              <section><h4 className="font-extrabold text-slate-900">6. 자동 확인과 운영진 검토</h4><p>신고 글과 사진은 안전성 자동 분석 대상이 될 수 있지만, 결과는 참고용이며 오탐·누락이 있을 수 있습니다. 추가 확인이 필요한 신고는 공개 전에 보류될 수 있고, 운영진이 맥락을 검토해 공개 여부를 정합니다. 개인정보 노출, 욕설·괴롭힘, 허위 주장, 부적절하거나 권리를 침해하는 이미지는 수정 요청·비공개·삭제 대상이 될 수 있습니다.</p></section>
              <section><h4 className="font-extrabold text-slate-900">7. 긴급 상황과 문의</h4><p>화재·폭력·부상·붕괴 우려처럼 즉시 대응이 필요한 상황은 서비스에만 신고하지 마세요. 주변 교직원·보호자에게 바로 알리고 필요한 경우 112·119 또는 관계 기관에 직접 연락하세요. 일반 문의와 개인정보 요청은 eunyool100208@gmail.com으로 보내 주세요.</p></section>
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">브라우저 데이터 삭제 시 내 신고 연결 정보가 사라질 수 있습니다. 서버 자료도 현재 배포 환경에서 영구 보관·백업을 보장하지 않으며 재시작·재배포·장애 시 초기화될 수 있습니다. 접수번호와 필요한 내용을 별도로 보관하세요. 외부 처리와 이용 기준은 ‘서비스 이용약관’ 및 ‘개인정보 안내’에서 확인해 주세요.</p>
            </div>
          </> : activeSection === "terms" ? <>
            <h3 className="text-lg font-extrabold text-slate-900">SchoolFix AI 운영규정 및 서비스 이용 안내</h3>
            <p className="mt-1 text-xs text-slate-500">시행일: 2026년 10월 10일</p>
            <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">SchoolFix는 학교 시설의 불편·위험 제보를 접수하고 진행 상태를 공유하는 서비스입니다. 학교나 교육기관의 공식 민원·긴급 신고 창구가 아니며, 학교의 조치나 답변을 대신하지 않습니다.</p>
            <ol className="mt-4 list-decimal space-y-4 pl-5">
              <li><strong>용어와 적용 범위.</strong> “신고”는 이용자가 선택한 학교·장소와 시설 문제 설명을 서비스에 제출하는 행위입니다. “운영진”은 전체 학교 신고와 학교 추가 신청을 확인하는 서비스 관리자이며, “교사 계정”은 설정된 학교 한 곳의 신고 처리 기능만 사용하는 계정입니다. 서비스 화면의 ‘처리 완료’는 담당자가 상태를 변경했다는 뜻으로, 학교의 공식 확인이나 보수 결과를 독립적으로 검증했다는 뜻은 아닙니다.</li>
              <li><strong>목적과 서비스.</strong> 이 약관은 SchoolFix AI(이하 “서비스”)를 이용해 학교 시설 문제를 제보하고, 학교 추가 지원을 신청할 때 필요한 기본 사항을 정합니다. 서비스는 제보 내용을 학교 시설 확인과 안전 개선을 위한 참고 자료로 전달합니다.</li>
              <li><strong>긴급 상황.</strong> 서비스는 긴급 구조·신고 기관이 아니며 제보 즉시 확인이나 조치를 보장하지 않습니다. 다치거나 즉각적인 위험이 있으면 교직원·보호자에게 알리고 112·119 등 해당 기관에 먼저 연락해 주세요.</li>
              <li><strong>정확하고 안전한 작성.</strong> 실제로 확인한 내용을 구체적으로 작성해 주세요. 다른 사람의 이름·연락처·얼굴이 나온 사진, 건강 정보, 비밀번호 등 불필요한 개인정보를 입력하거나 첨부하지 마세요. 허위 내용, 괴롭힘·모욕, 불법 촬영물 및 타인의 권리를 침해하는 자료는 등록하지 마세요.</li>
              <li><strong>검토와 공개.</strong> 신고는 운영진의 검토 또는 자동 안전성 확인 중 공개가 보류될 수 있습니다. 부적절한 내용이나 개인정보가 포함된 자료는 수정·비공개·삭제될 수 있습니다. 학교 추가 신청은 정보 확인 후 지원 여부를 별도로 결정하며, 신청만으로 학교가 추가되는 것은 아닙니다.</li>
              <li><strong>AI 및 오류.</strong> 제보 내용은 안전성 확인, 위험도 분류, 요약을 위해 자동 분석될 수 있습니다. 자동 분석은 참고용이며 사실 확인이나 학교의 공식 판단을 대신하지 않습니다. 서비스는 점검·장애·외부 제공자 문제로 일시 중단되거나 기능이 바뀔 수 있습니다.</li>
              <li><strong>표현 마스킹과 안전성 보류.</strong> 신고 제목·본문에서 시스템이 인식한 욕설·비하 표현은 일부 마스킹될 수 있습니다. 마스킹은 모든 표현을 찾아내거나 의미를 완벽히 보존하지 않으며, 신고 사실이나 주장의 진위를 확인하지 않습니다. 부적절한 텍스트는 규칙 기반 확인을 거치며, 사진이 첨부되면 자동 안전성 검사 결과에 따라 공개가 보류될 수 있습니다. 검사 기능 또는 외부 API가 작동하지 않는 경우에도 이미지 신고는 운영진 확인 전까지 숨겨질 수 있습니다.</li>
              <li><strong>계정·권한과 운영.</strong> 일반 제보에는 학생 계정 로그인이 필요하지 않습니다. 운영진 계정은 전체 지원 학교의 신고와 학교 추가 신청함에 접근할 수 있습니다. 교사 계정은 로그인 시 선택한 학교 신고만 관리하고 타 학교 자료에는 접근할 수 없습니다. 계정 비밀번호를 공유하지 말고, 공용 기기에서는 사용 후 로그아웃하세요. 운영자는 법령 준수와 안전 확보를 위해 신고를 보류·비공개·삭제하거나 기능을 제한할 수 있습니다.</li>
              <li><strong>위험 신고와 공식 절차.</strong> 이 서비스는 학교 또는 교육청의 공식 민원·시설점검·긴급신고 채널이 아닙니다. 신고 내용이 학교 관계자에게 전달되더라도 공식 접수, 현장 확인, 보수, 징계 또는 답변이 보장되지 않습니다. 즉각적인 위험은 교직원·보호자와 112·119 등 관계 기관에 바로 알리세요.</li>
              <li><strong>법령과 금지 행위.</strong> 이용자는 타인의 개인정보·초상·명예·저작권을 침해하는 자료, 허위 사실을 이용한 비방·모욕, 동의 없는 신체 촬영물·성적 이미지, 아동·청소년 성착취물, 협박·괴롭힘 자료를 작성·첨부·공유하면 안 됩니다. 관련 법령에는 「개인정보 보호법」, 「형법」 제307조(명예훼손)·제311조(모욕), 「성폭력범죄의 처벌 등에 관한 특례법」 제14조(카메라 등을 이용한 촬영), 「저작권법」 제103조(복제·전송의 중단) 등이 있습니다. 신고 서비스 이용이 위법 행위를 정당화하지 않습니다.</li>
              <li><strong>검토·비공개·권리침해 요청.</strong> 자동 검토 결과와 이용자 신고를 바탕으로 공개를 보류하거나 게시물을 숨길 수 있습니다. 권리 침해를 주장하는 사람은 게시물 접수번호 또는 URL, 침해 대상, 본인의 권리와 요청 사유를 이메일로 보내 주세요. 운영자는 확인에 필요한 최소 정보를 요청할 수 있고, 검토 중 임시 비공개할 수 있습니다. 허위 요청이나 다른 사람의 권리를 침해하는 용도로는 사용하지 마세요.</li>
              <li><strong>AI 분석과 이의 제기.</strong> 자동 분류·요약·안전성 판단은 참고 정보이며 학교의 사실 확인, 긴급 대응, 공식 결정이나 법률 판단이 아닙니다. 잘못된 보류·비공개·분류에 대한 정정 요청은 접수번호와 사유를 이메일로 보내 주세요. 운영진이 사람이 확인해 수정 또는 삭제 여부를 판단합니다.</li>
              <li><strong>신고 접수 및 본인 조회.</strong> 일반 신고는 계정이나 실명 없이 접수됩니다. 접수 후 안내되는 접수번호를 보관해 주세요. ‘내 신고’ 조회는 접수에 사용한 브라우저에 저장된 확인 정보로 연결되므로 브라우저 데이터 삭제, 기기 변경 또는 초기화 뒤에는 조회되지 않을 수 있습니다.</li>
              <li><strong>처리 단계 안내.</strong> 신고 상태는 접수 대기, 확인 중, 담당자 배정, 조치 예정, 처리 중, 처리 완료로 표시될 수 있습니다. 학교의 실제 업무에 따라 단계를 건너뛰거나 갱신이 늦어질 수 있으며, 상태 표시는 공식 확인서·완료 증명서가 아니고 처리 기한이나 결과를 보장하지 않습니다.</li>
              <li><strong>공개 보류와 운영진 검토.</strong> 글이나 첨부 이미지가 자동 안전성 확인에서 추가 검토 대상으로 분류되면 승인 전까지 공개 목록에서 숨겨질 수 있습니다. 운영진은 보류 사유와 자료를 확인해 공개 승인 또는 삭제를 결정합니다. 자동 분류에는 오류가 있을 수 있으므로 검토를 요청하려면 접수번호와 사유를 문의 이메일로 보내 주세요.</li>
              <li><strong>학교 추가 신청 전달.</strong> ‘웹 내부로 전달’을 선택하면 신청 내용이 운영진 전용 신청함에 저장됩니다. ‘메일로 전달’을 선택하면 기기의 메일 앱에 신청 초안이 열리며, 이용자가 메일 앱에서 직접 전송해야 신청이 전달됩니다. 접수 후에도 학교 확인과 지원 여부 검토가 필요하며 등록이나 회신 시점은 보장되지 않습니다.</li>
              <li><strong>서비스 자료 보관 한계와 백업.</strong> 현재 배포 설정은 Render 무료 웹 서비스와 컨테이너 파일 저장소를 사용하며 영구 디스크·별도 백업을 설정하지 않았습니다. 재시작·재배포·인스턴스 교체 시 신고·학교 신청 데이터나 로그인 세션이 사라질 수 있습니다. 운영자도 장기 보관이나 복구를 보장할 수 없으므로 접수번호를 별도로 기록하세요. 서비스 장애나 저장 한계 때문에 자료가 유실된 경우, 확인 가능한 범위에서 안내하지만 복구를 보장하지 않습니다.</li>
              <li><strong>이용 제한과 이의 문의.</strong> 반복적인 허위 신고, 자동화된 대량 요청, 보안 우회, 타인의 개인정보·권리를 침해하는 이용은 요청 제한이나 게시물 비공개로 이어질 수 있습니다. 조치가 잘못되었다고 생각하면 접수번호, 문제 화면, 요청 사유를 문의 이메일로 보내 주세요. 긴급 위험 신고나 법정 민원은 본 서비스의 문의 절차를 기다리지 말고 관계 기관에 직접 접수하세요.</li>
              <li><strong>문의.</strong> 약관 또는 서비스 이용에 관한 문의는 <a className="font-semibold text-blue-700 underline" href="mailto:eunyool100208@gmail.com">eunyool100208@gmail.com</a>으로 보내 주세요.</li>
            </ol>
            <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">법률 조항은 이용자가 지켜야 할 핵심 기준을 안내하기 위한 것입니다. 사건의 위법성·책임·구제 절차는 구체적 사실과 현행 법령에 따라 관계 기관 또는 법률 전문가가 판단합니다.</p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
              <a className="font-semibold text-blue-700 underline" href="https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1032386799" target="_blank" rel="noreferrer">형법 제307조</a>
              <a className="font-semibold text-blue-700 underline" href="https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1032061997" target="_blank" rel="noreferrer">성폭력처벌법 제14조</a>
              <a className="font-semibold text-blue-700 underline" href="https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1033064063" target="_blank" rel="noreferrer">저작권법 제103조</a>
            </div>
          </> : <>
            <h3 className="text-lg font-extrabold text-slate-900">개인정보 수집·이용 안내</h3>
            <p className="mt-1 text-xs text-slate-500">시행일: 2026년 10월 9일</p>
            <div className="mt-4 space-y-4">
              <section><h4 className="font-extrabold text-slate-900">한눈에 보는 처리 항목</h4><div className="overflow-x-auto"><table className="mt-2 w-full min-w-[34rem] border-collapse text-left text-xs leading-relaxed"><thead><tr className="bg-slate-50"><th className="border border-slate-200 p-2">구분</th><th className="border border-slate-200 p-2">처리 정보</th><th className="border border-slate-200 p-2">목적·접근 범위</th></tr></thead><tbody><tr><td className="border border-slate-200 p-2">시설 신고</td><td className="border border-slate-200 p-2">학교·위치·유형·제목·본문·첨부 사진·접수 및 상태 변경 시각</td><td className="border border-slate-200 p-2">신고 접수·검토·상태 공유. 공개 승인된 신고는 누구나 볼 수 있고, 보류 신고는 운영진 검토 화면에서만 확인</td></tr><tr><td className="border border-slate-200 p-2">신고 조회 연결</td><td className="border border-slate-200 p-2">브라우저의 익명 조회 토큰, 서버에 저장되는 토큰 해시</td><td className="border border-slate-200 p-2">이용자가 본인 신고를 다시 찾도록 연결. 원본 토큰은 서버 DB에 저장하지 않음</td></tr><tr><td className="border border-slate-200 p-2">학교 추가 신청</td><td className="border border-slate-200 p-2">학교명·홈페이지·주소/지역·사유·추가 요청·선택 회신 이메일</td><td className="border border-slate-200 p-2">신청 확인. 내부 신청함은 운영진만 접근하며 공개 신고 목록에 노출하지 않음</td></tr><tr><td className="border border-slate-200 p-2">보안·운영</td><td className="border border-slate-200 p-2">요청 처리에 필요한 IP 기반 해시, 운영진 로그인 세션 쿠키 및 서버 메모리 세션</td><td className="border border-slate-200 p-2">요청 횟수 제한과 인증. 원본 IP를 신고 데이터 레코드로 저장하지 않음</td></tr></tbody></table></div><p className="mt-2 text-xs text-slate-500">신고 글·이미지 안에 본인이나 제3자의 이름, 얼굴, 학번, 연락처, 건강·상담 정보가 들어가면 서비스가 입력값과 별도로 그 정보를 받게 됩니다. 꼭 필요한 경우가 아니면 입력하거나 첨부하지 마세요.</p></section>
              <section><h4 className="font-extrabold text-slate-900">개인정보 처리자와 연락 창구</h4><p><strong>서비스 운영자:</strong> SchoolFix AI 서비스 운영자. <strong>개인정보 보호 문의 창구:</strong> <a className="font-semibold text-blue-700 underline" href="mailto:eunyool100208@gmail.com">eunyool100208@gmail.com</a>. 개인정보 처리 관련 열람·정정·삭제·처리정지 요청, 유출 우려 신고 및 불만은 이메일로 접수할 수 있습니다. 요청 확인을 위해 접수번호나 학교 신청 ID를 알려 주세요. 이메일 본문에는 불필요한 민감정보를 적지 마세요.</p></section>
              <section><h4 className="font-extrabold text-slate-900">학교 추가 신청에서 처리하는 정보</h4><p><strong>필수:</strong> 학교명, 공식 홈페이지, 주소 또는 지역, 신청 사유. <strong>선택:</strong> 추가 요청 사항, 회신 이메일. 학교 지원 여부 검토와 답변에만 사용합니다. 내부 전달을 선택하면 입력값이 서버의 운영진 신청함에 저장되고 로그인한 운영진이 확인합니다. 메일 앱 전달을 선택하면 입력값이 기기의 메일 앱에 전달되어, 실제 전송·저장·삭제는 이용자가 선택한 메일 서비스의 정책을 따릅니다.</p><p><strong>보유 기간:</strong> 현재 신청함에는 자동 만료 기간이 설정되어 있지 않습니다. 코드상 운영진은 신청을 ‘확인 완료’로 표시하거나 삭제할 수 있지만, 검토 완료 시 자동 삭제되지는 않습니다. 삭제를 원하면 신청 ID와 함께 위 이메일로 요청해 주세요. 실제 전송 여부는 메일 앱에서 확인해야 합니다. 현재 무료 배포 서버에는 영구 디스크·별도 백업이 없으므로 재시작·재배포 시 파일 데이터가 사라질 수 있습니다.</p><p><strong>동의와 선택:</strong> 학교 추가 신청 폼은 이용약관과 개인정보 안내 동의 확인을 필수로 받습니다. 필수 정보 처리에 동의하지 않으면 웹 내부 신청을 보낼 수 없습니다. 회신 이메일은 선택 정보이고 미입력해도 신청할 수 있습니다. 안내에 동의하지 않으면 학교 추가 신청 기능을 이용하지 마세요.</p></section>
              <section><h4 className="font-extrabold text-slate-900">신고에서 처리·공개되는 정보</h4><p>신고 시 선택한 학교·위치·공식 시설, 직접 입력한 건물·층·학과·학년·반·구역, 선택형 제목·문제 유형, 신고 내용, 첨부 이미지와 파일 이름·크기, 접수·처리 상태 및 담당자·처리 메모를 처리합니다. 계정·실명·학번·연락처 입력은 요구하지 않습니다. 다만 신고 본문이나 사진에 사람을 알아볼 수 있는 정보가 포함되면 개인정보가 될 수 있으므로 얼굴, 이름표, 연락처, 건강정보 등은 가리거나 올리지 마세요.</p><p>안전성 검토 보류 신고는 승인 전까지 공개 목록·일반 상세 조회·통계에서 숨기며 운영진 검토 화면에서만 볼 수 있습니다. 승인된 신고의 제목, 위치 설명, 본문, 첨부 이미지와 처리 상태 및 처리 메모는 공개 화면에 표시될 수 있습니다. 실명·연락처를 넣지 않더라도 구체적 장소·사건 설명으로 개인을 알아볼 수 있다면 개인정보 노출이 될 수 있습니다. 신고자 소유 확인용 원본 토큰은 제출 응답 후 브라우저 localStorage에 보관되고, 서버에는 토큰의 해시만 저장합니다. 토큰이 든 브라우저를 다른 사람과 공유하지 마세요. 서버는 요청 횟수 제한을 위해 접속 IP에서 만든 해시를 서버 메모리에 사용하며 원본 IP를 신고 자료 레코드로 저장하지 않습니다. 호스팅 사업자가 네트워크·접속 기록을 별도로 처리할 수 있습니다.</p><p><strong>처리 목적:</strong> 신고 접수·본인 신고 조회·운영진 검토·시설 조치 상태 공개·통계·반복 신고 맥락 확인·안전성 및 위험도 분석. 작성 초안은 해당 브라우저 탭의 sessionStorage에 임시 저장되며 첨부 이미지와 AI 추가 질문 답변은 초안 저장에서 제외됩니다. 학교 선택값과 신고 소유 토큰은 localStorage에 저장될 수 있고, 운영진 인증 상태는 HttpOnly 세션 쿠키로 전달됩니다. 브라우저 저장 데이터 삭제 시 본인 신고 연결 정보나 선택 학교 값이 사라질 수 있습니다.</p></section>
              <section><h4 className="font-extrabold text-slate-900">외부 제공자 처리와 국외 이전</h4><p><strong>Render 호스팅:</strong> 수신자 Render Services, Inc. (문의: <a className="font-semibold text-blue-700 underline" href="mailto:privacy@render.com">privacy@render.com</a>). 서비스 인스턴스와 파일은 현재 싱가포르 리전에서 처리됩니다. 서버 운영·계정·보안 활동 정보는 Render의 다른 지역 인프라와 관련될 수 있습니다. 이 전송은 사이트 요청과 호스팅을 위해 이루어집니다. 현재 무료 서버에는 영구 디스크와 별도 백업을 설정하지 않아 신고·신청 파일은 인스턴스에서 운용되고 재시작·재배포 때 초기화될 수 있습니다. Render는 사이트 운영에 필요한 호스팅 제공자로서 관련 정보를 처리합니다. 자세한 조건은 Render의 정책을 확인해 주세요.</p><p><strong>OpenAI API (기능이 활성화된 경우):</strong> 수신자 OpenAI OpCo, LLC 및 공개된 계열사·처리 하위사업자 (문의: <a className="font-semibold text-blue-700 underline" href="mailto:privacy@openai.com">privacy@openai.com</a>). OPENAI_API_KEY가 서버에 설정되면 제목·본문·선택한 위치·문제 유형과 유사 신고 일부가 추가 질문·요약·위험도 분석에, 제목·본문 및 첨부 이미지가 안전성 검사에 사용될 수 있습니다. 각 기능 실행 시 HTTPS API로 필요한 입력이 전송됩니다. 활성 키가 없거나 API 요청에 실패하면 기능 일부가 생략되거나 제한된 로컬 규칙으로 처리될 수 있습니다. OpenAI API 입력·출력은 기본적으로 모델 학습에 사용되지 않지만 API별 남용 감시 로그 및 설정·예외에 따라 보유 방식이 달라질 수 있습니다. 국가·보유 조건은 계정 설정과 OpenAI 최신 안내를 함께 확인해 주세요. 처리 위치는 OpenAI 인프라 및 적용 설정에 따릅니다.</p><p><strong>이전 관련 안내:</strong> 서비스는 Render 싱가포르 리전에서 제공되며, 위와 같이 AI 기능을 실행하면 신고 정보가 OpenAI API로 전달될 수 있습니다. 현행 신고 양식에는 AI 전송을 끄는 별도 선택란이 없습니다. 따라서 관련 정보의 외부 처리에 동의하지 않는 경우에는 식별정보나 민감정보를 포함한 자료를 입력·첨부하지 말고 온라인 신고 기능을 이용하지 마세요. 학교 신청을 이메일 앱 방식으로 보내면 신청 내용은 이용자가 선택한 메일 서비스로도 전송됩니다. 제공자, 전달 항목, 처리 국가, 목적이나 보유 조건이 바뀌면 이 안내도 함께 갱신합니다.</p><div className="flex flex-wrap gap-x-4 gap-y-2 text-xs"><a className="font-semibold text-blue-700 underline" href="https://render.com/privacy" target="_blank" rel="noreferrer">Render 개인정보 처리방침</a><a className="font-semibold text-blue-700 underline" href="https://render.com/dpa" target="_blank" rel="noreferrer">Render DPA</a><a className="font-semibold text-blue-700 underline" href="https://render.com/docs/regions" target="_blank" rel="noreferrer">Render 리전 안내</a><a className="font-semibold text-blue-700 underline" href="https://openai.com/policies/sub-processor-list/" target="_blank" rel="noreferrer">OpenAI 처리 하위사업자</a><a className="font-semibold text-blue-700 underline" href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noreferrer">OpenAI API 데이터 보유·학습 정책</a></div></section>
              <section><h4 className="font-extrabold text-slate-900">보유 기간과 삭제 절차</h4><p><strong>신고:</strong> 자동 만료 기간이 설정되어 있지 않습니다. 서비스 운영 목적에 필요한 기간 동안 파일 데이터에 보관될 수 있습니다. 일반 이용자는 신고 삭제 기능에서 접수번호와 삭제용 비밀번호를 확인해 요청할 수 있고, 비밀번호를 모르는 경우 접수번호와 삭제 사유를 이메일로 문의할 수 있습니다. 운영진이 삭제하면 현재 구현상 공개 화면에서 제외되고 deletedAt 삭제 표시가 서버 자료에 남습니다. 이는 파일에서 즉시 물리 삭제하는 기능과 같지 않습니다.</p><p><strong>학교 신청:</strong> 자동 만료되지 않으며 운영진이 신청함에서 직접 삭제할 수 있습니다. 확인 완료 상태 변경은 삭제가 아닙니다.</p><p><strong>브라우저·세션 자료:</strong> 신고 작성 초안은 현재 탭의 세션 저장소에 임시 저장됩니다. 학교 선택값·신고 소유 확인 토큰은 브라우저 저장소에 남을 수 있으며 사용자가 사이트 데이터 또는 브라우저 저장 자료를 삭제할 수 있습니다. 운영진 로그인 세션은 서버 메모리에 유효기간 8시간으로 보관하고 HttpOnly·SameSite 쿠키로 접근합니다. 서버 재시작 시 세션은 사라집니다.</p><p><strong>서비스 환경 한계:</strong> 서버 파일 데이터는 자동 보유기간이 없지만 Render 무료 인스턴스의 재시작·재배포 등으로 예고 없이 소실될 수 있습니다. 이 안내의 “저장 중”은 장기 보존·백업·복구 보장을 뜻하지 않습니다. 법령상 보존 의무가 실제로 적용되는 경우에는 해당 근거와 기간을 확인해 필요한 자료만 별도 관리합니다. 개인정보 보호법 제21조에 따른 파기 의무를 포함한 구체적 보유기간은 운영 기반이 변경될 때 이 방침을 다시 검토합니다.</p></section>
              <section><h4 className="font-extrabold text-slate-900">정보주체의 권리와 아동 보호</h4><p>「개인정보 보호법」에 따라 본인 또는 적법한 대리인은 개인정보 열람, 정정·삭제, 처리정지를 요청할 수 있습니다. 운영자는 본인 여부와 요청 범위를 확인한 뒤 법령상 제한 여부를 검토하여 처리 결과를 안내합니다. 만 14세 미만 아동의 개인정보 처리에 동의가 필요한 경우 법정대리인의 동의를 받고 이를 확인해야 합니다. 서비스는 신고 내용·사진에 학생 본인이나 다른 사람의 식별정보·민감정보를 적지 않도록 요청하며, 만 14세 미만 이용자는 이름·연락처 등 개인정보를 입력하거나 타인의 정보를 첨부하기 전에 보호자와 확인해 주세요.</p></section>
              <section><h4 className="font-extrabold text-slate-900">요청 접수·처리 방법</h4><p>열람·정정·삭제·처리정지 요청은 <a className="font-semibold text-blue-700 underline" href="mailto:eunyool100208@gmail.com">eunyool100208@gmail.com</a>으로 보내 주세요. 신고는 접수번호와 삭제 비밀번호(있는 경우)를, 학교 신청은 신청 ID를 적으면 대상 자료를 찾는 데 도움이 됩니다. 다른 사람 자료의 무단 삭제 방지를 위해 요청자의 권한을 확인할 수 있으며, 이메일로 신분증 사본이나 주민등록번호 전체를 먼저 보내지 마세요. 추가 확인이 필요하면 최소한의 정보만 별도로 안내합니다. 법령상 처리 제한 또는 예외가 적용되는 경우 그 사유와 가능한 처리 방법을 회신합니다. 개인정보 침해 상담·분쟁 조정은 개인정보보호위원회 또는 개인정보침해 신고센터 등 관계 기관에 문의할 수 있습니다.</p></section>
              <section><h4 className="font-extrabold text-slate-900">안전조치와 관련 법령</h4><p>운영진 신청함과 관리 기능은 운영진 인증 후 이용하도록 제한하며, 교사 계정은 학교 ID를 기준으로 소속 학교 신고만 처리할 수 있습니다. 운영진·교사 비밀번호는 환경 설정에 bcrypt 해시 형태로 두고, 운영진 세션은 HttpOnly·SameSite 쿠키와 서버 메모리 세션으로 관리합니다. 신고 소유 확인 토큰 원문은 서버에 저장하지 않고 해시를 저장합니다. IP 기반 요청 제한, 입력 검증, 보안 헤더를 적용하지만 인터넷 전송·호스팅 환경의 위험을 완전히 제거한다고 보장하지는 않습니다. 법률상 처리 근거나 적절한 동의 방식은 실제 운영 주체·연령·이용 환경에 따라 달라질 수 있으므로, 공개적으로 운영하기 전에 개인정보 보호법상 의무와 이 동의 화면을 담당자가 확인해야 합니다.</p><p>이 안내는 현재 코드와 배포 설정을 바탕으로 작성한 서비스 설명이며, 개인정보 처리방침의 법률상 완전성이나 적법성을 보증하는 법률 자문은 아닙니다. 운영 주체의 정확한 명칭·연락처, 처리 근거, 보유기간, 외부 사업자 계약·국외 이전 방식은 실제 계정 및 운영 실태와 대조해 확정해야 합니다.</p><div className="flex flex-wrap gap-x-4 gap-y-2 text-xs"><a className="font-semibold text-blue-700 underline" href="https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1034516739" target="_blank" rel="noreferrer">개인정보 보호법 제21조(파기)</a><a className="font-semibold text-blue-700 underline" href="https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1034292881" target="_blank" rel="noreferrer">개인정보 보호법 제28조의8(국외 이전)</a><a className="font-semibold text-blue-700 underline" href="https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1034292763" target="_blank" rel="noreferrer">개인정보 보호법 제30조(처리방침)</a><a className="font-semibold text-blue-700 underline" href="https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1020398523" target="_blank" rel="noreferrer">개인정보 보호법 제22조의2(아동)</a></div></section>
            </div>
          </>}
        </div>
        <footer className="border-t border-slate-100 p-4 text-right"><button type="button" onClick={onClose} className="min-h-10 rounded-lg bg-blue-700 px-5 py-2 text-sm font-bold text-white">닫기</button></footer>
      </section>
    </div>
  );
}
