import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../utils/permissions';
import { useApiData } from '../utils/useApiData';
import { list as listVerifications } from '../api/verifications';
import { list as listReports } from '../api/reports';
import { list as listReviews } from '../api/reviews';
import { timeAgo, formatNumber } from '../utils/helpers';
import Header from '../components/layout/Header';
import StatCard from '../components/common/StatCard';
import StatusBadge from '../components/common/StatusBadge';
import { Check, Smile, Star } from 'lucide-react';

export default function SupportDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions(user?.role);

  const { data: verifications } = useApiData(() => listVerifications({ limit: 50 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });
  const { data: reports } = useApiData(() => listReports({ limit: 50 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });
  const { data: reviews } = useApiData(() => listReviews({ limit: 50 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });

  const pendingVerifications = useMemo(() => verifications.filter((v) => v.status === 'pending'), [verifications]);
  const pendingReports = useMemo(() => reports.filter((r) => r.status === 'open' || r.status === 'under_review'), [reports]);

  const stats = [
    { label: 'Pending Verifications', value: formatNumber(pendingVerifications.length), icon: <Check size={20} />, color: 'var(--color-blue)' },
    { label: 'Recent Reviews', value: formatNumber(reviews?.length || 0), icon: <Star size={20} />, color: 'var(--color-warning)' },
  ];

  return (
    <div>
      <Header title={`Support Dashboard - ${user?.name || 'Support Agent'}`} />

      <div className="dashboard-grid">
        {stats.map((s, idx) => <StatCard key={idx} {...s} />)}
      </div>

      <div className="mb-4">
        <div className="dashboard-section-title">Quick Access</div>
        <div className="quick-actions">
          {can('viewVerifications') && (
            <div className="quick-action-card" onClick={() => navigate('/verifications')}>
              <div className="quick-action-icon"><Check size={18} /></div>
              <div className="quick-action-text">Review Verifications</div>
            </div>
          )}
          {can('viewOversight') && (
            <div className="quick-action-card" onClick={() => navigate('/oversight')}>
              <div className="quick-action-icon"><Star size={18} /></div>
              <div className="quick-action-text">Review Reports</div>
            </div>
          )}
          {can('viewUsers') && (
            <div className="quick-action-card" onClick={() => navigate('/users')}>
              <div className="quick-action-icon"><Smile size={18} /></div>
              <div className="quick-action-text">Search Users</div>
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-activity-grid">
        <div className="card">
          <div className="card-header"><h3>Pending Verifications</h3></div>
          <div className="card-body">
            {pendingVerifications.length === 0 ? (
              <div className="empty-state" style={{ padding: '1rem' }}><div className="empty-state-text">No pending verifications</div></div>
            ) : (
              pendingVerifications.slice(0, 5).map((v) => (
                <div key={v.id} className="recent-item" style={{ cursor: 'pointer' }} onClick={() => navigate('/verifications')}>
                  <div className="recent-item-info">
                    <div className="recent-item-title">{v.userName}</div>
                    <div className="recent-item-sub">{v.userRole} - {timeAgo(v.submittedAt)}</div>
                  </div>
                  <StatusBadge status="pending" />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Recent Reviews & Reports</h3></div>
          <div className="card-body">
            {(reviews || []).length === 0 && pendingReports.length === 0 ? (
              <div className="empty-state" style={{ padding: '1rem' }}><div className="empty-state-text">No reviews or reports</div></div>
            ) : (
              <>
                {(reviews || []).slice(0, 3).map((r) => (
                  <div key={r.id} className="recent-item" style={{ cursor: 'pointer' }} onClick={() => navigate('/oversight')}>
                    <div className="recent-item-info">
                      <div className="recent-item-title">Review by {r.reviewerName}</div>
                      <div className="recent-item-sub">Rating: {r.rating}/5 - {timeAgo(r.createdAt)}</div>
                    </div>
                    <StatusBadge status={r.rating >= 4 ? 'positive' : r.rating >= 3 ? 'neutral' : 'negative'} />
                  </div>
                ))}
                {pendingReports.slice(0, 2).map((r) => (
                  <div key={r.id} className="recent-item" style={{ cursor: 'pointer' }} onClick={() => navigate('/oversight')}>
                    <div className="recent-item-info">
                      <div className="recent-item-title">{r.issueType}</div>
                      <div className="recent-item-sub">{r.targetType} - {timeAgo(r.createdAt)}</div>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          <div><strong>Support Agent:</strong> {user?.name}</div>
          <div><strong>Role:</strong> Customer Support</div>
          <div><strong>Permissions:</strong> Verification, Reports, Reviews</div>
          <div><strong>Restricted:</strong> Financial records, audit logs, account governance actions</div>
        </div>
      </div>
    </div>
  );
}
