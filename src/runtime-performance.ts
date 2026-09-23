import { Setting } from 'obsidian';
import { normalizeHeadingText } from './core/parser';

// Small runtime patch layer for the remaining legacy coordinator. These patches
// intentionally target the production prototype so they affect the bundled
// plugin while the coordinator continues its incremental TypeScript migration.
// eslint-disable-next-line @typescript-eslint/no-var-requires -- Load the legacy helper module while the runtime patch layer is migrated to typed modules.
const {
  hashHeadingSequence,
  nextCalibrationState
} = require('./runtime-helpers.js') as {
  hashHeadingSequence: (headings: unknown[]) => string;
  nextCalibrationState: (
    state: { frames?: number; stableFrames?: number },
    error: number,
    options?: { maxFrames?: number; threshold?: number; stableFramesRequired?: number }
  ) => CalibrationState;
};

type LegacyPluginConstructor = { prototype: Record<string, any> };
type CalibrationState = {
  frames: number;
  stableFrames: number;
  converged: boolean;
  hitCap: boolean;
  shouldContinue: boolean;
};

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

export function applyRuntimePerformancePatches(LegacyPlugin: LegacyPluginConstructor): void {
  const proto = LegacyPlugin.prototype;
  if (proto.__chapterIssue14Patched) return;
  proto.__chapterIssue14Patched = true;

  const originalLoadSettings = proto.loadSettings;
  proto.loadSettings = async function patchedLoadSettings(...args: unknown[]) {
    const persisted = await this.loadData?.();
    await originalLoadSettings.apply(this, args);

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
  };

  const originalOnload = proto.onload;
  proto.onload = async function patchedOnload(...args: unknown[]) {
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
      const result = await originalOnload.apply(this, args);
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
  };

  const headingFingerprints = new WeakMap<object, Map<string, string>>();
  const originalExtractChapters = proto.extractChapters;
  proto.extractChapters = function patchedExtractChapters(content: string, file: any, parserSettings?: unknown) {
    const filePath = file?.path || '';
    const cachedHeadings = this.app?.metadataCache?.getFileCache?.(file)?.headings;
    const headings = Array.isArray(cachedHeadings) && cachedHeadings.length > 0
      ? cachedHeadings
      : fallbackHeadings(content);
    const fingerprint = hashHeadingSequence(headings);

    let fingerprints = headingFingerprints.get(this);
    if (!fingerprints) {
      fingerprints = new Map<string, string>();
      headingFingerprints.set(this, fingerprints);
    }
    const previous = fingerprints.get(filePath);
    if (previous !== undefined && previous !== fingerprint) {
      this.documentRevisions?.set(
        filePath,
        (this.documentRevisions?.get(filePath) || 0) + 1
      );
      this.chapterCache?.deleteByPrefix?.(`${filePath}|`);
    }
    fingerprints.set(filePath, fingerprint);

    return originalExtractChapters.call(this, content, file, parserSettings);
  };

  // Issue #11: only the actual Markdown scroller (or one directly verified
  // scrolling parent in Reading View) is a production source. Never bind the
  // document, window, or an arbitrary ancestor chain.
  proto.getViewScrollers = function scopedGetViewScrollers(container: HTMLElement | null, view: any = null) {
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
      // Obsidian normally scrolls the preview element. Some layouts put the
      // view root inside one scrolling `.view-content` wrapper, so inspect only
      // that single direct host candidate — never walk an ancestor chain.
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
  };

  // The legacy renderer still asks for an initial active line while it creates
  // DOM. Inactive panes skip that expensive compatibility calculation entirely;
  // their typed tracker will become authoritative after activation and scrolling.
  const originalGetCurrentEditorTopLine = proto.getCurrentEditorTopLine;
  if (typeof originalGetCurrentEditorTopLine === 'function') {
    proto.getCurrentEditorTopLine = function scopedGetCurrentEditorTopLine(view: any, ...args: unknown[]) {
      if (
        view
        && this.app?.workspace?.getActiveViewOfType
        && typeof this.isActiveMarkdownView === 'function'
        && !this.isActiveMarkdownView(view)
      ) {
        return 0;
      }
      return originalGetCurrentEditorTopLine.call(this, view, ...args);
    };
  }

  // Cache the Reading View heading index per preview scroller. The typed
  // ReadingViewTracker asks for individual chapters while scrolling; resolving
  // them against this snapshot avoids a full h1..h6 query for every lookup.
  const readingHeadingSnapshots = new WeakMap<object, ReadingHeadingSnapshot>();
  const originalGetReadingHeading = proto.getReadingHeading;
  proto.getReadingHeading = function cachedGetReadingHeading(view: any, chapter: any) {
    const scroller = view?.contentEl?.querySelector?.('.markdown-preview-view') as Element | null;
    if (!scroller) return originalGetReadingHeading?.call(this, view, chapter) ?? null;

    let snapshot = readingHeadingSnapshots.get(scroller);
    if (!snapshot) {
      snapshot = buildReadingHeadingSnapshot(scroller);
      readingHeadingSnapshots.set(scroller, snapshot);
    }

    let resolved = resolveReadingHeading(snapshot, scroller, chapter);
    if (resolved && (resolved as Element & { isConnected?: boolean }).isConnected !== false) {
      return resolved;
    }

    // Reading View can virtualize or replace chunks. Refresh only when a cached
    // target disappeared or a lookup misses, never by scanning the whole cached
    // snapshot on every chapter resolution.
    snapshot = buildReadingHeadingSnapshot(scroller);
    readingHeadingSnapshots.set(scroller, snapshot);
    resolved = resolveReadingHeading(snapshot, scroller, chapter);
    return resolved;
  };

  const originalAttachStepperToView = proto.attachStepperToView;
  proto.attachStepperToView = async function patchedAttachStepperToView(view: any) {
    const scroller = view?.contentEl?.querySelector?.('.markdown-preview-view');
    if (scroller) readingHeadingSnapshots.delete(scroller);

    const result = await originalAttachStepperToView.call(this, view);
    const tooltip = this.viewTooltips?.get?.(view);
    if (tooltip?.classList) {
      // A plugin-local layer above note content without dominating app chrome,
      // menus, modals, or other global overlays.
      tooltip.classList.add('codex-floating-tooltip--view-layer');
    }
    return result;
  };

  const originalJumpToHeading = proto.jumpToHeading;
  proto.jumpToHeading = function patchedJumpToHeading(view: any, chapter: any) {
    const targetView = view && view.file ? view : null;
    const line = typeof chapter === 'number' ? chapter : chapter?.line;
    const isReading = targetView && this.isReadingMode?.(targetView, targetView.contentEl);
    const previewRoot = isReading
      ? targetView.contentEl?.querySelector?.('.markdown-preview-view')
      : null;
    const previewScroller = isReading
      ? (this.getViewScroller?.(targetView.contentEl, targetView) || previewRoot)
      : null;

    if (!targetView || line === undefined || !previewScroller) {
      return originalJumpToHeading.call(this, view, chapter);
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
      if (state.shouldContinue) this.scheduleFrame(calibratePreview);
    };

    this.scheduleFrame(calibratePreview);
    return undefined;
  };
}
