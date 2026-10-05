DROP FUNCTION IF EXISTS public.import_assessment_questions(uuid, jsonb);
DROP FUNCTION IF EXISTS public.import_assessment_questions(uuid, uuid, text, jsonb);

CREATE FUNCTION public.import_assessment_questions(
  p_assessment_id uuid,
  p_skill_id uuid,
  p_assessment_title text,
  p_questions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_question jsonb;
  v_choice jsonb;
  v_question_id uuid;
  v_choice_id uuid;
  v_correct_choice_id uuid;
  v_choice_index integer;
  v_inserted_count integer := 0;
  v_duplicates jsonb := '[]'::jsonb;
  v_row integer;
  v_assessment_id uuid := p_assessment_id;
  v_assessment_created boolean := false;
BEGIN
  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' OR jsonb_array_length(p_questions) = 0
     OR jsonb_array_length(p_questions) > 500 THEN
    RAISE EXCEPTION 'Questions must be a non-empty array of at most 500 rows';
  END IF;

  IF v_assessment_id IS NULL THEN
    IF p_skill_id IS NULL OR p_assessment_title IS NULL OR btrim(p_assessment_title) = '' THEN
      RAISE EXCEPTION 'A skill and assessment title are required when creating an assessment';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_skill_id::text, 0));

    SELECT assessment_id
    INTO v_assessment_id
    FROM public.skill_assessments
    WHERE skill_id = p_skill_id AND title = p_assessment_title
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_assessment_id IS NULL THEN
      INSERT INTO public.skill_assessments (
        skill_id, title, description, passing_percent, questions_per_category, time_limit_minutes, is_active
      ) VALUES (
        p_skill_id, p_assessment_title, 'Questions imported from a spreadsheet.', 75, 5, 40, true
      )
      RETURNING assessment_id INTO v_assessment_id;
      v_assessment_created := true;
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.skill_assessments
    WHERE assessment_id = v_assessment_id
      AND (p_skill_id IS NULL OR skill_id = p_skill_id)
  ) THEN
    RAISE EXCEPTION 'Assessment does not exist or does not belong to the selected skill';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_assessment_id::text, 0));

  FOR v_question IN SELECT value FROM jsonb_array_elements(p_questions)
  LOOP
    v_row := (v_question->>'rowNumber')::integer;
    IF EXISTS (
      SELECT 1
      FROM public.assessment_questions
      WHERE assessment_id = v_assessment_id
        AND lower(btrim(question_text)) = lower(btrim(v_question->>'questionText'))
    ) THEN
      v_duplicates := v_duplicates || jsonb_build_array(jsonb_build_object(
        'rowNumber', v_row,
        'questionText', v_question->>'questionText'
      ));
      CONTINUE;
    END IF;

    INSERT INTO public.assessment_questions (
      assessment_id, part_no, category, question_text, explanation, is_active
    ) VALUES (
      v_assessment_id,
      (v_question->>'partNo')::smallint,
      v_question->>'category',
      btrim(v_question->>'questionText'),
      NULLIF(btrim(v_question->>'explanation'), ''),
      true
    )
    RETURNING question_id INTO v_question_id;

    v_choice_index := 0;
    v_correct_choice_id := NULL;
    FOR v_choice IN SELECT value FROM jsonb_array_elements(v_question->'choices')
    LOOP
      INSERT INTO public.assessment_choices (question_id, choice_text, sort_order)
      VALUES (v_question_id, btrim(v_choice->>'choiceText'), (v_choice->>'sortOrder')::integer)
      RETURNING choice_id INTO v_choice_id;

      IF v_choice_index = (v_question->>'correctChoiceIndex')::integer THEN
        v_correct_choice_id := v_choice_id;
      END IF;
      v_choice_index := v_choice_index + 1;
    END LOOP;

    IF v_correct_choice_id IS NULL THEN
      RAISE EXCEPTION 'Correct answer was not found for imported row %', v_row;
    END IF;

    INSERT INTO public.assessment_answer_keys (question_id, correct_choice_id)
    VALUES (v_question_id, v_correct_choice_id);
    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'assessmentId', v_assessment_id,
    'assessmentCreated', v_assessment_created,
    'assessmentTitle', p_assessment_title,
    'insertedCount', v_inserted_count,
    'duplicateCount', jsonb_array_length(v_duplicates),
    'duplicates', v_duplicates
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_assessment_questions(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_assessment_questions(uuid, uuid, text, jsonb) TO service_role;
