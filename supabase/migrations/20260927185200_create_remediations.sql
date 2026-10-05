-- One saved remediation per row. Only the LaTeX and the page text are kept:
-- MathML and speech are deterministic functions of the LaTeX, so the client
-- re-derives them on load. Page images are never uploaded.
create table public.remediations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  title text not null check (char_length(title) between 1 and 200),
  source text not null check (source in ('paste', 'upload')),
  original_text text not null default '' check (char_length(original_text) <= 200000),
  latex text[] not null check (cardinality(latex) between 1 and 500),
  page_count integer not null default 0 check (page_count between 0 and 500)
);

create index remediations_user_created_idx on public.remediations (user_id, created_at desc);

alter table public.remediations enable row level security;

create policy "Users read their own remediations"
  on public.remediations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users save their own remediations"
  on public.remediations for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own remediations"
  on public.remediations for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.remediations from anon;
revoke update, truncate, references, trigger on public.remediations from authenticated;
grant select, insert, delete on public.remediations to authenticated;
