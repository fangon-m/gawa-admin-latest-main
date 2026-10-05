import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Jobs from './Jobs';

const testData = vi.hoisted(() => ({
  importAssessmentQuestions: vi.fn(),
  skills: [{ skillId: 'skill-1', skillName: 'Electrical', description: '', isActive: true }],
  assessments: [{ assessmentId: 'assessment-1', skillId: 'skill-1', title: 'Electrical Safety', isActive: true }],
  attemptStats: [],
  questions: [{
    questionId: 'question-1',
    assessmentId: 'assessment-1',
    questionText: 'What is the first step?',
    points: 5,
    category: 'safety',
    choices: [{ choiceId: 'choice-1', choiceText: 'Inspect', sortOrder: 0 }],
    answerKey: { correctChoiceId: 'choice-1' },
  }],
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }));
vi.mock('../utils/permissions', () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../api/jobs', () => ({ list: vi.fn() }));
vi.mock('../api/skills', () => ({ listSkills: vi.fn(), updateSkill: vi.fn(), createSkill: vi.fn(), deleteSkill: vi.fn() }));
vi.mock('../api/skillAssessments', () => ({ listSkillAssessments: vi.fn() }));
vi.mock('../api/assessmentAttempts', () => ({ getSkillAttemptStats: vi.fn() }));
vi.mock('../components/assessments/AssessmentAttemptsTable', () => ({
  default: () => <div>Assessment attempt rows</div>,
}));
vi.mock('../api/assessmentQuestions', () => ({
  listAssessmentQuestions: vi.fn(),
  createAssessmentQuestion: vi.fn(),
  updateAssessmentQuestion: vi.fn(),
  deleteAssessmentQuestion: vi.fn(),
  importAssessmentQuestions: testData.importAssessmentQuestions,
}));
vi.mock('../utils/useApiData', () => ({
  useApiData: (() => {
    let callIndex = 0;
    return () => {
      const datasets = [
        { data: [], loading: false },
        { data: testData.skills, refetch: vi.fn() },
        { data: testData.assessments, refetch: vi.fn() },
        { data: testData.questions, refetch: vi.fn() },
        { data: testData.attemptStats },
      ];
      const result = datasets[callIndex % datasets.length];
      callIndex += 1;
      return result;
    };
  })(),
}));

describe('assessment question edit navigation', () => {
  beforeEach(() => {
    testData.assessments = [{ assessmentId: 'assessment-1', skillId: 'skill-1', title: 'Electrical Safety', isActive: true }];
    testData.questions = [{
      questionId: 'question-1',
      assessmentId: 'assessment-1',
      questionText: 'What is the first step?',
      points: 5,
      category: 'safety',
      choices: [{ choiceId: 'choice-1', choiceText: 'Inspect', sortOrder: 0 }],
      answerKey: { correctChoiceId: 'choice-1' },
    }];
    testData.attemptStats = [];
    window.history.replaceState({}, '', '/jobs');
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('keeps context by scrolling to the editor, focusing its question field, and recording edit state', () => {
    render(<Jobs />);
    fireEvent.click(screen.getByRole('button', { name: 'Assessments' }));
    fireEvent.click(screen.getByText('Electrical'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit question' }));

    const questionField = screen.getByLabelText('Question');
    expect(questionField).toHaveFocus();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
    });
    expect(window.history.state.assessmentEditQuestionId).toBe('question-1');
  });

  it('allows importing from a skill with no assessments', () => {
    testData.assessments = [];
    testData.questions = [];
    render(<Jobs />);
    fireEvent.click(screen.getByRole('button', { name: 'Assessments' }));
    fireEvent.click(screen.getByText('Electrical'));

    expect(screen.getByLabelText('Upload Excel question file')).toBeEnabled();
    expect(screen.getByText('Uploading will create an assessment for Electrical.')).toBeInTheDocument();
  });

  it('hides the attempts count when the skill has no attempts', () => {
    testData.assessments = [{ assessmentId: 'assessment-1', skillId: 'skill-1', title: 'Electrical Safety', isActive: true }];
    testData.attemptStats = [];
    render(<Jobs />);
    fireEvent.click(screen.getByRole('button', { name: 'Assessments' }));

    expect(screen.queryByText('0 attempts')).not.toBeInTheDocument();
    expect(screen.queryByText('1/1 passed')).not.toBeInTheDocument();
  });

  it('counts in-progress attempts while showing completed attempt outcomes', () => {
    testData.assessments = [{ assessmentId: 'assessment-1', skillId: 'skill-1', title: 'Electrical Safety', isActive: true }];
    testData.attemptStats = [{
      skillId: 'skill-1',
      attemptCount: 3,
      passedCount: 1,
      averageScorePercent: 55,
    }];
    render(<Jobs />);
    fireEvent.click(screen.getByRole('button', { name: 'Assessments' }));

    expect(screen.getByText('3 attempts')).toBeInTheDocument();
    expect(screen.getByText('55% avg score')).toBeInTheDocument();
    expect(screen.getByText('1/3 passed')).toBeInTheDocument();
  });
});
