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
          <div><p className="text-xs font-bold text-blue-700">SchoolFix AI</p><h2 id="service-policy-title" className="mt-1 text-xl font-extrabold text-slate-950">서비스 안내</h2></div>
          <button type="button" aria-label="닫기" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>
        <nav aria-label="서비스 안내 종류" className="flex gap-2 border-b border-slate-100 px-5 pt-3 sm:px-6">
          <button type="button" aria-pressed={activeSection === "terms"} onClick={() => setActiveSection("terms")} className={`border-b-2 px-2 pb-3 text-sm font-bold ${activeSection === "terms" ? "border-blue-700 text-blue-800" : "border-transparent text-slate-500"}`}>서비스 이용약관</button>
          <button type="button" aria-pressed={activeSection === "privacy"} onClick={() => setActiveSection("privacy")} className={`border-b-2 px-2 pb-3 text-sm font-bold ${activeSection === "privacy" ? "border-blue-700 text-blue-800" : "border-transparent text-slate-500"}`}>개인정보 안내</button>
        </nav>
        <div className="overflow-y-auto p-5 text-sm leading-7 text-slate-700 sm:p-6">
          {activeSection === "terms" ? <>
            <h3 className="text-lg font-extrabold text-slate-900">SchoolFix AI 서비스 이용약관</h3>
            <p className="mt-1 text-xs text-slate-500">시행일: 2026년 10월 9일</p>
            <ol className="mt-4 list-decimal space-y-4 pl-5">
              <li><strong>목적과 서비스.</strong> 이 약관은 SchoolFix AI(이하 “서비스”)를 이용해 학교 시설 문제를 제보하고, 학교 추가 지원을 신청할 때 필요한 기본 사항을 정합니다. 서비스는 제보 내용을 학교 시설 확인과 안전 개선을 위한 참고 자료로 전달합니다.</li>
              <li><strong>긴급 상황.</strong> 서비스는 긴급 구조·신고 기관이 아니며 제보 즉시 확인이나 조치를 보장하지 않습니다. 다치거나 즉각적인 위험이 있으면 교직원·보호자에게 알리고 112·119 등 해당 기관에 먼저 연락해 주세요.</li>
              <li><strong>정확하고 안전한 작성.</strong> 실제로 확인한 내용을 구체적으로 작성해 주세요. 다른 사람의 이름·연락처·얼굴이 나온 사진, 건강 정보, 비밀번호 등 불필요한 개인정보를 입력하거나 첨부하지 마세요. 허위 내용, 괴롭힘·모욕, 불법 촬영물 및 타인의 권리를 침해하는 자료는 등록하지 마세요.</li>
              <li><strong>검토와 공개.</strong> 신고는 운영진의 검토 또는 자동 안전성 확인 중 공개가 보류될 수 있습니다. 부적절한 내용이나 개인정보가 포함된 자료는 수정·비공개·삭제될 수 있습니다. 학교 추가 신청은 정보 확인 후 지원 여부를 별도로 결정하며, 신청만으로 학교가 추가되는 것은 아닙니다.</li>
              <li><strong>AI 및 오류.</strong> 제보 내용은 안전성 확인, 위험도 분류, 요약을 위해 자동 분석될 수 있습니다. 자동 분석은 참고용이며 사실 확인이나 학교의 공식 판단을 대신하지 않습니다. 서비스는 점검·장애·외부 제공자 문제로 일시 중단되거나 기능이 바뀔 수 있습니다.</li>
              <li><strong>계정과 운영.</strong> 일반 제보에는 학생 계정 로그인이 필요하지 않습니다. 운영진 전용 화면은 승인된 운영진만 이용해야 합니다. 운영자는 법령 준수, 안전 확보, 서비스 개선을 위해 필요한 범위에서 기능을 제한하거나 게시물을 관리할 수 있습니다.</li>
              <li><strong>문의.</strong> 약관 또는 서비스 이용에 관한 문의는 <a className="font-semibold text-blue-700 underline" href="mailto:eunyool100208@gmail.com">eunyool100208@gmail.com</a>으로 보내 주세요.</li>
            </ol>
          </> : <>
            <h3 className="text-lg font-extrabold text-slate-900">개인정보 수집·이용 안내</h3>
            <p className="mt-1 text-xs text-slate-500">시행일: 2026년 10월 9일</p>
            <div className="mt-4 space-y-4">
              <section><h4 className="font-extrabold text-slate-900">학교 추가 신청</h4><p><strong>수집 항목:</strong> 학교명, 공식 홈페이지, 주소·지역, 신청 사유(필수); 추가 요청과 회신 이메일(선택).</p><p><strong>이용 목적:</strong> 학교 정보 확인, 지원 검토 및 신청에 대한 회신.</p><p><strong>보관 기간:</strong> 검토와 회신에 필요한 기간 동안 보관하고, 목적이 끝나면 운영진이 신청함에서 삭제합니다. 삭제를 요청하려면 아래 연락처로 신청 ID 또는 학교명을 알려 주세요.</p><p><strong>동의 거부:</strong> 필수 항목 처리에 동의하지 않으면 학교 추가 신청을 보낼 수 없습니다. 회신 이메일은 선택 항목이며 비워 두어도 신청할 수 있습니다.</p></section>
              <section><h4 className="font-extrabold text-slate-900">신고 내용과 자동 분석</h4><p>신고 내용, 선택한 위치, 첨부 파일은 신고 접수·안전성 검토·위험도 분석·요약과 학교 시설 개선에 이용될 수 있습니다. 위험도 분석에는 신고 글이, 이미지 안전성 확인에는 글과 첨부 이미지가 OpenAI API로 전송될 수 있습니다. OpenAI 기본 설정에서는 안전성 확인을 위한 로그에 입력 내용이 최대 30일 보관될 수 있습니다. 제보에는 본인이나 다른 사람을 식별할 정보 및 민감한 내용을 넣지 마세요. <a className="font-semibold text-blue-700 underline" href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noreferrer">OpenAI API 데이터 처리 안내</a></p></section>
              <section><h4 className="font-extrabold text-slate-900">접근과 보관</h4><p>학교 추가 신청 메일함은 운영진 로그인을 거쳐야 열 수 있습니다. 회신 이메일이 있으면 운영진이 답변을 위해 사용합니다. 메일 앱 전송을 고른 경우에는 기기의 메일 앱이 열리며, 실제 전송 여부와 보관은 해당 메일 서비스의 정책에도 영향을 받습니다.</p><p>서비스 운영에 필요한 서버·호스팅 제공자가 데이터를 처리할 수 있습니다. 현재 배포 설정은 영구 저장소가 없는 무료 인스턴스이므로 재시작·재배포 때 저장 자료가 초기화될 수 있습니다. 중요한 신청은 별도 사본을 보관해 주세요.</p></section>
              <section><h4 className="font-extrabold text-slate-900">문의 및 권리 요청</h4><p>개인정보 열람·정정·삭제 요청 및 개인정보 관련 문의: <a className="font-semibold text-blue-700 underline" href="mailto:eunyool100208@gmail.com">eunyool100208@gmail.com</a>. 운영자: SchoolFix 서비스 운영자.</p><p>만 14세 미만 이용자는 회신 이메일 등 개인정보를 입력하기 전에 보호자와 확인해 주세요.</p></section>
            </div>
          </>}
        </div>
        <footer className="border-t border-slate-100 p-4 text-right"><button type="button" onClick={onClose} className="min-h-10 rounded-lg bg-blue-700 px-5 text-sm font-bold text-white">닫기</button></footer>
      </section>
    </div>
  );
}
