export function focusAssessmentEditor(container, input) {
  if (input) {
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
  }

  if (!container) return;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const behavior = reduceMotion ? 'auto' : 'smooth';
  if (!container.scrollIntoView) {
    const scrollContainer = container.closest?.('.app-main');
    const rect = container.getBoundingClientRect?.();
    if (scrollContainer && rect) {
      const parentRect = scrollContainer.getBoundingClientRect();
      const top = scrollContainer.scrollTop + rect.top - parentRect.top;
      if (scrollContainer.scrollTo) scrollContainer.scrollTo({ top, behavior });
      else scrollContainer.scrollTop = top;
    } else if (rect) {
      window.scrollTo({ top: window.scrollY + rect.top, behavior });
    }
    return;
  }
  try {
    container.scrollIntoView({ behavior, block: 'start', inline: 'nearest' });
  } catch {
    container.scrollIntoView(true);
  }
}

export function updateAssessmentEditHistory(questionId) {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const state = { ...(window.history.state || {}) };
  if (questionId) state.assessmentEditQuestionId = questionId;
  else delete state.assessmentEditQuestionId;
  window.history.replaceState(state, '', window.location.href);
}
