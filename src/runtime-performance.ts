import { Setting } from 'obsidian';

// Small runtime patch layer for the remaining legacy coordinator. These patches
// intentionally target the production prototype so they affect the bundled
// plugin while the coordinator continues its incremental TypeScript migration.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  hashHeadingSequence,
  nextCalibrationState
} = require('./runtime-helpers.js') as {
  hashHeadingSequence: (headings: unknown[]) => string;
  nextCalibrationState: (
    state: { frames?: number; stableFrames?: number },
    error: number,
    options?: { maxFrames?: number; threshold?: number; stableFramesRequired?: number }
  ) => { frames: number; stableFrames: number; converged: boolean; hitCap: boolean; shouldContinue: boolean };
};

type LegacyPluginConstructor = { prototype: Record<string, any> };

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

export function applyRuntimePerformancePatches(LegacyPlugin: LegacyPluginConstructor): void {
  const proto = LegacyPlugin.prototype;
  if (proto.__charterIssue14Patched) return;
  proto.__charterIssue14Patched = true;

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
      if (playScrollTick && !this.soundEngine.__charterScrollSoundGuarded) {
        this.soundEngine.__charterScrollSoundGuarded = true;
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

  const originalJumpToHeading = proto.jumpToHeading;
  proto.jumpToHeading = function patchedJumpToHeading(view: any, chapter: any) {
    const targetView = (view && view.file)
      ? view
      : this.app?.workspace?.getActiveViewOfType?.(undefined);
    const line = typeof chapter === 'number' ? chapter : chapter?.line;
    const isReading = targetView && this.isReadingMode?.(targetView, targetView.contentEl);
    const previewScroller = isReading
      ? targetView.contentEl?.querySelector?.('.markdown-preview-view')
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

    let state = { frames: 0, stableFrames: 0 };
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
