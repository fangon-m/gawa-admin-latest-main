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
  const [tab, setTab] = useState('questions');
  const [qSearch, setQSearch] = useState('');
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

  const skillAssessments = useMemo(() => {
    if (!selectedSkill) return [];
    return allSkillAssessments.filter((sa) => sa.skillId === selectedSkill.skillId);
  }, [selectedSkill, allSkillAssessments]);

  const questions = useMemo(() => {
    if (!selectedAssessment) return [];
    const qs = allQuestions.filter((q) => q.assessmentId === selectedAssessment.assessmentId);
    if (qSearch) {
      const q = qSearch.toLowerCase();
      return qs.filter((x) => (x.questionText || '').toLowerCase().includes(q));
    }
    return qs;
  }, [selectedAssessment, allQuestions, qSearch]);

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
    setQForm({
      question: q.questionText,
      questionType: 'multiple_choice',
      difficulty: 'beginner',
      points: q.points,
      options: opts,
      correctAnswer: q.answerKey?.correctChoiceId || '',
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

  return (
    <div>
      <Header title={`Assessments - {selectedSkill.skillName}`} />
      <div className={styles.toolbar}>
        <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedSkill(null); setSelectedAssessment(null); setShowForm(false); setEditingQuestion(null); }}>
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
              <div key={assessment.assessmentId} className={styles.categoryCard} onClick={() => setSelectedAssessment(assessment)}>
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
}
