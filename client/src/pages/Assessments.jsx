import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../utils/permissions';
import { useApiData, useMutation } from '../utils/useApiData';
import * as categoriesApi from '../api/categories';
import * as assessmentsApi from '../api/assessments';
import { formatDate, capitalizeWords } from '../utils/helpers';
import Header from '../components/layout/Header';
import SearchBar from '../components/common/SearchBar';
import StatusBadge from '../components/common/StatusBadge';
import ConfirmModal from '../components/common/ConfirmModal';
import Tabs from '../components/common/Tabs';
import DataTable from '../components/common/DataTable';
import { Plus, Pencil, Trash2, X, Save, ChevronLeft, ClipboardCheck } from 'lucide-react';
import styles from './Assessments.module.css';

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const QUESTION_TYPES = [
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'true_false', label: 'True/False' },
  { value: 'descriptive', label: 'Descriptive' },
];

export default function Assessments() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { can } = usePermissions(currentUser?.role);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [deletingQuestion, setDeletingQuestion] = useState(null);
  const [tab, setTab] = useState('questions');
  const [qSearch, setQSearch] = useState('');

  const [form, setForm] = useState({
    question: '', questionType: 'multiple_choice', difficulty: 'beginner',
    points: 10, options: ['', '', '', ''], correctAnswer: '',
  });

  const { data: allCategories } = useApiData(() => categoriesApi.list(), [], {
    defaultValue: [],
    transform: (r) => r?.data ?? r ?? [],
  });

  const { data: allAssessments } = useApiData(() => assessmentsApi.list(), [], {
    defaultValue: [],
    transform: (r) => r?.data ?? r ?? [],
  });

  const { data: allQuestions, refetch: refetchQuestions } = useApiData(() => assessmentsApi.listQuestions({ limit: 500 }), [], {
    defaultValue: [],
    transform: (r) => r?.data ?? r ?? [],
  });

  const [doCreateQuestion] = useMutation(assessmentsApi.createQuestion);
  const [doUpdateQuestion] = useMutation(assessmentsApi.updateQuestion);
  const [doDeleteQuestion] = useMutation(assessmentsApi.deleteQuestion);

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

  const activeCategories = useMemo(() => allCategories.filter((c) => c.isActive), [allCategories]);

  const openNewForm = () => {
    setEditingQuestion(null);
    setForm({ question: '', questionType: 'multiple_choice', difficulty: 'beginner', points: 10, options: ['', '', '', ''], correctAnswer: '' });
    setShowForm(true);
  };

  const openEditForm = (q) => {
    setEditingQuestion(q);
    const opts = q.options?.length ? [...q.options] : [''];
    while (opts.length < 4) opts.push('');
    setForm({
      question: q.question || q.text || '',
      questionType: q.questionType || q.type,
      difficulty: q.difficulty,
      points: q.points,
      options: opts,
      correctAnswer: q.correctAnswer || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.question.trim()) return;
    if (form.questionType === 'multiple_choice' && form.options.filter((o) => o.trim()).length < 2) return;
    if ((form.questionType === 'multiple_choice' || form.questionType === 'true_false') && !form.correctAnswer) return;

    const data = {
      categoryId: selectedCategory.id,
      text: form.question.trim(),
      type: form.questionType,
      difficulty: form.difficulty,
      points: Number(form.points),
      options: form.questionType !== 'descriptive' ? form.options.filter((o) => o.trim()) : [],
      correctAnswer: form.questionType !== 'descriptive' ? form.correctAnswer : null,
    };

    try {
      if (editingQuestion) {
        await doUpdateQuestion(editingQuestion.id, data);
      } else {
        await doCreateQuestion(data);
      }
      setShowForm(false);
      setEditingQuestion(null);
      refetchQuestions();
    } catch {
      // silently fail
    }
  };

  const handleDelete = async () => {
    try {
      await doDeleteQuestion(deletingQuestion.id);
      setDeletingQuestion(null);
      refetchQuestions();
    } catch {
      // silently fail
    }
  };

  const totalPoints = useMemo(() => questions.reduce((sum, q) => sum + (q.points || 0), 0), [questions]);

  const questionTypeLabel = (type) => QUESTION_TYPES.find((t) => t.value === type)?.label || type;

  if (!selectedCategory) {
    return (
      <div>
        <Header title="Skill Assessments" />
        <div className={styles.categoryGrid}>
          {activeCategories.map((cat) => (
            <div key={cat.id} className={styles.categoryCard} onClick={() => setSelectedCategory(cat)}>
              <div className={styles.categoryCardIcon}><ClipboardCheck size={24} /></div>
              <div className={styles.categoryCardName}>{cat.name}</div>
              <div className={styles.categoryCardDesc}>{cat.description}</div>
              <div className={styles.categoryCardMeta}>
                <span>{allQuestions.filter((q) => q.categoryId === cat.id).length} questions</span>
                <span>{allAssessments.filter((a) => a.categoryId === cat.id).length} taken</span>
              </div>
            </div>
          ))}
          {activeCategories.length === 0 && (
            <div className="empty-state" style={{ gridColumn: '1/-1' }}>
              <div className="empty-state-text">No categories available</div>
              <div className="empty-state-sub">Create categories in Jobs &gt; Manage Categories first</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title={`Assessments — ${selectedCategory.name}`} />
      <div className={styles.toolbar}>
        <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedCategory(null); setShowForm(false); setEditingQuestion(null); }}>
          <ChevronLeft size={16} /> All Categories
        </button>
        <div className={styles.toolbarStats}>
          <span>{questions.length} questions</span>
          <span>{totalPoints} total points</span>
          <span>{categoryAssessments.length} submissions</span>
        </div>
      </div>

      <Tabs tabs={[
        { key: 'questions', label: 'Questions' },
        { key: 'submissions', label: 'Submissions' },
      ]} activeTab={tab} onChange={setTab} />

      <div className="tab-content">
        {tab === 'questions' && (
          <div className="card">
            <div className="card-header">
              <SearchBar value={qSearch} onChange={setQSearch} placeholder="Search questions..." />
              {can('manageQuestions') && (
                <button className="btn btn-accent btn-sm" onClick={openNewForm}>
                  <Plus size={15} /> Add Question
                </button>
              )}
            </div>
            {showForm && (
              <div className={styles.questionForm}>
                <div className={styles.questionFormHeader}>
                  <h4>{editingQuestion ? 'Edit Question' : 'New Question'}</h4>
                  <button className={styles.questionFormClose} onClick={() => { setShowForm(false); setEditingQuestion(null); }}>
                    <X size={16} />
                  </button>
                </div>
                <div className={styles.questionFormBody}>
                  <div className="form-group">
                    <label className="form-label">Question</label>
                    <textarea className="form-textarea" rows={2} value={form.question}
                      onChange={(e) => setForm((p) => ({ ...p, question: e.target.value }))} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Type</label>
                      <select className="form-select" value={form.questionType}
                        onChange={(e) => setForm((p) => ({ ...p, questionType: e.target.value, correctAnswer: '', options: ['', '', '', ''] }))}>
                        {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Difficulty</label>
                      <select className="form-select" value={form.difficulty}
                        onChange={(e) => setForm((p) => ({ ...p, difficulty: e.target.value }))}>
                        {DIFFICULTIES.map((d) => <option key={d} value={d}>{capitalizeWords(d)}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Points</label>
                      <input className="form-input" type="number" min={1} max={100} value={form.points}
                        onChange={(e) => setForm((p) => ({ ...p, points: e.target.value }))} />
                    </div>
                  </div>

                  {form.questionType === 'multiple_choice' && (
                    <div className="form-group">
                      <label className="form-label">Options (at least 2, mark correct with radio)</label>
                      {form.options.map((opt, i) => (
                        <div key={i} className={styles.optionRow}>
                          <input type="radio" name="correct" checked={form.correctAnswer === opt}
                            onChange={() => setForm((p) => ({ ...p, correctAnswer: opt }))} />
                          <input className="form-input" placeholder={`Option ${i + 1}`} value={opt}
                            onChange={(e) => {
                              const opts = [...form.options];
                              opts[i] = e.target.value;
                              setForm((p) => ({ ...p, options: opts }));
                            }} />
                          {opt && form.correctAnswer === opt && <span className={styles.correctBadge}>Correct</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {form.questionType === 'true_false' && (
                    <div className="form-group">
                      <label className="form-label">Correct Answer</label>
                      <div className={styles.optionRow}>
                        <input type="radio" name="tf" checked={form.correctAnswer === 'True'}
                          onChange={() => setForm((p) => ({ ...p, correctAnswer: 'True', options: ['True', 'False'] }))} />
                        <span>True</span>
                      </div>
                      <div className={styles.optionRow}>
                        <input type="radio" name="tf" checked={form.correctAnswer === 'False'}
                          onChange={() => setForm((p) => ({ ...p, correctAnswer: 'False', options: ['True', 'False'] }))} />
                        <span>False</span>
                      </div>
                    </div>
                  )}

                  {form.questionType === 'descriptive' && (
                    <div className="form-group">
                      <label className="form-label text-muted">Descriptive questions require manual grading.</label>
                    </div>
                  )}

                  <div className={styles.formActions}>
                    <button className="btn btn-primary btn-sm" onClick={handleSave}>
                      <Save size={14} /> {editingQuestion ? 'Update' : 'Add Question'}
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => { setShowForm(false); setEditingQuestion(null); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="card-body p-0">
              {questions.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon"><ClipboardCheck size={36} /></div>
                  <div className="empty-state-text">No questions yet</div>
                  <div className="empty-state-sub">Add assessment questions for {selectedCategory.name}</div>
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
                        <span className={styles.qBadge}>{questionTypeLabel(q.questionType || q.type)}</span>
                        <span className={styles.qBadge}>{capitalizeWords(q.difficulty)}</span>
                        <span className={styles.qBadge}>{q.points} pts</span>
                        {q.correctAnswer && <span className={styles.qBadge}>Ans: {q.correctAnswer}</span>}
                      </div>
                      {q.options?.length > 0 && (q.questionType || q.type) !== 'true_false' && (
                        <div className={styles.questionItemOptions}>
                          {q.options.map((o, i) => (
                            <span key={i} className={`${styles.optionPill} ${o === q.correctAnswer ? styles.optionCorrect : ''}`}>
                              {o === q.correctAnswer && '✓ '}{o}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'submissions' && (
          <div className="card">
            <div className="card-body p-0">
              {categoryAssessments.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-text">No submissions yet</div>
                  <div className="empty-state-sub">Talents will appear here after they take assessments</div>
                </div>
              ) : (
                <DataTable
                  columns={[
                    { key: 'userName', label: 'Talent', render: (row) => row.userName || row.userId },
                    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                    { key: 'score', label: 'Score', render: (row) => `${row.score || 0}/${row.totalPoints || 0}` },
                    { key: 'startedAt', label: 'Started', render: (row) => formatDate(row.startedAt) },
                    { key: 'completedAt', label: 'Completed', render: (row) => row.completedAt ? formatDate(row.completedAt) : '-' },
                  ]}
                  data={categoryAssessments}
                  pageSize={10}
                  emptyMessage="No submissions"
                  onRowClick={(row) => navigate(`/users/${row.userId}`)}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!deletingQuestion}
        title="Delete Question"
        message={`Remove "${(deletingQuestion?.question || deletingQuestion?.text || '').substring(0, 60)}..."? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeletingQuestion(null)}
      />
    </div>
  );
}
