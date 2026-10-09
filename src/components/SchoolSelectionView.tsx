import { useEffect, useState } from "react";
import { ArrowRight, Building2, Check, CheckCircle2, Globe2, Mail, MapPin, X } from "lucide-react";
import type { FormEvent } from "react";
import type { School } from "../types";

interface Props {
  schools: School[];
  loading: boolean;
  error: string;
  initialSchoolId?: string;
  onRetry: () => void;
  onSelect: (school: School) => void;
}

export function SchoolSelectionView({ schools, loading, error, initialSchoolId = "", onRetry, onSelect }: Props) {
  const [selectedId, setSelectedId] = useState(initialSchoolId);
  const [showApplication, setShowApplication] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("");
  const [requests, setRequests] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [mailNotice, setMailNotice] = useState(false);

  useEffect(() => {
    if (initialSchoolId && schools.some((school) => school.id === initialSchoolId)) {
      setSelectedId((current) => current || initialSchoolId);
    }
  }, [initialSchoolId, schools]);

  const selectedSchool = schools.find((school) => school.id === selectedId) || null;

  const openMail = (event: FormEvent) => {
    event.preventDefault();
    const subject = `[SchoolFix 학교 지원 신청] ${schoolName.trim()}`;
    const body = [
      `학교 공식 명칭: ${schoolName.trim()}`,
      `공식 홈페이지: ${website.trim()}`,
      `주소 또는 지역: ${address.trim()}`,
      `신청 사유: ${reason.trim()}`,
      `추가 요청 사항: ${requests.trim() || "없음"}`,
      `회신 이메일: ${replyEmail.trim() || "미기재"}`,
      "",
      "※ 이 메일은 신청 초안입니다. 메일 앱에서 직접 전송을 완료해 주세요.",
    ].join("\n");
    window.location.href = `mailto:eunyool100208@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setMailNotice(true);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-lg shadow-blue-900/15"><Building2 className="h-7 w-7" /></span>
          <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.18em] text-blue-700">SchoolFix AI</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">어느 학교의 불편사항을 신고하시겠어요?</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-600">먼저 학교를 선택한 다음 입장해 주세요. 학교별 신고와 위치 정보가 분리되어 표시됩니다.</p>
        </div>

        {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">지원 학교 정보를 불러오는 중…</div> : error ? <div className="rounded-2xl border border-rose-200 bg-white p-6 text-center"><p role="alert" className="text-sm text-rose-700">{error}</p><button onClick={onRetry} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">다시 시도</button></div> : (
          <div className="grid gap-3">
            {schools.map((school) => {
              const selected = selectedId === school.id;
              return <button type="button" key={school.id} aria-pressed={selected} onClick={() => setSelectedId(school.id)} className={`w-full rounded-2xl border bg-white p-5 text-left shadow-sm transition sm:p-6 ${selected ? "border-blue-600 ring-2 ring-blue-100 shadow-md" : "border-slate-200 hover:border-blue-300 hover:shadow-md"}`}>
              <div className="flex min-w-0 items-start gap-4"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-blue-700 text-white" : "bg-blue-50 text-blue-700"}`}>{selected ? <Check className="h-6 w-6" /> : <Building2 className="h-6 w-6" />}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-extrabold text-slate-900">{school.schoolName}</h2><p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{school.address}</p><span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700"><Globe2 className="h-3.5 w-3.5" />공식 홈페이지에서 학교 정보 확인</span></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${selected ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{selected ? "선택됨" : "선택"}</span></div></div></div>
              </button>;
            })}
            {schools.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">현재 지원 중인 학교가 없습니다.</p>}
          </div>
        )}

        {!loading && !error && schools.length > 0 && <div className="sticky bottom-3 z-10 mt-5 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl shadow-slate-900/10 backdrop-blur sm:p-4"><p className="min-w-0 text-xs text-slate-600 sm:text-sm">{selectedSchool ? <><span className="font-bold text-slate-900">{selectedSchool.schoolName}</span> 선택됨</> : "입장할 학교를 선택해 주세요."}</p><button type="button" disabled={!selectedSchool} onClick={() => selectedSchool && onSelect(selectedSchool)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300">학교에 입장 <ArrowRight className="h-4 w-4" /></button></div>}

        <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-5 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div><p className="text-sm font-bold text-slate-900">우리 학교도 추가하고 싶으신가요?</p><p className="mt-1 text-xs leading-relaxed text-slate-600">공식 정보와 실제 시설 구성을 확인한 후 지원 여부를 검토합니다.</p></div>
          <button type="button" onClick={() => { setMailNotice(false); setShowApplication(true); }} className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3.5 py-2 text-sm font-bold text-blue-800 sm:mt-0"><Mail className="h-4 w-4" />우리 학교 추가 신청</button>
        </div>
        <p className="mt-5 text-center text-[11px] text-slate-400">지원 학교만 목록에 표시됩니다. 학교별 위치 정보는 공식 공개 자료로 확인한 내용만 등록합니다.</p>
      </div>

      {showApplication && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowApplication(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="school-application-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-7">
          <div className="flex items-start justify-between gap-4"><div><h2 id="school-application-title" className="text-lg font-extrabold text-slate-950">학교 추가 신청</h2><p className="mt-1 text-xs leading-relaxed text-slate-600">지원 여부를 검토할 수 있도록 학교 정보를 알려주세요.</p></div><button type="button" aria-label="닫기" onClick={() => setShowApplication(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
          <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">현재 지원하지 않는 학교는 추가 신청을 통해 검토받을 수 있습니다. 학교 정보와 실제 시설 구성을 확인한 후 지원 여부를 안내합니다.</p>
          <form className="mt-5 space-y-3" onSubmit={openMail}>
            <label className="block text-xs font-bold text-slate-700">학교 공식 명칭<input required value={schoolName} onChange={(e) => setSchoolName(e.target.value)} maxLength={100} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
            <label className="block text-xs font-bold text-slate-700">학교 공식 홈페이지<input required type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
            <label className="block text-xs font-bold text-slate-700">학교 주소 또는 지역<input required value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
            <label className="block text-xs font-bold text-slate-700">신청 사유<textarea required value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={2} className="mt-1.5 w-full rounded-lg border border-slate-300 p-3 text-sm" /></label>
            <label className="block text-xs font-bold text-slate-700">추가 요청 사항<textarea value={requests} onChange={(e) => setRequests(e.target.value)} maxLength={1000} rows={2} className="mt-1.5 w-full rounded-lg border border-slate-300 p-3 text-sm" /></label>
            <label className="block text-xs font-bold text-slate-700">회신 이메일 <span className="font-normal text-slate-400">(선택)</span><input type="email" value={replyEmail} onChange={(e) => setReplyEmail(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
            {mailNotice && <p role="status" className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />메일 작성 앱 열기를 요청했습니다. 실제 신청 전달은 메일 앱에서 전송을 완료한 경우에만 됩니다.</p>}
            <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800"><Mail className="h-4 w-4" />메일 앱에서 신청서 작성</button>
          </form>
        </section>
      </div>}
    </main>
  );
}

