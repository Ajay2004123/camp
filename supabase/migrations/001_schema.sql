-- ============================================================
-- CampusKeys — Complete Database Schema
-- Run this in: Supabase → SQL Editor → New query → Run
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Profiles ──────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  full_name      text not null,
  email          text not null,
  avatar_url     text,
  college        text default 'My College',
  department     text,
  verified       boolean default false,
  role           text default 'student' check (role in ('student','admin')),
  total_rentals  int default 0,
  total_lends    int default 0,
  avg_rating     numeric(3,2) default 0,
  blocked        boolean default false,
  created_at     timestamptz default now()
);

-- ── Items ─────────────────────────────────────────────────────────────────────
create table if not exists public.items (
  id               uuid primary key default uuid_generate_v4(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  title            text not null,
  description      text,
  category         text not null,
  condition        text default 'Good',
  emoji            text default '📦',
  photo_url        text,
  rent_per_day     int not null,
  fine_per_day     int not null default 10,
  avail_from       date not null,
  avail_to         date not null,
  pickup_location  text not null,
  status           text default 'available' check (status in ('available','rented','inactive')),
  avg_rating       numeric(3,2) default 0,
  review_count     int default 0,
  created_at       timestamptz default now()
);

-- ── Bookings ──────────────────────────────────────────────────────────────────
create table if not exists public.bookings (
  id               uuid primary key default uuid_generate_v4(),
  item_id          uuid not null references public.items(id) on delete cascade,
  borrower_id      uuid not null references public.profiles(id) on delete cascade,
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  from_date        date not null,
  to_date          date not null,
  rent_per_day     int not null,
  fine_per_day     int not null,
  total_rent       int not null,
  late_days        int default 0,
  fine_charged     int default 0,
  status           text default 'pending' check (status in ('pending','approved','rejected','returned','completed')),
  pickup_location  text,
  rated_by_borrower boolean default false,
  rated_by_owner    boolean default false,
  reminder_sent    boolean default false,
  created_at       timestamptz default now(),
  approved_at      timestamptz,
  returned_at      timestamptz
);

-- ── Messages ──────────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id          uuid primary key default uuid_generate_v4(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  content     text,
  type        text default 'text' check (type in ('text','voice','image')),
  voice_url   text,
  read        boolean default false,
  created_at  timestamptz default now()
);

-- ── Reviews ───────────────────────────────────────────────────────────────────
create table if not exists public.reviews (
  id           uuid primary key default uuid_generate_v4(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  reviewer_id  uuid not null references public.profiles(id),
  reviewee_id  uuid not null references public.profiles(id),
  item_id      uuid not null references public.items(id),
  stars        int not null check (stars between 1 and 5),
  comment      text,
  created_at   timestamptz default now(),
  unique(booking_id, reviewer_id)
);

-- ── Notifications ─────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  body       text not null,
  type       text default 'info',
  meta       jsonb default '{}',
  read       boolean default false,
  created_at timestamptz default now()
);

-- ── Reports ───────────────────────────────────────────────────────────────────
create table if not exists public.reports (
  id            uuid primary key default uuid_generate_v4(),
  reporter_id   uuid not null references public.profiles(id),
  against_id    uuid references public.profiles(id),
  item_id       uuid references public.items(id),
  reason        text not null,
  description   text,
  status        text default 'pending' check (status in ('pending','under_review','resolved','dismissed')),
  admin_note    text,
  created_at    timestamptz default now()
);

-- ── RLS Policies ─────────────────────────────────────────────────────────────
alter table public.profiles     enable row level security;
alter table public.items        enable row level security;
alter table public.bookings     enable row level security;
alter table public.messages     enable row level security;
alter table public.reviews      enable row level security;
alter table public.notifications enable row level security;
alter table public.reports      enable row level security;

-- Profiles
create policy "Public profiles visible"       on public.profiles for select using (true);
create policy "Users update own profile"       on public.profiles for update using (auth.uid() = id);
create policy "Users insert own profile"       on public.profiles for insert with check (auth.uid() = id);

-- Items
create policy "Items are public"              on public.items for select using (true);
create policy "Owners insert items"           on public.items for insert with check (auth.uid() = owner_id);
create policy "Owners update own items"       on public.items for update using (auth.uid() = owner_id);
create policy "Owners delete own items"       on public.items for delete using (auth.uid() = owner_id);

-- Bookings
create policy "View own bookings"             on public.bookings for select using (auth.uid() = borrower_id or auth.uid() = owner_id);
create policy "Borrowers create bookings"     on public.bookings for insert with check (auth.uid() = borrower_id);
create policy "Owners update bookings"        on public.bookings for update using (auth.uid() = owner_id or auth.uid() = borrower_id);

-- Messages
create policy "Booking parties see messages"  on public.messages for select
  using (exists (select 1 from public.bookings b where b.id = booking_id and (b.borrower_id = auth.uid() or b.owner_id = auth.uid())));
create policy "Booking parties send messages" on public.messages for insert
  with check (auth.uid() = sender_id and exists (select 1 from public.bookings b where b.id = booking_id and (b.borrower_id = auth.uid() or b.owner_id = auth.uid())));

-- Reviews
create policy "Reviews are public"            on public.reviews for select using (true);
create policy "Reviewers insert reviews"      on public.reviews for insert with check (auth.uid() = reviewer_id);

-- Notifications
create policy "Own notifications"             on public.notifications for select using (auth.uid() = user_id);
create policy "System inserts notifications"  on public.notifications for insert with check (true);
create policy "Mark own read"                 on public.notifications for update using (auth.uid() = user_id);

-- Reports
create policy "Reporters see own"             on public.reports for select using (auth.uid() = reporter_id);
create policy "Users submit reports"          on public.reports for insert with check (auth.uid() = reporter_id);

-- ── Trigger: auto-create profile on signup ────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, email, verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.email,
    new.email_confirmed_at is not null
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Trigger: update verified flag when email confirmed ────────────────────────
create or replace function public.handle_email_confirmed()
returns trigger language plpgsql security definer as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.profiles set verified = true where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_email_confirmed on auth.users;
create trigger on_email_confirmed
  after update on auth.users
  for each row execute procedure public.handle_email_confirmed();

-- ── Trigger: recalculate avg_rating on review insert ────────────────────────
create or replace function public.update_ratings()
returns trigger language plpgsql as $$
begin
  -- Update reviewee's avg rating in profiles
  update public.profiles
  set avg_rating = (
    select round(avg(stars)::numeric, 2) from public.reviews where reviewee_id = new.reviewee_id
  ),
  total_rentals = total_rentals + 1
  where id = new.reviewee_id;

  -- Update item avg rating
  update public.items
  set avg_rating = (
    select round(avg(stars)::numeric, 2) from public.reviews where item_id = new.item_id
  ),
  review_count = (
    select count(*) from public.reviews where item_id = new.item_id
  )
  where id = new.item_id;

  return new;
end;
$$;

drop trigger if exists on_review_inserted on public.reviews;
create trigger on_review_inserted
  after insert on public.reviews
  for each row execute procedure public.update_ratings();

-- ── Enable Realtime ───────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.bookings;

-- ── Storage bucket for item photos ───────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('items', 'items', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('voices', 'voices', true) on conflict do nothing;

create policy "Anyone can view item photos"   on storage.objects for select using (bucket_id = 'items');
create policy "Auth users upload item photos" on storage.objects for insert with check (bucket_id = 'items' and auth.role() = 'authenticated');
create policy "Owners delete item photos"     on storage.objects for delete using (bucket_id = 'items' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Anyone can view voice msgs"    on storage.objects for select using (bucket_id = 'voices');
create policy "Auth users upload voices"      on storage.objects for insert with check (bucket_id = 'voices' and auth.role() = 'authenticated');

-- ════════════════════════════════════════════════════════════════════════════
-- NEW TABLES (run these additions in Supabase SQL Editor)
-- ════════════════════════════════════════════════════════════════════════════

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
create policy "Item requests are public"          on public.item_requests for select using (true);
create policy "Requesters create requests"        on public.item_requests for insert with check (auth.uid() = requester_id);
create policy "Requesters update own requests"    on public.item_requests for update using (auth.uid() = requester_id);

alter publication supabase_realtime add table public.item_requests;

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
-- Admin can see all messages; users can see their own
create policy "Admin sees all admin messages"     on public.admin_messages for select
  using (
    auth.uid() = sender_id or auth.uid() = receiver_id or
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Users send admin messages"         on public.admin_messages for insert
  with check (auth.uid() = sender_id);
create policy "Update own admin messages"         on public.admin_messages for update
  using (auth.uid() = receiver_id);

alter publication supabase_realtime add table public.admin_messages;

-- ── Allow admin to update any booking (for block operations) ─────────────
-- Also allow messages update for read marking
create policy "Messages update read flag"         on public.messages for update
  using (
    auth.uid() = sender_id or
    exists (select 1 from public.bookings b where b.id = booking_id and (b.borrower_id = auth.uid() or b.owner_id = auth.uid()))
  );

-- ── Allow admin to update profiles (block/unblock) ───────────────────────
create policy "Admin updates any profile"         on public.profiles for update
  using (
    auth.uid() = id or
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── Allow admin to see all reports ───────────────────────────────────────
create policy "Admin sees all reports"            on public.reports for select
  using (
    auth.uid() = reporter_id or
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin updates reports"             on public.reports for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ── Request Offers ────────────────────────────────────────────────────────
create table if not exists public.request_offers (
  id           uuid primary key default uuid_generate_v4(),
  request_id   uuid not null references public.item_requests(id) on delete cascade,
  offerer_id   uuid not null references public.profiles(id) on delete cascade,
  note         text,
  offered_rent numeric(10,2) default 0,
  created_at   timestamptz default now()
);

alter table public.request_offers enable row level security;
create policy "Request offers are public"      on public.request_offers for select using (true);
create policy "Offerers create offers"         on public.request_offers for insert with check (auth.uid() = offerer_id);

alter publication supabase_realtime add table public.request_offers;

-- ── Add extra columns to item_requests if not present ────────────────────
alter table public.item_requests add column if not exists urgency text default 'normal';
alter table public.item_requests add column if not exists max_budget numeric(10,2);
alter table public.item_requests add column if not exists duration_days integer default 1;
alter table public.item_requests add column if not exists offer_count integer default 0;
alter table public.item_requests add column if not exists needed_by date;

-- ── Direct Messages (for request chats between users) ────────────────────
create table if not exists public.direct_messages (
  id           uuid primary key default uuid_generate_v4(),
  room_id      text not null,       -- sorted user IDs + request ID
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  receiver_id  uuid not null references public.profiles(id) on delete cascade,
  content      text not null,
  read         boolean default false,
  created_at   timestamptz default now()
);

create index if not exists direct_messages_room_idx on public.direct_messages(room_id);

alter table public.direct_messages enable row level security;

create policy "DM participants can select"  on public.direct_messages for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "DM sender can insert"        on public.direct_messages for insert
  with check (auth.uid() = sender_id);
create policy "DM receiver can update read" on public.direct_messages for update
  using (auth.uid() = receiver_id);

alter publication supabase_realtime add table public.direct_messages;

-- ── request_offers: add fulfilled_by to item_requests ────────────────────
alter table public.item_requests add column if not exists fulfilled_by uuid references public.profiles(id);

-- Allow users to update offer_count on requests
create policy "Anyone can update offer_count" on public.item_requests for update
  using (true)
  with check (true);
