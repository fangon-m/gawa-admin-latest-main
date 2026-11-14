import React, { useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import * as assessmentQuestionsApi from '../../api/assessmentQuestions';
import { ASSESSMENT_IMPORT_TEMPLATE, readAssessmentImportFile } from '../../utils/assessmentImport';
import styles from './AssessmentQuestionImport.module.css';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = /\.(xlsx|xls|csv)$/i;

export default function AssessmentQuestionImport({ assessmentId, skillId, skillName, onImported }) {
  const [file, setFile] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  const handleFile = async (event) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    setFile(null);
    setQuestions([]);
    setErrors([]);
    setMessage('');
    if (!selectedFile) return;
    if (!ALLOWED_EXTENSIONS.test(selectedFile.name)) {
      setErrors([{ row: 1, field: 'file', message: 'Choose an .xlsx, .xls, or .csv file.' }]);
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setErrors([{ row: 1, field: 'file', message: 'The file must be 5 MB or smaller.' }]);
      return;
    }
    setFile(selectedFile);
    try {
      const parsed = await readAssessmentImportFile(selectedFile);
      setQuestions(parsed.questions);
      setErrors(parsed.errors);
    } catch (error) {
      setErrors([{ row: 1, field: 'file', message: `Could not read the workbook: ${error.message || 'Invalid file.'}` }]);
    }
  };

  const handleImport = async () => {
    if ((!assessmentId && !skillId) || !file || errors.length || !questions.length || busy) return;
    setBusy(true);
    setProgress(0);
    setMessage('');
    try {
      const result = await assessmentQuestionsApi.importAssessmentQuestions({ assessmentId, skillId, skillName }, file, setProgress);
      const summary = result.data || {};
      const duplicates = summary.duplicates || [];
      const duplicateRows = duplicates.map((duplicate) => duplicate.rowNumber).join(', ');
      const createdAssessment = summary.assessmentCreated ? ` Created "${summary.assessmentTitle}".` : '';
      setMessage(`${summary.insertedCount || 0} questions imported; ${duplicates.length} duplicates skipped.${duplicateRows ? ` Duplicate rows: ${duplicateRows}.` : ''}${createdAssessment}`);
      setFile(null);
      setQuestions([]);
      try {
        await onImported?.();
      } catch {
        setMessage('Import succeeded, but the question list could not refresh. Reload the page to view the imported questions.');
      }
    } catch (error) {
      setErrors(error.details || [{ row: 1, field: 'import', message: error.error || error.message || 'Import failed. No questions were committed.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.panel} aria-label="Excel question import">
      <div className={styles.toolbar}>
        <label className={`btn btn-outline btn-sm ${styles.uploadLabel} ${(!assessmentId && !skillId) || busy ? styles.uploadLabelDisabled : ''}`}>
          <Upload size={14} /> Upload Excel
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            aria-label="Upload Excel question file"
            disabled={(!assessmentId && !skillId) || busy}
            onChange={handleFile}
            className={styles.fileInput}
          />
        </label>
        <a
          className="btn btn-ghost btn-sm"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(ASSESSMENT_IMPORT_TEMPLATE)}`}
          download="assessment-questions-template.csv"
        >
          <Download size={14} /> Sample template
        </a>
        {!assessmentId && skillId && (
          <span className={styles.hint}>Uploading will create an assessment for {skillName || 'this skill'}.</span>
        )}
        {!assessmentId && !skillId && <span className={styles.hint}>Select a skill to import questions.</span>}
      </div>

      {errors.length > 0 && !file && (
        <ul className={styles.errors} role="alert">
          {errors.map((error, index) => (
            <li key={`${error.row}-${error.field}-${index}`}>Row {error.row}, {error.field}: {error.message}</li>
          ))}
        </ul>
      )}
      {file && (
        <div className={styles.preview}>
          <div className={styles.fileName}><FileSpreadsheet size={16} /> {file.name}</div>
          <p className={styles.hint}>Previewing {questions.length} valid question{questions.length === 1 ? '' : 's'}.</p>
          {questions.length > 0 && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Question</th><th>Options</th><th>Correct answer</th><th>Part</th></tr></thead>
                <tbody>
                  {questions.slice(0, 10).map((question) => (
                    <tr key={question.rowNumber}>
                      <td>{question.questionText}</td>
                      <td>{question.choices.map((choice) => choice.choiceText).join(' · ')}</td>
                      <td>{question.choices[question.correctChoiceIndex]?.choiceText}</td>
                      <td>{question.partNo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {errors.length > 0 && (
            <ul className={styles.errors} role="alert">
              {errors.slice(0, 20).map((error, index) => (
                <li key={`${error.row}-${error.field}-${index}`}>Row {error.row}, {error.field}: {error.message}</li>
              ))}
              {errors.length > 20 && <li>{errors.length - 20} more validation errors omitted.</li>}
            </ul>
          )}
          {busy && (
            <div className={styles.progressGroup}>
              <progress aria-label="Upload progress" max="100" value={progress} />
              <span>{progress}%</span>
            </div>
          )}
          <div className={styles.actions}>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={(!assessmentId && !skillId) || !questions.length || errors.length > 0 || busy}
              onClick={handleImport}
            >
              {busy ? 'Importing…' : `Import ${questions.length} questions`}
            </button>
            <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => {
              setFile(null);
              setQuestions([]);
              setErrors([]);
              setMessage('');
            }}>
              Clear
            </button>
          </div>
        </div>
      )}
      {message && <p className={styles.success} role="status">{message}</p>}
    </section>
  );
}
