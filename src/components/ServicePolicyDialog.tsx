import { useState } from "react";
import { X } from "lucide-react";


export type PolicySection = "terms" | "privacy";


interface Props {
  section: PolicySection;
  onClose: () => void;
}


export function ServicePolicyDialog({ section, onClose }: Props) {
  const [activeSection, setActiveSection] = useState<PolicySection>(section);


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
        </nav>
        <div className="overflow-y-auto p-5 text-sm leading-7 text-slate-700 sm:p-6">
          {activeSection === "terms" ? <>
            <h3 className="text-lg font-extrabold text-slate-900">SchoolFix AI 운영규정 및 서비스 이용 안내</h3>
            <p className="mt-1 text-xs text-slate-500">시행일: 2026년 10월 10일</p>
            <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">SchoolFix는 학교 시설의 불편·위험 제보를 접수하고 진행 상태를 공유하는 서비스입니다. 학교나 교육기관의 공식 민원·긴급 신고 창구가 아니며, 학교의 조치나 답변을 대신하지 않습니다.</p>
            <ol className="mt-4 list-decimal space-y-4 pl-5">
              <li><strong>목적과 서비스.</strong> 이 약관은 SchoolFix AI(이하 “서비스”)를 이용해 학교 시설 문제를 제보하고, 학교 추가 지원을 신청할 때 필요한 기본 사항을 정합니다. 서비스는 제보 내용을 학교 시설 확인과 안전 개선을 위한 참고 자료로 전달합니다.</li>
              <li><strong>긴급 상황.</strong> 서비스는 긴급 구조·신고 기관이 아니며 제보 즉시 확인이나 조치를 보장하지 않습니다. 다치거나 즉각적인 위험이 있으면 교직원·보호자에게 알리고 112·119 등 해당 기관에 먼저 연락해 주세요.</li>
              <li><strong>정확하고 안전한 작성.</strong> 실제로 확인한 내용을 구체적으로 작성해 주세요. 다른 사람의 이름·연락처·얼굴이 나온 사진, 건강 정보, 비밀번호 등 불필요한 개인정보를 입력하거나 첨부하지 마세요. 허위 내용, 괴롭힘·모욕, 불법 촬영물 및 타인의 권리를 침해하는 자료는 등록하지 마세요.</li>
              <li><strong>검토와 공개.</strong> 신고는 운영진의 검토 또는 자동 안전성 확인 중 공개가 보류될 수 있습니다. 부적절한 내용이나 개인정보가 포함된 자료는 수정·비공개·삭제될 수 있습니다. 학교 추가 신청은 정보 확인 후 지원 여부를 별도로 결정하며, 신청만으로 학교가 추가되는 것은 아닙니다.</li>
              <li><strong>AI 및 오류.</strong> 제보 내용은 안전성 확인, 위험도 분류, 요약을 위해 자동 분석될 수 있습니다. 자동 분석은 참고용이며 사실 확인이나 학교의 공식 판단을 대신하지 않습니다. 서비스는 점검·장애·외부 제공자 문제로 일시 중단되거나 기능이 바뀔 수 있습니다.</li>
              <li><strong>계정과 운영.</strong> 일반 제보에는 학생 계정 로그인이 필요하지 않습니다. 운영진 전용 화면은 승인된 운영진만 이용해야 합니다. 운영자는 법령 준수, 안전 확보, 서비스 개선을 위해 필요한 범위에서 기능을 제한하거나 게시물을 관리할 수 있습니다.</li>
              <li><strong>위험 신고와 공식 절차.</strong> 이 서비스는 학교 또는 교육청의 공식 민원·시설점검·긴급신고 채널이 아닙니다. 신고 내용이 학교 관계자에게 전달되더라도 공식 접수, 현장 확인, 보수, 징계 또는 답변이 보장되지 않습니다. 즉각적인 위험은 교직원·보호자와 112·119 등 관계 기관에 바로 알리세요.</li>
              <li><strong>법령과 금지 행위.</strong> 이용자는 타인의 개인정보·초상·명예·저작권을 침해하는 자료, 허위 사실을 이용한 비방·모욕, 동의 없는 신체 촬영물·성적 이미지, 아동·청소년 성착취물, 협박·괴롭힘 자료를 작성·첨부·공유하면 안 됩니다. 관련 법령에는 「개인정보 보호법」, 「형법」 제307조(명예훼손)·제311조(모욕), 「성폭력범죄의 처벌 등에 관한 특례법」 제14조(카메라 등을 이용한 촬영), 「저작권법」 제103조(복제·전송의 중단) 등이 있습니다. 신고 서비스 이용이 위법 행위를 정당화하지 않습니다.</li>
              <li><strong>검토·비공개·권리침해 요청.</strong> 자동 검토 결과와 이용자 신고를 바탕으로 공개를 보류하거나 게시물을 숨길 수 있습니다. 권리 침해를 주장하는 사람은 게시물 접수번호 또는 URL, 침해 대상, 본인의 권리와 요청 사유를 이메일로 보내 주세요. 운영자는 확인에 필요한 최소 정보를 요청할 수 있고, 검토 중 임시 비공개할 수 있습니다. 허위 요청이나 다른 사람의 권리를 침해하는 용도로는 사용하지 마세요.</li>
              <li><strong>AI 분석과 이의 제기.</strong> 자동 분류·요약·안전성 판단은 참고 정보이며 학교의 사실 확인, 긴급 대응, 공식 결정이나 법률 판단이 아닙니다. 잘못된 보류·비공개·분류에 대한 정정 요청은 접수번호와 사유를 이메일로 보내 주세요. 운영진이 사람이 확인해 수정 또는 삭제 여부를 판단합니다.</li>
              <li><strong>신고 접수 및 본인 조회.</strong> 일반 신고는 계정이나 실명 없이 접수됩니다. 접수 후 안내되는 접수번호를 보관해 주세요. ‘내 신고’ 조회는 접수에 사용한 브라우저에 저장된 확인 정보로 연결되므로 브라우저 데이터 삭제, 기기 변경 또는 초기화 뒤에는 조회되지 않을 수 있습니다.</li>
              <li><strong>처리 단계 안내.</strong> 신고 상태는 접수 대기, 확인 중, 담당자 배정, 조치 예정, 처리 중, 처리 완료로 표시될 수 있습니다. 학교의 실제 업무에 따라 단계를 건너뛰거나 갱신이 늦어질 수 있으며, 상태 표시는 공식 확인서·완료 증명서가 아니고 처리 기한이나 결과를 보장하지 않습니다.</li>
              <li><strong>공개 보류와 운영진 검토.</strong> 글이나 첨부 이미지가 자동 안전성 확인에서 추가 검토 대상으로 분류되면 승인 전까지 공개 목록에서 숨겨질 수 있습니다. 운영진은 보류 사유와 자료를 확인해 공개 승인 또는 삭제를 결정합니다. 자동 분류에는 오류가 있을 수 있으므로 검토를 요청하려면 접수번호와 사유를 문의 이메일로 보내 주세요.</li>
              <li><strong>학교 추가 신청 전달.</strong> ‘웹 내부로 전달’을 선택하면 신청 내용이 운영진 전용 신청함에 저장됩니다. ‘메일로 전달’을 선택하면 기기의 메일 앱에 신청 초안이 열리며, 이용자가 메일 앱에서 직접 전송해야 신청이 전달됩니다. 접수 후에도 학교 확인과 지원 여부 검토가 필요하며 등록이나 회신 시점은 보장되지 않습니다.</li>
              <li><strong>서비스 자료 보관 한계.</strong> 현재 배포 환경은 영구 디스크를 사용하지 않아 서버 재시작·재배포 시 신고·학교 신청 자료가 초기화될 수 있습니다. 접수번호를 별도로 보관하고, 장기간 보관이 필요한 자료는 직접 사본을 유지해 주세요.</li>
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
              <section><h4 className="font-extrabold text-slate-900">개인정보 처리자와 연락 창구</h4><p><strong>서비스 운영자:</strong> SchoolFix AI 서비스 운영자. <strong>개인정보 보호 문의 창구:</strong> <a className="font-semibold text-blue-700 underline" href="mailto:eunyool100208@gmail.com">eunyool100208@gmail.com</a>. 개인정보 처리 관련 열람·정정·삭제·처리정지 요청, 유출 우려 신고 및 불만은 이메일로 접수할 수 있습니다. 요청 확인을 위해 접수번호나 학교 신청 ID를 알려 주세요. 이메일 본문에는 불필요한 민감정보를 적지 마세요.</p></section>
              <section><h4 className="font-extrabold text-slate-900">학교 추가 신청에서 처리하는 정보</h4><p><strong>필수:</strong> 학교명, 공식 홈페이지, 주소 또는 지역, 신청 사유. <strong>선택:</strong> 추가 요청 사항, 회신 이메일. 학교 지원 여부 검토와 답변에만 사용합니다. 내부 전달을 선택하면 입력값이 서버의 운영진 신청함에 저장되고 로그인한 운영진이 확인합니다. 메일 앱 전달을 선택하면 입력값이 기기의 메일 앱에 전달되어, 실제 전송·저장·삭제는 이용자가 선택한 메일 서비스의 정책을 따릅니다.</p><p><strong>보유 기간:</strong> 현재 신청함에는 자동 만료 기간이 설정되어 있지 않습니다. 운영진이 검토를 마치고 회신 목적이 끝나면 신청함에서 삭제합니다. 본인은 위 이메일로 삭제를 요청할 수 있습니다. 현재 무료 배포 서버에는 영구 디스크가 없으므로 서버 재시작·재배포 시 파일 데이터가 사라질 수 있습니다.</p><p><strong>동의 거부:</strong> 필수 정보 처리에 동의하지 않으면 신청을 전달할 수 없습니다. 선택 항목은 제공하지 않아도 신청할 수 있습니다.</p></section>
              <section><h4 className="font-extrabold text-slate-900">신고에서 처리·공개되는 정보</h4><p>신고 시 선택한 학교·위치·공식 시설, 직접 입력한 건물·층·학과·학년·반·구역, 선택형 제목·문제 유형, 신고 내용, 첨부 이미지와 파일 이름·크기, 접수·처리 상태를 처리합니다. 계정·실명·학번·연락처 입력은 요구하지 않습니다. 다만 신고 본문이나 사진에 사람을 알아볼 수 있는 정보가 포함되면 개인정보가 될 수 있으므로 얼굴, 이름표, 연락처, 건강정보 등은 가리거나 올리지 마세요.</p><p>검토 보류된 신고는 승인 전까지 공개 목록에서 숨깁니다. 그 외 공개된 신고의 제목, 위치 설명, 본문, 첨부 이미지와 처리 상태는 서비스 이용자에게 표시될 수 있습니다. 신고자 소유 확인용 원본 토큰은 브라우저에 저장되고, 서버에는 토큰의 해시만 저장합니다. 서버는 요청 횟수 제한을 위해 접속 IP에서 만든 해시를 임시 메모리에 사용하며 원본 IP를 애플리케이션의 신고 자료로 저장하지 않습니다.</p><p><strong>처리 목적:</strong> 신고 접수·본인 신고 조회·운영진 검토·시설 조치 상태 공개·통계·반복 신고 맥락 확인·안전성 및 위험도 분석. 작성 초안은 해당 브라우저 탭의 sessionStorage에 임시 저장되며 첨부 이미지와 AI 추가 질문 답변은 초안 저장에서 제외됩니다.</p></section>
              <section><h4 className="font-extrabold text-slate-900">AI 처리와 국외 이전</h4><p><strong>Render 호스팅:</strong> 수신자 Render Services, Inc. (문의: <a className="font-semibold text-blue-700 underline" href="mailto:privacy@render.com">privacy@render.com</a>). 서비스와 저장 파일은 현재 싱가포르 리전에서 처리됩니다. 서버 운영·계정·보안 활동 정보는 Render의 미국 내 서비스와도 관련될 수 있습니다. 전송은 서비스 요청 및 서버 처리를 위해 네트워크를 통해 이루어집니다. 현재 무료 서버에는 영구 디스크가 없어 신고·신청 파일은 인스턴스에서 운용되고 재시작·재배포 때 초기화될 수 있습니다. 더 자세한 사항은 Render의 개인정보 처리방침과 DPA에 따릅니다.</p><p><strong>OpenAI 분석:</strong> 수신자 OpenAI OpCo, LLC (미국, API 처리; 문의: <a className="font-semibold text-blue-700 underline" href="mailto:privacy@openai.com">privacy@openai.com</a>) 및 OpenAI가 공개한 계열사·처리 하위사업자. 처리 위치는 미국, 아일랜드, 영국, 일본 및 공개된 하위처리 국가일 수 있으며, 최신 목록은 제공자 안내에서 확인해 주세요. 제목·본문·선택한 위치·문제 유형과 유사 신고 일부는 추가 질문·요약·위험도 분석에, 제목·본문 및 첨부 이미지는 안전성 검사에 사용될 수 있습니다. 신고 접수와 분석 요청 때 HTTPS API로 전송됩니다. OpenAI API 입력·출력은 기본적으로 모델 학습에 사용되지 않지만 API 기능별 보안 모니터링 기록은 최대 30일 보관될 수 있으며 예외·별도 보유 규칙이 있습니다. AI 처리는 자동 참고자료이고 분석 실패가 신고 접수를 막지는 않습니다.</p><p><strong>이전 거부와 선택:</strong> 서비스 자체는 싱가포르의 Render 서버에서 제공되므로 서버 국외 처리를 원하지 않으면 온라인 신고 및 웹 내부 신청을 이용하지 않을 수 있습니다. 현행 신고 양식에는 별도의 AI 전송 끄기 항목이 없으므로 신고 글이나 사진을 OpenAI에 보내고 싶지 않다면 해당 신고를 온라인으로 제출하지 마세요. 학교 신청을 이메일 앱 방식으로 보내면 신청 내용은 사용자가 선택한 메일 서비스로도 전달됩니다. 제공자·국가·이전 항목·목적·보유기간이 바뀌면 이 안내를 갱신합니다.</p><div className="flex flex-wrap gap-x-4 gap-y-2 text-xs"><a className="font-semibold text-blue-700 underline" href="https://render.com/privacy" target="_blank" rel="noreferrer">Render 개인정보 처리방침</a><a className="font-semibold text-blue-700 underline" href="https://render.com/dpa" target="_blank" rel="noreferrer">Render DPA</a><a className="font-semibold text-blue-700 underline" href="https://render.com/docs/regions" target="_blank" rel="noreferrer">Render 리전 안내</a><a className="font-semibold text-blue-700 underline" href="https://openai.com/policies/sub-processor-list/" target="_blank" rel="noreferrer">OpenAI 처리 하위사업자</a><a className="font-semibold text-blue-700 underline" href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noreferrer">OpenAI API 데이터 보유·학습 정책</a></div></section>
              <section><h4 className="font-extrabold text-slate-900">보유 기간과 삭제</h4><p>현재 신고와 신청 데이터는 서버 파일에 저장되고 자동 만료 일정은 설정되어 있지 않습니다. 신고는 공개 화면에서 삭제되어도 서버 기록에는 삭제 표시가 남을 수 있습니다. 삭제 요청을 하려면 접수번호를 적어 위 연락처로 문의하세요. 운영진은 목적 달성, 요청 접수, 법령상 보존 필요 여부를 확인해 공개 제외 또는 삭제 조치를 합니다. 무료 배포 환경에는 영구 디스크가 없어 서버가 재시작·재배포될 때 저장 파일이 초기화될 수 있으며, 따라서 장기 보관을 보장하지 않습니다. 법령에 별도 보존 의무가 적용되는 경우에는 그 의무가 끝날 때까지 필요한 항목만 분리 보관합니다.</p></section>
              <section><h4 className="font-extrabold text-slate-900">정보주체의 권리와 아동 보호</h4><p>「개인정보 보호법」에 따라 본인 또는 적법한 대리인은 개인정보 열람, 정정·삭제, 처리정지를 요청할 수 있습니다. 운영자는 본인 여부와 요청 범위를 확인한 뒤 법령상 제한 여부를 검토하여 처리 결과를 안내합니다. 만 14세 미만 아동의 개인정보 처리에 동의가 필요한 경우 법정대리인의 동의를 받고 이를 확인해야 합니다. 서비스는 신고 내용·사진에 학생 본인이나 다른 사람의 식별정보·민감정보를 적지 않도록 요청하며, 만 14세 미만 이용자는 이름·연락처 등 개인정보를 입력하거나 타인의 정보를 첨부하기 전에 보호자와 확인해 주세요.</p></section>
              <section><h4 className="font-extrabold text-slate-900">안전조치와 관련 법령</h4><p>운영진 신청함과 관리 기능은 운영진 인증 후 이용하도록 제한합니다. 신고 소유 확인 토큰 원문은 서버에 저장하지 않고 해시를 저장하며, 요청 횟수 제한과 보안 헤더를 적용합니다. 운영자는 「개인정보 보호법」 제15조·제21조·제22조·제22조의2·제28조의8·제29조·제30조에 따라 목적 제한, 최소 처리, 파기, 아동 보호, 국외 이전 고지, 안전조치와 처리방침 공개 사항을 반영하도록 관리합니다. 구체적 사건의 법률상 권리·의무는 현행 법령과 사실관계에 따라 달라집니다.</p><div className="flex flex-wrap gap-x-4 gap-y-2 text-xs"><a className="font-semibold text-blue-700 underline" href="https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1034292881" target="_blank" rel="noreferrer">개인정보 보호법 제28조의8(국외 이전)</a><a className="font-semibold text-blue-700 underline" href="https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1034292763" target="_blank" rel="noreferrer">개인정보 보호법 제30조(처리방침)</a><a className="font-semibold text-blue-700 underline" href="https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1020398523" target="_blank" rel="noreferrer">개인정보 보호법 제22조의2(아동)</a></div></section>
            </div>
          </>}
        </div>
