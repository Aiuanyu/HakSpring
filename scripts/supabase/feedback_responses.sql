-- 意見回饋（js/feedback.js）：匿名簡短問卷。在 Supabase 後台 SQL Editor 執行一擺。
-- 任何人（anon）淨做得「新增」，毋能讀、改、刪；維護者用後台（service role）看資料。
create table if not exists public.feedback_responses (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  topic text not null default 'audio-outage-202610',
  affected text check (affected in ('yes', 'no', 'unsure')),
  device text check (device in ('phone', 'desktop', 'tablet')),
  message text check (char_length(message) <= 300),
  app_version text check (char_length(app_version) <= 40)
);

alter table public.feedback_responses enable row level security;

drop policy if exists "anon can insert feedback" on public.feedback_responses;
create policy "anon can insert feedback"
  on public.feedback_responses
  for insert
  to anon
  with check (true);

-- 毋建 select／update／delete policy：匿名使用者讀毋著別人个回饋，乜改毋著。
revoke all on public.feedback_responses from anon;
grant insert on public.feedback_responses to anon;
