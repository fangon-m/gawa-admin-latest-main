import { describe, expect, it, vi } from 'vitest';
import { focusAssessmentEditor, updateAssessmentEditHistory } from './assessmentEditor';

describe('assessment question editor navigation', () => {
  it('focuses the question without scrolling it into the browser default position, then scrolls the editor into view', () => {
    const input = { focus: vi.fn() };
    const container = { scrollIntoView: vi.fn() };
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });

    focusAssessmentEditor(container, input);

    expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(container.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
    });
  });

  it('updates the current history entry without creating an anchor jump', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    updateAssessmentEditHistory('question-123');
    expect(window.history.state.assessmentEditQuestionId).toBe('question-123');
    updateAssessmentEditHistory(null);
    expect(window.history.state.assessmentEditQuestionId).toBeUndefined();
    expect(replaceState).toHaveBeenCalledTimes(2);
  });

  it('scrolls the main content container when scrollIntoView is unavailable', () => {
    const scrollTo = vi.fn();
    const scrollContainer = {
      scrollTop: 10,
      scrollTo,
      getBoundingClientRect: () => ({ top: 20 }),
    };
    const container = {
      closest: () => scrollContainer,
      getBoundingClientRect: () => ({ top: 120 }),
    };
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });

    focusAssessmentEditor(container, null);

    expect(scrollTo).toHaveBeenCalledWith({ top: 110, behavior: 'auto' });
  });
});
