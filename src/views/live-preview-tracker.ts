import type { ChapterNode } from '../types';

export interface LivePreviewTrackerOptions {
  container: HTMLElement;
  onActiveChapter: (index: number) => void;
  /** Set false when an existing renderer already established the initial UI state. */
  trackImmediately?: boolean;
}

interface RenderedChapterCandidate {
  element: Element;
  chapterIndex: number;
}

const CANDIDATE_SELECTOR = '.cm-line, .cm-heading';
const CANDIDATE_CLASS_PATTERN = /(^|\s)(cm-line|cm-heading)(\s|$)/;

/** CodeMirror 6 tracker. It only reads geometry inside a scheduled frame. */
export class LivePreviewTracker {
  private readonly options: LivePreviewTrackerOptions;
  private chapters: ChapterNode[] = [];
  private lineToChapterIndex = new Map<number, number>();
  private renderedCandidates: RenderedChapterCandidate[] = [];
  private candidatesDirty = true;
  private frame: number | null = null;
  private disposed = false;
  private lastActiveIndex = -1;
  private readonly observer: MutationObserver | null;

  constructor(options: LivePreviewTrackerOptions) {
    this.options = options;
    this.options.container.addEventListener('scroll', this.schedule, { passive: true });

    this.observer = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver((records) => {
        let shouldSchedule = false;
        let shouldRefreshCandidates = false;

        for (const record of records) {
          const impact = this.getMutationImpact(record);
          if (impact === 'refresh') {
            shouldSchedule = true;
            shouldRefreshCandidates = true;
            break;
          }
          if (impact === 'layout') shouldSchedule = true;
        }

        if (!shouldSchedule) return;
        if (shouldRefreshCandidates) this.candidatesDirty = true;
        this.schedule();
      });
    this.observer?.observe(this.options.container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['class', 'data-line'],
    });
  }

  setChapters(chapters: ChapterNode[]): void {
    this.chapters = chapters;
    this.lineToChapterIndex = new Map(chapters.map((chapter, index) => [chapter.line, index]));
    this.renderedCandidates = [];
    this.candidatesDirty = true;
    this.lastActiveIndex = -1;
    if (this.options.trackImmediately !== false) this.schedule();
  }

  private readonly schedule = (): void => {
    if (this.frame !== null || this.disposed) return;
    let executedSynchronously = false;
    const frame = requestAnimationFrame(() => {
      executedSynchronously = true;
      this.frame = null;
      this.update();
    });
    this.frame = executedSynchronously ? null : frame;
  };

  private isCandidateElement(value: unknown): boolean {
    if (!value || typeof (value as Element).matches !== 'function') return false;
    return (value as Element).matches(CANDIDATE_SELECTOR);
  }

  private containsCandidate(value: unknown): boolean {
    if (!value) return false;
    const node = value as Element;
    if (typeof node.matches === 'function' && node.matches(CANDIDATE_SELECTOR)) return true;
    return typeof node.querySelector === 'function' && Boolean(node.querySelector(CANDIDATE_SELECTOR));
  }

  private isInsideCandidate(value: unknown): boolean {
    if (!value) return false;
    const node = value as Element;
    if (this.isCandidateElement(node)) return true;
    return typeof node.closest === 'function' && Boolean(node.closest(CANDIDATE_SELECTOR));
  }

  private getMutationImpact(record: MutationRecord): 'none' | 'layout' | 'refresh' {
    if (record.type === 'attributes') {
      if (record.attributeName === 'data-line') {
        return this.isCandidateElement(record.target) ? 'refresh' : 'none';
      }

      if (record.attributeName === 'class') {
        const wasCandidate = CANDIDATE_CLASS_PATTERN.test(record.oldValue || '');
        return this.isCandidateElement(record.target) || wasCandidate ? 'refresh' : 'none';
      }

      return 'none';
    }

    if (record.type !== 'childList') return 'none';

    for (const node of Array.from(record.addedNodes)) {
      if (this.containsCandidate(node)) return 'refresh';
    }
    for (const node of Array.from(record.removedNodes)) {
      if (this.containsCandidate(node)) return 'refresh';
    }

    return this.isInsideCandidate(record.target) ? 'layout' : 'none';
  }

  private refreshCandidates(): void {
    if (!this.candidatesDirty) return;

    const next: RenderedChapterCandidate[] = [];
    const seen = new Set<number>();
    const rendered = this.options.container.querySelectorAll(CANDIDATE_SELECTOR);
    for (const element of rendered) {
      const line = Number(element.getAttribute('data-line'));
      if (!Number.isInteger(line)) continue;
      const chapterIndex = this.lineToChapterIndex.get(line);
      if (chapterIndex === undefined || seen.has(chapterIndex)) continue;
      seen.add(chapterIndex);
      next.push({ element, chapterIndex });
    }

    this.renderedCandidates = next;
    this.candidatesDirty = false;
  }

  private findActiveCandidate(baseline: number): number {
    let low = 0;
    let high = this.renderedCandidates.length - 1;
    let active = -1;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      const candidate = this.renderedCandidates[mid];
      const top = candidate.element.getBoundingClientRect().top;
      if (top <= baseline) {
        active = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return active;
  }

  private update(): void {
    this.refreshCandidates();
    if (this.renderedCandidates.length === 0) return;

    const baseline = this.options.container.getBoundingClientRect().top + 70;
    const candidateIndex = this.findActiveCandidate(baseline);
    if (candidateIndex < 0) return;

    const activeIndex = this.renderedCandidates[candidateIndex].chapterIndex;
    if (activeIndex === this.lastActiveIndex) return;
    this.lastActiveIndex = activeIndex;
    this.options.onActiveChapter(activeIndex);
  }

  dispose(): void {
    this.disposed = true;
    this.options.container.removeEventListener('scroll', this.schedule);
    this.observer?.disconnect();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.renderedCandidates = [];
  }
}

export default LivePreviewTracker;
