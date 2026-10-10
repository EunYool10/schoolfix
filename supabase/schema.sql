-- SchoolFix JSON document store. Run in Supabase Dashboard > SQL Editor.
-- 처음 설치할 때와, 이미 테이블이 있는 배포를 업데이트할 때 모두 이 파일 전체를 실행하면 됩니다.
create table if not exists public.schoolfix_store (
  key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- 저장하는 문서 종류:
--   reports            신고
--   school_applications 학교 추가 신청
--   custom_schools     운영진이 화면에서 등록한 학교
--   blocked_reporters  장난 신고로 처리돼 공개 전 검토를 거치는 기기
-- 예전 버전의 제약(reports, school_applications 만 허용)을 새 목록으로 바꿉니다.
alter table public.schoolfix_store drop constraint if exists schoolfix_store_key_check;
alter table public.schoolfix_store add constraint schoolfix_store_key_check
  check (key in ('reports', 'school_applications', 'custom_schools', 'blocked_reporters'));

alter table public.schoolfix_store enable row level security;

-- Browser roles must never read/write reports directly. The server uses the
-- Supabase service_role secret from Render environment variables.
revoke all on table public.schoolfix_store from anon, authenticated;
grant select, insert, update on table public.schoolfix_store to service_role;
