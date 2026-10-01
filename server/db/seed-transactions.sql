-- seed-transactions.sql
-- Idempotent DDL + backfill for transactions table
-- Run once in Supabase Dashboard SQL Editor

-- 1. Create transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    type text NOT NULL CHECK (type IN ('job_payment', 'rental_payment', 'deposit', 'refund', 'payout', 'gawa_purchase')),
    amount numeric(12, 2) NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'completed', 'escrow', 'held', 'cancelled', 'refunded')),
    payment_method text CHECK (payment_method IN ('gcash', 'bank_transfer', 'card', 'wallet', 'cash')),
    reference text,
    fee numeric(12, 2) DEFAULT 0,
    description text,
    net_amount numeric(12, 2),
    created_at timestamptz NOT NULL DEFAULT now(),
    related_id uuid,
    related_type text CHECK (related_type IN ('job_post', 'equipment_rental', 'gawa_pack')),
    direction text NOT NULL CHECK (direction IN ('in', 'out'))
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_created_at_desc ON public.transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions (status);
CREATE INDEX IF NOT EXISTS idx_transactions_related ON public.transactions (related_type, related_id);

-- 3. Backfill job_payment from job_matches
INSERT INTO public.transactions (id, user_id, type, amount, status, payment_method, reference, fee, description, net_amount, created_at, related_id, related_type, direction)
SELECT
    md5('gawa:txn:job_payment:' || jm.job_match_id)::uuid,
    jm.client_id,
    'job_payment',
    jm.agreed_price,
    CASE
        WHEN jm.status = 'completed' AND jm.confirmed_at IS NOT NULL THEN 'completed'
        WHEN jm.status = 'completed' THEN 'escrow'
        ELSE 'pending'
    END,
    'cash',
    'JOB-' || substr(md5('JOB:' || jm.job_match_id), 1, 8),
    0,
    'Job payment for ' || jp.job_title,
    jm.agreed_price,
    COALESCE(jm.matched_at, jm.created_at),
    jm.job_post_id,
    'job_post',
    'in'
FROM public.job_matches jm
JOIN public.job_posts jp ON jp.job_post_id = jm.job_post_id
WHERE jm.status IN ('matched', 'in_progress', 'completed', 'verified')
  AND jm.agreed_price IS NOT NULL
  AND jm.client_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 4. Backfill rental_payment from equipment_rentals
INSERT INTO public.transactions (id, user_id, type, amount, status, payment_method, reference, fee, description, net_amount, created_at, related_id, related_type, direction)
SELECT
    md5('gawa:txn:rental_payment:' || er.rental_id)::uuid,
    er.renter_id,
    'rental_payment',
    er.total_price,
    CASE
        WHEN er.rental_status = 'completed' THEN 'completed'
        WHEN er.rental_status = 'active' THEN 'held'
        WHEN er.rental_status = 'cancelled' THEN 'cancelled'
        ELSE 'pending'
    END,
    'cash',
    'RENT-' || substr(md5('RENT:' || er.rental_id), 1, 8),
    0,
    'Rental payment for ' || el.equipment_name,
    er.total_price,
    er.created_at,
    er.rental_id,
    'equipment_rental',
    'in'
FROM public.equipment_rentals er
JOIN public.equipment_listings el ON el.listing_id = er.listing_id
WHERE er.total_price IS NOT NULL
  AND er.renter_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 5. Backfill deposit from equipment_rentals (security_deposit_paid > 0)
INSERT INTO public.transactions (id, user_id, type, amount, status, payment_method, reference, fee, description, net_amount, created_at, related_id, related_type, direction)
SELECT
    md5('gawa:txn:deposit:' || er.rental_id)::uuid,
    er.renter_id,
    'deposit',
    er.security_deposit_paid,
    CASE
        WHEN er.rental_status = 'active' THEN 'held'
        ELSE 'completed'
    END,
    'cash',
    'DEP-' || substr(md5('DEP:' || er.rental_id), 1, 8),
    0,
    'Security deposit for ' || el.equipment_name,
    er.security_deposit_paid,
    er.created_at,
    er.rental_id,
    'equipment_rental',
    'in'
FROM public.equipment_rentals er
JOIN public.equipment_listings el ON el.listing_id = er.listing_id
WHERE er.security_deposit_paid IS NOT NULL
  AND er.security_deposit_paid > 0
  AND er.renter_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 6. Backfill payout from completed job_matches (talent payout)
INSERT INTO public.transactions (id, user_id, type, amount, status, payment_method, reference, fee, description, net_amount, created_at, related_id, related_type, direction)
SELECT
    md5('gawa:txn:payout:job:' || jm.job_match_id)::uuid,
    jm.user_id,
    'payout',
    jm.agreed_price,
    CASE
        WHEN jm.status = 'completed' THEN 'completed'
        ELSE 'pending'
    END,
    'cash',
    'PAY-JOB-' || substr(md5('PAY:JOB:' || jm.job_match_id), 1, 8),
    0,
    'Payout for job ' || jp.job_title,
    jm.agreed_price,
    COALESCE(jm.completed_at, jm.updated_at, jm.created_at),
    jm.job_post_id,
    'job_post',
    'out'
FROM public.job_matches jm
JOIN public.job_posts jp ON jp.job_post_id = jm.job_post_id
WHERE jm.status = 'completed'
  AND jm.agreed_price IS NOT NULL
  AND jm.user_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 7. Backfill payout from completed equipment_rentals (owner payout)
INSERT INTO public.transactions (id, user_id, type, amount, status, payment_method, reference, fee, description, net_amount, created_at, related_id, related_type, direction)
SELECT
    md5('gawa:txn:payout:rental:' || er.rental_id)::uuid,
    el.owner_id,
    'payout',
    er.total_price,
    CASE
        WHEN er.rental_status = 'completed' THEN 'completed'
        ELSE 'pending'
    END,
    'cash',
    'PAY-RENT-' || substr(md5('PAY:RENT:' || er.rental_id), 1, 8),
    0,
    'Payout for rental ' || el.equipment_name,
    er.total_price,
    er.updated_at,
    er.rental_id,
    'equipment_rental',
    'out'
FROM public.equipment_rentals er
JOIN public.equipment_listings el ON el.listing_id = er.listing_id
WHERE er.rental_status = 'completed'
  AND er.total_price IS NOT NULL
  AND el.owner_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;