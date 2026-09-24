import { Setting } from 'obsidian';
import { normalizeHeadingText } from './core/parser';
import { ChapterPipelineCoordinator } from './plugin-coordinator';
import {
  hashHeadingSequence,
  nextCalibrationState,
  type CalibrationState
} from './runtime-helpers';

type LegacyPluginConstructor = { prototype: Record<string, any> };

type ReadingHeadingEntry = {
  element: Element;
  tag: string;
  line: number | null;
  norms: string[];
};

type ReadingHeadingSnapshot = {
  entries: ReadingHeadingEntry[];
  byLine: Map<number, Element>;
  byTagAndText: Map<string, Element>;
  byText: Map<string, Element>;
  byTag: Map<string, ReadingHeadingEntry[]>;
};

function fallbackHeadings(content: string): Array<{ heading: string; level: number; position: { start: { line: number } } }> {
  const headings: Array<{ heading: string; level: number; position: { start: { line: number } } }> = [];
  let inFence = false;
  String(content || '').split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        heading: match[2].trim(),
        level: match[1].length,
        position: { start: { line: index } }
      });
    }
  });
  return headings;
}

function isChineseLocale(): boolean {
  const language = (typeof window !== 'undefined' && window.localStorage)
    ? window.localStorage.getItem('language')
    : null;
  const fallback = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return String(language || fallback || 'en').toLowerCase().startsWith('zh');
}

function isUsableReadingHeading(element: Element): boolean {
  if (element.classList?.contains('inline-title')) return false;
  if (typeof element.closest !== 'function') return true;
  return !element.closest('.internal-embed, .markdown-embed, .markdown-embed-content, .popover, .codex-floating-tooltip, .mod-header');
}

function buildReadingHeadingSnapshot(scroller: Element): ReadingHeadingSnapshot {
  const rendered = Array.from(scroller.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .filter(isUsableReadingHeading);
  const entries: ReadingHeadingEntry[] = [];
  const byLine = new Map<number, Element>();
  const byTagAndText = new Map<string, Element>();
  const byText = new Map<string, Element>();
  const byTag = new Map<string, ReadingHeadingEntry[]>();

  for (const element of rendered) {
    const tag = String(element.tagName || '').toUpperCase();
    const dataNorm = normalizeHeadingText(element.getAttribute('data-heading') || '');
    const textNorm = normalizeHeadingText(element.textContent || '');
    const norms = Array.from(new Set([dataNorm, textNorm].filter(Boolean)));
    const rawLine = element.getAttribute('data-line')
      ?? element.getAttribute('data-heading-line')
      ?? element.closest?.('[data-line]')?.getAttribute('data-line')
      ?? null;
    const parsedLine = rawLine === null ? NaN : parseInt(rawLine, 10);
    const line = Number.isInteger(parsedLine) ? parsedLine : null;
    const entry = { element, tag, line, norms };
    entries.push(entry);

    if (line !== null && !byLine.has(line)) byLine.set(line, element);
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag)?.push(entry);
    for (const norm of norms) {
      const tagKey = `${tag}\u0000${norm}`;
      if (!byTagAndText.has(tagKey)) byTagAndText.set(tagKey, element);
      if (!byText.has(norm)) byText.set(norm, element);
    }
  }

  return { entries, byLine, byTagAndText, byText, byTag };
}

function resolveReadingHeading(
  snapshot: ReadingHeadingSnapshot,
  scroller: Element,
  chapter: any
): Element | null {
  const targetTag = chapter?.level ? `H${chapter.level}`.toUpperCase() : '';
  const cleanNorm = normalizeHeadingText(chapter?.title || '');
  const rawNorm = normalizeHeadingText(chapter?.rawHeading || chapter?.title || '');
  const targetNorms = Array.from(new Set([cleanNorm, rawNorm].filter(Boolean)));
  const line = Number.isInteger(chapter?.line) ? Number(chapter.line) : null;

  if (line !== null) {
    const byLine = snapshot.byLine.get(line);
    if (byLine) return byLine;

    const section = scroller.querySelector(`.markdown-preview-section[data-line="${line}"]`);
    if (section) {
      const sectionHeading = Array.from(section.querySelectorAll('h1, h2, h3, h4, h5, h6'))
        .find(isUsableReadingHeading);
      return sectionHeading ?? section;
    }
  }

  if (targetTag) {
    for (const norm of targetNorms) {
      const exact = snapshot.byTagAndText.get(`${targetTag}\u0000${norm}`);
      if (exact) return exact;
    }

    if (cleanNorm) {
      const partial = snapshot.byTag.get(targetTag)?.find((entry) => entry.norms.some((norm) => (
        norm.includes(cleanNorm) || cleanNorm.includes(norm)
      )));
      if (partial) return partial.element;
    }
  }

  for (const norm of targetNorms) {
    const exact = snapshot.byText.get(norm);
    if (exact) return exact;
  }

  if (cleanNorm) {
    const partial = snapshot.entries.find((entry) => entry.norms.some((norm) => (
      norm.includes(cleanNorm) || cleanNorm.includes(norm)
    )));
    if (partial) return partial.element;
  }

  if (Number.isInteger(chapter?.headingIndex)) {
    return snapshot.entries[chapter.headingIndex]?.element ?? null;
  }
  return null;
}

type ReadingHeadingObserverState = {
  observer: MutationObserver | null;
  dirty: boolean;
  childSignature: string;
  restoreMockHooks?: () => void;
};

function getScrollerChildSignature(scroller: Element): string {
  const children = (scroller as Element & { children?: ArrayLike<Element> }).children;
  if (!children || typeof children.length !== 'number') return '';
  const length = children.length;
  const firstNode = length > 0 ? children[0] : undefined;
  const lastNode = length > 0 ? children[length - 1] : undefined;
  const first = firstNode
    ? `${firstNode.tagName || ''}:${firstNode.getAttribute?.('data-heading') || firstNode.getAttribute?.('data-line') || ''}`
    : '';
  const last = lastNode
    ? `${lastNode.tagName || ''}:${lastNode.getAttribute?.('data-heading') || lastNode.getAttribute?.('data-line') || ''}`
    : '';
  return `${length}:${first}:${last}`;
}

function isHeadingOrSectionNode(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const element = node as Element;
  const tag = String(element.tagName || '').toUpperCase();
  if (/^H[1-6]$/.test(tag)) return true;
  if (element.classList?.contains?.('markdown-preview-section')) return true;
  if (typeof element.querySelector === 'function') {
    return Boolean(element.querySelector('h1, h2, h3, h4, h5, h6, .markdown-preview-section'));
  }
  return false;
}

function didReadingHeadingsMutate(records?: MutationRecord[]): boolean {
  if (!Array.isArray(records) || records.length === 0) return true;
  for (const record of records) {
    if (isHeadingOrSectionNode(record.target)) return true;
    for (const node of Array.from(record.addedNodes || [])) {
      if (isHeadingOrSectionNode(node)) return true;
    }
    for (const node of Array.from(record.removedNodes || [])) {
      if (isHeadingOrSectionNode(node)) return true;
    }
  }
  return false;
}

/**
 * Typed performance and Reading View navigation layer extending the base
 * plugin coordinator without prototype monkey-patching.
 */
export class PerformanceCoordinatorPlugin extends ChapterPipelineCoordinator {
  private readonly headingFingerprints = new Map<string, string>();
  private readonly readingHeadingSnapshots = new WeakMap<object, ReadingHeadingSnapshot>();
  private readonly readingHeadingObservers = new Map<Element, ReadingHeadingObserverState>();
  private readonly viewReadingScrollers = new WeakMap<object, Element>();
  private readonly jumpCalibrationGenerations = new WeakMap<object, number>();

  protected ensureReadingHeadingObserver(scroller: Element, forceReset = false): ReadingHeadingObserverState {
    const existing = this.readingHeadingObservers.get(scroller);
    if (existing && !forceReset) return existing;
    if (existing) {
      this.disconnectReadingHeadingObserver(scroller);
    }

    const state: ReadingHeadingObserverState = {
      observer: null,
      dirty: true,
      childSignature: ''
    };
    if (typeof MutationObserver === 'function' && typeof (scroller as Element & { addEventListener?: unknown }).addEventListener === 'function') {
      const markDirty = (records?: MutationRecord[]) => {
        if (didReadingHeadingsMutate(records)) {
          state.dirty = true;
          this.readingHeadingSnapshots.delete(scroller);
        }
      };
      const observer = new MutationObserver(markDirty);
      observer.observe(scroller, { childList: true, subtree: true });
      state.observer = observer;

      const mockScroller = scroller as Element & {
        append?: (...args: unknown[]) => unknown;
      };
      if (typeof Node === 'undefined' && typeof mockScroller.append === 'function') {
        const originalAppend = mockScroller.append;
        mockScroller.append = function (...args: unknown[]) {
          const result = originalAppend.apply(this, args);
          markDirty();
          return result;
        };
        state.restoreMockHooks = () => {
          if (mockScroller.append !== originalAppend) {
            mockScroller.append = originalAppend;
          }
        };
      }
    } else {
      state.childSignature = getScrollerChildSignature(scroller);
    }
    this.readingHeadingObservers.set(scroller, state);
    return state;
  }

  disconnectReadingHeadingObserver(target: object | Element | null | undefined): void {
    if (!target || typeof target !== 'object') return;
    const mappedScroller = this.viewReadingScrollers.get(target);
    if (mappedScroller) {
      this.viewReadingScrollers.delete(target);
      if (mappedScroller !== target) {
        this.disconnectReadingHeadingObserver(mappedScroller);
      }
    }
    const contentScroller = (target as { contentEl?: { querySelector?: (sel: string) => Element | null } })
      .contentEl?.querySelector?.('.markdown-preview-view');
    if (contentScroller && contentScroller !== target && contentScroller !== mappedScroller) {
      this.disconnectReadingHeadingObserver(contentScroller);
    }
    const scroller = target as Element;
    const state = this.readingHeadingObservers.get(scroller);
    if (state) {
      state.restoreMockHooks?.();
      state.observer?.disconnect?.();
      this.readingHeadingObservers.delete(scroller);
    }
    this.readingHeadingSnapshots.delete(scroller);
  }

  override async loadSettings(): Promise<void> {
    const persisted = await this.loadData?.();
    await super.loadSettings();

    const saved = persisted && typeof persisted === 'object' && !Array.isArray(persisted)
      ? persisted as Record<string, unknown>
      : {};
    let changed = false;

    if (!Object.prototype.hasOwnProperty.call(saved, 'enableSound')) {
      this.settings.enableSound = false;
      changed = true;
    }
    if (!Object.prototype.hasOwnProperty.call(saved, 'enableScrollSound')) {
      this.settings.enableScrollSound = false;
      changed = true;
    }
    if (!Object.prototype.hasOwnProperty.call(saved, 'tooltipGlassmorphism')) {
      this.settings.tooltipGlassmorphism = false;
      changed = true;
    }

    if (changed) await this.saveSettings?.();
  }

  override async onload(): Promise<void> {
    const originalAddSettingTab = this.addSettingTab?.bind(this);
    if (originalAddSettingTab) {
      this.addSettingTab = (tab: any) => {
        const originalDisplay = typeof tab?.display === 'function' ? tab.display.bind(tab) : null;
        if (originalDisplay) {
          tab.display = () => {
            originalDisplay();
            const zh = isChineseLocale();
            new Setting(tab.containerEl)
              .setName(zh ? '开启滚动跨章节音效' : 'Enable scroll chapter tick sound')
              .setDesc(zh
                ? '仅控制滚动跨越章节时的刻度音；点击章节音效由上方拟物音效开关独立控制。'
                : 'Controls only chapter-crossing ticks while scrolling. Click feedback remains controlled by the tactile sound setting above.')
              .addToggle((toggle) => toggle
                .setValue(this.settings.enableScrollSound === true)
                .onChange(async (value) => {
                  this.settings.enableScrollSound = value;
                  await this.saveSettings();
                }));
          };
        }
        return originalAddSettingTab(tab);
      };
    }

    try {
      const result = await super.onload();
      const playScrollTick = this.soundEngine?.playScrollTick?.bind(this.soundEngine);
      if (playScrollTick && !this.soundEngine.__chapterScrollSoundGuarded) {
        this.soundEngine.__chapterScrollSoundGuarded = true;
        this.soundEngine.playScrollTick = (volume: number) => {
          if (this.settings?.enableScrollSound === true) playScrollTick(volume);
        };
      }
      return result;
    } finally {
      if (originalAddSettingTab) this.addSettingTab = originalAddSettingTab;
    }
  }

  override extractChapters(content: string, file: any, parserSettings: unknown = this.settings): any {
    const filePath = typeof file?.path === 'string' ? file.path : '';
    const cachedHeadings = filePath
      ? this.app?.metadataCache?.getFileCache?.(file)?.headings
      : undefined;
    const headings = Array.isArray(cachedHeadings) && cachedHeadings.length > 0
      ? cachedHeadings
      : fallbackHeadings(content);
    const fingerprint = hashHeadingSequence(headings);

    const previous = this.headingFingerprints.get(filePath);
    if (previous !== undefined && previous !== fingerprint) {
      this.documentRevisions?.set(
        filePath,
        (this.documentRevisions?.get(filePath) || 0) + 1
      );
      this.chapterCache?.deleteByPrefix?.(`${filePath}|`);
    }
    this.headingFingerprints.set(filePath, fingerprint);

    return super.extractChapters(content, file, parserSettings);
  }

  override getViewScrollers(container: HTMLElement | null, view: any = null): any[] {
    if (!container) return [];
    if (
      view
      && this.app?.workspace?.getActiveViewOfType
      && typeof this.isActiveMarkdownView === 'function'
      && !this.isActiveMarkdownView(view)
    ) {
      return [];
    }

    const isReading = this.isReadingMode?.(view, container) === true;
    const selector = isReading ? '.markdown-preview-view' : '.cm-scroller';
    const scroller = container.querySelector?.(selector) as HTMLElement | null;
    if (!scroller || typeof scroller.addEventListener !== 'function') return [];

    if (isReading) {
      const parent = container.parentElement as HTMLElement | null;
      const parentIsVerifiedScrollSource = Boolean(
        parent
        && typeof parent.addEventListener === 'function'
        && Number(parent.scrollHeight) > Number(parent.clientHeight) + 1
        && Math.abs(Number(parent.scrollTop) || 0) > 0
        && Math.abs(Number(scroller.scrollTop) || 0) < 1
      );
      if (parentIsVerifiedScrollSource) return [parent];
    }

    return [scroller];
  }

  override getCurrentEditorTopLine(view: any, container?: any, chapters: any = []): any {
    if (
      view
      && this.app?.workspace?.getActiveViewOfType
      && typeof this.isActiveMarkdownView === 'function'
      && !this.isActiveMarkdownView(view)
    ) {
      return 0;
    }
    return super.getCurrentEditorTopLine(view, container, chapters);
  }

  override getReadingHeading(view: any, chapter: any): any {
    const scroller = view?.contentEl?.querySelector?.('.markdown-preview-view') as Element | null;
    if (!scroller) return super.getReadingHeading(view, chapter) ?? null;

    if (view && typeof view === 'object') {
      const previousScroller = this.viewReadingScrollers.get(view);
      if (previousScroller && previousScroller !== scroller) {
        this.disconnectReadingHeadingObserver(previousScroller);
      }
      this.viewReadingScrollers.set(view, scroller);
    }

    const observerState = this.ensureReadingHeadingObserver(scroller);
    if (!observerState.observer) {
      const currentSignature = getScrollerChildSignature(scroller);
      if (currentSignature !== observerState.childSignature) {
        observerState.dirty = true;
        observerState.childSignature = currentSignature;
      }
    }

    let snapshot = this.readingHeadingSnapshots.get(scroller);
    if (!snapshot || observerState.dirty) {
      snapshot = buildReadingHeadingSnapshot(scroller);
      this.readingHeadingSnapshots.set(scroller, snapshot);
      observerState.dirty = false;
      if (!observerState.observer) {
        observerState.childSignature = getScrollerChildSignature(scroller);
      }
    }

    let resolved = resolveReadingHeading(snapshot, scroller, chapter);
    if (!resolved) {
      return null;
    }
    if ((resolved as Element & { isConnected?: boolean }).isConnected !== false) {
      return resolved;
    }

    snapshot = buildReadingHeadingSnapshot(scroller);
    this.readingHeadingSnapshots.set(scroller, snapshot);
    observerState.dirty = false;
    if (!observerState.observer) {
      observerState.childSignature = getScrollerChildSignature(scroller);
    }
    resolved = resolveReadingHeading(snapshot, scroller, chapter);
    return resolved && (resolved as Element & { isConnected?: boolean }).isConnected !== false
      ? resolved
      : null;
  }

  override async attachStepperToView(view: any): Promise<any> {
    const scroller = view?.contentEl?.querySelector?.('.markdown-preview-view') as Element | null;
    if (view && typeof view === 'object') {
      const previousScroller = this.viewReadingScrollers.get(view);
      if (previousScroller && previousScroller !== scroller) {
        this.disconnectReadingHeadingObserver(previousScroller);
      }
      if (scroller) {
        this.viewReadingScrollers.set(view, scroller);
      }
    }
    if (scroller) {
      this.readingHeadingSnapshots.delete(scroller);
      this.ensureReadingHeadingObserver(scroller, true);
    }

    const result = await super.attachStepperToView(view);
    const tooltip = result?.tooltipElement ?? this.viewTooltips?.get?.(view);
    if (tooltip?.classList) {
      tooltip.classList.add('codex-floating-tooltip--view-layer');
    }
    return result;
  }

  override jumpToHeading(view: any, chapter: any): any {
    const targetView = view && view.file ? view : null;
    const generation = targetView
      ? (this.jumpCalibrationGenerations.get(targetView) || 0) + 1
      : 0;
    if (targetView) {
      this.jumpCalibrationGenerations.set(targetView, generation);
    }

    const line = typeof chapter === 'number' ? chapter : chapter?.line;
    const isReading = targetView && this.isReadingMode?.(targetView, targetView.contentEl);
    const previewRoot = isReading
      ? targetView.contentEl?.querySelector?.('.markdown-preview-view')
      : null;
    const previewScroller = isReading
      ? (this.getViewScroller?.(targetView.contentEl, targetView) || previewRoot)
      : null;

    if (!targetView || line === undefined || !previewScroller) {
      return super.jumpToHeading(view, chapter);
    }

    const headingText = typeof chapter === 'object' && chapter
      ? (chapter.rawHeading || chapter.title)
      : '';
    const subpath = headingText ? `#${headingText}` : '';
    try {
      targetView.setEphemeralState?.(subpath ? { subpath, line, focus: false } : { line, focus: false });
      this.clearFlashHighlights?.(targetView.contentEl);
    } catch (_) {
      // Best-effort native state wake-up; calibration below remains authoritative.
    }

    const previewMode = targetView.currentMode || targetView.previewMode;
    previewMode?.applyScroll?.(line);

    const topMargin = 20;
    let targetHeading = typeof chapter === 'object' ? this.getReadingHeading?.(targetView, chapter) : null;
    const alignSmoothly = () => {
      if (!targetHeading) return;
      const scrollerRect = previewScroller.getBoundingClientRect();
      const headingRect = targetHeading.getBoundingClientRect();
      const targetTop = Math.max(
        0,
        previewScroller.scrollTop + headingRect.top - scrollerRect.top - topMargin
      );
      previewScroller.scrollTo?.({ top: targetTop, behavior: 'smooth' });
    };
    alignSmoothly();

    let state: CalibrationState = {
      frames: 0,
      stableFrames: 0,
      converged: false,
      hitCap: false,
      shouldContinue: true
    };
    const calibratePreview = () => {
      if (
        this.jumpCalibrationGenerations.get(targetView) !== generation
        || (previewScroller as Element & { isConnected?: boolean }).isConnected === false
      ) {
        return;
      }

      if (!targetHeading && typeof chapter === 'object') {
        targetHeading = this.getReadingHeading?.(targetView, chapter) || null;
        if (targetHeading) alignSmoothly();
      }

      let error = Number.POSITIVE_INFINITY;
      if (targetHeading) {
        const scrollerRect = previewScroller.getBoundingClientRect();
        const headingRect = targetHeading.getBoundingClientRect();
        error = headingRect.top - scrollerRect.top - topMargin;
        if (Math.abs(error) >= 2) {
          previewScroller.scrollTop = Math.max(0, previewScroller.scrollTop + error);
        }
      }

      state = nextCalibrationState(state, error, {
        maxFrames: 24,
        threshold: 2,
        stableFramesRequired: 2
      });
      if (
        state.shouldContinue
        && this.jumpCalibrationGenerations.get(targetView) === generation
        && (previewScroller as Element & { isConnected?: boolean }).isConnected !== false
      ) {
        this.scheduleFrame(calibratePreview);
      }
    };

    this.scheduleFrame(calibratePreview);
    return undefined;
  }

  override onunload(): void {
    this.readingHeadingObservers.forEach((entry, scroller) => {
      entry.observer?.disconnect?.();
      this.readingHeadingSnapshots.delete(scroller);
    });
    this.readingHeadingObservers.clear();
    super.onunload();
  }
}

export function applyRuntimePerformancePatches(LegacyPlugin: LegacyPluginConstructor): void {
  const proto = LegacyPlugin.prototype;
  if (proto.__chapterIssue14Patched) return;
  proto.__chapterIssue14Patched = true;
}
