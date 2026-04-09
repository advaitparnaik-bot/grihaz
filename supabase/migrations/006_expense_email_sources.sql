create table expense_email_sources (
  id uuid primary key default gen_random_uuid(),
  home_id uuid references homes(id) on delete cascade not null,
  sender_email text not null,
  platform text not null,
  category expense_platform_category not null,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(home_id, sender_email)
);

alter table expense_email_sources enable row level security;

create policy "home members can select expense_email_sources"
  on expense_email_sources for select
  using (home_id in (select home_id from home_members where user_id = auth.uid()));

create policy "home members can insert expense_email_sources"
  on expense_email_sources for insert
  with check (home_id in (select home_id from home_members where user_id = auth.uid()));

create policy "home members can update expense_email_sources"
  on expense_email_sources for update
  using (home_id in (select home_id from home_members where user_id = auth.uid()));

create policy "home members can delete expense_email_sources"
  on expense_email_sources for delete
  using (home_id in (select home_id from home_members where user_id = auth.uid()));