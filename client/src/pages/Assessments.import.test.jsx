import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Assessments from './Assessments';

const fixtures = vi.hoisted(() => ({
  index: 0,
  updateAssessmentQuestion: vi.fn(),
  skills: [{ skillId: 'skill-1', skillName: 'Electrical', description: '', isActive: true }],
  assessments: [{
    assessmentId: 'assessment-1',
    skillId: 'skill-1',
    title: 'Electrical Safety',
    description: '',
    timeLimitMinutes: 40,
    passingPercent: 75,
    isActive: true,
  }],
  questions: [],
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }));
vi.mock('../utils/permissions', () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../api/skills', () => ({ listSkills: vi.fn() }));
vi.mock('../api/skillAssessments', () => ({ listSkillAssessments: vi.fn() }));
vi.mock('../api/assessmentQuestions', () => ({
  listAssessmentQuestions: vi.fn(),
  createAssessmentQuestion: vi.fn(),
  updateAssessmentQuestion: fixtures.updateAssessmentQuestion,
  deleteAssessmentQuestion: vi.fn(),
  importAssessmentQuestions: vi.fn(),
}));
vi.mock('../utils/useApiData', () => ({
  useApiData: () => {
    const datasets = [
      fixtures.skills,
      fixtures.assessments,
      fixtures.questions,
    ];
    const data = datasets[fixtures.index % datasets.length];
    fixtures.index += 1;
    return { data, refetch: vi.fn() };
  },
  useMutation: (mutation) => [mutation],
}));

describe('assessment page question import', () => {
  beforeEach(() => {
    fixtures.index = 0;
    fixtures.questions = [];
    fixtures.updateAssessmentQuestion.mockReset().mockResolvedValue({});
  });

  it('enables Excel import for an existing assessment with no questions', () => {
    render(<Assessments />);
    fireEvent.click(screen.getByText('Electrical'));
    fireEvent.click(screen.getByText('Electrical Safety'));

    expect(screen.getByText('No questions yet')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload Excel question file')).toBeEnabled();
  });

  it('confirms and deactivates an active assessment question', async () => {
    fixtures.questions = [{
      questionId: 'question-1',
      assessmentId: 'assessment-1',
      questionText: 'Welding safety check?',
      isActive: true,
      choices: [],
    }];
    render(<Assessments />);
    fireEvent.click(screen.getByText('Electrical'));
    fireEvent.click(screen.getByText('Electrical Safety'));

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Deactivate', exact: true }).at(-1));

    expect(await screen.findByRole('status')).toHaveTextContent('Question deactivated.');
    expect(fixtures.updateAssessmentQuestion).toHaveBeenCalledWith('question-1', { isActive: false });
  });

  it('shows the backend guidance when deactivation is blocked', async () => {
    fixtures.questions = [{
      questionId: 'question-1',
      assessmentId: 'assessment-1',
      questionText: 'Welding safety check?',
      isActive: true,
      choices: [],
    }];
    fixtures.updateAssessmentQuestion.mockRejectedValue({
      status: 409,
      error: 'This question has attempt history and cannot be edited.',
    });
    render(<Assessments />);
    fireEvent.click(screen.getByText('Electrical'));
    fireEvent.click(screen.getByText('Electrical Safety'));
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Deactivate', exact: true }).at(-1));

    expect(await screen.findByRole('alert')).toHaveTextContent('This question has attempt history and cannot be edited.');
  });

  it('bulk deactivates selected active questions and filters active/deactivated questions', async () => {
    fixtures.questions = [
      { questionId: 'question-1', assessmentId: 'assessment-1', questionText: 'Question one', isActive: true, choices: [] },
      { questionId: 'question-2', assessmentId: 'assessment-1', questionText: 'Question two', isActive: true, choices: [] },
      { questionId: 'question-3', assessmentId: 'assessment-1', questionText: 'Inactive question', isActive: false, choices: [] },
    ];
    render(<Assessments />);
    fireEvent.click(screen.getByText('Electrical'));
    fireEvent.click(screen.getByText('Electrical Safety'));
    expect(screen.getByText(/Question set: Electrical — Electrical Safety/)).toBeInTheDocument();
    expect(screen.queryByText('Inactive question')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Select question: Question one'));
    fireEvent.click(screen.getByLabelText('Select question: Question two'));
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate selected (2)' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Deactivate 2 questions' }).at(-1));

    expect(await screen.findByRole('status')).toHaveTextContent('2 questions deactivated.');
    expect(fixtures.updateAssessmentQuestion).toHaveBeenCalledTimes(2);
    expect(fixtures.updateAssessmentQuestion).toHaveBeenCalledWith('question-1', { isActive: false });
    expect(fixtures.updateAssessmentQuestion).toHaveBeenCalledWith('question-2', { isActive: false });

    fixtures.questions.forEach((question) => { question.isActive = false; });
    fireEvent.change(screen.getByLabelText('Filter questions by status'), { target: { value: 'inactive' } });
    expect(screen.getByText('Question one')).toBeInTheDocument();
    expect(screen.getByText('Inactive question')).toBeInTheDocument();
  });
});
