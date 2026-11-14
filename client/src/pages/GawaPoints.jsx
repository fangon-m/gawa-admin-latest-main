import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../utils/permissions';
import { useApiData, useMutation } from '../utils/useApiData';
import * as gawaPointsApi from '../api/gawaPoints';
import * as usersApi from '../api/users';
import { formatDate, formatCurrency, formatNumber, userEntityPath, formatEntityIdNumeric } from '../utils/helpers';
import Header from '../components/layout/Header';
import Tabs from '../components/common/Tabs';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import StatCard from '../components/common/StatCard';
import ConfirmModal from '../components/common/ConfirmModal';
import {
  Star, ArrowRight, RotateCcw, PhilippinePeso, Check, X, Plus, Minus,
} from 'lucide-react';

const emptyPackForm = { displayName: '', points: '', pricePhp: '', sortOrder: '' };

// An untouched optional field is an empty string, which must stay `undefined`
// so the server applies its own default. `0` is a legitimate sort order, so a
// plain falsy check would wrongly discard it.
const optionalNumber = (value) => (
  value === '' || value === null || value === undefined ? undefined : Number(value)
);

// `cost_per_point` is a generated column in the database, so it is never sent
// to the API. This preview mirrors the database formula for the form display.
const previewCostPerPoint = (points, pricePhp) => {
  const p = Number(points);
  const price = Number(pricePhp);
  if (!Number.isFinite(p) || !Number.isFinite(price) || p <= 0 || price <= 0) return '';
  return `PHP ${(price / p).toFixed(2)}`;
};

const modalStyles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem',
  },
  modal: {
    background: 'var(--color-bg)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-xl)',
    width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', padding: '1.5rem 2rem',
  },
  title: { fontSize: 'var(--text-xl)', fontWeight: 600, marginBottom: '1.25rem', color: 'var(--color-text)' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' },
};

export default function GawaPoints() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { can } = usePermissions(currentUser?.role);
  const [tab, setTab] = useState('packs');
  const [message, setMessage] = useState(null);

  // === Data fetching ===
  const { data: allPacks, refetch: refetchPacks } = useApiData(() => gawaPointsApi.listPacks(), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });
  const { data: transactions, refetch: refetchTxns } = useApiData(() => gawaPointsApi.listTransactions({ limit: 100 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });
  const { data: allUsers } = useApiData(() => usersApi.list({ limit: 100 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });
  const { data: wallets, refetch: refetchWallets } = useApiData(() => gawaPointsApi.listWallets({ limit: 100 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });

  // === Mutations ===
  const [doCreatePack] = useMutation(gawaPointsApi.createPack);
  const [doUpdatePack] = useMutation(gawaPointsApi.updatePack);
  const [doDeletePack] = useMutation(gawaPointsApi.deletePack);
  const [doIssuePoints] = useMutation(gawaPointsApi.issuePoints);
  const [doDeductPoints] = useMutation(gawaPointsApi.deductPoints);

  // === Derived stats ===
  const dashStats = useMemo(() => {
    const purchased = transactions.filter(t => t.transactionType === 'credit' || t.transactionType === 'purchase').reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const consumed = transactions.filter(t => t.transactionType === 'proposal_charge' || t.transactionType === 'deducted' || t.transactionType === 'consumed').reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const refunded = transactions.filter(t => t.transactionType === 'refund').reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    return {
      totalGawaPointsPurchased: purchased,
      totalGawaPointsConsumed: consumed,
      totalGawaPointsRefunded: refunded,
      outstandingGawaPoints: purchased - consumed - refunded,
    };
  }, [transactions]);

  // Manual issue/deduct only applies to accounts that already have a Gawa
  // Points wallet, so the picker is restricted to those users.
  const userOptions = useMemo(() => {
    const walletUserIds = new Set(wallets.map((w) => w.userId).filter(Boolean));
    return allUsers.filter((u) => walletUserIds.has(u.id));
  }, [allUsers, wallets]);

  // === Modal state ===
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...emptyPackForm });
  const [editingPack, setEditingPack] = useState(null);
  const [editForm, setEditForm] = useState({ ...emptyPackForm });
  const [deletingPack, setDeletingPack] = useState(null);
  const [togglingPack, setTogglingPack] = useState(null);
  const [showIssue, setShowIssue] = useState(false);
  const [issueForm, setIssueForm] = useState({ userId: '', amount: '', reason: '' });
  const [showDeduct, setShowDeduct] = useState(false);
  const [deductForm, setDeductForm] = useState({ userId: '', amount: '', reason: '' });

  const showMsg = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const refetchAll = useCallback(() => {
    refetchPacks();
    refetchTxns();
    refetchWallets();
  }, [refetchPacks, refetchTxns, refetchWallets]);

  // === Pack handlers ===
  const handleCreatePack = async (e) => {
    e.preventDefault();
    try {
      await doCreatePack({
        displayName: createForm.displayName,
        points: Number(createForm.points),
        pricePhp: Number(createForm.pricePhp),
        sortOrder: optionalNumber(createForm.sortOrder),
      });
      setShowCreate(false);
      setCreateForm({ ...emptyPackForm });
      refetchPacks();
      showMsg(`Pack "${createForm.displayName}" created`);
    } catch (err) {
      console.error('Create pack failed:', err);
      showMsg(err?.error || 'Could not create the pack.', 'error');
    }
  };

  const handleEditPack = async (e) => {
    e.preventDefault();
    try {
      // `cost_per_point` is generated by the database from price and points, so
      // it is never part of the update payload.
      await doUpdatePack(editingPack.packId, {
        displayName: editForm.displayName,
        points: Number(editForm.points),
        pricePhp: Number(editForm.pricePhp),
        sortOrder: optionalNumber(editForm.sortOrder),
      });
      setEditingPack(null);
      refetchPacks();
      showMsg('Pack updated');
    } catch (err) {
      console.error('Edit pack failed:', err);
      showMsg(err?.error || 'Could not update the pack.', 'error');
    }
  };

  const handleDeletePack = async () => {
    const pack = deletingPack;
    try {
      await doDeletePack(pack.packId);
      setDeletingPack(null);
      refetchPacks();
      showMsg(`Pack "${pack.displayName}" deleted`);
    } catch (err) {
      console.error('Delete pack failed:', err);
      showMsg(err?.error || 'Could not delete the pack.', 'error');
    }
  };

  const handleTogglePack = async () => {
    const pack = togglingPack;
    try {
      await doUpdatePack(pack.packId, { isActive: !pack.isActive });
      setTogglingPack(null);
      refetchPacks();
      showMsg(`Pack "${pack.displayName}" ${pack.isActive ? 'deactivated' : 'activated'}`);
    } catch (err) {
      console.error('Toggle pack failed:', err);
      showMsg(err?.error || 'Could not change the pack status.', 'error');
    }
  };

  const openEditPack = (pack) => {
    setEditingPack(pack);
    setEditForm({
      displayName: pack.displayName,
      points: String(pack.points),
      pricePhp: String(pack.pricePhp),
      sortOrder: pack.sortOrder ?? '',
    });
  };

  const handleIssue = async (e) => {
    e.preventDefault();
    const amt = parseInt(issueForm.amount, 10);
    if (!issueForm.userId || !amt || amt <= 0) {
      showMsg('Select a user and enter a positive number of points.', 'error');
      return;
    }
    try {
      await doIssuePoints({ userId: issueForm.userId, amount: amt, reason: issueForm.reason });
      setShowIssue(false);
      setIssueForm({ userId: '', amount: '', reason: '' });
      refetchTxns();
      refetchWallets();
      showMsg(`Issued ${amt} GP`);
    } catch (err) {
      console.error('Issue points failed:', err);
      showMsg(err?.error || 'Could not issue points.', 'error');
    }
  };

  const handleDeduct = async (e) => {
    e.preventDefault();
    const amt = parseInt(deductForm.amount, 10);
    if (!deductForm.userId || !amt || amt <= 0) {
      showMsg('Select a user and enter a positive number of points.', 'error');
      return;
    }
    try {
      await doDeductPoints({ userId: deductForm.userId, amount: amt, reason: deductForm.reason });
      setShowDeduct(false);
      setDeductForm({ userId: '', amount: '', reason: '' });
      refetchTxns();
      refetchWallets();
      showMsg(`Deducted ${amt} GP`);
    } catch (err) {
      console.error('Deduct points failed:', err);
      showMsg(err?.error || 'Could not deduct points.', 'error');
    }
  };

  // === Table columns ===
  const packCols = [
    { key: 'displayName', label: 'Pack Name' },
    { key: 'points', label: 'Points', render: (row) => <strong>{formatNumber(row.points)}</strong> },
    { key: 'pricePhp', label: 'Price (PHP)', render: (row) => formatCurrency(row.pricePhp) },
    { key: 'costPerPoint', label: 'Cost/Point', render: (row) => row.costPerPoint != null ? `PHP ${Number(row.costPerPoint).toFixed(2)}` : '—' },
    { key: 'sortOrder', label: 'Sort Order', render: (row) => row.sortOrder ?? '—' },
    { key: 'isActive', label: 'Active', render: (row) => row.isActive ? <Check size={16} color="var(--color-success)" /> : <X size={16} color="var(--color-error)" /> },
    ...(can('managePacks') ? [{
      key: 'actions', label: 'Actions', render: (row) => (
        <div className="table-actions">
          {row.isActive ? (
            <button className="btn btn-sm btn-outline" onClick={() => setTogglingPack(row)}>Deactivate</button>
          ) : (
            <button className="btn btn-sm btn-success" onClick={() => setTogglingPack(row)}>Set Active</button>
          )}
          <button className="btn btn-sm btn-outline" onClick={() => openEditPack(row)}>Edit</button>
          <button className="btn btn-sm btn-danger" onClick={() => setDeletingPack(row)}>Delete</button>
        </div>
      ),
    }] : []),
  ];

  const txnCols = [
    { key: 'id', label: 'ID', render: (row) => <span className="text-xs text-muted font-mono">{formatEntityIdNumeric(row.id, 'PTS-')}</span> },
    { key: 'userName', label: 'User' },
    { key: 'transactionType', label: 'Type', render: (row) => <StatusBadge status={row.transactionType} /> },
    { key: 'amount', label: 'Amount', render: (row) => (
      <span style={{ color: (row.amount || 0) > 0 ? 'var(--color-success)' : 'var(--color-error)', fontWeight: 600 }}>
        {(row.amount || 0) > 0 ? '+' : ''}{row.amount}
      </span>
    )},
    { key: 'description', label: 'Description' },
    { key: 'createdAt', label: 'Date', render: (row) => formatDate(row.createdAt) },
  ];

  const walletCols = [
    { key: 'userName', label: 'User' },
    { key: 'userEmail', label: 'Email', render: (row) => <span className="text-sm text-muted">{row.userEmail}</span> },
    { key: 'balance', label: 'Balance', render: (row) => <strong>{formatNumber(row.balance)} GP</strong> },
    { key: 'updatedAt', label: 'Last Updated', render: (row) => formatDate(row.updatedAt) },
    { key: 'createdAt', label: 'Created', render: (row) => formatDate(row.createdAt) },
  ];

  const tabs = [
    { key: 'packs', label: 'Points Packs' },
    { key: 'transactions', label: 'Transaction History' },
    { key: 'wallets', label: 'Wallets' },
    { key: 'metrics', label: 'Platform Metrics' },
  ];

  return (
    <div>
      <Header title="Gawa Points Management" />
      {message && (
        <div style={{
          padding: '0.625rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem',
          background: message.type === 'success' ? 'var(--color-success-subtle)' : 'var(--color-error-subtle)',
          color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
          fontSize: 'var(--text-sm)',
        }}>
          {message.text}
        </div>
      )}

      <div className="kpi-row">
        <StatCard label="Total Purchased" value={formatNumber(dashStats.totalGawaPointsPurchased)} icon={<Star size={20} />} color="var(--color-success)" />
        <StatCard label="Total Consumed" value={formatNumber(dashStats.totalGawaPointsConsumed)} icon={<ArrowRight size={20} />} color="var(--color-warning)" />
        <StatCard label="Total Refunded" value={formatNumber(dashStats.totalGawaPointsRefunded)} icon={<RotateCcw size={20} />} color="var(--color-blue)" />
        <StatCard label="Outstanding Balance" value={formatNumber(dashStats.outstandingGawaPoints)} icon={<PhilippinePeso size={20} />} color="var(--color-text)" />
      </div>

      <Tabs tabs={tabs} activeTab={tab} onChange={setTab} />

      <div className="tab-content">
        {tab === 'packs' && (
          <div>
            {can('managePacks') && (
              <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-accent" onClick={() => { setCreateForm({ ...emptyPackForm }); setShowCreate(true); }}>
                  <Plus size={16} /> Create New Pack
                </button>
              </div>
            )}
            <div className="card">
              <div className="card-body" style={{ padding: 0 }}>
                <DataTable columns={packCols} data={allPacks} pageSize={10} emptyMessage="No points packs configured." />
              </div>
            </div>
          </div>
        )}

        {tab === 'transactions' && (
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <DataTable columns={txnCols} data={transactions} pageSize={10} onRowClick={(row) => row.userId && navigate(userEntityPath(row.userId))} emptyMessage="No transactions found." />
            </div>
          </div>
        )}

        {tab === 'wallets' && (
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <DataTable columns={walletCols} data={wallets} pageSize={10} onRowClick={(row) => row.userId && navigate(userEntityPath(row.userId))} emptyMessage="No wallets found." />
            </div>
          </div>
        )}

        {tab === 'metrics' && (
          <div className="card">
            <div className="card-body">
              <div className="detail-grid">
                <div className="detail-field"><div className="detail-label">Total Purchased</div><div className="detail-value">{formatNumber(dashStats.totalGawaPointsPurchased)} GP</div></div>
                <div className="detail-field"><div className="detail-label">Total Consumed</div><div className="detail-value">{formatNumber(dashStats.totalGawaPointsConsumed)} GP</div></div>
                <div className="detail-field"><div className="detail-label">Total Refunded</div><div className="detail-value">{formatNumber(dashStats.totalGawaPointsRefunded)} GP</div></div>
                <div className="detail-field"><div className="detail-label">Outstanding Balances</div><div className="detail-value">{formatNumber(dashStats.outstandingGawaPoints)} GP</div></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {can('issuePoints') && (
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-success" onClick={() => { setIssueForm({ userId: '', amount: '', reason: '' }); setShowIssue(true); }}>
            <Plus size={16} /> Manual Issue Points
          </button>
          <button className="btn btn-danger" onClick={() => { setDeductForm({ userId: '', amount: '', reason: '' }); setShowDeduct(true); }}>
            <Minus size={16} /> Manual Deduct Points
          </button>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <div style={modalStyles.overlay} onClick={() => setShowCreate(false)}>
          <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={modalStyles.title}>Create Points Pack</div>
            <form onSubmit={handleCreatePack}>
              <div className="form-group">
                <label className="form-label">Pack Name</label>
                <input className="form-input" placeholder="e.g. Starter Pack" value={createForm.displayName} onChange={(e) => setCreateForm((p) => ({ ...p, displayName: e.target.value }))} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Points</label>
                  <input className="form-input" type="number" min="1" placeholder="100" value={createForm.points} onChange={(e) => setCreateForm((p) => ({ ...p, points: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Price (PHP)</label>
                  <input className="form-input" type="number" min="0" step="0.01" placeholder="100" value={createForm.pricePhp} onChange={(e) => setCreateForm((p) => ({ ...p, pricePhp: e.target.value }))} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Cost per Point</label>
                  <input
                    className="form-input"
                    value={previewCostPerPoint(createForm.points, createForm.pricePhp)}
                    placeholder="Auto-calculated"
                    readOnly
                    disabled
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Sort Order</label>
                  <input className="form-input" type="number" min="0" placeholder="Auto-assigned" value={createForm.sortOrder} onChange={(e) => setCreateForm((p) => ({ ...p, sortOrder: e.target.value }))} />
                </div>
              </div>
              <div style={modalStyles.actions}>
                <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-accent">Create Pack</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingPack && (
        <div style={modalStyles.overlay} onClick={() => setEditingPack(null)}>
          <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={modalStyles.title}>Edit Pack: {editingPack.displayName}</div>
            <form onSubmit={handleEditPack}>
              <div className="form-group">
                <label className="form-label">Pack Name</label>
                <input className="form-input" value={editForm.displayName} onChange={(e) => setEditForm((p) => ({ ...p, displayName: e.target.value }))} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Points</label>
                  <input className="form-input" type="number" min="1" value={editForm.points} onChange={(e) => setEditForm((p) => ({ ...p, points: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Price (PHP)</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={editForm.pricePhp} onChange={(e) => setEditForm((p) => ({ ...p, pricePhp: e.target.value }))} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Cost per Point</label>
                  <input
                    className="form-input"
                    value={previewCostPerPoint(editForm.points, editForm.pricePhp)}
                    placeholder="Auto-calculated"
                    readOnly
                    disabled
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Sort Order</label>
                  <input className="form-input" type="number" min="0" value={editForm.sortOrder} onChange={(e) => setEditForm((p) => ({ ...p, sortOrder: e.target.value }))} />
                </div>
              </div>
              <div style={modalStyles.actions}>
                <button type="button" className="btn btn-outline" onClick={() => setEditingPack(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal open={!!deletingPack} title="Delete Points Pack"
        message={`Are you sure you want to delete "${deletingPack?.displayName}"?`}
        confirmLabel="Delete Pack" variant="danger" onConfirm={handleDeletePack} onCancel={() => setDeletingPack(null)} />

      {showIssue && (
        <div style={modalStyles.overlay} onClick={() => setShowIssue(false)}>
          <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={modalStyles.title}>Manual Issue Points</div>
            <form onSubmit={handleIssue}>
              <div className="form-group">
                <label className="form-label">User</label>
                <select className="form-select" value={issueForm.userId} onChange={(e) => setIssueForm((p) => ({ ...p, userId: e.target.value }))} required>
                  <option value="">Select a user...</option>
                  {userOptions.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Points to Issue</label>
                <input className="form-input" type="number" min="1" placeholder="e.g. 200" value={issueForm.amount} onChange={(e) => setIssueForm((p) => ({ ...p, amount: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Reason</label>
                <input className="form-input" placeholder="e.g. Compensation for platform error" value={issueForm.reason} onChange={(e) => setIssueForm((p) => ({ ...p, reason: e.target.value }))} />
              </div>
              <div style={modalStyles.actions}>
                <button type="button" className="btn btn-outline" onClick={() => setShowIssue(false)}>Cancel</button>
                <button type="submit" className="btn btn-success">Issue Points</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeduct && (
        <div style={modalStyles.overlay} onClick={() => setShowDeduct(false)}>
          <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={modalStyles.title}>Manual Deduct Points</div>
            <form onSubmit={handleDeduct}>
              <div className="form-group">
                <label className="form-label">User</label>
                <select className="form-select" value={deductForm.userId} onChange={(e) => setDeductForm((p) => ({ ...p, userId: e.target.value }))} required>
                  <option value="">Select a user...</option>
                  {userOptions.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Points to Deduct</label>
                <input className="form-input" type="number" min="1" placeholder="e.g. 100" value={deductForm.amount} onChange={(e) => setDeductForm((p) => ({ ...p, amount: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Reason</label>
                <input className="form-input" placeholder="e.g. Violation penalty" value={deductForm.reason} onChange={(e) => setDeductForm((p) => ({ ...p, reason: e.target.value }))} />
              </div>
              <div style={modalStyles.actions}>
                <button type="button" className="btn btn-outline" onClick={() => setShowDeduct(false)}>Cancel</button>
                <button type="submit" className="btn btn-danger">Deduct Points</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal open={!!togglingPack} title={togglingPack?.isActive ? 'Deactivate Pack' : 'Activate Pack'}
        message={`${togglingPack?.isActive ? 'Deactivate' : 'Activate'} "${togglingPack?.displayName}"?`}
        confirmLabel={togglingPack?.isActive ? 'Deactivate' : 'Activate'}
        variant={togglingPack?.isActive ? 'warning' : 'success'}
        onConfirm={handleTogglePack} onCancel={() => setTogglingPack(null)} />
    </div>
  );
}