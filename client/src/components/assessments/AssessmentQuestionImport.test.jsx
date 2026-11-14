import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssessmentQuestionImport from './AssessmentQuestionImport';
import * as assessmentQuestionsApi from '../../api/assessmentQuestions';
import { readAssessmentImportFile } from '../../utils/assessmentImport';

vi.mock('../../api/assessmentQuestions', () => ({
  importAssessmentQuestions: vi.fn(),
}));
vi.mock('../../utils/assessmentImport', () => ({
  ASSESSMENT_IMPORT_TEMPLATE: 'Question,Option 1,Option 2,Correct Answer',
  readAssessmentImportFile: vi.fn(),
}));

describe('assessment question file import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readAssessmentImportFile).mockResolvedValue({
      questions: [{
        rowNumber: 2,
        questionText: 'Question?',
        choices: [{ choiceText: 'Yes' }, { choiceText: 'No' }],
        correctChoiceIndex: 0,
        partNo: 1,
      }],
      errors: [],
    });
  });

  it('previews the selected workbook and sends it to the selected assessment import endpoint', async () => {
    vi.mocked(assessmentQuestionsApi.importAssessmentQuestions).mockResolvedValue({
      data: { insertedCount: 1, duplicates: [] },
    });
    const onImported = vi.fn();
    render(<AssessmentQuestionImport assessmentId="assessment-1" onImported={onImported} />);

    const file = new File(['workbook'], 'questions.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    fireEvent.change(screen.getByLabelText('Upload Excel question file'), {
      target: { files: [file] },
    });

    expect(await screen.findByText('Question?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 questions' }));

    await waitFor(() => {
      expect(assessmentQuestionsApi.importAssessmentQuestions).toHaveBeenCalledWith(
        { assessmentId: 'assessment-1', skillId: undefined, skillName: undefined },
        file,
        expect.any(Function),
      );
    });
    expect(onImported).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent('1 questions imported');
  });

  it('enables upload for a skill without assessments so import can create the first assessment', () => {
    render(<AssessmentQuestionImport assessmentId="" skillId="skill-1" skillName="Electrical" />);

    expect(screen.getByLabelText('Upload Excel question file')).toBeEnabled();
    expect(screen.getByText('Uploading will create an assessment for Electrical.')).toBeInTheDocument();
  });

  it('imports rows for a skill with no assessment, letting the server create its assessment', async () => {
    vi.mocked(assessmentQuestionsApi.importAssessmentQuestions).mockResolvedValue({
      data: { assessmentCreated: true, assessmentTitle: 'Electrical Assessment', insertedCount: 1, duplicates: [] },
    });
    render(<AssessmentQuestionImport assessmentId="" skillId="skill-1" skillName="Electrical" />);
    const file = new File(['workbook'], 'questions.xlsx');
    fireEvent.change(screen.getByLabelText('Upload Excel question file'), { target: { files: [file] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Import 1 questions' }));

    await waitFor(() => {
      expect(assessmentQuestionsApi.importAssessmentQuestions).toHaveBeenCalledWith(
        { assessmentId: '', skillId: 'skill-1', skillName: 'Electrical' },
        file,
        expect.any(Function),
      );
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Created "Electrical Assessment"');
  });
});
