-- Migration: extend activity_log CHECK constraints to support admin activity types
-- Run against the live Supabase project via the SQL Editor (service role bypasses RLS).
--
-- The existing CHECK constraints only allow consumer-facing values.
-- Admin actions need their own activity_type values and a 'user' category.
--
-- NOTE: There is no migration runner in this repo. Apply manually via the
-- Supabase SQL editor.

BEGIN;

-- Drop and recreate the activity_type CHECK constraint with admin types added.
ALTER TABLE public.activity_log
  DROP CONSTRAINT IF EXISTS activity_log_activity_type_check;

ALTER TABLE public.activity_log
  ADD CONSTRAINT activity_log_activity_type_check
  CHECK (
    activity_type = ANY (
      ARRAY[
        'deposit_refunded'::text,
        'equipment_returned'::text,
        'equipment_paid'::text,
        'deposit_paid'::text,
        'job_posted'::text,
        'talent_hired'::text,
        'job_payment_paid'::text,
        'points_topped_up'::text,
        'proposal_sent'::text,
        'proposal_received'::text,
        'job_cancelled'::text,
        'equipment_listed'::text,
        'rental_requested'::text,
        'rental_request_received'::text,
        'rental_request_approved'::text,
        'rental_request_rejected'::text,
        'rental_request_cancelled'::text,
        -- Admin activity types
        'user_suspended'::text,
        'user_reinstated'::text,
        'user_archived'::text,
        'user_unarchived'::text,
        'user_deleted'::text,
        'user_flagged'::text,
        'password_reset'::text,
        'user_invited'::text,
        'points_deducted'::text,
        'content_flagged'::text
      ]
    )
  );

-- Drop and recreate the category CHECK constraint with 'user' added.
ALTER TABLE public.activity_log
  DROP CONSTRAINT IF EXISTS activity_log_category_check;

ALTER TABLE public.activity_log
  ADD CONSTRAINT activity_log_category_check
  CHECK (
    category = ANY (
      ARRAY[
        'equipment'::text,
        'job'::text,
        'wallet'::text,
        'user'::text
      ]
    )
  );

COMMIT;
