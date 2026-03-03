-- ============================================================
-- CampusKeys — New Features Migration
-- Run this AFTER 001_schema.sql
-- Supabase → SQL Editor → New query → Run
-- ============================================================

-- ── Item Requests ─────────────────────────────────────────────────────────
create table if not exists public.item_requests (
  id               uuid primary key default uuid_generate_v4(),
  requester_id     uuid not null references public.profiles(id) on delete cascade,
  title            text not null,
  category         text not null,
  description      text,
  need_date        date not null,
  days             int default 1,
  max_rent_per_day int,
  status           text default 'open' check (status in ('open','closed','fulfilled')),
  created_at       timestamptz default now()
);

alter table public.item_requests enable row level security;
drop policy if exists "Item requests are public"       on public.item_requests;
drop policy if exists "Requesters create requests"     on public.item_requests;
drop policy if exists "Requesters update own requests" on public.item_requests;
create policy "Item requests are public"          on public.item_requests for select using (true);
create policy "Requesters create requests"        on public.item_requests for insert with check (auth.uid() = requester_id);
create policy "Requesters update own requests"    on public.item_requests for update using (auth.uid() = requester_id);

-- ── Admin Messages ────────────────────────────────────────────────────────
create table if not exists public.admin_messages (
  id           uuid primary key default uuid_generate_v4(),
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  receiver_id  uuid not null references public.profiles(id) on delete cascade,
  content      text not null,
  from_admin   boolean default false,
  read         boolean default false,
  created_at   timestamptz default now()
);

alter table public.admin_messages enable row level security;
drop policy if exists "Admin sees all admin messages" on public.admin_messages;
drop policy if exists "Users send admin messages"     on public.admin_messages;
drop policy if exists "Update own admin messages"     on public.admin_messages;
create policy "Admin sees all admin messages"
  on public.admin_messages for select
  using (
    auth.uid() = sender_id or auth.uid() = receiver_id or
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Users send admin messages"
  on public.admin_messages for insert
  with check (auth.uid() = sender_id);
create policy "Update own admin messages"
  on public.admin_messages for update
  using (auth.uid() = receiver_id);

-- ── Messages: allow updating read flag ───────────────────────────────────
drop policy if exists "Messages update read flag" on public.messages;
create policy "Messages update read flag"
  on public.messages for update
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.borrower_id = auth.uid() or b.owner_id = auth.uid())
    )
  );

-- ── Admin can update any profile (block/unblock) ─────────────────────────
drop policy if exists "Admin updates any profile" on public.profiles;
create policy "Admin updates any profile"
  on public.profiles for update
  using (
    auth.uid() = id or
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── Admin can see & update all reports ───────────────────────────────────
drop policy if exists "Admin sees all reports"  on public.reports;
drop policy if exists "Admin updates reports"   on public.reports;
create policy "Admin sees all reports"
  on public.reports for select
  using (
    auth.uid() = reporter_id or
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Admin updates reports"
  on public.reports for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ── Enable Realtime for new tables ───────────────────────────────────────
alter publication supabase_realtime add table public.item_requests;
alter publication supabase_realtime add table public.admin_messages;

select 'Migration 002 complete! ✅' as result;
