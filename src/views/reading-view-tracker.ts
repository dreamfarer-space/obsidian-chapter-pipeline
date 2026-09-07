import type { ChapterNode } from '../types';

export interface ReadingTrackerOptions {
  container: HTMLElement;
  findHeadings: (chapter: ChapterNode) => Element | null;
  onActiveChapter: (index: number) => void;
  onScrollTick?: () => void;
}

/** Reading View tracker with one passive listener and rAF coalescing. */
export class ReadingViewTracker {
  private readonly options: ReadingTrackerOptions;
  private frame: number | null = null;
  private disposed = false;
  private lastScrollTop = -1;
  private chapters: ChapterNode[] = [];

  constructor(options: ReadingTrackerOptions) {
    this.options = options;
    this.options.container.addEventListener('scroll', this.handleScroll, { passive: true });
  }

  setChapters(chapters: ChapterNode[]): void {
    this.chapters = chapters;
    this.schedule();
  }

  private readonly handleScroll = (): void => {
    if (this.disposed) return;
    const top = this.options.container.scrollTop;
    if (Math.abs(top - this.lastScrollTop) < 1) return;
    this.lastScrollTop = top;
    this.schedule();
  };

  private schedule(): void {
    if (this.frame !== null || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.update();
    });
  }

  private update(): void {
    const baseline = this.options.container.getBoundingClientRect().top + 70;
    let active = -1;
    this.chapters.forEach((chapter, index) => {
      const heading = this.options.findHeadings(chapter);
      if (heading && heading.getBoundingClientRect().top <= baseline) active = index;
    });
    if (active >= 0) this.options.onActiveChapter(active);
    this.options.onScrollTick?.();
  }

  dispose(): void {
    this.disposed = true;
    this.options.container.removeEventListener('scroll', this.handleScroll);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}

export default ReadingViewTracker;
