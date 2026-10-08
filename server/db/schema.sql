-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.users_table (
  id uuid NOT NULL,
  email text,
  phone text,
  role text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  first_name text,
  middle_name text,
  last_name text,
  birth_date date,
  region text,
  province text,
  municipality text,
  barangay text,
  complete_address text,
  profile_image_url text,
  is_verified boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamp with time zone,
  archived_by text,
  archive_reason text,
  CONSTRAINT users_table_pkey PRIMARY KEY (id),
  CONSTRAINT users_table_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.job_posts (
  job_post_id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  hiring_option text NOT NULL CHECK (hiring_option = ANY (ARRAY['talent'::text, 'contractor'::text])),
  job_title text NOT NULL,
  service_type text NOT NULL,
  job_address text,
  preferred_start_time text,
  job_description text,
  payment_method ARRAY NOT NULL CHECK (cardinality(payment_method) > 0),
  supporting_images_url ARRAY,
  job_status text NOT NULL DEFAULT 'open'::text CHECK (job_status = ANY (ARRAY['open'::text, 'closed'::text, 'in_progress'::text, 'completed'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  job_trades ARRAY NOT NULL DEFAULT '{}'::text[],
  budget numeric,
  CONSTRAINT job_posts_pkey PRIMARY KEY (job_post_id),
  CONSTRAINT job_posts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users_table(id)
);
CREATE TABLE public.equipment_listings (
  listing_id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  equipment_name text NOT NULL,
  equipment_condition text NOT NULL CHECK ((equipment_condition = ANY (ARRAY['new'::text, 'like_new'::text, 'used'::text, 'for_repair'::text])) OR (equipment_condition = ANY (ARRAY['Brand New'::text, 'Like New'::text, 'Good Condition'::text, 'Fair Condition'::text]))),
  equipment_description text,
  equipment_images_url ARRAY,
  stock integer NOT NULL DEFAULT 1,
  size text,
  weight numeric,
  number_of_items integer NOT NULL DEFAULT 1,
  skill_level text CHECK (skill_level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'expert'::text])),
  day_pricing numeric NOT NULL,
  week_pricing numeric,
  equipment_value numeric,
  security_deposit numeric,
  payment_method text NOT NULL,
  status text NOT NULL DEFAULT 'available'::text CHECK (status = ANY (ARRAY['available'::text, 'rented'::text, 'unavailable'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT equipment_listings_pkey PRIMARY KEY (listing_id),
  CONSTRAINT equipment_listings_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users_table(id)
);
CREATE TABLE public.skills (
  skill_id uuid NOT NULL DEFAULT gen_random_uuid(),
  skill_name text NOT NULL UNIQUE,
  icon text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT skills_pkey PRIMARY KEY (skill_id)
);
CREATE TABLE public.job_skills (
  job_skill_id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_post_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT job_skills_pkey PRIMARY KEY (job_skill_id),
  CONSTRAINT job_skills_job_post_id_fkey FOREIGN KEY (job_post_id) REFERENCES public.job_posts(job_post_id),
  CONSTRAINT job_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(skill_id)
);
CREATE TABLE public.job_matches (
  job_match_id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_post_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  client_id uuid NOT NULL,
  user_id uuid NOT NULL,
  connections integer,
  status text NOT NULL DEFAULT 'pending'::text,
  agreed_price numeric,
  matched_at timestamp with time zone,
  completed_at timestamp with time zone,
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT job_matches_pkey PRIMARY KEY (job_match_id),
  CONSTRAINT job_matches_job_post_id_fkey FOREIGN KEY (job_post_id) REFERENCES public.job_posts(job_post_id),
  CONSTRAINT job_matches_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users_table(id),
  CONSTRAINT job_matches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_table(id)
);
CREATE TABLE public.check_ins (
  check_in_id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_match_id uuid NOT NULL,
  client_id uuid NOT NULL,
  user_id uuid NOT NULL,
  location_lat numeric,
  location_lng numeric,
  checked_in_at timestamp with time zone,
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT check_ins_pkey PRIMARY KEY (check_in_id),
  CONSTRAINT check_ins_job_match_id_fkey FOREIGN KEY (job_match_id) REFERENCES public.job_matches(job_match_id),
  CONSTRAINT check_ins_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users_table(id),
  CONSTRAINT check_ins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_table(id)
);
CREATE TABLE public.job_completion (
  job_completion_id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_match_id uuid NOT NULL,
  client_id uuid NOT NULL,
  user_id uuid NOT NULL,
  message text,
  supporting_images_url ARRAY,
  requested_at timestamp with time zone,
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT job_completion_pkey PRIMARY KEY (job_completion_id),
  CONSTRAINT job_completion_job_match_id_fkey FOREIGN KEY (job_match_id) REFERENCES public.job_matches(job_match_id),
  CONSTRAINT job_completion_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users_table(id),
  CONSTRAINT job_completion_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_table(id)
);
CREATE TABLE public.user_skills (
  user_skill_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_skills_pkey PRIMARY KEY (user_skill_id),
  CONSTRAINT user_skills_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_table(id),
  CONSTRAINT user_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(skill_id)
);
CREATE TABLE public.reviews (
  review_id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_completion_id uuid,
  reviewer_id uuid NOT NULL,
  reviewee_id uuid NOT NULL,
  rating numeric NOT NULL CHECK (rating >= 1::numeric AND rating <= 5::numeric),
  comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reviews_pkey PRIMARY KEY (review_id),
  CONSTRAINT reviews_job_completion_id_fkey FOREIGN KEY (job_completion_id) REFERENCES public.job_completion(job_completion_id),
  CONSTRAINT reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.users_table(id),
  CONSTRAINT reviews_reviewee_id_fkey FOREIGN KEY (reviewee_id) REFERENCES public.users_table(id)
);
CREATE TABLE public.equipment_listing_skills (
  listing_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT equipment_listing_skills_pkey PRIMARY KEY (listing_id, skill_id),
  CONSTRAINT equipment_listing_skills_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.equipment_listings(listing_id),
  CONSTRAINT equipment_listing_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(skill_id)
);
CREATE TABLE public.activity_log (
  activity_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  activity_type text NOT NULL CHECK (activity_type = ANY (ARRAY['deposit_refunded'::text, 'equipment_returned'::text, 'equipment_paid'::text, 'deposit_paid'::text, 'job_posted'::text, 'talent_hired'::text, 'job_payment_paid'::text, 'points_topped_up'::text, 'proposal_sent'::text, 'proposal_received'::text, 'job_cancelled'::text, 'equipment_listed'::text, 'rental_requested'::text, 'rental_request_received'::text, 'rental_request_approved'::text, 'rental_request_rejected'::text, 'rental_request_cancelled'::text])),
  category text NOT NULL CHECK (category = ANY (ARRAY['equipment'::text, 'job'::text, 'wallet'::text])),
  description text NOT NULL,
  related_listing_id uuid,
  related_job_post_id uuid,
  related_user_id uuid,
  amount numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT activity_log_pkey PRIMARY KEY (activity_id),
  CONSTRAINT activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_table(id),
  CONSTRAINT activity_log_related_listing_id_fkey FOREIGN KEY (related_listing_id) REFERENCES public.equipment_listings(listing_id),
  CONSTRAINT activity_log_related_job_post_id_fkey FOREIGN KEY (related_job_post_id) REFERENCES public.job_posts(job_post_id),
  CONSTRAINT activity_log_related_user_id_fkey FOREIGN KEY (related_user_id) REFERENCES public.users_table(id)
);
CREATE TABLE public.id_verifications (
  verification_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  government_id_type text NOT NULL,
  front_image_url text NOT NULL,
  back_image_url text NOT NULL,
  selfie_image_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  rejection_reason text,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  first_name text,
  middle_name text,
  last_name text,
  birth_date date,
  region text,
  province text,
  municipality text,
  barangay text,
  complete_address text,
  email text,
  phone text,
  CONSTRAINT id_verifications_pkey PRIMARY KEY (verification_id),
  CONSTRAINT id_verifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_table(id),
  CONSTRAINT id_verifications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users_table(id)
);
CREATE TABLE public.otp_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contact text NOT NULL,
  method text NOT NULL CHECK (method = ANY (ARRAY['email'::text, 'phone'::text])),
  code text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  consumed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  verification_token text,
  token_expires_at timestamp with time zone,
  CONSTRAINT otp_codes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.equipment_rentals (
  rental_id uuid NOT NULL DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  renter_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_price numeric NOT NULL,
  security_deposit_paid numeric,
  rental_status text NOT NULL DEFAULT 'active'::text CHECK (rental_status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT equipment_rentals_pkey PRIMARY KEY (rental_id),
  CONSTRAINT equipment_rentals_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.equipment_listings(listing_id),
  CONSTRAINT equipment_rentals_renter_id_fkey FOREIGN KEY (renter_id) REFERENCES public.users_table(id),
  CONSTRAINT equipment_rentals_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users_table(id)
);
CREATE TABLE public.equipment_requests (
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  requested_start_date date NOT NULL,
  requested_end_date date NOT NULL,
  message text,
  request_status text NOT NULL DEFAULT 'pending'::text CHECK (request_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  delivery_address text,
  rental_period text CHECK (rental_period IS NULL OR (rental_period = ANY (ARRAY['day'::text, 'week'::text]))),
  total_price numeric,
  approved_at timestamp with time zone,
  security_deposit_paid numeric,
  security_deposit_payment_method text,
  security_deposit_paid_at timestamp with time zone,
  out_for_delivery_at timestamp with time zone,
  owner_confirmed_handover_at timestamp with time zone,
  renter_confirmed_delivery_at timestamp with time zone,
  returned_at timestamp with time zone,
  rental_started_at timestamp with time zone,
  rental_due_at timestamp with time zone,
  owner_location_latitude double precision,
  owner_location_longitude double precision,
  owner_location_updated_at timestamp with time zone,
  CONSTRAINT equipment_requests_pkey PRIMARY KEY (request_id),
  CONSTRAINT equipment_requests_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.equipment_listings(listing_id),
  CONSTRAINT equipment_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.users_table(id),
  CONSTRAINT equipment_requests_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users_table(id)
);
CREATE TABLE public.work_portfolios (
  portfolio_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  work_title text NOT NULL CHECK (char_length(btrim(work_title)) > 0),
  work_description text NOT NULL DEFAULT ''::text,
  work_trades ARRAY NOT NULL DEFAULT '{}'::text[],
  supporting_images ARRAY NOT NULL DEFAULT '{}'::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT work_portfolios_pkey PRIMARY KEY (portfolio_id),
  CONSTRAINT work_portfolios_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_table(id)
);
CREATE TABLE public.push_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  expo_push_token text NOT NULL,
  platform text NOT NULL CHECK (platform = ANY (ARRAY['ios'::text, 'android'::text])),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT push_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.job_proposals (
  proposal_id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_post_id uuid NOT NULL,
  proposer_id uuid NOT NULL,
  proposal_title text NOT NULL,
  proposed_price numeric NOT NULL CHECK (proposed_price > 0::numeric),
  price_type text NOT NULL CHECK (price_type = ANY (ARRAY['per_day'::text, 'per_week'::text, 'per_month'::text, 'per_milestone'::text, 'per_project'::text, 'per_task'::text])),
  proposal_description text NOT NULL,
  supporting_images_url ARRAY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'countered'::text, 'accepted'::text, 'declined'::text])),
  counter_offer_price numeric CHECK (counter_offer_price IS NULL OR counter_offer_price > 0::numeric),
  job_title text,
  proposal_milestones jsonb,
  CONSTRAINT job_proposals_pkey PRIMARY KEY (proposal_id),
  CONSTRAINT job_proposals_job_post_id_fkey FOREIGN KEY (job_post_id) REFERENCES public.job_posts(job_post_id),
  CONSTRAINT job_proposals_proposer_id_fkey FOREIGN KEY (proposer_id) REFERENCES public.users_table(id)
);
CREATE TABLE public.transactions (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['job_payment'::text, 'rental_payment'::text, 'deposit'::text, 'refund'::text, 'payout'::text, 'gawa_purchase'::text])),
  amount numeric NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'escrow'::text, 'held'::text, 'cancelled'::text, 'refunded'::text])),
  payment_method text CHECK (payment_method = ANY (ARRAY['gcash'::text, 'bank_transfer'::text, 'card'::text, 'wallet'::text, 'cash'::text])),
  reference text,
  fee numeric DEFAULT 0,
  description text,
  net_amount numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  related_id uuid,
  related_type text CHECK (related_type = ANY (ARRAY['job_post'::text, 'equipment_rental'::text, 'gawa_pack'::text])),
  direction text NOT NULL CHECK (direction = ANY (ARRAY['in'::text, 'out'::text])),
  CONSTRAINT transactions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.equipment_reviews (
  review_id uuid NOT NULL DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text text NOT NULL CHECK (length(btrim(review_text)) > 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT equipment_reviews_pkey PRIMARY KEY (review_id),
  CONSTRAINT equipment_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.users_table(id),
  CONSTRAINT equipment_reviews_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.equipment_listings(listing_id)
);
CREATE TABLE public.skill_assessments (
  assessment_id uuid NOT NULL DEFAULT gen_random_uuid(),
  skill_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  passing_percent numeric NOT NULL DEFAULT 75 CHECK (passing_percent >= 1::numeric AND passing_percent <= 100::numeric),
  questions_per_category integer NOT NULL DEFAULT 5 CHECK (questions_per_category > 0),
  time_limit_minutes integer NOT NULL DEFAULT 40 CHECK (time_limit_minutes > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT skill_assessments_pkey PRIMARY KEY (assessment_id),
  CONSTRAINT skill_assessments_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(skill_id)
);
CREATE TABLE public.assessment_questions (
  question_id uuid NOT NULL DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL,
  part_no smallint NOT NULL DEFAULT 1,
  category text NOT NULL,
  question_text text NOT NULL,
  explanation text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT assessment_questions_pkey PRIMARY KEY (question_id),
  CONSTRAINT assessment_questions_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.skill_assessments(assessment_id)
);
CREATE TABLE public.assessment_choices (
  choice_id uuid NOT NULL DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  choice_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT assessment_choices_pkey PRIMARY KEY (choice_id),
  CONSTRAINT assessment_choices_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.assessment_questions(question_id)
);
CREATE TABLE public.assessment_answer_keys (
  question_id uuid NOT NULL,
  correct_choice_id uuid NOT NULL,
  CONSTRAINT assessment_answer_keys_pkey PRIMARY KEY (question_id),
  CONSTRAINT assessment_answer_keys_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.assessment_questions(question_id),
  CONSTRAINT assessment_answer_keys_correct_choice_id_question_id_fkey FOREIGN KEY (correct_choice_id) REFERENCES public.assessment_choices(choice_id),
  CONSTRAINT assessment_answer_keys_correct_choice_id_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.assessment_choices(question_id)
);
CREATE TABLE public.assessment_attempts (
  attempt_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'in_progress'::text CHECK (status = ANY (ARRAY['in_progress'::text, 'passed'::text, 'failed'::text])),
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  submitted_at timestamp with time zone,
  total_questions integer NOT NULL DEFAULT 0,
  correct_count integer,
  score_percent numeric,
  fail_number integer,
  next_attempt_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT assessment_attempts_pkey PRIMARY KEY (attempt_id),
  CONSTRAINT assessment_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT assessment_attempts_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.skill_assessments(assessment_id),
  CONSTRAINT assessment_attempts_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(skill_id)
);
CREATE TABLE public.assessment_attempt_answers (
  attempt_id uuid NOT NULL,
  question_id uuid NOT NULL,
  position integer NOT NULL,
  selected_choice_id uuid,
  is_correct boolean,
  CONSTRAINT assessment_attempt_answers_pkey PRIMARY KEY (attempt_id, question_id),
  CONSTRAINT assessment_attempt_answers_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.assessment_attempts(attempt_id),
  CONSTRAINT assessment_attempt_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.assessment_questions(question_id),
  CONSTRAINT assessment_attempt_answers_selected_choice_id_fkey FOREIGN KEY (selected_choice_id) REFERENCES public.assessment_choices(choice_id)
);
CREATE TABLE public.user_assessment_status (
  user_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  fail_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamp with time zone,
  last_attempt_at timestamp with time zone,
  passed_at timestamp with time zone,
  CONSTRAINT user_assessment_status_pkey PRIMARY KEY (user_id, assessment_id),
  CONSTRAINT user_assessment_status_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_assessment_status_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.skill_assessments(assessment_id)
);
CREATE TABLE public.job_assignments (
  assignment_id uuid NOT NULL DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL UNIQUE,
  job_post_id uuid NOT NULL UNIQUE,
  client_id uuid NOT NULL,
  worker_id uuid NOT NULL,
  job_title text NOT NULL,
  job_trades ARRAY,
  service_type text NOT NULL,
  job_address text,
  agreed_price numeric NOT NULL CHECK (agreed_price > 0::numeric),
  price_type text NOT NULL CHECK (price_type = ANY (ARRAY['per_day'::text, 'per_week'::text, 'per_month'::text, 'per_milestone'::text, 'per_project'::text, 'per_task'::text])),
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  preferred_start_time text,
  check_in_at timestamp with time zone,
  client_check_in_confirmed_at timestamp with time zone,
  payment_requested_at timestamp with time zone,
  payment_request_message text,
  payment_request_images_url ARRAY,
  check_in_latitude double precision,
  check_in_longitude double precision,
  payment_sent_at timestamp with time zone,
  payment_confirmed_at timestamp with time zone,
  payment_method ARRAY NOT NULL DEFAULT '{}'::text[],
  payment_method_used text,
  CONSTRAINT job_assignments_pkey PRIMARY KEY (assignment_id),
  CONSTRAINT job_assignments_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.job_proposals(proposal_id),
  CONSTRAINT job_assignments_job_post_id_fkey FOREIGN KEY (job_post_id) REFERENCES public.job_posts(job_post_id),
  CONSTRAINT job_assignments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users_table(id),
  CONSTRAINT job_assignments_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.users_table(id)
);
CREATE TABLE public.gawa_points_wallets (
  user_id uuid NOT NULL,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT gawa_points_wallets_pkey PRIMARY KEY (user_id),
  CONSTRAINT gawa_points_wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_table(id)
);
CREATE TABLE public.gawa_points_transactions (
  transaction_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  proposal_id uuid,
  transaction_type text NOT NULL CHECK (transaction_type = ANY (ARRAY['credit'::text, 'proposal_charge'::text])),
  amount integer NOT NULL CHECK (amount <> 0),
  description text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT gawa_points_transactions_pkey PRIMARY KEY (transaction_id),
  CONSTRAINT gawa_points_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_table(id),
  CONSTRAINT gawa_points_transactions_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.job_proposals(proposal_id)
);
CREATE TABLE public.gawa_points_packs (
  pack_id text NOT NULL,
  display_name text NOT NULL,
  points integer NOT NULL CHECK (points > 0),
  price_php numeric NOT NULL CHECK (price_php > 0::numeric),
  cost_per_point numeric DEFAULT round((price_php / (points)::numeric), 2),
  sort_order smallint NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT gawa_points_packs_pkey PRIMARY KEY (pack_id)
);
CREATE TABLE public.equipment_security_deposit_escrow (
  escrow_id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  renter_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  payment_method text NOT NULL CHECK (payment_method = ANY (ARRAY['gcash'::text, 'wallet'::text, 'bank_transfer'::text])),
  status text NOT NULL DEFAULT 'held'::text CHECK (status = ANY (ARRAY['held'::text, 'released'::text, 'refunded'::text])),
  held_at timestamp with time zone NOT NULL DEFAULT now(),
  released_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT equipment_security_deposit_escrow_pkey PRIMARY KEY (escrow_id),
  CONSTRAINT equipment_security_deposit_escrow_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.equipment_requests(request_id),
  CONSTRAINT equipment_security_deposit_escrow_renter_id_fkey FOREIGN KEY (renter_id) REFERENCES auth.users(id),
  CONSTRAINT equipment_security_deposit_escrow_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id)
);