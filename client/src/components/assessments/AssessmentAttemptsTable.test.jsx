import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssessmentAttemptsTable from './AssessmentAttemptsTable';
import * as assessmentAttemptsApi from '../../api/assessmentAttempts';

const fixture = vi.hoisted(() => ({
  data: [{
    id: 'attempt-1',
    userId: 'user-1',
    userName: 'Alex Example',
    status: 'passed',
    scorePercent: 85,
    startedAt: '2026-10-05T08:00:00.000Z',
    submittedAt: '2026-10-05T08:10:00.000Z',
  }],
}));

vi.mock('../../api/assessmentAttempts', () => ({
  getSkillAttempts: vi.fn(),
}));
vi.mock('../../utils/useApiData', () => ({
  useApiData: (fetchFn) => {
    fetchFn();
    return { data: fixture.data, loading: false, error: null };
  },
}));

describe('assessment attempts table', () => {
  beforeEach(() => {
    fixture.data = [{
      id: 'attempt-1',
      userId: 'user-1',
      userName: 'Alex Example',
      status: 'passed',
      scorePercent: 85,
      startedAt: '2026-10-05T08:00:00.000Z',
      submittedAt: '2026-10-05T08:10:00.000Z',
    }];
  });

  it('loads a skill attempt list and renders the actual user and result', () => {
    render(<AssessmentAttemptsTable skillId="skill-1" />);

    expect(assessmentAttemptsApi.getSkillAttempts).toHaveBeenCalledWith('skill-1');
    expect(screen.getByText('Alex Example')).toBeInTheDocument();
    expect(screen.getByText('85.0%')).toBeInTheDocument();
  });

  it('shows a clear empty state when nobody has attempted this skill', () => {
    fixture.data = [];
    render(<AssessmentAttemptsTable skillId="skill-1" />);
    expect(screen.getByText('No assessment attempts')).toBeInTheDocument();
  });
});
