-- 20261112_assessment_stats_function.sql
--
-- Creates the function the admin portal's assessment statistics depend on.
--
-- WHY THIS FILE EXISTS
--   GET /api/assessment-attempts/stats/skills calls the database function
--   `get_skill_assessment_attempt_stats`. The function was never created, so
--   the endpoint answered 500 and the skill cards on the Jobs page showed no
--   submission or pass-rate figures.
--
--   The shape below is the one the admin client expects:
--     skill_id                -> skillId
--     attempt_count           -> attemptCount
--     passed_count            -> passedCount
--     average_score_percent   -> averageScorePercent
--
--   Only submitted attempts count: an attempt that was started but never
--   submitted has no score and must not drag the average down.
--
-- HOW TO APPLY
--   Paste into the Supabase SQL Editor and run it once. It is idempotent.
--
-- VERIFY
--   select * from public.get_skill_assessment_attempt_stats();

create or replace function public.get_skill_assessment_attempt_stats()
returns table (
  skill_id               uuid,
  attempt_count          bigint,
  passed_count           bigint,
  average_score_percent  numeric
)
language sql
stable
set search_path = public
as $$
  select
    a.skill_id,
    count(*)::bigint                                              as attempt_count,
    count(*) filter (where a.status = 'passed')::bigint           as passed_count,
    coalesce(round(avg(a.score_percent)::numeric, 2), 0)          as average_score_percent
  from public.assessment_attempts a
  where a.submitted_at is not null
    and a.skill_id is not null
  group by a.skill_id
  order by a.skill_id;
$$;

comment on function public.get_skill_assessment_attempt_stats()
  is 'Submitted assessment attempts per skill: attempt count, passed count and average score percentage.';
