-- ============================================================================
-- GAWA Admin — Supabase Database Schema (v2)
-- Restructured: profiles → users_table, verifications → id_verifications,
--               suspension fields → user_suspensions
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================================
-- TABLES
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Users Table (replaces profiles)
-- ---------------------------------------------------------------------------
create table if not exists public.users_table (
  id                uuid not null,
  email             text,
  phone             text,
  role              text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  first_name        text,
  middle_name       text,
  last_name         text,
  birth_date        date,
  region            text,
  province          text,
  municipality      text,
  barangay          text,
  complete_address  text,
  profile_image_url text,
  is_verified       boolean not null default false,
  constraint users_table_pkey primary key (id),
  constraint users_table_id_fkey foreign key (id) references auth.users(id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- 2. ID Verifications (replaces verifications)
-- ---------------------------------------------------------------------------
create table if not exists public.id_verifications (
  verification_id    uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references public.users_table(id),
  government_id_type text not null check (government_id_type in ('government_id','professional_license','business_permit','barangay_clearance')),
  front_image_url    text,
  back_image_url     text,
  selfie_image_url   text,
  status             text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_reason   text,
  submitted_at       timestamptz not null default now(),
  reviewed_by        uuid references public.users_table(id),
  first_name         text not null,
  middle_name        text,
  last_name          text not null,
  birth_date         date,
  region             text,
  province           text,
  municipality       text,
  barangay           text,
  complete_address   text,
  email              text not null,
  phone              text
);

-- ---------------------------------------------------------------------------
-- 3. User Suspensions
-- ---------------------------------------------------------------------------
create table if not exists public.user_suspensions (
  suspension_id        uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references public.users_table(id) on delete cascade,
  suspended_until      timestamptz,
  suspension_reason    text,
  escalated_to_deletion boolean not null default false,
  suspension_status    text not null default 'active' check (suspension_status in ('active','expired','escalated','resolved')),
  created_at           timestamptz not null default now(),
  resolved_at          timestamptz
);

-- ---------------------------------------------------------------------------
-- 4. Entity Notes (polymorphic admin notes on any entity)
-- ---------------------------------------------------------------------------
create table if not exists public.entity_notes (
  id           uuid primary key default uuid_generate_v4(),
  entity_type  text not null check (entity_type in ('job', 'dispute', 'appeal', 'user', 'proposal')),
  entity_id    uuid not null,
  content      text not null,
  author_id    uuid references public.users_table(id),
  author_name  text not null default 'Admin',
  created_at   timestamptz not null default now()
);

create index if not exists idx_entity_notes_entity on public.entity_notes(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- 5. User Notes (admin notes on users only)
-- ---------------------------------------------------------------------------
create table if not exists public.user_notes (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.users_table(id) on delete cascade,
  content    text not null,
  author_id  uuid not null references public.users_table(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. User Incidents
-- ---------------------------------------------------------------------------
create table if not exists public.user_incidents (
  id               uuid primary key default uuid_generate_v4(),
  type             text not null check (type in ('violation','fraud','damage','abuse','other')),
  severity         text not null check (severity in ('low','medium','high','critical')),
  status           text not null default 'open' check (status in ('open','investigating','resolved','dismissed')),
  module           text not null,
  title            text not null,
  description      text,
  reporter         text,
  reporter_id      uuid references public.users_table(id),
  respondent_name  text,
  respondent_id    uuid references public.users_table(id),
  assigned_to      uuid references public.users_table(id),
  resolution       text,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7. Roles
-- ---------------------------------------------------------------------------
create table if not exists public.roles (
  role_id    uuid primary key default uuid_generate_v4(),
  role_name  text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 8. User Roles
-- ---------------------------------------------------------------------------
create table if not exists public.user_roles (
  user_role_id uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.users_table(id),
  role_id      uuid not null references public.roles(role_id),
  created_at   timestamptz not null default now(),
  unique (user_id, role_id)
);

-- ---------------------------------------------------------------------------
-- 9. Role Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.role_profiles (
  profile_id      uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users_table(id),
  role_type       text not null check (role_type in ('client','talent','contractor','equipment_owner')),
  completed_jobs  int default 0,
  average_rating  numeric default 0,
  meta            jsonb default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (user_id, role_type)
);

-- ---------------------------------------------------------------------------
-- 10. Categories
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null unique,
  description   text,
  job_count     integer default 0,
  listing_count integer default 0,
  is_active     boolean not null default true
);

-- ---------------------------------------------------------------------------
-- 11. Skills
-- ---------------------------------------------------------------------------
create table if not exists public.skills (
  skill_id    uuid primary key default uuid_generate_v4(),
  skill_name  text not null unique,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 12. Skills Junction Tables (split from polymorphic entity_skills)
-- ---------------------------------------------------------------------------
create table if not exists public.job_skills (
  job_skill_id uuid primary key default uuid_generate_v4(),
  job_post_id  uuid not null references public.job_posts(job_post_id) on delete cascade,
  skill_id     uuid not null references public.skills(skill_id),
  created_at   timestamptz not null default now(),
  unique (job_post_id, skill_id)
);

create table if not exists public.user_skills (
  user_skill_id uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users_table(id) on delete cascade,
  skill_id      uuid not null references public.skills(skill_id),
  created_at    timestamptz not null default now(),
  unique (user_id, skill_id)
);

create table if not exists public.equipment_listing_skill (
  listing_id uuid not null references public.equipment_listings(listing_id) on delete cascade,
  skill_id   uuid not null references public.skills(skill_id),
  created_at timestamptz not null default now(),
  primary key (listing_id, skill_id)
);

-- ---------------------------------------------------------------------------
-- 13. Job Posts (replaces jobs)
-- ---------------------------------------------------------------------------
create table if not exists public.job_posts (
  job_post_id          uuid primary key default uuid_generate_v4(),
  client_id            uuid not null references public.users_table(id),
  hiring_option        text,
  job_title            text not null,
  service_type         text,
  job_address          text,
  preferred_start_time timestamptz,
  job_description      text,
  payment_method       text,
  supporting_images_url text[],
  job_status           text not null default 'active' check (job_status in ('active','finished','flagged','cancelled','escalated')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 14. Job Matches (replaces proposals)
-- ---------------------------------------------------------------------------
create table if not exists public.job_matches (
  job_match_id uuid primary key default uuid_generate_v4(),
  job_post_id  uuid not null references public.job_posts(job_post_id) on delete cascade,
  proposal_id  uuid,
  client_id    uuid not null references public.users_table(id),
  user_id      uuid not null references public.users_table(id),
  connections  integer default 0,
  status       text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn','in_progress','completed','verified')),
  agreed_price numeric(10,2),
  matched_at   timestamptz,
  completed_at timestamptz,
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 15. Equipment Listings (replaces listings)
-- ---------------------------------------------------------------------------
create table if not exists public.equipment_listings (
  listing_id            uuid primary key default uuid_generate_v4(),
  owner_id              uuid not null references public.users_table(id),
  equipment_name        text not null,
  equipment_condition   text,
  equipment_description text,
  equipment_images_url  text[] default '{}',
  stock                 integer default 1,
  size                  text,
  weight                numeric,
  number_of_items       integer default 0,
  skill_level           text,
  day_pricing           numeric(10,2),
  week_pricing          numeric(10,2),
  equipment_value       numeric(10,2),
  security_deposit      numeric(10,2),
  payment_method        text,
  status                text not null default 'published' check (status in ('published','flagged','unpublished')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 16. Rentals
-- ---------------------------------------------------------------------------
create table if not exists public.rentals (
  id              uuid primary key default uuid_generate_v4(),
  display_id      text,
  listing_id      uuid not null references public.listings(id),
  renter_id       uuid not null references public.users_table(id),
  owner_id        uuid not null references public.users_table(id),
  start_date      timestamptz not null,
  end_date        timestamptz not null,
  total_amount    numeric(10,2),
  status          text not null default 'pending' check (status in ('pending','active','completed','cancelled')),
  deposit_amount  numeric(10,2) default 0,
  deposit_status  text default 'held' check (deposit_status in ('held','returned','deducted')),
  damage_report   text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 17. Return Records
-- ---------------------------------------------------------------------------
create table if not exists public.return_records (
  return_id             uuid primary key default uuid_generate_v4(),
  rental_id             uuid not null references public.rentals(id),
  renter_id             uuid not null references public.users_table(id),
  item_condition        text,
  supporting_images_url text[],
  returned_at           timestamptz default now(),
  confirmed_at          timestamptz,
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 18. Wallets
-- ---------------------------------------------------------------------------
create table if not exists public.wallets (
  wallet_id  uuid primary key default uuid_generate_v4(),
  user_id    uuid not null unique references public.users_table(id),
  balance    numeric default 0,
  updated_at timestamptz default now(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 19. Transactions
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id               uuid primary key default uuid_generate_v4(),
  type             text not null check (type in ('job_payment','rental_payment','deposit','refund','payout','galaw_purchase','fee')),
  amount           numeric(10,2) not null,
  status           text not null check (status in ('pending','completed','failed','escrow','held','cancelled')),
  payment_method   text check (payment_method in ('gcash','bank_transfer','card','wallet')),
  reference        text,
  user_id          uuid not null references public.users_table(id),
  wallet_id        uuid references public.wallets(wallet_id),
  related_id       uuid,
  related_type     text check (related_type in ('job', 'rental', 'galaw_pack')),
  direction        text,
  reference_id     uuid,
  reference_type   text,
  running_balance  numeric,
  description      text,
  fee              numeric(10,2) default 0,
  net_amount       numeric(10,2),
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 20. Trust Ledger
-- ---------------------------------------------------------------------------
create table if not exists public.trust_ledger (
  id                  uuid primary key default uuid_generate_v4(),
  display_id          text,
  transaction_id      uuid references public.transactions(id),
  user_id             uuid not null references public.users_table(id),
  type                text not null,
  amount              numeric(10,2) not null,
  balance             numeric(10,2) not null,
  status              text default 'pending',
  release_date        timestamptz,
  release_condition   text,
  notes               text,
  direction           text,
  running_balance     numeric,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 21. Fee Configurations
-- ---------------------------------------------------------------------------
create table if not exists public.fee_configs (
  id                   uuid primary key default uuid_generate_v4(),
  name                 text not null,
  proposal_gp_cost     integer not null default 50,
  platform_fee_percent numeric(5,2) not null default 2.5,
  gp_conversion_rate   numeric(5,2) not null default 1.0,
  listing_fee          numeric(10,2) default 0,
  rental_commission    numeric(5,2) default 10,
  is_active            boolean not null default false,
  updated_by           uuid references public.users_table(id),
  created_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 22. App Settings
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  id         uuid primary key default uuid_generate_v4(),
  key        text not null unique,
  value      jsonb not null default '{}'::jsonb,
  updated_by uuid references public.users_table(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 23. Galaw Points Packs
-- ---------------------------------------------------------------------------
create table if not exists public.galaw_points_packs (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  points      integer not null,
  price       numeric(10,2) not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 24. Galaw Points Transactions
-- ---------------------------------------------------------------------------
create table if not exists public.galaw_points_transactions (
  id          uuid primary key default uuid_generate_v4(),
  display_id  text,
  user_id     uuid not null references public.users_table(id),
  type        text not null check (type in ('purchase','consumed','issued','deducted')),
  points      integer not null,
  amount      numeric(10,2),
  pack_id     uuid references public.galaw_points_packs(id),
  job_id      uuid references public.jobs(id),
  admin_id    uuid references public.users_table(id),
  description text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 25. Disputes
-- ---------------------------------------------------------------------------
create table if not exists public.disputes (
  id              uuid primary key default uuid_generate_v4(),
  type            text not null check (type in ('job_dispute','damage_report','fraud_report','abuse_report','report')),
  title           text not null,
  description     text,
  severity        text not null check (severity in ('low','medium','high','critical')),
  status          text not null default 'pending' check (status in ('pending','under-review','resolved','dismissed')),
  reporter_id     uuid not null references public.users_table(id),
  respondent_id   uuid references public.users_table(id),
  related_id      uuid,
  related_type    text check (related_type in ('job', 'rental')),
  assigned_to     uuid references public.users_table(id),
  evidence        text[],
  timeline        jsonb default '[]',
  resolution      text,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  notes           text
);

-- ---------------------------------------------------------------------------
-- 26. Reports
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id              uuid primary key default uuid_generate_v4(),
  type            text not null check (type in ('content_report','user_report')),
  reporter_id     uuid not null references public.users_table(id),
  target_type     text not null check (target_type in ('job', 'user', 'listing')),
  target_id       uuid not null,
  title           text not null,
  description     text,
  severity        text not null check (severity in ('low','medium','high','critical')),
  status          text not null default 'pending' check (status in ('pending','under-review','resolved')),
  decision        text check (decision in ('keep','remove','warn')),
  decision_notes  text,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 27. Appeals
-- ---------------------------------------------------------------------------
create table if not exists public.appeals (
  id                      uuid primary key default uuid_generate_v4(),
  user_id                 uuid not null references public.users_table(id),
  status                  text not null default 'pending' check (status in ('pending','forwarded','decided')),
  suspension_reason       text not null,
  support_recommendation  text check (support_recommendation in ('reinstate','uphold')),
  support_notes           text,
  decision                text check (decision in ('reinstate','uphold')),
  decision_notes          text,
  decided_at              timestamptz,
  filed_at                timestamptz not null default now(),
  timeline                jsonb default '[]',
  notes                   text
);

-- ---------------------------------------------------------------------------
-- 28. Reviews
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id          uuid primary key default uuid_generate_v4(),
  reviewer_id uuid not null references public.users_table(id),
  target_id   uuid not null,
  target_type text not null check (target_type in ('talent','equipment_owner','contractor','client')),
  rating      integer not null check (rating >= 1 and rating <= 5),
  text        text,
  status      text not null default 'published' check (status in ('published','flagged','hidden')),
  flags       integer default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 29. Conversations & Messages
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id              uuid primary key default uuid_generate_v4(),
  last_message    text,
  last_message_at timestamptz,
  unread          boolean default false,
  created_at      timestamptz not null default now()
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.users_table(id),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.users_table(id),
  text            text not null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 30. Assessments System
-- ---------------------------------------------------------------------------
create table if not exists public.assessments_tests (
  test_id               uuid primary key default uuid_generate_v4(),
  skill_id              uuid not null references public.skills(skill_id),
  test_name             text not null,
  total_items           int default 0,
  time_limit            int,
  retake_cooldown_hours int default 24,
  created_at            timestamptz not null default now()
);

create table if not exists public.questions (
  id             uuid primary key default uuid_generate_v4(),
  category_id    uuid not null references public.categories(id),
  test_id        uuid references public.assessments_tests(test_id),
  text           text not null,
  type           text not null default 'multiple_choice' check (type in ('multiple_choice','true_false','essay')),
  options        text[] default '{}',
  correct_answer text,
  points         integer not null default 5,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.assessments (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users_table(id),
  category_id   uuid not null references public.categories(id),
  status        text not null default 'in_progress' check (status in ('in_progress','completed','graded')),
  score         integer default 0,
  total_points  integer not null default 0,
  is_passed     boolean default false,
  last_taken_at timestamptz,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  graded_by     uuid references public.users_table(id),
  graded_at     timestamptz
);

create table if not exists public.assessment_responses (
  id            uuid primary key default uuid_generate_v4(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  question_id   uuid not null references public.questions(id),
  answer        text not null,
  is_correct    boolean,
  score         integer default 0,
  unique (assessment_id, question_id)
);

create table if not exists public.assessment_attempts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users_table(id),
  assessment_id   uuid not null references public.assessments(id),
  attempted_at    timestamptz not null default now(),
  score           integer not null default 0,
  total_points    integer not null default 0,
  result          text not null check (result in ('passed','failed')),
  is_retake       boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (user_id, assessment_id, attempted_at)
);

create table if not exists public.assessment_retake_overrides (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users_table(id),
  assessment_id   uuid references public.assessments(id),
  granted_by      uuid not null references public.users_table(id),
  reason          text not null,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 31. Incident Logs (admin audit trail)
-- ---------------------------------------------------------------------------
create table if not exists public.incident_logs (
  id          uuid primary key default uuid_generate_v4(),
  agent_id    uuid not null references public.users_table(id),
  agent_name  text not null,
  action      text not null,
  module      text not null,
  target_id   text,
  target_type text,
  description text,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 32. Notifications (admin-facing alerts)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references public.users_table(id) on delete cascade,
  type           text not null,
  title          text not null,
  description    text,
  link           text,
  read           boolean not null default false,
  actor_name     text not null default 'System',
  reference_id   uuid,
  reference_type text check (reference_type in ('job', 'dispute', 'appeal', 'proposal')),
  body           text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 33. Entity Flags (join table — replaces flags columns on old tables)
-- ---------------------------------------------------------------------------
create table if not exists public.entity_flags (
  flag_id     uuid primary key default uuid_generate_v4(),
  entity_type text not null,
  entity_id   uuid not null,
  flagged_by  uuid references public.users_table(id),
  reason      text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 34. Job Completion (replaces job_tasks — restructured per merge plan)
-- ---------------------------------------------------------------------------
create table if not exists public.job_completion (
  job_completion_id   uuid primary key default uuid_generate_v4(),
  job_match_id        uuid references public.job_matches(job_match_id),
  client_id           uuid references public.users_table(id),
  user_id             uuid references public.users_table(id),
  message             text,
  supporting_images_url text,
  requested_at        timestamptz,
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 35. Check-Ins (replaces job_check_ins — restructured per merge plan)
-- ---------------------------------------------------------------------------
create table if not exists public.check_ins (
  check_in_id   uuid primary key default uuid_generate_v4(),
  job_match_id  uuid references public.job_matches(job_match_id),
  client_id     uuid references public.users_table(id),
  user_id       uuid not null references public.users_table(id),
  location_lat  numeric,
  location_lng  numeric,
  checked_in_at timestamptz not null default now(),
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 35. Rental Check-Ins
-- ---------------------------------------------------------------------------
create table if not exists public.rental_check_ins (
  id            uuid primary key default uuid_generate_v4(),
  rental_id     uuid not null references public.rentals(id) on delete cascade,
  user_id       uuid not null references public.users_table(id),
  type          text not null check (type in ('receive','return')),
  location_lat  numeric,
  location_lng  numeric,
  device_info   text,
  ip_address    text,
  notes         text,
  checked_in_at timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
create index if not exists idx_users_table_email on public.users_table(email);
create index if not exists idx_users_table_role on public.users_table(role);
create index if not exists idx_users_table_verified on public.users_table(is_verified);
create index if not exists idx_id_verifications_user on public.id_verifications(user_id);
create index if not exists idx_id_verifications_status on public.id_verifications(status);
create index if not exists idx_user_suspensions_user on public.user_suspensions(user_id);
create index if not exists idx_user_suspensions_status on public.user_suspensions(suspension_status);
create index if not exists idx_user_notes_user on public.user_notes(user_id);
create index if not exists idx_roles_name on public.roles(role_name);
create index if not exists idx_user_roles_user on public.user_roles(user_id);
create index if not exists idx_user_roles_role on public.user_roles(role_id);
create index if not exists idx_role_profiles_user on public.role_profiles(user_id);
create index if not exists idx_role_profiles_role_type on public.role_profiles(role_type);
create index if not exists idx_skills_name on public.skills(skill_name);
create index if not exists idx_entity_flags_entity on public.entity_flags(entity_type, entity_id);
create index if not exists idx_entity_flags_flagged_by on public.entity_flags(flagged_by);
create index if not exists idx_job_posts_client on public.job_posts(client_id);
create index if not exists idx_job_posts_status on public.job_posts(job_status);
create index if not exists idx_job_posts_created on public.job_posts(created_at);
create index if not exists idx_job_matches_job_post on public.job_matches(job_post_id);
create index if not exists idx_job_matches_client on public.job_matches(client_id);
create index if not exists idx_job_matches_user on public.job_matches(user_id);
create index if not exists idx_job_matches_status on public.job_matches(status);
create index if not exists idx_equipment_listings_owner on public.equipment_listings(owner_id);
create index if not exists idx_equipment_listings_status on public.equipment_listings(status);
create index if not exists idx_rentals_listing on public.rentals(listing_id);
create index if not exists idx_rentals_renter on public.rentals(renter_id);
create index if not exists idx_rentals_status on public.rentals(status);
create index if not exists idx_return_records_rental on public.return_records(rental_id);
create index if not exists idx_return_records_renter on public.return_records(renter_id);
create index if not exists idx_wallets_user on public.wallets(user_id);
create index if not exists idx_job_completion_match on public.job_completion(job_match_id);
create index if not exists idx_check_ins_match on public.check_ins(job_match_id);
create index if not exists idx_check_ins_user on public.check_ins(user_id);
create index if not exists idx_job_skills_job on public.job_skills(job_post_id);
create index if not exists idx_user_skills_user on public.user_skills(user_id);
create index if not exists idx_equipment_listing_skill_listing on public.equipment_listing_skill(listing_id);
create index if not exists idx_transactions_user on public.transactions(user_id);
create index if not exists idx_transactions_type on public.transactions(type);
create index if not exists idx_transactions_status on public.transactions(status);
create index if not exists idx_transactions_related on public.transactions(related_id, related_type);
create index if not exists idx_disputes_status on public.disputes(status);
create index if not exists idx_disputes_assigned on public.disputes(assigned_to);
create index if not exists idx_reports_status on public.reports(status);
create index if not exists idx_appeals_status on public.appeals(status);
create index if not exists idx_reviews_target on public.reviews(target_id, target_type);
create index if not exists idx_reviews_status on public.reviews(status);
create index if not exists idx_messages_conversation on public.messages(conversation_id);
create index if not exists idx_conv_participants_user on public.conversation_participants(user_id);
create index if not exists idx_conv_participants_conv on public.conversation_participants(conversation_id);
create index if not exists idx_assessments_user on public.assessments(user_id);
create index if not exists idx_assessments_category on public.assessments(category_id);
create index if not exists idx_assessments_status on public.assessments(status);
create index if not exists idx_questions_category on public.questions(category_id);
create index if not exists idx_questions_test on public.questions(test_id);
create index if not exists idx_galaw_txns_user on public.galaw_points_transactions(user_id);
create index if not exists idx_galaw_txns_type on public.galaw_points_transactions(type);
create index if not exists idx_incident_logs_agent on public.incident_logs(agent_id);
create index if not exists idx_incident_logs_module on public.incident_logs(module);
create index if not exists idx_incident_logs_action on public.incident_logs(action);
create index if not exists idx_user_incidents_status on public.user_incidents(status);
create index if not exists idx_assessment_attempts_user on public.assessment_attempts(user_id);
create index if not exists idx_assessment_attempts_assessment on public.assessment_attempts(assessment_id);
create index if not exists idx_assessment_attempts_attempted on public.assessment_attempts(attempted_at);
create index if not exists idx_retake_overrides_user on public.assessment_retake_overrides(user_id);
create index if not exists idx_retake_overrides_expiry on public.assessment_retake_overrides(expires_at);
create index if not exists idx_assessments_tests_skill on public.assessments_tests(skill_id);
create index if not exists idx_notifications_read on public.notifications(read);
create index if not exists idx_notifications_created on public.notifications(created_at desc);
create index if not exists idx_job_tasks_job on public.job_tasks(job_id);
create index if not exists idx_job_tasks_status on public.job_tasks(status);
create index if not exists idx_job_check_ins_proposal on public.job_check_ins(proposal_id);
create index if not exists idx_job_check_ins_job on public.job_check_ins(job_id);
create index if not exists idx_job_check_ins_user on public.job_check_ins(user_id);
create index if not exists idx_rental_check_ins_rental on public.rental_check_ins(rental_id);
create index if not exists idx_rental_check_ins_user on public.rental_check_ins(user_id);
create index if not exists idx_rental_check_ins_type on public.rental_check_ins(type);

-- ============================================================================
-- TRIGGER FUNCTIONS
-- ============================================================================

-- Auto-profile trigger: creates a users_table row when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_first_name text;
  v_last_name text;
begin
  v_first_name := coalesce(new.raw_user_meta_data->>'first_name', split_part(new.email, '@', 1));
  v_last_name := coalesce(new.raw_user_meta_data->>'last_name', '');

  insert into public.users_table (id, email, role, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'client'),
    v_first_name,
    v_last_name
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sync: users_table.role → user_roles
create or replace function public.sync_users_table_role_to_user_roles()
returns trigger as $$
begin
  if new.role is not null then
    insert into public.roles (role_name) values (new.role)
    on conflict (role_name) do nothing;

    insert into public.user_roles (user_id, role_id)
    select new.id, r.role_id
    from public.roles r
    where r.role_name = new.role
    on conflict (user_id, role_id) do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_sync_users_table_role_to_user_roles on public.users_table;
create trigger trg_sync_users_table_role_to_user_roles
  after insert or update of role on public.users_table
  for each row execute function public.sync_users_table_role_to_user_roles();

-- Sync: user_roles → role_profiles
create or replace function public.sync_user_roles_to_role_profiles()
returns trigger as $$
declare
  v_role_type text;
begin
  select r.role_name into v_role_type
  from public.roles r
  where r.role_id = new.role_id;

  if v_role_type in ('client', 'talent', 'contractor', 'equipment_owner') then
    insert into public.role_profiles (user_id, role_type)
    values (new.user_id, v_role_type)
    on conflict (user_id, role_type) do nothing;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_sync_user_roles_to_role_profiles on public.user_roles;
create trigger trg_sync_user_roles_to_role_profiles
  after insert on public.user_roles
  for each row execute function public.sync_user_roles_to_role_profiles();

-- Name sync triggers for audit/notes
create or replace function public.sync_incident_logs_agent_name()
returns trigger as $$
begin
  if new.agent_id is not null then
    select concat(first_name, ' ', last_name) into new.agent_name
    from public.users_table
    where id = new.agent_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_sync_incident_logs_agent_name on public.incident_logs;
create trigger trg_sync_incident_logs_agent_name
  before insert or update of agent_id on public.incident_logs
  for each row execute function public.sync_incident_logs_agent_name();

create or replace function public.sync_entity_notes_author_name()
returns trigger as $$
begin
  if new.author_id is not null then
    select concat(first_name, ' ', last_name) into new.author_name
    from public.users_table
    where id = new.author_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_sync_entity_notes_author_name on public.entity_notes;
create trigger trg_sync_entity_notes_author_name
  before insert or update of author_id on public.entity_notes
  for each row execute function public.sync_entity_notes_author_name();

create or replace function public.sync_user_incidents_reporter_name()
returns trigger as $$
begin
  if new.reporter_id is not null then
    select concat(first_name, ' ', last_name) into new.reporter
    from public.users_table
    where id = new.reporter_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_sync_user_incidents_reporter_name on public.user_incidents;
create trigger trg_sync_user_incidents_reporter_name
  before insert or update of reporter_id on public.user_incidents
  for each row execute function public.sync_user_incidents_reporter_name();

create or replace function public.sync_user_incidents_respondent_name()
returns trigger as $$
begin
  if new.respondent_id is not null then
    select concat(first_name, ' ', last_name) into new.respondent_name
    from public.users_table
    where id = new.respondent_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_sync_user_incidents_respondent_name on public.user_incidents;
create trigger trg_sync_user_incidents_respondent_name
  before insert or update of respondent_id on public.user_incidents
  for each row execute function public.sync_user_incidents_respondent_name();

-- Trust Ledger Auto-Sync
create or replace function public.sync_trust_ledger()
returns trigger as $$
declare
  trust_type text;
  trust_amount numeric;
  last_balance numeric;
  new_balance numeric;
begin
  if new.type in ('job_payment', 'rental_payment') then
    trust_type := 'payment_in';
    trust_amount := abs(new.amount);
  elsif new.type in ('deposit', 'galaw_purchase') then
    trust_type := 'deposit';
    trust_amount := abs(new.amount);
  elsif new.type = 'payout' then
    trust_type := 'payout';
    trust_amount := -abs(new.amount);
  elsif new.type = 'refund' then
    trust_type := 'refund';
    trust_amount := -abs(new.amount);
  elsif new.type = 'fee' then
    trust_type := 'fee';
    trust_amount := -abs(new.amount);
  else
    return new;
  end if;

  if new.status in ('cancelled', 'failed') then
    if exists (select 1 from public.trust_ledger where transaction_id = new.id) then
      update public.trust_ledger
      set status = new.status, updated_at = now()
      where transaction_id = new.id;
    end if;
    return new;
  end if;

  if exists (select 1 from public.trust_ledger where transaction_id = new.id) then
    if new.status = 'completed' then
      update public.trust_ledger
      set status = 'completed',
          release_date = now(),
          updated_at = now()
      where transaction_id = new.id;
    else
      update public.trust_ledger
      set status = case
        when new.status in ('escrow', 'held') then 'held'
        else new.status
      end,
      updated_at = now()
      where transaction_id = new.id;
    end if;
    return new;
  end if;

  if new.status in ('pending', 'completed', 'escrow', 'held') then
    select coalesce(sum(amount), 0) into last_balance from public.trust_ledger;
    new_balance := last_balance + trust_amount;

    insert into public.trust_ledger (
      transaction_id, user_id, type, amount, balance, status,
      release_condition, notes, created_at, updated_at
    ) values (
      new.id,
      new.user_id,
      trust_type,
      trust_amount,
      new_balance,
      case
        when new.status in ('escrow', 'held') then 'held'
        else new.status
      end,
      case
        when new.type = 'job_payment' and new.status in ('escrow', 'held') then 'job'
        when new.type = 'rental_payment' and new.status in ('escrow', 'held') then 'rental_completion'
        else null
      end,
      'Auto-synced from transaction',
      new.created_at,
      now()
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_sync_trust_ledger on public.transactions;
create trigger trg_sync_trust_ledger
  after insert or update on public.transactions
  for each row execute function public.sync_trust_ledger();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

create or replace function public.is_staff()
returns boolean as $$
begin
  return exists (
    select 1 from public.users_table
    where id = auth.uid()
      and role in ('admin', 'customer_support')
  );
end;
$$ language plpgsql stable;

-- Users Table
alter table public.users_table enable row level security;
create policy "Users can view own profile"
  on public.users_table for select
  using (auth.uid() = id);
create policy "Staff can view all users"
  on public.users_table for select
  using (public.is_staff());
create policy "Staff can update users"
  on public.users_table for update
  using (public.is_staff());

-- ID Verifications
alter table public.id_verifications enable row level security;
create policy "Staff can read id_verifications"
  on public.id_verifications for select
  using (public.is_staff());
create policy "Staff can update id_verifications"
  on public.id_verifications for update
  using (public.is_staff());
create policy "Users can view own verifications"
  on public.id_verifications for select
  using (auth.uid() = user_id);

-- User Suspensions
alter table public.user_suspensions enable row level security;
create policy "Staff can read user_suspensions"
  on public.user_suspensions for select
  using (public.is_staff());
create policy "Staff can manage user_suspensions"
  on public.user_suspensions for all
  using (public.is_staff());

-- RLS for remaining tables (same policies as before, references updated to users_table)
alter table public.entity_notes enable row level security;
create policy "Staff can manage entity notes"
  on public.entity_notes for all
  using (public.is_staff());

alter table public.user_notes enable row level security;
create policy "Staff can manage notes"
  on public.user_notes for all
  using (public.is_staff());

alter table public.user_incidents enable row level security;
create policy "Staff can read user incidents"
  on public.user_incidents for select
  using (public.is_staff());
create policy "Staff can update user incidents"
  on public.user_incidents for update
  using (public.is_staff());

alter table public.roles enable row level security;
create policy "Staff can read roles"
  on public.roles for select
  using (public.is_staff());
create policy "Staff can manage roles"
  on public.roles for all
  using (public.is_staff());

alter table public.user_roles enable row level security;
create policy "Staff can read user roles"
  on public.user_roles for select
  using (public.is_staff());
create policy "Staff can manage user roles"
  on public.user_roles for all
  using (public.is_staff());

alter table public.role_profiles enable row level security;
create policy "Staff can read role profiles"
  on public.role_profiles for select
  using (public.is_staff());
create policy "Staff can manage role profiles"
  on public.role_profiles for all
  using (public.is_staff());

alter table public.categories enable row level security;
create policy "Staff can manage categories"
  on public.categories for all
  using (public.is_staff());
create policy "Anyone can read categories"
  on public.categories for select
  using (true);

alter table public.skills enable row level security;
create policy "Staff can read skills"
  on public.skills for select
  using (public.is_staff());
create policy "Staff can manage skills"
  on public.skills for all
  using (public.is_staff());

alter table public.job_posts enable row level security;
create policy "Staff can read all job_posts"
  on public.job_posts for select
  using (public.is_staff());
create policy "Staff can manage job_posts"
  on public.job_posts for all
  using (public.is_staff());

alter table public.job_matches enable row level security;
create policy "Staff can read all job_matches"
  on public.job_matches for select
  using (public.is_staff());
create policy "Staff can manage job_matches"
  on public.job_matches for all
  using (public.is_staff());

alter table public.equipment_listings enable row level security;
create policy "Staff can read all equipment_listings"
  on public.equipment_listings for select
  using (public.is_staff());
create policy "Staff can manage equipment_listings"
  on public.equipment_listings for all
  using (public.is_staff());

alter table public.job_skills enable row level security;
create policy "Staff can read all job_skills"
  on public.job_skills for select
  using (public.is_staff());
create policy "Staff can manage job_skills"
  on public.job_skills for all
  using (public.is_staff());

alter table public.user_skills enable row level security;
create policy "Staff can read all user_skills"
  on public.user_skills for select
  using (public.is_staff());
create policy "Staff can manage user_skills"
  on public.user_skills for all
  using (public.is_staff());

alter table public.equipment_listing_skill enable row level security;
create policy "Staff can read all equipment_listing_skill"
  on public.equipment_listing_skill for select
  using (public.is_staff());
create policy "Staff can manage equipment_listing_skill"
  on public.equipment_listing_skill for all
  using (public.is_staff());

alter table public.entity_flags enable row level security;
create policy "Staff can read all entity_flags"
  on public.entity_flags for select
  using (public.is_staff());
create policy "Staff can manage entity_flags"
  on public.entity_flags for all
  using (public.is_staff());

alter table public.rentals enable row level security;
create policy "Staff can read all rentals"
  on public.rentals for select
  using (public.is_staff());
create policy "Staff can update rentals"
  on public.rentals for update
  using (public.is_staff());

alter table public.return_records enable row level security;
create policy "Staff can read return records"
  on public.return_records for select
  using (public.is_staff());
create policy "Staff can manage return records"
  on public.return_records for all
  using (public.is_staff());

alter table public.transactions enable row level security;
create policy "Staff can read all transactions"
  on public.transactions for select
  using (public.is_staff());
create policy "Staff can insert transactions"
  on public.transactions for insert
  with check (public.is_staff());

alter table public.trust_ledger enable row level security;
create policy "Staff can read trust ledger"
  on public.trust_ledger for select
  using (public.is_staff());
create policy "Staff can insert trust ledger"
  on public.trust_ledger for insert
  with check (public.is_staff());
create policy "Staff can update trust ledger"
  on public.trust_ledger for update
  using (public.is_staff());

alter table public.fee_configs enable row level security;
create policy "Staff can manage fee configs"
  on public.fee_configs for all
  using (public.is_staff());
create policy "Anyone can read active fee config"
  on public.fee_configs for select
  using (true);

alter table public.app_settings enable row level security;
create policy "Staff can manage app settings"
  on public.app_settings for all
  using (public.is_staff());
create policy "Anyone can read app settings"
  on public.app_settings for select
  using (true);

alter table public.wallets enable row level security;
create policy "Staff can read wallets"
  on public.wallets for select
  using (public.is_staff());
create policy "Staff can manage wallets"
  on public.wallets for all
  using (public.is_staff());

alter table public.galaw_points_packs enable row level security;
create policy "Staff can manage packs"
  on public.galaw_points_packs for all
  using (public.is_staff());
create policy "Anyone can read active packs"
  on public.galaw_points_packs for select
  using (true);

alter table public.galaw_points_transactions enable row level security;
create policy "Staff can read galaw txns"
  on public.galaw_points_transactions for select
  using (public.is_staff());
create policy "Staff can insert galaw txns"
  on public.galaw_points_transactions for insert
  with check (public.is_staff());

alter table public.disputes enable row level security;
create policy "Staff can read disputes"
  on public.disputes for select
  using (public.is_staff());
create policy "Staff can update disputes"
  on public.disputes for update
  using (public.is_staff());

alter table public.reports enable row level security;
create policy "Staff can read reports"
  on public.reports for select
  using (public.is_staff());
create policy "Staff can update reports"
  on public.reports for update
  using (public.is_staff());

alter table public.appeals enable row level security;
create policy "Staff can read appeals"
  on public.appeals for select
  using (public.is_staff());
create policy "Staff can update appeals"
  on public.appeals for update
  using (public.is_staff());

alter table public.reviews enable row level security;
create policy "Staff can read reviews"
  on public.reviews for select
  using (public.is_staff());
create policy "Staff can update reviews"
  on public.reviews for update
  using (public.is_staff());

alter table public.conversations enable row level security;
create policy "Staff can read conversations"
  on public.conversations for select
  using (public.is_staff());
create policy "Staff can insert conversations"
  on public.conversations for insert
  with check (public.is_staff());
create policy "Staff can update conversations"
  on public.conversations for update
  using (public.is_staff());

alter table public.conversation_participants enable row level security;
create policy "Staff can read participants"
  on public.conversation_participants for select
  using (public.is_staff());
create policy "Staff can insert participants"
  on public.conversation_participants for insert
  with check (public.is_staff());

alter table public.messages enable row level security;
create policy "Staff can read messages"
  on public.messages for select
  using (public.is_staff());
create policy "Staff can insert messages"
  on public.messages for insert
  with check (public.is_staff());

alter table public.questions enable row level security;
create policy "Staff can manage questions"
  on public.questions for all
  using (public.is_staff());
create policy "Anyone can read active questions"
  on public.questions for select
  using (true);

alter table public.assessments enable row level security;
create policy "Staff can read assessments"
  on public.assessments for select
  using (public.is_staff());
create policy "Staff can update assessments"
  on public.assessments for update
  using (public.is_staff());

alter table public.assessment_responses enable row level security;
create policy "Staff can read responses"
  on public.assessment_responses for select
  using (public.is_staff());

alter table public.assessment_attempts enable row level security;
create policy "Staff can read assessment attempts"
  on public.assessment_attempts for select
  using (public.is_staff());
create policy "Staff can insert assessment attempts"
  on public.assessment_attempts for insert
  with check (public.is_staff());

alter table public.assessment_retake_overrides enable row level security;
create policy "Staff can read retake overrides"
  on public.assessment_retake_overrides for select
  using (public.is_staff());
create policy "Staff can insert retake overrides"
  on public.assessment_retake_overrides for insert
  with check (public.is_staff());

alter table public.assessments_tests enable row level security;
create policy "Staff can read assessments tests"
  on public.assessments_tests for select
  using (public.is_staff());
create policy "Staff can manage assessments tests"
  on public.assessments_tests for all
  using (public.is_staff());

alter table public.incident_logs enable row level security;
create policy "Staff can read incident logs"
  on public.incident_logs for select
  using (public.is_staff());
create policy "Staff can insert incident logs"
  on public.incident_logs for insert
  with check (public.is_staff());

alter table public.notifications enable row level security;
create policy "Staff can read notifications"
  on public.notifications for select
  using (public.is_staff());
create policy "Staff can insert notifications"
  on public.notifications for insert
  with check (public.is_staff());
create policy "Staff can update notifications"
  on public.notifications for update
  using (public.is_staff());

alter table public.job_completion enable row level security;
create policy "Staff can read job_completion"
  on public.job_completion for select
  using (public.is_staff());
create policy "Staff can manage job_completion"
  on public.job_completion for all
  using (public.is_staff());

alter table public.check_ins enable row level security;
create policy "Staff can read check_ins"
  on public.check_ins for select
  using (public.is_staff());
create policy "Staff can manage check_ins"
  on public.check_ins for all
  using (public.is_staff());

alter table public.rental_check_ins enable row level security;
create policy "Staff can read rental check_ins"
  on public.rental_check_ins for select
  using (public.is_staff());
create policy "Staff can manage rental check_ins"
  on public.rental_check_ins for all
  using (public.is_staff());

grant usage on schema public to authenticated, anon;
grant all privileges on all tables in schema public to authenticated, anon;
