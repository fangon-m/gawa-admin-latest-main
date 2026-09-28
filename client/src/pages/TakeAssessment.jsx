import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApiData, useMutation } from '../utils/useApiData';
import * as categoriesApi from '../api/categories';
import * as assessmentsApi from '../api/assessments';
import { capitalizeWords } from '../utils/helpers';
import Header from '../components/layout/Header';
import ConfirmModal from '../components/common/ConfirmModal';
import { ChevronLeft, ChevronRight, Send, Clock } from 'lucide-react';
import styles from './TakeAssessment.module.css';

export default function TakeAssessment() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: category } = useApiData(() => categoriesApi.getById(categoryId), [categoryId], {
    defaultValue: null,
    immediate: !!categoryId,
  });

  const { data: allQuestions } = useApiData(
    () => assessmentsApi.listQuestions({ categoryId, limit: 200 }),
    [categoryId],
    { defaultValue: [], immediate: !!categoryId, transform: (r) => r?.data ?? r ?? [] },
  );

  const [doCreateAssessment] = useMutation(assessmentsApi.create);
  const [doUpdateAssessment] = useMutation(assessmentsApi.update);
  const [doAddResponse] = useMutation(assessmentsApi.addResponse);

  const filteredQs = useMemo(() => allQuestions.filter((q) => q.isActive !== false), [allQuestions]);
  const current = filteredQs[currentIdx];
  const totalQuestions = filteredQs.length;
  const answeredCount = Object.keys(answers).length;
  const progressPct = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const setAnswer = useCallback((questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!category) return;

    try {
      const assessmentRes = await doCreateAssessment({ userId: currentUser?.id, categoryId: category.id });
      const assessmentId = assessmentRes?.id || assessmentRes?.data?.id;

      let totalScore = 0;
      let totalPossible = 0;

      for (const q of filteredQs) {
        const userAnswer = answers[q.id] || '';
        let isCorrect = null;
        let score = 0;

        if (q.type === 'multiple_choice' || q.type === 'true_false') {
          isCorrect = userAnswer === q.correctAnswer;
          score = isCorrect ? q.points : 0;
        } else {
          isCorrect = null;
          score = 0;
        }

        totalScore += score;
        totalPossible += (q.points || 0);

        await doAddResponse(assessmentId, {
          questionId: q.id,
          answer: userAnswer,
          isCorrect,
          score,
          feedback: null,
        });
      }

      const isComplete = totalQuestions === answeredCount;

      await doUpdateAssessment(assessmentId, {
        status: isComplete ? 'completed' : 'in_progress',
        score: totalScore,
        totalPoints: totalPossible,
        completedAt: isComplete ? new Date().toISOString() : null,
      });

      setResult({ assessmentId, score: totalScore, totalPoints: totalPossible, answers });
      setSubmitted(true);
    } catch {
      // submission failed
    }
    setShowConfirm(false);
  }, [category, currentUser, filteredQs, answers, totalQuestions, answeredCount,
      doCreateAssessment, doUpdateAssessment, doAddResponse]);

  const handleFinish = () => setShowConfirm(true);

  if (!category && !submitted) {
    return (
      <div>
        <Header title="Assessment" />
        <div className="empty-state">
          <div className="empty-state-text">Category not found</div>
          <button className="btn btn-outline mt-4" onClick={() => navigate('/assessments')}>Back</button>
        </div>
      </div>
    );
  }

  if (submitted && result) {
    const autoGraded = filteredQs.filter((q) => q.type !== 'descriptive').length;
    const manualGraded = filteredQs.filter((q) => q.type === 'descriptive').length;
    const autoCorrect = filteredQs.filter(
      (q) => q.type !== 'descriptive' && answers[q.id] === q.correctAnswer
    ).length;
    const pct = result.totalPoints > 0 ? Math.round((result.score / result.totalPoints) * 100) : 0;

    return (
      <div>
        <Header title={`${category?.name || 'Assessment'} — Results`} />
        <div className={styles.resultContainer}>
          <div className={styles.resultCard}>
            <div className={styles.resultScore}>{result.score}/{result.totalPoints}</div>
            <div className={styles.resultPct}>{pct}%</div>
            <div className={styles.resultLabel}>
              {pct >= 80 ? 'Excellent!' : pct >= 60 ? 'Good' : pct >= 40 ? 'Fair' : 'Needs Improvement'}
            </div>
          </div>
          <div className={styles.resultDetail}>
            <div className={styles.resultStat}>
              <span className={styles.resultStatLabel}>Questions Answered</span>
              <span className={styles.resultStatValue}>{answeredCount}/{totalQuestions}</span>
            </div>
            <div className={styles.resultStat}>
              <span className={styles.resultStatLabel}>Auto-Graded Correct</span>
              <span className={styles.resultStatValue}>{autoCorrect}/{autoGraded}</span>
            </div>
            {manualGraded > 0 && (
              <div className={styles.resultStat}>
                <span className={styles.resultStatLabel}>Pending Review</span>
                <span className={styles.resultStatValue}>{manualGraded} descriptive</span>
              </div>
            )}
          </div>
          <div className={styles.resultActions}>
            <button className="btn btn-primary" onClick={() => navigate('/assessments')}>
              Back to Assessments
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title={`Assessment: ${category?.name || ''}`} />
      <div className={styles.container}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>
        <div className={styles.progressInfo}>
          <span><Clock size={14} /> Question {currentIdx + 1} of {totalQuestions}</span>
          <span>{answeredCount} answered</span>
        </div>

        {filteredQs.length === 0 ? (
          <div className="empty-state" style={{ marginTop: '2rem' }}>
            <div className="empty-state-text">No questions available</div>
            <div className="empty-state-sub">This category has no assessment questions yet.</div>
            <button className="btn btn-outline mt-4" onClick={() => navigate('/assessments')}>Back</button>
          </div>
        ) : (
          <>
            <div className={styles.questionCard}>
              <div className={styles.questionHeader}>
                <span className={styles.qTypeBadge}>
                  {current.type === 'multiple_choice' ? 'Multiple Choice' :
                   current.type === 'true_false' ? 'True/False' : 'Descriptive'}
                </span>
                <span className={styles.qDifficultyBadge}>{capitalizeWords(current.difficulty)}</span>
                <span className={styles.qPointsBadge}>{current.points} pts</span>
              </div>
              <div className={styles.questionText}>{current.question || current.text}</div>

              {current.type === 'multiple_choice' && (
                <div className={styles.optionsList}>
                  {current.options.map((opt, i) => (
                    <div
                      key={i}
                      className={`${styles.optionItem} ${answers[current.id] === opt ? styles.optionSelected : ''}`}
                      onClick={() => setAnswer(current.id, opt)}
                    >
                      <div className={styles.optionRadio}>
                        {answers[current.id] === opt && <div className={styles.optionRadioFill} />}
                      </div>
                      <span>{opt}</span>
                    </div>
                  ))}
                </div>
              )}

              {current.type === 'true_false' && (
                <div className={styles.optionsList}>
                  {['True', 'False'].map((opt) => (
                    <div
                      key={opt}
                      className={`${styles.optionItem} ${answers[current.id] === opt ? styles.optionSelected : ''}`}
                      onClick={() => setAnswer(current.id, opt)}
                    >
                      <div className={styles.optionRadio}>
                        {answers[current.id] === opt && <div className={styles.optionRadioFill} />}
                      </div>
                      <span>{opt}</span>
                    </div>
                  ))}
                </div>
              )}

              {current.type === 'descriptive' && (
                <div className={styles.descArea}>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    placeholder="Type your answer here..."
                    value={answers[current.id] || ''}
                    onChange={(e) => setAnswer(current.id, e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className={styles.navBar}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                disabled={currentIdx === 0}
              >
                <ChevronLeft size={16} /> Previous
              </button>

              <div className={styles.navDots}>
                {filteredQs.map((q, i) => (
                  <div
                    key={q.id}
                    className={`${styles.navDot} ${i === currentIdx ? styles.navDotActive : ''} ${answers[q.id] ? styles.navDotAnswered : ''}`}
                    onClick={() => setCurrentIdx(i)}
                  />
                ))}
              </div>

              {currentIdx < totalQuestions - 1 ? (
                <button className="btn btn-outline btn-sm" onClick={() => setCurrentIdx((i) => i + 1)}>
                  Next <ChevronRight size={16} />
                </button>
              ) : (
                <button className="btn btn-accent btn-sm" onClick={handleFinish}>
                  <Send size={14} /> Submit
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <ConfirmModal
        open={showConfirm}
        title="Submit Assessment"
        message={`You have answered ${answeredCount} of ${totalQuestions} questions. Unanswered questions will receive zero points. Submit now?`}
        confirmLabel="Submit"
        variant="primary"
        onConfirm={handleSubmit}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
