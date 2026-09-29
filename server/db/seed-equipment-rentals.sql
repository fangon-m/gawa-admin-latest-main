-- Seed equipment_rentals with demo data matching live DB constraint
-- Live rental_status CHECK: only 'active', 'completed', 'cancelled' allowed
-- Run in Supabase SQL Editor. Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING.
-- Requires: equipment_listings with rows, users with appropriate roles.

DO $$
DECLARE
  renter_uuids uuid[];
  owner_uuids uuid[];
  listing_recs RECORD;
  i int;
  start_dt timestamptz;
  end_dt timestamptz;
  created_dt timestamptz;
  days int;
  price numeric;
  deposit_amt numeric;
  statuses text[] := ARRAY['active','completed','cancelled'];
  status_idx int;
BEGIN
  -- Collect eligible renters (client or talent)
  SELECT array_agg(u.id) INTO renter_uuids
  FROM public.users_table u
  JOIN public.role_profiles rp ON rp.user_id = u.id
  WHERE rp.role_type IN ('client','talent');

  -- Collect eligible owners (equipment_owner)
  SELECT array_agg(u.id) INTO owner_uuids
  FROM public.users_table u
  JOIN public.role_profiles rp ON rp.user_id = u.id
  WHERE rp.role_type = 'equipment_owner';

  -- Fallback if no role_profiles: use any non-admin users
  IF renter_uuids IS NULL OR array_length(renter_uuids, 1) = 0 THEN
    SELECT array_agg(id) INTO renter_uuids
    FROM public.users_table
    WHERE role NOT IN ('admin','customer_support');
  END IF;

  IF owner_uuids IS NULL OR array_length(owner_uuids, 1) = 0 THEN
    SELECT array_agg(id) INTO owner_uuids
    FROM public.users_table
    WHERE role NOT IN ('admin','customer_support');
  END IF;

  IF renter_uuids IS NULL OR array_length(renter_uuids, 1) = 0
     OR owner_uuids IS NULL OR array_length(owner_uuids, 1) = 0 THEN
    RAISE NOTICE 'No eligible users found. Ensure users exist with appropriate roles.';
    RETURN;
  END IF;

  -- Loop through listings (prefer owner's own listing)
  FOR listing_recs IN
    SELECT el.listing_id, el.owner_id, el.day_pricing, el.week_pricing, el.security_deposit, el.equipment_name
    FROM public.equipment_listings el
    WHERE el.status = 'available'
    ORDER BY el.created_at DESC
  LOOP
    DECLARE
      renter_id uuid;
    BEGIN
      SELECT r INTO renter_id
      FROM unnest(renter_uuids) r
      WHERE r <> listing_recs.owner_id
      LIMIT 1;
      IF renter_id IS NULL THEN
        renter_id := renter_uuids[1];
      END IF;

      days := (CASE WHEN random() < 0.6 THEN (3 + floor(random() * 7))::int ELSE (7 + floor(random() * 21))::int END);
      price := CASE
        WHEN days <= 7 THEN listing_recs.day_pricing * days
        ELSE listing_recs.week_pricing * ceil(days / 7.0)
      END;
      deposit_amt := COALESCE(listing_recs.security_deposit, 500);

      created_dt := now() - (floor(random() * 28) || ' days')::interval;
      start_dt := created_dt + (floor(random() * 3) || ' days')::interval;
      end_dt := start_dt + (days || ' days')::interval;

      status_idx := (listing_recs.listing_id::text::int % 3) + 1;

      INSERT INTO public.equipment_rentals (
        rental_id,
        listing_id,
        renter_id,
        owner_id,
        start_date,
        end_date,
        total_price,
        security_deposit_paid,
        rental_status,
        created_at,
        updated_at
      ) VALUES (
        ('51000000-0000-0000-0000-' || lpad(substring(md5(listing_recs.listing_id::text) from 1 for 12), 12, '0'))::uuid,
        listing_recs.listing_id,
        renter_id,
        listing_recs.owner_id,
        start_dt,
        end_dt,
        price,
        deposit_amt,
        statuses[status_idx],
        created_dt,
        created_dt
      ) ON CONFLICT (rental_id) DO NOTHING;

      RAISE NOTICE 'Seeded rental for listing %: status=%, price=%, deposit=%',
        listing_recs.equipment_name, statuses[status_idx], price, deposit_amt;
    END;
  END LOOP;

  RAISE NOTICE 'Seeding complete. Total equipment_rentals rows: %', (SELECT count(*) FROM public.equipment_rentals);
END $$;