import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../utils/permissions';
import { useApiData, useMutation } from '../utils/useApiData';
import * as skillsApi from '../api/skills';
import * as skillAssessmentsApi from '../api/skillAssessments';
import * as assessmentQuestionsApi from '../api/assessmentQuestions';
import { formatDate, capitalizeWords } from '../utils/helpers';
import Header from '../components/layout/Header';
import SearchBar from '../components/common/SearchBar';
import StatusBadge from '../components/common/StatusBadge';
import ConfirmModal from '../components/common/ConfirmModal';
import Tabs from '../components/common/Tabs';
import DataTable from '../components/common/DataTable';
import AssessmentQuestionImport from '../components/assessments/AssessmentQuestionImport';
import { Plus, Pencil, Trash2, X, Save, ChevronLeft, ClipboardCheck, BookOpen, Zap, Wrench, Hammer } from 'lucide-react';
import * as lucideIcons from 'lucide-react';
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
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [selectedAssessment, setSelectedAssessment] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [deletingQuestion, setDeletingQuestion] = useState(null);
  const [deactivatingQuestion, setDeactivatingQuestion] = useState(null);
  const [confirmBulkDeactivate, setConfirmBulkDeactivate] = useState(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState([]);
  const [questionActionFeedback, setQuestionActionFeedback] = useState(null);
  const [tab, setTab] = useState('questions');
  const [qSearch, setQSearch] = useState('');
  const [questionStatusFilter, setQuestionStatusFilter] = useState('active');
  const [qForm, setQForm] = useState({
    question: '', questionType: 'multiple_choice', difficulty: 'beginner',
    points: 10, options: ['', '', '', ''], correctAnswer: '',
  });

  const { data: allSkills, refetch: refetchSkills } = useApiData(() => skillsApi.listSkills(), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });

  const { data: allSkillAssessments, refetch: refetchSkillAssessments } = useApiData(() => skillAssessmentsApi.listSkillAssessments({ limit: 100 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });

  const { data: allQuestions, refetch: refetchQs } = useApiData(() => assessmentQuestionsApi.listAssessmentQuestions({ limit: 500 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });

  const [doCreateQuestion] = useMutation(assessmentQuestionsApi.createAssessmentQuestion);
  const [doUpdateQuestion] = useMutation(assessmentQuestionsApi.updateAssessmentQuestion);
  const [doDeleteQuestion] = useMutation(assessmentQuestionsApi.deleteAssessmentQuestion);
  const [doDeactivateQuestion] = useMutation((id) => assessmentQuestionsApi.updateAssessmentQuestion(id, { isActive: false }));

  const skillAssessments = useMemo(() => {
    if (!selectedSkill) return [];
    return allSkillAssessments.filter((sa) => sa.skillId === selectedSkill.skillId);
  }, [selectedSkill, allSkillAssessments]);

  const questions = useMemo(() => {
    if (!selectedAssessment) return [];
    const qs = allQuestions.filter((q) => q.assessmentId === selectedAssessment.assessmentId);
    const statusFiltered = qs.filter((question) => questionStatusFilter === 'inactive'
      ? question.isActive === false
      : question.isActive !== false);
    return qSearch
      ? statusFiltered.filter((x) => (x.questionText || '').toLowerCase().includes(qSearch.toLowerCase()))
      : statusFiltered;
  }, [selectedAssessment, allQuestions, qSearch, questionStatusFilter]);
  const allVisibleQuestionsSelected = questions.length > 0 &&
    questions.every((question) => selectedQuestionIds.includes(question.questionId));
  const selectedActiveQuestionIds = selectedQuestionIds.filter((id) =>
    allQuestions.some((question) => question.questionId === id && question.assessmentId === selectedAssessment?.assessmentId && question.isActive !== false)
  );

  const activeSkills = useMemo(() => allSkills.filter((s) => s.isActive !== false), [allSkills]);

  const openNewForm = () => {
    setEditingQuestion(null);
    setQForm({ question: '', questionType: 'multiple_choice', difficulty: 'beginner', points: 10, options: ['', '', '', ''], correctAnswer: '' });
    setShowForm(true);
  };

  const openEditForm = (q) => {
    setEditingQuestion(q);
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
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!qForm.question.trim() || !selectedAssessment) return;
    if (qForm.questionType === 'multiple_choice' && qForm.options.filter((o) => o.trim()).length < 2) return;

    const choices = qForm.options.filter((o) => o.trim()).map((opt, i) => ({
      choiceText: opt,
      sortOrder: i,
    }));
    const correctChoiceIndex = choices.findIndex(c => c.choiceText === qForm.correctAnswer);

    const data = {
      assessmentId: selectedAssessment.assessmentId,
      partNo: 1,
      category: 'general',
      questionText: qForm.question.trim(),
      explanation: '',
      choices,
      correctChoiceId: correctChoiceIndex >= 0 ? correctChoiceIndex : undefined,
    };

    try {
      if (editingQuestion) {
        await doUpdateQuestion(editingQuestion.questionId, data);
      } else {
        await doCreateQuestion(data);
      }
      setShowForm(false);
      setEditingQuestion(null);
      refetchQs();
    } catch (err) { console.error('Save question failed:', err); }
  };

  const handleDelete = async () => {
    try {
      await doDeleteQuestion(deletingQuestion.questionId);
      setDeletingQuestion(null);
      refetchQs();
    } catch (err) { console.error('Delete question failed:', err); }
  };

  const handleDeactivate = async () => {
    if (!deactivatingQuestion) return;
    try {
      await doDeactivateQuestion(deactivatingQuestion.questionId);
      setSelectedQuestionIds((current) => current.filter((id) => id !== deactivatingQuestion.questionId));
      setQuestionActionFeedback({ type: 'success', message: 'Question deactivated.' });
      setDeactivatingQuestion(null);
      await refetchQs();
    } catch (err) {
      setQuestionActionFeedback({
        type: 'error',
        message: err?.status === 409
          ? err?.error || 'This question has attempt history. Deactivate it and add a replacement question instead.'
          : err?.error || err?.message || 'Could not deactivate this question.',
      });
      setDeactivatingQuestion(null);
    }
  };

  const handleBulkDeactivate = async () => {
    if (!selectedActiveQuestionIds.length) return;
    setQuestionActionFeedback(null);
    const results = await Promise.allSettled(
      selectedActiveQuestionIds.map((id) => assessmentQuestionsApi.updateAssessmentQuestion(id, { isActive: false }))
    );
    const succeededIds = selectedActiveQuestionIds.filter((_, index) => results[index].status === 'fulfilled');
    const failures = results.filter((result) => result.status === 'rejected');
    setSelectedQuestionIds((current) => current.filter((id) => !succeededIds.includes(id)));
    setConfirmBulkDeactivate(false);
    await refetchQs();
    if (failures.length) {
      const conflict = failures.find((result) => result.reason?.status === 409);
      setQuestionActionFeedback({
        type: 'error',
        message: `${succeededIds.length} question(s) deactivated; ${failures.length} could not be deactivated.${conflict?.reason?.error ? ` ${conflict.reason.error}` : ''}`,
      });
      return;
    }
    setQuestionActionFeedback({ type: 'success', message: `${succeededIds.length} questions deactivated.` });
  };

  const totalPoints = useMemo(() => questions.reduce((sum, q) => sum + (q.points || 0), 0), [questions]);

  const questionTypeLabel = (type) => QUESTION_TYPES.find((t) => t.value === type)?.label || type;

  const renderSkillIcon = (icon) => {
    if (!icon) return <BookOpen size={24} />;
    const trimmed = icon.trim();
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('data:')) {
      return <img src={trimmed} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />;
    }
    const normalized = trimmed.toLowerCase().replace(/[-_\s]/g, '');
    const lucideMatch = Object.keys(lucideIcons).find(k => k.toLowerCase() === normalized);
    if (lucideMatch && lucideIcons[lucideMatch]) {
      const Icon = lucideIcons[lucideMatch];
      return <Icon size={24} />;
    }
    return <span role="img" aria-label={icon} style={{ fontSize: 24 }}>{icon}</span>;
  };

  if (!selectedSkill) {
    return (
      <div>
        <Header title="Skill Assessments" />
        <div className={styles.categoryGrid}>
          {activeSkills.map((skill) => (
            <div key={skill.skillId} className={styles.categoryCard} onClick={() => setSelectedSkill(skill)}>
              <div className={styles.categoryCardIcon}>{renderSkillIcon(skill.icon)}</div>
              <div className={styles.categoryCardName}>{skill.skillName}</div>
              <div className={styles.categoryCardDesc}>{skill.description}</div>
              <div className={styles.categoryCardMeta}>
                <span>{skillAssessments.length > 0 ? skillAssessments.filter(sa => sa.skillId === skill.skillId).length : 0} assessments</span>
              </div>
            </div>
          ))}
          {activeSkills.length === 0 && (
            <div className="empty-state" style={{ gridColumn: '1/-1' }}>
              <div className="empty-state-text">No skills available</div>
              <div className="empty-state-sub">Create skills in Jobs &gt; Manage Skills first</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!selectedAssessment) return (
    <div>
      <Header title={`Assessments - ${selectedSkill.skillName}`} />
      <div className={styles.toolbar}>
        <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedSkill(null); setSelectedAssessment(null); setShowForm(false); setEditingQuestion(null); setSelectedQuestionIds([]); }}>
          <ChevronLeft size={16} /> All Skills
        </button>
        <div className={styles.toolbarStats}>
          <span>{skillAssessments.length} assessments</span>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {skillAssessments.map((assessment) => (
              <div key={assessment.assessmentId} className={styles.categoryCard} onClick={() => { setSelectedAssessment(assessment); setSelectedQuestionIds([]); }}>
                <div className={styles.categoryCardIcon}><ClipboardCheck size={24} /></div>
                <div className={styles.categoryCardName}>{assessment.title}</div>
                <div className={styles.categoryCardDesc}>{assessment.description}</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.6875rem', padding: '0.125rem 0.4375rem', borderRadius: 'var(--radius-full)', background: '#EEF2F6', color: '#475569', fontWeight: 500 }}>
                    {assessment.questionsPerCategory} questions per category
                  </span>
                  <span style={{ fontSize: '0.6875rem', padding: '0.125rem 0.4375rem', borderRadius: 'var(--radius-full)', background: '#EEF2F6', color: '#475569', fontWeight: 500 }}>
                    {assessment.timeLimitMinutes} min
                  </span>
                </div>
                <div className={styles.categoryCardMeta}>
                  <span>Passing: {assessment.passingPercent}%</span>
                  <span>{assessment.isActive ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
            ))}
            {skillAssessments.length === 0 && (
              <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                <div className="empty-state-text">No assessments for this skill</div>
                <div className="empty-state-sub">Create assessments from Jobs &gt; Manage Skills</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <Header title={selectedAssessment.title} />
      <div className={styles.toolbar}>
        <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedAssessment(null); setQSearch(''); setSelectedQuestionIds([]); }}>
          <ChevronLeft size={16} /> All Assessments
        </button>
        <div className={styles.toolbarStats}>
          <span>Question set: {selectedSkill.skillName} — {selectedAssessment.title}</span>
          <span>{questions.length} questions</span>
          <span>{selectedAssessment.timeLimitMinutes} min</span>
          <span>Passing: {selectedAssessment.passingPercent}%</span>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <SearchBar value={qSearch} onChange={setQSearch} placeholder="Search questions..." />
          <select className="form-select" aria-label="Filter questions by status" value={questionStatusFilter}
            onChange={(event) => setQuestionStatusFilter(event.target.value)}>
            <option value="active">Active questions</option>
            <option value="inactive">Deactivated questions</option>
          </select>
        </div>
        {can('manageAssessmentQuestions') && (
          <AssessmentQuestionImport
            assessmentId={selectedAssessment.assessmentId}
            skillId={selectedSkill.skillId}
            skillName={selectedSkill.skillName}
            onImported={refetchQs}
          />
        )}
        {questionActionFeedback && (
          <p className={questionActionFeedback.type === 'error' ? styles.bulkDeleteError : styles.questionActionSuccess}
            role={questionActionFeedback.type === 'error' ? 'alert' : 'status'}>
            {questionActionFeedback.message}
          </p>
        )}
        <div className="card-body">
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
              <button className="btn btn-outline btn-sm" type="button"
                disabled={!selectedActiveQuestionIds.length}
                onClick={() => setConfirmBulkDeactivate(true)}>
                Deactivate selected ({selectedActiveQuestionIds.length})
              </button>
            </div>
          )}
          {questions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><BookOpen size={36} /></div>
              <div className="empty-state-text">{qSearch || questionStatusFilter === 'inactive' ? 'No questions match this filter' : 'No questions yet'}</div>
              {!qSearch && questionStatusFilter === 'active' && can('manageAssessmentQuestions') && (
                <div className="empty-state-sub">Upload an Excel or CSV file to add questions to this assessment.</div>
              )}
            </div>
          ) : (
            <div className={styles.questionList}>
              {questions.map((question) => (
                <div key={question.questionId} className={styles.questionItem}>
                  <div className={styles.questionItemTop}>
                    {can('manageAssessmentQuestions') && (
                      <input
                        type="checkbox"
                        aria-label={`Select question: ${question.questionText}`}
                        checked={selectedQuestionIds.includes(question.questionId)}
                        onChange={() => setSelectedQuestionIds((current) => current.includes(question.questionId)
                          ? current.filter((id) => id !== question.questionId)
                          : [...current, question.questionId])}
                      />
                    )}
                    <div className={styles.questionItemText}>{question.questionText}</div>
                    {can('manageAssessmentQuestions') && question.isActive !== false && (
                      <button className="btn btn-outline btn-sm" type="button"
                        onClick={() => setDeactivatingQuestion(question)}>
                        Deactivate
                      </button>
                    )}
                  </div>
                  <div className={styles.questionItemMeta}>
                    <span className={styles.qBadge}>{question.category || 'general'}</span>
                    <span className={styles.qBadge}>Part {question.partNo}</span>
                    {question.isActive === false && <span className={`${styles.qBadge} ${styles.qBadgeInactive}`}>Inactive</span>}
                    {question.answerKey && <span className={styles.qBadge}>Has Answer Key</span>}
                  </div>
                  {question.choices?.length > 0 && (
                    <div className={styles.questionItemOptions}>
                      {question.choices.map((choice) => (
                        <span
                          key={choice.choiceId}
                          className={`${styles.optionPill} ${question.answerKey?.correctChoiceId === choice.choiceId ? styles.optionCorrect : ''}`}
                        >
                          {question.answerKey?.correctChoiceId === choice.choiceId && '✓ '}
                          {choice.choiceText}
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
      <ConfirmModal
        open={!!deactivatingQuestion}
        title="Deactivate Question"
        message="This question will no longer be available for future assessment attempts. Existing attempt history will be preserved."
        confirmLabel="Deactivate"
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivatingQuestion(null)}
      />
      <ConfirmModal
        open={confirmBulkDeactivate}
        title={`Deactivate ${selectedActiveQuestionIds.length} question${selectedActiveQuestionIds.length === 1 ? '' : 's'}?`}
        message="Selected active questions will no longer be available for future attempts. Existing assessment history will be preserved."
        confirmLabel={`Deactivate ${selectedActiveQuestionIds.length} question${selectedActiveQuestionIds.length === 1 ? '' : 's'}`}
        onConfirm={handleBulkDeactivate}
        onCancel={() => setConfirmBulkDeactivate(false)}
      />
    </div>
  );
}
