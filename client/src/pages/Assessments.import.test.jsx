import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Assessments from './Assessments';

const fixtures = vi.hoisted(() => ({
  index: 0,
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
  updateAssessmentQuestion: vi.fn(),
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
  useMutation: () => [vi.fn()],
}));

describe('assessment page question import', () => {
  beforeEach(() => {
    fixtures.index = 0;
  });

  it('enables Excel import for an existing assessment with no questions', () => {
    render(<Assessments />);
    fireEvent.click(screen.getByText('Electrical'));
    fireEvent.click(screen.getByText('Electrical Safety'));

    expect(screen.getByText('No questions yet')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload Excel question file')).toBeEnabled();
  });
});
