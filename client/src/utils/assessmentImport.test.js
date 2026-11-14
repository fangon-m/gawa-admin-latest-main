import { describe, expect, it } from 'vitest';
import * as XLSX from '@e965/xlsx';
import { parseAssessmentRows, readAssessmentImportFile } from './assessmentImport';

describe('assessment import parsing', () => {
  it('validates and sanitizes rows into the assessment question shape', () => {
    const result = parseAssessmentRows([
      ['Question', 'Option 1', 'Option 2', 'Correct Answer', 'Part No'],
      ['  What is safe?\n', 'Inspect', 'Rush', 'inspect', '2'],
    ]);
    expect(result.errors).toEqual([]);
    expect(result.questions[0]).toMatchObject({
      rowNumber: 2,
      questionText: 'What is safe?',
      partNo: 2,
      choices: [{ choiceText: 'Inspect' }, { choiceText: 'Rush' }],
      correctChoiceIndex: 0,
    });
  });

  it('rejects missing columns and malformed question rows', () => {
    expect(parseAssessmentRows([['Prompt', 'Option 1']]).errors).toHaveLength(3);
    const result = parseAssessmentRows([
      ['Question', 'Option 1', 'Option 2', 'Correct Answer'],
      ['Question?', 'Same', 'same', 'Missing'],
    ]);
    expect(result.questions).toEqual([]);
    expect(result.errors.map((error) => error.field)).toEqual(['options', 'correct answer']);
  });

  it('enforces the 500-question batch limit', () => {
    const rows = [['Question', 'Option 1', 'Option 2', 'Correct Answer']];
    for (let row = 0; row < 501; row += 1) rows.push([`Question ${row}`, 'Yes', 'No', 'Yes']);
    expect(parseAssessmentRows(rows).errors[0].message).toContain('500');
  });

  it('reads an xlsx workbook in the same format accepted by the upload UI', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Question', 'Option 1', 'Option 2', 'Correct Answer'],
      ['Question?', 'Yes', 'No', 'Yes'],
    ]), 'Questions');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const file = { arrayBuffer: async () => buffer };
    const result = await readAssessmentImportFile(file);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].correctChoiceIndex).toBe(0);
  });
});
