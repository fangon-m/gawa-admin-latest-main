import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../utils/permissions';
import { useApiData } from '../utils/useApiData';
import { list as listJobs } from '../api/jobs';
import * as categoriesApi from '../api/categories';
import * as assessmentsApi from '../api/assessments';
import { formatDate, formatCurrency, capitalizeWords } from '../utils/helpers';
import Header from '../components/layout/Header';
import SearchBar from '../components/common/SearchBar';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import ConfirmModal from '../components/common/ConfirmModal';
import Tabs from '../components/common/Tabs';
import { Plus, Pencil, Trash2, X, Save, ClipboardCheck, BookOpen, ChevronLeft, Briefcase } from 'lucide-react';
import styles from './Assessments.module.css';

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const QUESTION_TYPES = [
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'true_false', label: 'True/False' },
  { value: 'descriptive', label: 'Descriptive' },
];

export default function Jobs() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { can } = usePermissions(currentUser?.role);
  const [search, setSearch] = useState('');
  const [fil, setFil] = useState({ type: '', status: '', category: '' });
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', description: '' });
  const [deletingCat, setDeletingCat] = useState(null);

  const [activeTab, setActiveTab] = useState('jobs');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [deletingQuestion, setDeletingQuestion] = useState(null);
  const [qTab, setQTab] = useState('questions');
  const [qSearch, setQSearch] = useState('');
  const [qForm, setQForm] = useState({
    question: '', questionType: 'multiple_choice', difficulty: 'beginner',
    points: 10, options: ['', '', '', ''], correctAnswer: '',
  });

  // Data fetching — pass type filter so backend enriches contractor data when applicable
  const { data: jobs, loading: jobsLoading } = useApiData(
    () => {
      const params = { limit: 100 };
      if (fil.type) params.hiringOption = fil.type;
      return listJobs(params);
    },
    [fil.type],
    { defaultValue: [], transform: (r) => r?.data ?? r ?? [] }
  );
  const { data: allCategories, refetch: refetchCats } = useApiData(() => categoriesApi.list(), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });
  const { data: allAssessments } = useApiData(() => assessmentsApi.list({ limit: 100 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });

  // Fetch ALL questions upfront (used by both overview grid and drill-down view)
  const { data: allQuestions, refetch: refetchQs } = useApiData(() => assessmentsApi.listQuestions({ limit: 500 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });

  // Question drill-down: filter from all questions when a category is selected
  const questions = useMemo(() => {
    if (!selectedCategory) return [];
    const qs = allQuestions.filter((q) => q.categoryId === selectedCategory.id);
    if (qSearch) {
      const q = qSearch.toLowerCase();
      return qs.filter((x) => (x.question || x.text || '').toLowerCase().includes(q));
    }
    return qs;
  }, [selectedCategory, allQuestions, qSearch]);

  const categoryAssessments = useMemo(() => {
    if (!selectedCategory) return [];
    return allAssessments.filter((a) => a.categoryId === selectedCategory.id);
  }, [selectedCategory, allAssessments]);

  const activeCategories = useMemo(() => allCategories.filter((c) => c.isActive !== false), [allCategories]);

  // Analytics: computed from all questions (works for overview grid even without a selected category)
  const categoryAnalytics = useMemo(() => {
    return activeCategories.map((cat) => {
      const qs = allQuestions.filter((q) => q.categoryId === cat.id);
      const asmts = allAssessments.filter((a) => a.categoryId === cat.id);
      const totalPts = qs.reduce((s, q) => s + (q.points || 0), 0);
      const passed = asmts.filter((a) => (a.score || 0) / (a.totalPoints || 1) >= 0.6).length;
      const avgScore = asmts.length > 0
        ? Math.round(asmts.reduce((s, a) => s + ((a.score || 0) / (a.totalPoints || 1)) * 100, 0) / asmts.length)
        : 0;
      return { ...cat, questionCount: qs.length, submissionCount: asmts.length, passed, avgScore, totalPoints: totalPts };
    });
  }, [activeCategories, allAssessments, allQuestions]);

  const filterDefs = useMemo(() => [
    { key: 'type', label: 'Type', placeholder: 'All Types', options: [
      { value: 'task_based', label: 'Task-Based' },
      { value: 'contractor_based', label: 'Contractor-Based' },
    ]},
    { key: 'status', label: 'Status', placeholder: 'All Statuses', options: [
      { value: 'open', label: 'Open' },
      { value: 'in_progress', label: 'In Progress' },
      { value: 'completed', label: 'Completed' },
      { value: 'finished', label: 'Finished' },
      { value: 'flagged', label: 'Flagged' },
      { value: 'escalated', label: 'Escalated' },
    ]},
  ], []);

  const filtered = useMemo(() => {
    let data = [...jobs];
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((j) => j.jobTitle?.toLowerCase().includes(q) || j.clientName?.toLowerCase().includes(q));
    }
    if (fil.type) data = data.filter((j) => j.hiringOption === fil.type);
    if (fil.status) data = data.filter((j) => j.jobStatus === fil.status);
    return data;
  }, [search, fil, jobs]);

  const columns = useMemo(() => {
    if (fil.type === 'contractor_based') {
      return [
        {
          key: 'jobTitle',
          label: 'Project',
          render: (row) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Briefcase size={15} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <span className="cell-link" onClick={() => { if (row.jobPostId) navigate(`/jobs/${row.jobPostId}`); }}>{row.jobTitle}</span>
            </div>
          ),
        },
        { key: 'id', label: 'ID', render: (row) => <span className="text-xs text-muted font-mono">{row.jobPostId?.slice(0, 8)}</span> },
        { key: 'contractorName', label: 'Contractor', render: (row) => row.contractorName || <span className="text-muted">Unassigned</span> },
        { key: 'clientName', label: 'Client' },
        {
          key: 'jobStatus',
          label: 'Status',
          render: (row) => <StatusBadge status={row.jobStatus} label={capitalizeWords(row.jobStatus)} />,
        },
        { key: 'createdAt', label: 'Posted', render: (row) => formatDate(row.createdAt) },
      ];
    }

    return [
      { key: 'jobTitle', label: 'Job', render: (row) => <span className="cell-link" onClick={() => { if (row.jobPostId) navigate(`/jobs/${row.jobPostId}`); }}>{row.jobTitle}</span> },
      { key: 'id', label: 'ID', render: (row) => <span className="text-xs text-muted font-mono">{row.jobPostId?.slice(0, 8)}</span> },
      { key: 'hiringOption', label: 'Type', render: (row) => <StatusBadge status={row.hiringOption} /> },
      { key: 'clientName', label: 'Client' },
      { key: 'jobStatus', label: 'Status', render: (row) => <StatusBadge status={row.jobStatus} /> },
      { key: 'matchCount', label: 'Matches' },
      { key: 'createdAt', label: 'Posted', render: (row) => formatDate(row.createdAt) },
    ];
  }, [fil.type]);

  const openEditCat = (cat) => {
    setEditingCat(cat);
    setCatForm({ name: cat.name, description: cat.description || '' });
  };

  const handleSaveCat = async () => {
    if (!catForm.name.trim()) return;
    try {
      if (editingCat) {
        await categoriesApi.update(editingCat.id, { name: catForm.name.trim(), description: catForm.description.trim() });
      } else {
        await categoriesApi.create({ name: catForm.name.trim(), description: catForm.description.trim() });
      }
      setEditingCat(null);
      setCatForm({ name: '', description: '' });
      refetchCats();
    } catch (err) { console.error('Save category failed:', err); }
  };

  const handleDeleteCat = async () => {
    try {
      await categoriesApi.remove(deletingCat.id);
      setDeletingCat(null);
      refetchCats();
    } catch (err) {
      alert('Cannot delete this category.');
      setDeletingCat(null);
    }
  };

  const openNewForm = () => {
    setEditingQuestion(null);
    setQForm({ question: '', questionType: 'multiple_choice', difficulty: 'beginner', points: 10, options: ['', '', '', ''], correctAnswer: '' });
    setShowQuestionForm(true);
  };

  const openEditForm = (q) => {
    setEditingQuestion(q);
    const opts = q.options?.length ? [...q.options] : [''];
    while (opts.length < 4) opts.push('');
    setQForm({
      question: q.question,
      questionType: q.questionType,
      difficulty: q.difficulty,
      points: q.points,
      options: opts,
      correctAnswer: q.correctAnswer || '',
    });
    setShowQuestionForm(true);
  };

  const handleSaveQuestion = async () => {
    if (!qForm.question.trim() || !selectedCategory) return;
    if (qForm.questionType === 'multiple_choice' && qForm.options.filter((o) => o.trim()).length < 2) return;
    if ((qForm.questionType === 'multiple_choice' || qForm.questionType === 'true_false') && !qForm.correctAnswer) return;

    const data = {
      categoryId: selectedCategory.id,
      text: qForm.question.trim(),
      type: qForm.questionType,
      points: Number(qForm.points),
      options: qForm.questionType !== 'descriptive' ? qForm.options.filter((o) => o.trim()) : [],
      correctAnswer: qForm.questionType !== 'descriptive' ? qForm.correctAnswer : null,
    };

    try {
      if (editingQuestion) {
        await assessmentsApi.updateQuestion(editingQuestion.id, data);
      } else {
        await assessmentsApi.createQuestion(data);
      }
      setShowQuestionForm(false);
      setEditingQuestion(null);
      refetchQs();
    } catch (err) { console.error('Save question failed:', err); }
  };

  const handleDeleteQuestion = async () => {
    try {
      await assessmentsApi.deleteQuestion(deletingQuestion.id);
      setDeletingQuestion(null);
      refetchQs();
    } catch (err) { console.error('Delete question failed:', err); }
  };

  const totalPoints = useMemo(() => questions.reduce((sum, q) => sum + (q.points || 0), 0), [questions]);

  const assessmentColumns = [
    { key: 'userName', label: 'Talent', render: (row) => row.userName || row.userId || 'Unknown' },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'score', label: 'Score', render: (row) => `${row.score || 0}/${row.totalPoints || 0}` },
    { key: 'startedAt', label: 'Started', render: (row) => formatDate(row.startedAt) },
    { key: 'completedAt', label: 'Completed', render: (row) => row.completedAt ? formatDate(row.completedAt) : '-' },
  ];

  return (
    <div>
      <Header title="Job Management" onSearch={activeTab === 'jobs' ? setSearch : undefined} />
      <Tabs tabs={[
        { key: 'jobs', label: 'Jobs' },
        { key: 'assessments', label: 'Assessments' },
      ]} activeTab={activeTab} onChange={(t) => { setActiveTab(t); setSelectedCategory(null); }} />

      {activeTab === 'jobs' && (
        <>
          <div className="card">
            <div className="card-header">
              <FilterBar filters={filterDefs} values={fil} onChange={(key, value) => setFil((p) => ({ ...p, [key]: value }))} />
              {can('manageSettings') && (
                <button className="btn btn-outline btn-sm" onClick={() => setShowCatModal(true)}>
                  Manage Categories
                </button>
              )}
            </div>
            <div className="card-body p-0">
              <DataTable columns={columns} data={filtered} onRowClick={(row) => { if (row.jobPostId) navigate(`/jobs/${row.jobPostId}`); }} pageSize={10} emptyMessage={jobsLoading ? 'Loading...' : 'No jobs found.'} />
            </div>
          </div>

          {showCatModal && (
            <div className="modal-overlay" onClick={() => { setShowCatModal(false); setEditingCat(null); setCatForm({ name: '', description: '' }); }}>
              <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
                <div className="modal-header">
                  <h3>Manage Categories</h3>
                  <button className="modal-close" onClick={() => { setShowCatModal(false); setEditingCat(null); setCatForm({ name: '', description: '' }); }}>
                    <X size={16} />
                  </button>
                </div>
                <div className="modal-body">
                  <div className="form-section" style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
                    <h4 className="text-sm font-semibold mb-3">{editingCat ? `Edit: ${editingCat.name}` : 'Add New Category'}</h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Name</label>
                        <input className="form-input" placeholder="e.g. Landscaping" value={catForm.name} onChange={(e) => setCatForm((p) => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Description</label>
                        <input className="form-input" placeholder="Brief description" value={catForm.description} onChange={(e) => setCatForm((p) => ({ ...p, description: e.target.value }))} />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button className="btn btn-sm btn-primary" onClick={handleSaveCat}>
                        <Save size={14} /> {editingCat ? 'Update' : 'Add'}
                      </button>
                      {editingCat && (
                        <button className="btn btn-sm btn-outline" onClick={() => { setEditingCat(null); setCatForm({ name: '', description: '' }); }}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  {allCategories.map((cat) => (
                    <div key={cat.id} className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <div>
                        <div className="font-medium text-sm">{cat.name}</div>
                        <div className="text-xs text-muted">{cat.description}{cat.description ? ' · ' : ''}{cat.jobCount || 0} job(s)</div>
                      </div>
                      <div className="flex gap-1">
                        <button className="btn btn-sm btn-outline" onClick={() => openEditCat(cat)}><Pencil size={13} /></button>
                        <button className="btn btn-sm btn-danger" onClick={() => setDeletingCat(cat)}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <ConfirmModal open={!!deletingCat} title="Delete Category"
            message={`Delete "${deletingCat?.name}"?`}
            confirmLabel="Delete" variant="danger" onConfirm={handleDeleteCat} onCancel={() => setDeletingCat(null)} />
        </>
      )}

      {activeTab === 'assessments' && (
        <>
          {!selectedCategory ? (
            <>
              <div className={styles.toolbar}>
                <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600 }}>Assessment Overview</h3>
              </div>
              <div className="card">
                <div className="card-body">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                    {categoryAnalytics.map((cat) => (
                      <div key={cat.id} className={styles.categoryCard} onClick={() => setSelectedCategory(cat)}>
                        <div className={styles.categoryCardIcon}><ClipboardCheck size={24} /></div>
                        <div className={styles.categoryCardName}>{cat.name}</div>
                        <div className={styles.categoryCardDesc}>{cat.description}</div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.6875rem', padding: '0.125rem 0.4375rem', borderRadius: 'var(--radius-full)', background: '#EEF2F6', color: '#475569', fontWeight: 500 }}>
                            {cat.questionCount} questions
                          </span>
                          <span style={{ fontSize: '0.6875rem', padding: '0.125rem 0.4375rem', borderRadius: 'var(--radius-full)', background: '#EEF2F6', color: '#475569', fontWeight: 500 }}>
                            {cat.totalPoints} pts
                          </span>
                        </div>
                        <div className={styles.categoryCardMeta}>
                          <span>{cat.submissionCount} taken</span>
                          {cat.submissionCount > 0 && (<><span>{cat.avgScore}% avg</span><span>{cat.passed}/{cat.submissionCount} passed</span></>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={styles.toolbar}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedCategory(null); setShowQuestionForm(false); setEditingQuestion(null); }}>
                  <ChevronLeft size={16} /> All Categories
                </button>
                <div className={styles.toolbarStats}>
                  <span>{questions.length} questions</span>
                  <span>{totalPoints} total points</span>
                  <span>{categoryAssessments.length} submissions</span>
                </div>
              </div>

              <Tabs tabs={[{ key: 'questions', label: 'Questions' }, { key: 'submissions', label: 'Submissions' }]} activeTab={qTab} onChange={setQTab} />

              <div className="tab-content">
                {qTab === 'questions' && (
                  <div className="card">
                    <div className="card-header">
                      <SearchBar value={qSearch} onChange={setQSearch} placeholder="Search questions..." />
                      {can('manageQuestions') && (
                        <button className="btn btn-accent btn-sm" onClick={openNewForm}>
                          <Plus size={15} /> Add Question
                        </button>
                      )}
                    </div>
                    {showQuestionForm && (
                      <div className={styles.questionForm}>
                        <div className={styles.questionFormHeader}>
                          <h4>{editingQuestion ? 'Edit Question' : 'New Question'}</h4>
                          <button className={styles.questionFormClose} onClick={() => { setShowQuestionForm(false); setEditingQuestion(null); }}>
                            <X size={16} />
                          </button>
                        </div>
                        <div className={styles.questionFormBody}>
                          <div className="form-group">
                            <label className="form-label">Question</label>
                            <textarea className="form-textarea" rows={2} value={qForm.question}
                              onChange={(e) => setQForm((p) => ({ ...p, question: e.target.value }))} />
                          </div>
                          <div className="form-row">
                            <div className="form-group">
                              <label className="form-label">Type</label>
                              <select className="form-select" value={qForm.questionType}
                                onChange={(e) => setQForm((p) => ({ ...p, questionType: e.target.value, correctAnswer: '', options: ['', '', '', ''] }))}>
                                {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                              </select>
                            </div>
                            <div className="form-group">
                              <label className="form-label">Difficulty</label>
                              <select className="form-select" value={qForm.difficulty}
                                onChange={(e) => setQForm((p) => ({ ...p, difficulty: e.target.value }))}>
                                {DIFFICULTIES.map((d) => <option key={d} value={d}>{capitalizeWords(d)}</option>)}
                              </select>
                            </div>
                            <div className="form-group">
                              <label className="form-label">Points</label>
                              <input className="form-input" type="number" min={1} max={100} value={qForm.points}
                                onChange={(e) => setQForm((p) => ({ ...p, points: e.target.value }))} />
                            </div>
                          </div>
                          {qForm.questionType === 'multiple_choice' && (
                            <div className="form-group">
                              <label className="form-label">Options (mark correct with radio)</label>
                              {qForm.options.map((opt, i) => (
                                <div key={i} className={styles.optionRow}>
                                  <input type="radio" name="correct" checked={qForm.correctAnswer === opt}
                                    onChange={() => setQForm((p) => ({ ...p, correctAnswer: opt }))} />
                                  <input className="form-input" placeholder={`Option ${i + 1}`} value={opt}
                                    onChange={(e) => {
                                      const opts = [...qForm.options];
                                      opts[i] = e.target.value;
                                      setQForm((p) => ({ ...p, options: opts }));
                                    }} />
                                </div>
                              ))}
                            </div>
                          )}
                          {qForm.questionType === 'true_false' && (
                            <div className="form-group">
                              <label className="form-label">Correct Answer</label>
                              {['True', 'False'].map((opt) => (
                                <div key={opt} className={styles.optionRow}>
                                  <input type="radio" name="tf" checked={qForm.correctAnswer === opt}
                                    onChange={() => setQForm((p) => ({ ...p, correctAnswer: opt, options: ['True', 'False'] }))} />
                                  <span>{opt}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className={styles.formActions}>
                            <button className="btn btn-primary btn-sm" onClick={handleSaveQuestion}>
                              <Save size={14} /> {editingQuestion ? 'Update' : 'Add Question'}
                            </button>
                            <button className="btn btn-outline btn-sm" onClick={() => { setShowQuestionForm(false); setEditingQuestion(null); }}>Cancel</button>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="card-body p-0">
                      {questions.length === 0 ? (
                        <div className="empty-state">
                          <div className="empty-state-icon"><BookOpen size={36} /></div>
                          <div className="empty-state-text">No questions yet</div>
                        </div>
                      ) : (
                        <div className={styles.questionList}>
                          {questions.map((q) => (
                            <div key={q.id} className={styles.questionItem}>
                              <div className={styles.questionItemTop}>
                                <div className={styles.questionItemText}>{q.question || q.text}</div>
                                <div className={styles.questionItemActions}>
                                  {can('manageQuestions') && (
                                    <>
                                      <button className="btn btn-ghost btn-sm" onClick={() => openEditForm(q)}><Pencil size={13} /></button>
                                      <button className="btn btn-ghost btn-sm" onClick={() => setDeletingQuestion(q)}><Trash2 size={13} /></button>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className={styles.questionItemMeta}>
                                <span className={styles.qBadge}>{QUESTION_TYPES.find((t) => t.value === q.type)?.label}</span>
                                <span className={styles.qBadge}>{q.points} pts</span>
                                {q.correctAnswer && <span className={styles.qBadge}>Ans: {q.correctAnswer}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {qTab === 'submissions' && (
                  <div className="card">
                    <div className="card-body p-0">
                      <DataTable columns={assessmentColumns} data={categoryAssessments} pageSize={10} emptyMessage="No submissions" />
                    </div>
                  </div>
                )}
              </div>

              <ConfirmModal open={!!deletingQuestion} title="Delete Question"
                message={`Remove this question?`}
                confirmLabel="Delete" variant="danger" onConfirm={handleDeleteQuestion} onCancel={() => setDeletingQuestion(null)} />
            </>
          )}
        </>
      )}
    </div>
  );
}
