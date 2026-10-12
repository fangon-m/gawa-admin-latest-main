CREATE OR REPLACE FUNCTION public.execute_issue_report_action(
  p_report_id uuid,
  p_action_id text,
  p_actor_id uuid,
  p_actor_role text,
  p_reason text,
  p_duration_days integer,
  p_target_version timestamptz,
  p_idempotency_key uuid,
  p_request_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_report public.issue_reports%ROWTYPE;
  v_existing public.issue_report_action_events%ROWTYPE;
  v_event public.issue_report_action_events%ROWTYPE;
  v_target_updated_at timestamptz;
  v_target_state text;
  v_suspension_status text;
  v_suspended_until timestamptz;
  v_suspension_reason text;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_result jsonb;
  v_now timestamptz := now();
BEGIN
  IF p_actor_id IS NULL OR p_actor_role IS NULL
     OR p_actor_role NOT IN ('admin', 'customer_support') THEN
    RAISE EXCEPTION 'ACTION_FORBIDDEN';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 OR length(p_reason) > 1000 THEN
    RAISE EXCEPTION 'INVALID_ACTION_INPUT';
  END IF;
  IF p_idempotency_key IS NULL OR p_request_hash IS NULL
     OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_ACTION_INPUT';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text || ':' || p_idempotency_key::text, 0));
  SELECT * INTO v_existing
  FROM public.issue_report_action_events
  WHERE actor_id = p_actor_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.request_hash <> p_request_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('result', v_existing.result, 'replayed', true);
  END IF;

  SELECT * INTO v_report
  FROM public.issue_reports
  WHERE report_id = p_report_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REPORT_NOT_FOUND';
  END IF;
  IF v_report.status NOT IN ('open', 'under_review') THEN
    RAISE EXCEPTION 'REPORT_ALREADY_HANDLED';
  END IF;

  IF p_action_id = 'mark_irrelevant' THEN
    IF v_report.target_type = 'profile' THEN
      SELECT updated_at, is_archived::text INTO v_target_updated_at, v_target_state
      FROM public.users_table WHERE id = v_report.target_id FOR UPDATE;
    ELSIF v_report.target_type = 'job_post' THEN
      SELECT updated_at, job_status INTO v_target_updated_at, v_target_state
      FROM public.job_posts WHERE job_post_id = v_report.target_id FOR UPDATE;
    ELSIF v_report.target_type = 'job_proposal' THEN
      SELECT updated_at, status INTO v_target_updated_at, v_target_state
      FROM public.job_proposals WHERE proposal_id = v_report.target_id FOR UPDATE;
    ELSIF v_report.target_type = 'job_match' THEN
      SELECT updated_at, status INTO v_target_updated_at, v_target_state
      FROM public.job_matches WHERE job_match_id = v_report.target_id FOR UPDATE;
    ELSIF v_report.target_type = 'equipment_listing' THEN
      SELECT updated_at, status INTO v_target_updated_at, v_target_state
      FROM public.equipment_listings WHERE listing_id = v_report.target_id FOR UPDATE;
    ELSIF v_report.target_type = 'equipment_rental' THEN
      SELECT updated_at, rental_status INTO v_target_updated_at, v_target_state
      FROM public.equipment_rentals WHERE rental_id = v_report.target_id FOR UPDATE;
    ELSIF v_report.target_type = 'equipment_request' THEN
      SELECT updated_at, request_status INTO v_target_updated_at, v_target_state
      FROM public.equipment_requests WHERE request_id = v_report.target_id FOR UPDATE;
    END IF;
    IF p_target_version IS NOT NULL AND v_target_updated_at IS NOT NULL
       AND v_target_updated_at <> p_target_version THEN
      RAISE EXCEPTION 'TARGET_CHANGED';
    END IF;
    v_before := jsonb_build_object('reportStatus', v_report.status, 'targetState', v_target_state);
    UPDATE public.issue_reports SET status = 'dismissed' WHERE report_id = p_report_id;
    v_after := jsonb_build_object('reportStatus', 'dismissed', 'targetState', v_target_state);
    v_report.status := 'dismissed';

  ELSIF p_action_id = 'relist' THEN
    IF p_actor_role <> 'admin' THEN RAISE EXCEPTION 'ACTION_FORBIDDEN'; END IF;
    IF v_report.target_type <> 'job_post' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED_FOR_TARGET'; END IF;
    SELECT updated_at, job_status INTO v_target_updated_at, v_target_state
    FROM public.job_posts WHERE job_post_id = v_report.target_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_DELETED'; END IF;
    IF p_target_version IS NULL OR v_target_updated_at <> p_target_version THEN
      RAISE EXCEPTION 'TARGET_CHANGED';
    END IF;
    IF v_target_state <> 'closed' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED_FOR_TARGET'; END IF;
    UPDATE public.job_posts
    SET job_status = 'open', updated_at = v_now
    WHERE job_post_id = v_report.target_id;
    v_before := jsonb_build_object('jobStatus', v_target_state, 'updatedAt', v_target_updated_at);
    v_after := jsonb_build_object('jobStatus', 'open', 'updatedAt', v_now);

  ELSIF p_action_id = 'flag_job_match' THEN
    IF v_report.target_type <> 'job_match' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED_FOR_TARGET'; END IF;
    SELECT updated_at, status INTO v_target_updated_at, v_target_state
    FROM public.job_matches WHERE job_match_id = v_report.target_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_DELETED'; END IF;
    IF p_target_version IS NULL OR v_target_updated_at <> p_target_version THEN
      RAISE EXCEPTION 'TARGET_CHANGED';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.entity_flags
      WHERE entity_type = 'job_match' AND entity_id = v_report.target_id
    ) THEN
      RAISE EXCEPTION 'ALREADY_FLAGGED';
    END IF;
    INSERT INTO public.entity_flags (entity_type, entity_id, flagged_by, reason)
    VALUES ('job_match', v_report.target_id, p_actor_id, btrim(p_reason));
    v_before := jsonb_build_object('jobMatchStatus', v_target_state);
    v_after := jsonb_build_object('flagged', true, 'jobMatchStatus', v_target_state);

  ELSIF p_action_id = 'warn' THEN
    IF v_report.target_type <> 'profile' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED_FOR_TARGET'; END IF;
    SELECT updated_at, is_archived::text INTO v_target_updated_at, v_target_state
    FROM public.users_table WHERE id = v_report.target_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_DELETED'; END IF;
    IF p_target_version IS NULL OR v_target_updated_at <> p_target_version THEN
      RAISE EXCEPTION 'TARGET_CHANGED';
    END IF;
    IF v_target_state = 'true' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED_FOR_TARGET'; END IF;
    v_before := jsonb_build_object('isArchived', false);
    v_after := jsonb_build_object('warningRecorded', true);

  ELSIF p_action_id = 'suspend' THEN
    IF p_actor_role <> 'admin' THEN RAISE EXCEPTION 'ACTION_FORBIDDEN'; END IF;
    IF v_report.target_type <> 'profile' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED_FOR_TARGET'; END IF;
    IF p_duration_days IS NULL OR p_duration_days < 1 OR p_duration_days > 90 THEN
      RAISE EXCEPTION 'INVALID_ACTION_INPUT';
    END IF;
    SELECT updated_at, is_archived::text, suspension_status, suspended_until, suspension_reason
      INTO v_target_updated_at, v_target_state, v_suspension_status, v_suspended_until, v_suspension_reason
    FROM public.users_table
    WHERE id = v_report.target_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_DELETED'; END IF;
    IF p_target_version IS NULL OR v_target_updated_at <> p_target_version THEN
      RAISE EXCEPTION 'TARGET_CHANGED';
    END IF;
    IF v_target_state = 'true'
       OR (v_suspension_status = 'active' AND (v_suspended_until IS NULL OR v_suspended_until > v_now)) THEN
      RAISE EXCEPTION 'ACTION_NOT_ALLOWED_FOR_TARGET';
    END IF;

    UPDATE public.users_table
    SET suspension_status = 'active',
        suspended_until = v_now + make_interval(days => p_duration_days),
        suspension_reason = btrim(p_reason),
        suspension_updated_at = v_now,
        escalated_to_deletion = false,
        updated_at = v_now
    WHERE id = v_report.target_id;
    UPDATE public.issue_reports
    SET status = 'resolved'
    WHERE report_id = p_report_id;
    v_report.status := 'resolved';
    v_before := jsonb_build_object(
      'reportStatus', 'open',
      'suspensionStatus', coalesce(v_suspension_status, 'none'),
      'suspendedUntil', v_suspended_until,
      'suspensionReason', v_suspension_reason
    );
    v_after := jsonb_build_object(
      'reportStatus', 'resolved',
      'suspensionStatus', 'active',
      'suspendedUntil', v_now + make_interval(days => p_duration_days),
      'suspensionReason', btrim(p_reason)
    );

  ELSE
    RAISE EXCEPTION 'ACTION_NOT_ALLOWED_FOR_TARGET';
  END IF;

  v_result := jsonb_build_object(
    'reportId', p_report_id,
    'target', jsonb_build_object('type', v_report.target_type, 'id', v_report.target_id),
    'action', p_action_id,
    'result', v_after,
    'reportStatus', v_report.status,
    'executedAt', v_now
  );

  INSERT INTO public.issue_report_action_events (
    report_id, target_type, target_id, actor_id, actor_role, action_id,
    reason, idempotency_key, request_hash, before_state, after_state, result
  ) VALUES (
    p_report_id, v_report.target_type, v_report.target_id, p_actor_id, p_actor_role,
    p_action_id, btrim(p_reason), p_idempotency_key, p_request_hash,
    v_before, v_after, v_result
  ) RETURNING * INTO v_event;

  RETURN jsonb_build_object('result', v_event.result, 'replayed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.execute_issue_report_action(
  uuid, text, uuid, text, text, integer, timestamptz, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_issue_report_action(
  uuid, text, uuid, text, text, integer, timestamptz, uuid, text
) TO service_role;

NOTIFY pgrst, 'reload schema';
