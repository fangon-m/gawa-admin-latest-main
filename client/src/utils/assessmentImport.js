import * as XLSX from '@e965/xlsx';

const MAX_ROWS = 500;
const MAX_CHOICES = 10;
const sanitizeCell = (value) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export function parseAssessmentRows(rows) {
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

  if (dataRows.length === 0) {
    errors.push({ row: 1, field: 'file', message: 'The worksheet contains no question rows.' });
  }
  return { questions, errors };
}

export async function readAssessmentImportFile(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) {
    return { questions: [], errors: [{ row: 1, field: 'file', message: 'The workbook has no worksheets.' }] };
  }
  if (firstSheet['!ref']) {
    const range = XLSX.utils.decode_range(firstSheet['!ref']);
    if (range.e.r + 1 > MAX_ROWS + 1) {
      return { questions: [], errors: [{ row: 1, field: 'file', message: `A maximum of ${MAX_ROWS} questions can be imported at once.` }] };
    }
    if (range.e.c + 1 > 20) {
      return { questions: [], errors: [{ row: 1, field: 'file', message: 'The worksheet has too many columns.' }] };
    }
  }
  return parseAssessmentRows(XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', raw: false, blankrows: false }));
}

export const ASSESSMENT_IMPORT_TEMPLATE =
  'Question,Option 1,Option 2,Option 3,Option 4,Correct Answer,Category,Part No,Explanation\r\n' +
  '"What is the safe first step?","Inspect the area","Start immediately","Ignore hazards",,"Inspect the area","Safety",1,"Check for hazards before beginning."';
