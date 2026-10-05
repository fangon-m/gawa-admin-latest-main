import React from 'react';
import { formatDate } from '../../utils/helpers';
import { useApiData } from '../../utils/useApiData';
import * as assessmentAttemptsApi from '../../api/assessmentAttempts';
import StatusBadge from '../common/StatusBadge';
import DataTable from '../common/DataTable';

const columns = [
  { key: 'userName', label: 'Talent', render: (row) => row.userName || row.userId || 'Unknown' },
  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  {
    key: 'scorePercent',
    label: 'Score',
    render: (row) => row.scorePercent === null || row.scorePercent === undefined
      ? '-'
      : `${Number(row.scorePercent).toFixed(1)}%`,
  },
  { key: 'startedAt', label: 'Started', render: (row) => formatDate(row.startedAt) },
  { key: 'submittedAt', label: 'Submitted', render: (row) => row.submittedAt ? formatDate(row.submittedAt) : '-' },
];

export default function AssessmentAttemptsTable({ skillId }) {
  const { data, loading, error } = useApiData(
    () => assessmentAttemptsApi.getSkillAttempts(skillId),
    [skillId],
    { defaultValue: [], transform: (response) => response?.data ?? response ?? [] },
  );

  if (error) return <div className="empty-state-text" role="alert">{error}</div>;

  return (
    <DataTable
      columns={columns}
      data={data}
      pageSize={10}
      loading={loading}
      emptyMessage="No assessment attempts"
    />
  );
}
