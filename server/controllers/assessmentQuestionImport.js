const path = require('path');
const XLSX = require('@e965/xlsx');
const supabase = require('../db/supabase');
const { createAuditLog } = require('../middleware/auditLogger');

const MAX_ROWS = 500;
const MAX_CHOICES = 10;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeCell(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAssessmentRows(rows) {
  if (!rows.length) {
    return { questions: [], errors: [{ row: 1, field: 'file', message: 'The worksheet is empty.' }] };
  }

  const headers = rows[0].map((header) => sanitizeCell(header).toLowerCase());
  const headerIndex = new Map();
  const errors = [];
  headers.forEach((header, index) => {
    if (header && headerIndex.has(header)) {
      errors.push({ row: 1, field: header, message: 'Column names must be unique.' });
    } else if (header) {
      headerIndex.set(header, index);
    }
  });

  ['question', 'option 1', 'option 2', 'correct answer'].forEach((required) => {
    if (!headerIndex.has(required)) {
      errors.push({ row: 1, field: required, message: `Required column "${required}" is missing.` });
    }
  });
  if (errors.length) return { questions: [], errors };

  const dataRows = rows.slice(1).filter((row) => row.some((cell) => sanitizeCell(cell)));
  if (dataRows.length > MAX_ROWS) {
    return {
      questions: [],
      errors: [{ row: 1, field: 'file', message: `A maximum of ${MAX_ROWS} questions can be imported at once.` }],
    };
  }

  const questions = [];
  dataRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const value = (column) => sanitizeCell(row[headerIndex.get(column)] ?? '');
    const questionText = value('question');
    const choiceValues = Array.from({ length: MAX_CHOICES }, (_, i) => value(`option ${i + 1}`)).filter(Boolean);
    const correctAnswer = value('correct answer');
    const rowErrors = [];

    if (!questionText) rowErrors.push({ row: rowNumber, field: 'question', message: 'Question is required.' });
    if (questionText.length > 2000) rowErrors.push({ row: rowNumber, field: 'question', message: 'Question must be 2,000 characters or fewer.' });
    if (choiceValues.length < 2) rowErrors.push({ row: rowNumber, field: 'options', message: 'At least two answer options are required.' });
    if (choiceValues.some((choice) => choice.length > 1000)) {
      rowErrors.push({ row: rowNumber, field: 'options', message: 'Each answer option must be 1,000 characters or fewer.' });
    }
    if (new Set(choiceValues.map((choice) => choice.toLowerCase())).size !== choiceValues.length) {
      rowErrors.push({ row: rowNumber, field: 'options', message: 'Answer options must be unique.' });
    }
    const correctChoiceIndex = choiceValues.findIndex((choice) => choice.toLowerCase() === correctAnswer.toLowerCase());
    if (!correctAnswer || correctChoiceIndex < 0) {
      rowErrors.push({ row: rowNumber, field: 'correct answer', message: 'Correct Answer must match one of the answer options.' });
    }

    const partNoValue = value('part no');
    const partNo = partNoValue ? Number(partNoValue) : 1;
    if (!Number.isInteger(partNo) || partNo < 1 || partNo > 32767) {
      rowErrors.push({ row: rowNumber, field: 'part no', message: 'Part No must be an integer between 1 and 32,767.' });
    }
    const category = value('category') || 'general';
    const explanation = value('explanation');
    if (category.length > 100) rowErrors.push({ row: rowNumber, field: 'category', message: 'Category must be 100 characters or fewer.' });
    if (explanation.length > 5000) rowErrors.push({ row: rowNumber, field: 'explanation', message: 'Explanation must be 5,000 characters or fewer.' });

    errors.push(...rowErrors);
    if (!rowErrors.length) {
      questions.push({
        rowNumber,
        questionText,
        partNo,
        category,
        explanation,
        choices: choiceValues.map((choiceText, sortOrder) => ({ choiceText, sortOrder })),
        correctChoiceIndex,
      });
    }
  });

  if (!dataRows.length) errors.push({ row: 1, field: 'file', message: 'The worksheet contains no question rows.' });
  return { questions, errors };
}

async function logImportFailure(req, assessmentId, description) {
  await createAuditLog({
    agentId: req.user?.id,
    agentName: req.user?.name,
    action: 'ASSESSMENT_QUESTION_IMPORT_FAILED',
    module: 'assessment-questions',
    targetId: assessmentId || null,
    targetType: 'skill_assessment',
    description,
    ipAddress: req.ip,
    userAgent: req.headers?.['user-agent'],
  });
}

async function importAssessmentQuestions(req, res) {
  const assessmentId = typeof req.body?.assessmentId === 'string' ? req.body.assessmentId : '';
  const skillId = typeof req.body?.skillId === 'string' ? req.body.skillId : '';
  if (assessmentId && !UUID_PATTERN.test(assessmentId)) {
    await logImportFailure(req, assessmentId, 'Import rejected: invalid assessment ID.');
    return res.status(400).json({ error: 'The assessment ID is invalid.' });
  }
  if (!assessmentId && !UUID_PATTERN.test(skillId)) {
    await logImportFailure(req, null, 'Import rejected: assessment and skill IDs are missing or invalid.');
    return res.status(400).json({ error: 'A valid skill ID is required when creating an assessment from an import.' });
  }
  if (!req.file) {
    await logImportFailure(req, assessmentId, 'Import rejected: no workbook uploaded.');
    return res.status(400).json({ error: 'Choose an Excel or CSV file to import.' });
  }
  if (!/\.(xlsx|xls|csv)$/i.test(path.extname(req.file.originalname || ''))) {
    await logImportFailure(req, assessmentId, 'Import rejected: unsupported file extension.');
    return res.status(400).json({ error: 'Only .xlsx, .xls, and .csv files are supported.' });
  }

  let rows;
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) throw new Error('The workbook has no worksheets.');
    if (firstSheet['!ref']) {
      const range = XLSX.utils.decode_range(firstSheet['!ref']);
      if (range.e.r + 1 > MAX_ROWS + 1) {
        throw Object.assign(new Error('A maximum of 500 questions can be imported at once.'), { validationMessage: 'A maximum of 500 questions can be imported at once.' });
      }
      if (range.e.c + 1 > 20) {
        throw Object.assign(new Error('The worksheet has too many columns.'), { validationMessage: 'The worksheet has too many columns.' });
      }
    }
    rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', raw: false, blankrows: false });
  } catch (error) {
    await logImportFailure(req, assessmentId, `Import rejected: workbook parsing failed (${error.message}).`);
    return res.status(400).json({ error: error.validationMessage || 'The uploaded workbook could not be read.' });
  }

  const parsed = parseAssessmentRows(rows);
  if (parsed.errors.length) {
    await logImportFailure(req, assessmentId, `Import rejected: ${parsed.errors.length} validation error(s).`);
    return res.status(400).json({ error: 'The workbook contains invalid rows.', details: parsed.errors });
  }

  let assessmentTitle = null;
  if (assessmentId) {
    const { data: assessment, error: assessmentError } = await supabase
      .from('skill_assessments')
      .select('assessment_id, skill_id')
      .eq('assessment_id', assessmentId)
      .maybeSingle();
    if (assessmentError) {
      console.error('[Assessment import] Assessment lookup failed:', assessmentError.message);
      await logImportFailure(req, assessmentId, 'Import failed: assessment lookup failed.');
      return res.status(500).json({ error: 'Unable to verify the target assessment.' });
    }
    if (!assessment) {
      await logImportFailure(req, assessmentId, 'Import rejected: target assessment does not exist.');
      return res.status(404).json({ error: 'The target assessment was not found.' });
    }
    if (skillId && assessment.skill_id !== skillId) {
      await logImportFailure(req, assessmentId, 'Import rejected: assessment does not belong to the selected skill.');
      return res.status(400).json({ error: 'The assessment does not belong to the selected skill.' });
    }
  } else {
    const { data: skill, error: skillError } = await supabase
      .from('skills')
      .select('skill_name')
      .eq('skill_id', skillId)
      .maybeSingle();
    if (skillError) {
      console.error('[Assessment import] Skill lookup failed:', skillError.message);
      await logImportFailure(req, null, 'Import failed: skill lookup failed.');
      return res.status(500).json({ error: 'Unable to verify the target skill.' });
    }
    if (!skill) {
      await logImportFailure(req, null, 'Import rejected: target skill does not exist.');
      return res.status(404).json({ error: 'The target skill was not found.' });
    }
    assessmentTitle = `${skill.skill_name} Assessment`.slice(0, 200);
  }

  const { data, error } = await supabase.rpc('import_assessment_questions', {
    p_assessment_id: assessmentId || null,
    p_skill_id: skillId || null,
    p_assessment_title: assessmentTitle,
    p_questions: parsed.questions,
  });
  if (error) {
    console.error('[Assessment import] Transaction failed:', error.message);
    await logImportFailure(req, assessmentId || null, 'Import failed: transactional database insert rolled back.');
    if (error.code === 'PGRST202' || error.code === '42883') {
      return res.status(500).json({
        error: 'The assessment import database migration is missing or outdated. Apply server/db/migrations/20261005_import_assessment_questions.sql, then retry.',
      });
    }
    if (error.code === '42501') {
      return res.status(500).json({
        error: 'The server database role cannot execute the assessment import function. Reapply the assessment import migration grants.',
      });
    }
    const detail = String(error.message || 'Database error').replace(/[\r\n]+/g, ' ').slice(0, 300);
    return res.status(500).json({ error: `Import failed; no questions were committed. ${detail}` });
  }

  res.status(201).json({
    data,
    message: 'Question import completed.',
  });
}

module.exports = { importAssessmentQuestions, parseAssessmentRows };
