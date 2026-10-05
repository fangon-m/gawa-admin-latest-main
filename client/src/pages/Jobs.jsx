import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../utils/permissions';
import { useApiData } from '../utils/useApiData';
import { list as listJobs } from '../api/jobs';
import * as skillsApi from '../api/skills';
import * as skillAssessmentsApi from '../api/skillAssessments';
import * as assessmentQuestionsApi from '../api/assessmentQuestions';
import * as assessmentAttemptsApi from '../api/assessmentAttempts';
import { formatDate, formatCurrency, capitalizeWords, formatEntityIdNumeric } from '../utils/helpers';
import Header from '../components/layout/Header';
import SearchBar from '../components/common/SearchBar';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import ConfirmModal from '../components/common/ConfirmModal';
import Tabs from '../components/common/Tabs';
import AssessmentQuestionImport from '../components/assessments/AssessmentQuestionImport';
import AssessmentAttemptsTable from '../components/assessments/AssessmentAttemptsTable';
import { focusAssessmentEditor, updateAssessmentEditHistory } from '../utils/assessmentEditor';
import { Plus, Pencil, Trash2, X, Save, ClipboardCheck, BookOpen, ChevronLeft, Briefcase } from 'lucide-react';
import * as lucideIcons from 'lucide-react';
import styles from './Assessments.module.css';

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const QUESTION_TYPES = [
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'true_false', label: 'True/False' },
  { value: 'descriptive', label: 'Descriptive' },
];

const SKILL_ICON_OPTIONS = [
  'Zap', 'Wrench', 'Hammer', 'HardHat', 'Paintbrush', 'Ruler', 'Saw', 'Drill',
  'Truck', 'Car', 'Bike', 'Leaf', 'Trees', 'Flower2', 'Shovel', 'Drill',
  'Briefcase', 'ChefHat', 'Scissors', 'Camera', 'Monitor', 'Smartphone', 'Wifi',
  'Plug', 'Lightbulb', 'Droplets', 'Flame', 'Snowflake', 'ShieldCheck', 'Star',
  'Heart', 'Home', 'Building2', 'Store', 'Factory', 'Warehouse', 'Package',
]
  .filter((v, i, a) => a.indexOf(v) === i)
  .map((name) => ({ name, Icon: lucideIcons[name] }))
  .filter((o) => o.Icon);

export default function Jobs() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { can } = usePermissions(currentUser?.role);
  const [search, setSearch] = useState('');
  const [fil, setFil] = useState({ type: '', status: '', category: '' });
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', description: '', icon: '' });
  const [deletingCat, setDeletingCat] = useState(null);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const [activeTab, setActiveTab] = useState('jobs');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [questionAssessmentId, setQuestionAssessmentId] = useState('');
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [deletingQuestion, setDeletingQuestion] = useState(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState('');
  const [questionError, setQuestionError] = useState('');
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [deletingQuestions, setDeletingQuestions] = useState(false);
  const [qTab, setQTab] = useState('questions');
  const [qSearch, setQSearch] = useState('');
  const [qForm, setQForm] = useState({
    question: '', questionType: 'multiple_choice', difficulty: 'beginner',
    points: 10, options: ['', '', '', ''], correctAnswer: '',
  });
  const questionFormRef = useRef(null);
  const questionInputRef = useRef(null);

  // Data fetching
  const { data: jobs, loading: jobsLoading } = useApiData(
    () => {
      const params = { limit: 100 };
      if (fil.type) params.hiringOption = fil.type;
      return listJobs(params);
    },
    [fil.type],
    { defaultValue: [], transform: (r) => r?.data ?? r ?? [] }
  );
  const { data: allSkills, refetch: refetchSkills } = useApiData(() => skillsApi.listSkills(), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });
  const { data: allSkillAssessments, refetch: refetchSkillAssessments } = useApiData(() => skillAssessmentsApi.listSkillAssessments({ limit: 100 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });
  const { data: allQuestions, refetch: refetchQs } = useApiData(() => assessmentQuestionsApi.listAssessmentQuestions({ limit: 500 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });
  const { data: skillAttemptStats } = useApiData(() => assessmentAttemptsApi.getSkillAttemptStats(), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });

  // Question drill-down: filter from all questions when a skill is selected
  const questions = useMemo(() => {
    if (!selectedCategory) return [];
    const skillAssessmentIds = allSkillAssessments
      .filter((sa) => sa.skillId === selectedCategory.skillId)
      .map((sa) => sa.assessmentId);
    const qs = allQuestions.filter((q) => skillAssessmentIds.includes(q.assessmentId));
    if (qSearch) {
      const q = qSearch.toLowerCase();
      return qs.filter((x) => (x.questionText || '').toLowerCase().includes(q));
    }
    return qs;
  }, [selectedCategory, allQuestions, qSearch, allSkillAssessments]);

  const skillAssessments = useMemo(() => {
    if (!selectedCategory) return [];
    return allSkillAssessments.filter((a) => a.skillId === selectedCategory.skillId);
  }, [selectedCategory, allSkillAssessments]);
  const selectedAssessmentId = skillAssessments.some((assessment) => assessment.assessmentId === questionAssessmentId)
    ? questionAssessmentId
    : skillAssessments[0]?.assessmentId || '';
  const allVisibleQuestionsSelected = questions.length > 0 &&
    questions.every((question) => selectedQuestionIds.includes(question.questionId));

  const activeSkills = useMemo(() => allSkills.filter((s) => s.isActive !== false), [allSkills]);

  // Analytics: computed from all questions (works for overview grid even without a selected category)
  const skillAnalytics = useMemo(() => {
    return activeSkills.map((skill) => {
      const skillAssmts = allSkillAssessments.filter((sa) => sa.skillId === skill.skillId);
      const questions = skillAssmts.flatMap((sa) => 
        allQuestions.filter((q) => q.assessmentId === sa.assessmentId)
      );
      const attemptStats = skillAttemptStats.find((stats) => stats.skillId === skill.skillId);
      const submissionCount = Number(attemptStats?.attemptCount || 0);
      const passed = Number(attemptStats?.passedCount || 0);
      const avgScore = submissionCount > 0 ? Math.round(Number(attemptStats.averageScorePercent || 0)) : 0;
      return { ...skill, questionCount: questions.length, submissionCount, passed, avgScore };
    });
  }, [activeSkills, allSkillAssessments, allQuestions, skillAttemptStats]);

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
{ key: 'id', label: 'ID', render: (row) => <span className="text-xs text-muted font-mono">{formatEntityId(row.jobPostId, 'JOB-')}</span> },
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
{ key: 'id', label: 'ID', render: (row) => <span className="text-xs text-muted font-mono">{formatEntityIdNumeric(row.jobPostId, 'JOB-')}</span> },
      { key: 'hiringOption', label: 'Type', render: (row) => <StatusBadge status={row.hiringOption} /> },
      { key: 'clientName', label: 'Client' },
      { key: 'jobStatus', label: 'Status', render: (row) => <StatusBadge status={row.jobStatus} /> },
      { key: 'matchCount', label: 'Matches' },
      { key: 'createdAt', label: 'Posted', render: (row) => formatDate(row.createdAt) },
    ];
  }, [fil.type]);

  const openEditCat = (cat) => {
    setEditingCat(cat);
    setCatForm({ name: cat.skillName, icon: cat.icon || '' });
  };

  const handleSaveCat = async () => {
    if (!catForm.name.trim()) return;
    try {
      if (editingCat) {
        await skillsApi.updateSkill(editingCat.skillId, { skillName: catForm.name.trim(), icon: catForm.icon });
      } else {
        await skillsApi.createSkill({ skillName: catForm.name.trim(), icon: catForm.icon });
      }
      setEditingCat(null);
      setCatForm({ name: '', description: '', icon: '' }); setShowIconPicker(false);
      refetchSkills();
    } catch (err) { console.error('Save skill failed:', err); }
  };

  const handleDeleteCat = async () => {
    try {
      await skillsApi.deleteSkill(deletingCat.skillId);
      setDeletingCat(null);
      refetchSkills();
    } catch (err) {
      alert('Cannot delete this skill.');
      setDeletingCat(null);
    }
  };

  const openNewForm = () => {
    setEditingQuestion(null);
    updateAssessmentEditHistory(null);
    setQuestionError('');
    setQForm({ question: '', questionType: 'multiple_choice', difficulty: 'beginner', points: 10, options: ['', '', '', ''], correctAnswer: '' });
    setShowQuestionForm(true);
  };

  const openEditForm = (q) => {
    setEditingQuestion(q);
    setQuestionError('');
    const opts = q.choices?.length ? q.choices.map(c => c.choiceText) : [''];
    while (opts.length < 4) opts.push('');
    const correctAnswerText = q.choices?.find((c) => c.choiceId === q.answerKey?.correctChoiceId)?.choiceText || '';
    setQForm({
      question: q.questionText,
      questionType: 'multiple_choice',
      difficulty: 'beginner',
      points: q.points,
      options: opts,
      correctAnswer: correctAnswerText,
    });
    setShowQuestionForm(true);
  };

  useEffect(() => {
    if (!showQuestionForm || !editingQuestion) return;
    updateAssessmentEditHistory(editingQuestion.questionId);
    focusAssessmentEditor(questionFormRef.current, questionInputRef.current);
  }, [showQuestionForm, editingQuestion]);

  const handleSaveQuestion = async () => {
    if (!qForm.question.trim() || !selectedCategory || savingQuestion) return;
    if (qForm.questionType === 'multiple_choice' && qForm.options.filter((o) => o.trim()).length < 2) return;

    const choices = qForm.options.filter((o) => o.trim()).map((opt, i) => ({
      choiceText: opt,
      sortOrder: i,
    }));
    const correctChoiceIndex = choices.findIndex(c => c.choiceText === qForm.correctAnswer);

    setSavingQuestion(true);
    setQuestionError('');
    try {
      let assessmentId = editingQuestion?.assessmentId || selectedAssessmentId;
      if (!assessmentId) {
        const assessmentResponse = await skillAssessmentsApi.createSkillAssessment({
          skillId: selectedCategory.skillId,
          title: `${selectedCategory.skillName} Assessment`.slice(0, 200),
        });
        assessmentId = (assessmentResponse?.data ?? assessmentResponse)?.assessmentId;
        if (!assessmentId) throw new Error('The assessment could not be created.');
      }
      const data = {
        assessmentId,
        partNo: 1,
        category: 'general',
        questionText: qForm.question.trim(),
        explanation: '',
        choices,
        correctChoiceId: correctChoiceIndex >= 0 ? correctChoiceIndex : undefined,
      };
      if (editingQuestion) {
        await assessmentQuestionsApi.updateAssessmentQuestion(editingQuestion.questionId, data);
      } else {
        await assessmentQuestionsApi.createAssessmentQuestion(data);
      }
      setShowQuestionForm(false);
      setEditingQuestion(null);
      setQuestionError('');
      setQuestionAssessmentId(assessmentId);
      updateAssessmentEditHistory(null);
      await Promise.all([refetchQs(), refetchSkillAssessments()]);
    } catch (err) {
      setQuestionError(err?.error || err?.message || 'Could not save the question.');
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleDeleteQuestion = async () => {
    try {
      await assessmentQuestionsApi.deleteAssessmentQuestion(deletingQuestion.questionId);
      setSelectedQuestionIds((current) => current.filter((id) => id !== deletingQuestion.questionId));
      setDeletingQuestion(null);
      refetchQs();
    } catch (err) { console.error('Delete question failed:', err); }
  };

  const handleBulkDelete = async () => {
    if (!selectedCategory || !selectedQuestionIds.length || deletingQuestions) return;
    setDeletingQuestions(true);
    setBulkDeleteError('');
    try {
      await assessmentQuestionsApi.deleteAssessmentQuestions(selectedCategory.skillId, selectedQuestionIds);
      setSelectedQuestionIds([]);
      setConfirmBulkDelete(false);
      await refetchQs();
    } catch (err) {
      setBulkDeleteError(err?.error || err?.message || 'Could not delete the selected questions.');
      setConfirmBulkDelete(false);
    } finally {
      setDeletingQuestions(false);
    }
  };

  return (
    <div>
      <Header title="Job Management" onSearch={activeTab === 'jobs' ? setSearch : undefined} />
      <Tabs
        tabs={[
          { key: 'jobs', label: 'Jobs' },
          { key: 'assessments', label: 'Assessments' },
        ]}
        activeTab={activeTab}
        onChange={(t) => { setActiveTab(t); setSelectedCategory(null); setSelectedQuestionIds([]); }}
      />

      {activeTab === 'jobs' && (
        <>
          <div className="card">
            <div className="card-header">
              <FilterBar filters={filterDefs} values={fil} onChange={(key, value) => setFil((p) => ({ ...p, [key]: value }))} />
              {can('manageSkills') && (
                <button className="btn btn-outline btn-sm" onClick={() => setShowCatModal(true)}>
                  Manage Skills
                </button>
              )}
            </div>
            <div className="card-body p-0">
              <DataTable columns={columns} data={filtered} onRowClick={(row) => { if (row.jobPostId) navigate(`/jobs/${row.jobPostId}`); }} pageSize={10} emptyMessage={jobsLoading ? 'Loading...' : 'No jobs found.'} />
            </div>
          </div>

          {showCatModal && (
            <div className="modal-overlay" onClick={() => { setShowCatModal(false); setEditingCat(null); setCatForm({ name: '', description: '', icon: '' }); setShowIconPicker(false); }}>
              <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
                <div className="modal-header">
                  <h3>Manage Skills</h3>
                  <button className="modal-close" onClick={() => { setShowCatModal(false); setEditingCat(null); setCatForm({ name: '', description: '', icon: '' }); setShowIconPicker(false); }}>
                    <X size={16} />
                  </button>
                </div>
                <div className="modal-body">
                  <div className="form-section" style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
                    <h4 className="text-sm font-semibold mb-3">{editingCat ? `Edit: ${editingCat.skillName}` : 'Add New Skill'}</h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Skill Name</label>
                        <input className="form-input" placeholder="e.g. Electrical" value={catForm.name} onChange={(e) => setCatForm((p) => ({ ...p, name: e.target.value }))} />
                      </div>
                    <div className="form-group" style={{ position: 'relative' }}>
                      <label className="form-label">Icon</label>
                      <button
                        type="button"
                        className="form-input"
                        onClick={() => setShowIconPicker((v) => !v)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', textAlign: 'left' }}
                      >
                        {(() => {
                          const opt = SKILL_ICON_OPTIONS.find((o) => o.name === catForm.icon);
                          if (opt) { const Icon = opt.Icon; return <><Icon size={18} style={{ color: 'var(--color-accent)' }} /> <span>{opt.name}</span></>; }
                          if (catForm.icon) {
                            const isImg = /^https?:\/\//i.test(catForm.icon) || catForm.icon.startsWith('/') || catForm.icon.startsWith('data:');
                            return (
                              <>
                                {isImg ? (
                                  <img src={catForm.icon} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                                ) : (
                                  <span style={{ fontSize: 18 }}>{catForm.icon}</span>
                                )}
                                <span style={{ color: 'var(--color-text-muted)' }}>{isImg ? 'Custom icon' : catForm.icon}</span>
                              </>
                            );
                          }
                          return <span style={{ color: 'var(--color-text-muted)' }}>Choose icon...</span>;
                        })()}
                      </button>
                      {showIconPicker && (
                        <>
                          <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowIconPicker(false)} />
                          <div style={{
                            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 301,
                            background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', padding: '1rem',
                            maxHeight: '80vh', overflowY: 'auto', width: 'fit-content', maxWidth: '90vw',
                          }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 40px)', gap: '0.5rem' }}>
                              <button
                                type="button"
                                title="No icon"
                                onClick={() => { setCatForm((p) => ({ ...p, icon: '' })); setShowIconPicker(false); }}
                                style={{
                                  width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                  border: !catForm.icon ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                                  background: !catForm.icon ? 'rgba(199, 90, 27, 0.08)' : 'var(--color-surface)',
                                  color: 'var(--color-text-muted)', fontSize: 18,
                                }}
                              >
                                <X size={16} />
                              </button>
                              {SKILL_ICON_OPTIONS.map(({ name, Icon }) => (
                                <button
                                  key={name}
                                  type="button"
                                  title={name}
                                  onClick={() => { setCatForm((p) => ({ ...p, icon: name })); setShowIconPicker(false); }}
                                  style={{
                                    width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                    border: catForm.icon === name ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                                    background: catForm.icon === name ? 'rgba(199, 90, 27, 0.08)' : 'var(--color-surface)',
                                    color: catForm.icon === name ? 'var(--color-accent)' : 'var(--color-text-muted)',
                                  }}
                                >
                                  <Icon size={18} />
                                </button>
                              ))}
                            </div>
                            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                              <label className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center', cursor: 'pointer', display: 'flex' }}>
                                Upload custom icon
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                      setCatForm((p) => ({ ...p, icon: reader.result }));
                                      setShowIconPicker(false);
                                    };
                                    reader.readAsDataURL(file);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button className="btn btn-sm btn-primary" onClick={handleSaveCat}>
                        <Save size={14} /> {editingCat ? 'Update' : 'Add'}
                      </button>
                      {editingCat && (
                        <button className="btn btn-sm btn-outline" onClick={() => { setEditingCat(null); setCatForm({ name: '', description: '', icon: '' }); setShowIconPicker(false); }}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  {allSkills.map((skill) => (
<div key={skill.skillId} className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <div className="font-medium text-sm">{skill.skillName}</div>
                        <div className="flex gap-1">
                          <button className="btn btn-sm btn-outline" onClick={() => openEditCat(skill)}><Pencil size={13} /></button>
                          <button className="btn btn-sm btn-danger" onClick={() => setDeletingCat(skill)}><Trash2 size={13} /></button>
                        </div>
                      </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <ConfirmModal open={!!deletingCat} title="Delete Skill"
            message={`Delete "${deletingCat?.skillName}"?`}
            confirmLabel="Delete" variant="danger" onConfirm={handleDeleteCat} onCancel={() => setDeletingCat(null)} />
        </>
      )}

      {activeTab === 'assessments' && (
        <>
          {!selectedCategory ? (
            <>
              <div className={styles.toolbar}>
                <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600 }}>Skills Overview</h3>
              </div>
              <div className="card">
                <div className="card-body">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                    {skillAnalytics.map((skill) => (
                      <div key={skill.skillId} className={styles.categoryCard} onClick={() => { setSelectedCategory(skill); setQuestionAssessmentId(''); setSelectedQuestionIds([]); }}>
                        <div className={styles.categoryCardIcon}>
                          {skill.icon ? (
                            /^https?:\/\//i.test(skill.icon) || skill.icon.startsWith('/') || skill.icon.startsWith('data:') ? (
                              <img src={skill.icon} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                            ) : (() => {
                              const normalized = skill.icon.toLowerCase().replace(/[-_\s]/g, '');
                              const lucideMatch = Object.keys(lucideIcons).find(k => k.toLowerCase() === normalized);
                              if (lucideMatch) {
                                const Icon = lucideIcons[lucideMatch];
                                return <Icon size={24} />;
                              }
                              return <span style={{ fontSize: 24 }} role="img" aria-label={skill.icon}>{skill.icon}</span>;
                            })()
                          ) : (
                            <BookOpen size={24} />
                          )}
                        </div>
                        <div className={styles.categoryCardName}>{skill.skillName}</div>
                        <div className={styles.categoryCardDesc}>{skill.description}</div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.6875rem', padding: '0.125rem 0.4375rem', borderRadius: 'var(--radius-full)', background: '#EEF2F6', color: '#475569', fontWeight: 500 }}>
                            {skill.questionCount} questions
                          </span>
                        </div>
                        <div className={styles.categoryCardMeta}>
                          {skill.submissionCount > 0 && (
                            <>
                              <span>{skill.submissionCount} attempts</span>
                              <span>{skill.avgScore}% avg score</span>
                              <span>{skill.passed}/{skill.submissionCount} passed</span>
                            </>
                          )}
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
                <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedCategory(null); setShowQuestionForm(false); setEditingQuestion(null); setSelectedQuestionIds([]); updateAssessmentEditHistory(null); }}>
                  <ChevronLeft size={16} /> All Skills
                </button>
                <div className={styles.toolbarStats}>
                  <span>{questions.length} questions</span>
                  <span>{skillAssessments.length} assessments</span>
                </div>
              </div>

              <Tabs tabs={[{ key: 'questions', label: 'Questions' }, { key: 'assessments', label: 'Assessments' }]} activeTab={qTab} onChange={setQTab} />

              <div className="tab-content">
                {qTab === 'questions' && (
                  <div className="card">
                    <div className="card-header">
                      <SearchBar value={qSearch} onChange={setQSearch} placeholder="Search questions..." />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        {can('manageAssessmentQuestions') && (
                          <button className="btn btn-accent btn-sm" onClick={openNewForm}>
                            <Plus size={15} /> Add Question
                          </button>
                        )}
                      </div>
                    </div>
                    {can('manageAssessmentQuestions') && (
                      <AssessmentQuestionImport
                        assessmentId={selectedAssessmentId}
                        skillId={selectedCategory.skillId}
                        skillName={selectedCategory.skillName}
                        onImported={async () => {
                          await Promise.all([refetchQs(), refetchSkillAssessments()]);
                        }}
                      />
                    )}
                    {showQuestionForm && (
                      <div className={styles.questionForm} ref={questionFormRef}>
                        <div className={styles.questionFormHeader}>
                          <h4>{editingQuestion ? 'Edit Question' : 'New Question'}</h4>
                          <button className={styles.questionFormClose} onClick={() => { setShowQuestionForm(false); setEditingQuestion(null); updateAssessmentEditHistory(null); }}>
                            <X size={16} />
                          </button>
                        </div>
                        <div className={styles.questionFormBody}>
                          {!selectedAssessmentId && !editingQuestion && (
                            <p className={styles.formHint}>Saving this question will create an assessment for {selectedCategory.skillName}.</p>
                          )}
                          {questionError && <p className={styles.bulkDeleteError} role="alert">{questionError}</p>}
                          <div className="form-group">
                            <label className="form-label" htmlFor="assessment-question-editor">Question</label>
                            <textarea id="assessment-question-editor" ref={questionInputRef} className="form-textarea" rows={2} value={qForm.question}
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
                            <button className="btn btn-primary btn-sm" onClick={handleSaveQuestion} disabled={savingQuestion}>
                              <Save size={14} /> {savingQuestion ? 'Saving…' : editingQuestion ? 'Update' : 'Add Question'}
                            </button>
                            <button className="btn btn-outline btn-sm" onClick={() => { setShowQuestionForm(false); setEditingQuestion(null); updateAssessmentEditHistory(null); }}>Cancel</button>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="card-body p-0">
                      {can('manageAssessmentQuestions') && questions.length > 0 && (
                        <div className={styles.selectionToolbar}>
                          <label className={styles.selectAll}>
                            <input
                              type="checkbox"
                              aria-label="Select all visible questions"
                              checked={allVisibleQuestionsSelected}
                              onChange={(event) => setSelectedQuestionIds((current) => {
                                const visibleIds = questions.map((question) => question.questionId);
                                return event.target.checked
                                  ? [...new Set([...current, ...visibleIds])]
                                  : current.filter((id) => !visibleIds.includes(id));
                              })}
                            />
                            Select all visible
                          </label>
                          <span className={styles.selectedCount}>{selectedQuestionIds.length} selected</span>
                          <button
                            className="btn btn-danger btn-sm"
                            type="button"
                            disabled={!selectedQuestionIds.length || deletingQuestions}
                            onClick={() => { setBulkDeleteError(''); setConfirmBulkDelete(true); }}
                          >
                            <Trash2 size={14} /> Delete selected
                          </button>
                        </div>
                      )}
                      {bulkDeleteError && <p className={styles.bulkDeleteError} role="alert">{bulkDeleteError}</p>}
                      {questions.length === 0 ? (
                        <div className="empty-state">
                          <div className="empty-state-icon"><BookOpen size={36} /></div>
                          <div className="empty-state-text">No questions yet</div>
                        </div>
                      ) : (
                        <div className={styles.questionList}>
                          {questions.map((q) => (
                            <div key={q.questionId} className={styles.questionItem}>
                              <div className={styles.questionItemTop}>
                                {can('manageAssessmentQuestions') && (
                                  <input
                                    type="checkbox"
                                    aria-label={`Select question: ${q.questionText}`}
                                    checked={selectedQuestionIds.includes(q.questionId)}
                                    onChange={() => setSelectedQuestionIds((current) => current.includes(q.questionId)
                                      ? current.filter((id) => id !== q.questionId)
                                      : [...current, q.questionId])}
                                  />
                                )}
                                <div className={styles.questionItemText}>{q.questionText}</div>
                                <div className={styles.questionItemActions}>
                                  {can('manageAssessmentQuestions') && (
                                    <>
                                      <button className="btn btn-ghost btn-sm" aria-label="Edit question" onClick={() => openEditForm(q)}><Pencil size={13} /></button>
                                      <button className="btn btn-ghost btn-sm" aria-label="Delete question" onClick={() => setDeletingQuestion(q)}><Trash2 size={13} /></button>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className={styles.questionItemMeta}>
                                <span className={styles.qBadge}>{q.category}</span>
                                <span className={styles.qBadge}>{q.points} pts</span>
                                {q.answerKey && <span className={styles.qBadge}>Has Answer Key</span>}
                              </div>
                              {q.choices?.length > 0 && (
                                <div className={styles.questionItemOptions}>
                                  {q.choices.map((c, i) => (
                                    <span key={i} className={`${styles.optionPill} ${q.answerKey?.correctChoiceId === c.choiceId ? styles.optionCorrect : ''}`}>
                                      {q.answerKey?.correctChoiceId === c.choiceId && '✓ '}{c.choiceText}
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

{qTab === 'assessments' && (
                <div className="card">
                  <div className="card-body p-0">
                    <AssessmentAttemptsTable skillId={selectedCategory.skillId} />
                  </div>
                </div>
              )}

              <ConfirmModal open={!!deletingQuestion} title="Delete Question"
                message={`Remove this question?`}
                confirmLabel="Delete" variant="danger" onConfirm={handleDeleteQuestion} onCancel={() => setDeletingQuestion(null)} />
              <ConfirmModal
                open={confirmBulkDelete}
                title={`Delete ${selectedQuestionIds.length} question${selectedQuestionIds.length === 1 ? '' : 's'}?`}
                message="This permanently deletes the selected questions and their answer choices. Questions with assessment attempt history cannot be deleted."
                confirmLabel={deletingQuestions
                  ? 'Deleting…'
                  : `Delete ${selectedQuestionIds.length} question${selectedQuestionIds.length === 1 ? '' : 's'}`}
                variant="danger"
                onConfirm={handleBulkDelete}
                onCancel={() => { if (!deletingQuestions) setConfirmBulkDelete(false); }}
              />
            </div>
          </>
        )}
      </>
    )}
  </div>
);
}
