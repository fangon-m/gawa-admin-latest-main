-- Migration: allow moderation warning events in the existing admin activity log.
-- Apply after 004_activity_log_admin_types.sql via the Supabase SQL Editor.

BEGIN;

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
        'user_suspended'::text,
        'user_reinstated'::text,
        'user_archived'::text,
        'user_unarchived'::text,
        'user_deleted'::text,
        'user_flagged'::text,
        'user_warned'::text,
        'password_reset'::text,
        'user_invited'::text,
        'points_deducted'::text,
        'content_flagged'::text
      ]
    )
  );

COMMIT;
