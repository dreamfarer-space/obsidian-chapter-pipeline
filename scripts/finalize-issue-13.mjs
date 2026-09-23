import fs from 'node:fs';

const path = 'src/main.ts';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(needle, replacement, label) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Missing target: ${label}`);
  if (source.indexOf(needle, index + needle.length) >= 0) throw new Error(`Non-unique target: ${label}`);
  source = source.slice(0, index) + replacement + source.slice(index + needle.length);
}

replaceOnce(
  "import { ChapterParser } from './core/parser';",
  "import { MarkdownView } from 'obsidian';\nimport { ChapterParser } from './core/parser';",
  'MarkdownView import'
);

replaceOnce(
  "type ReadingAwarePlugin = ProductionPlugin & Record<string, any>;\n",
  `type ReadingAwarePlugin = ProductionPlugin & Record<string, any>;

function readingNoticeText(key: 'resumeUnavailable' | 'resumeNotFound' | 'resumeAvailable', title = ''): string {
  const language = (
    (typeof window !== 'undefined' && window.localStorage?.getItem('language')) ||
    (typeof navigator !== 'undefined' ? navigator.language : 'en') ||
    'en'
  ).toLowerCase();
  const zh = language.startsWith('zh');
  if (key === 'resumeUnavailable') return zh ? '这篇笔记没有保存的阅读位置。' : 'No saved reading position in this note.';
  if (key === 'resumeNotFound') return zh ? '保存的章节已不存在，无法恢复。' : 'The saved chapter is no longer available.';
  return zh ? \`可恢复上次阅读：\${title}\` : \`Resume available: \${title}\`;
}
`,
  'reading notice helper'
);

replaceOnce(
  `    this.settings = Object.assign({}, defaults, loadedSettings);

    if (this.settings.showExcerpt === undefined) this.settings.showExcerpt = true;
    if (typeof this.settings.excerptLength !== 'number' || this.settings.excerptLength < 60 || this.settings.excerptLength > 300) {
      this.settings.excerptLength = 140;
    }
    if (this.settings.activeColor === '#10b981') this.settings.activeColor = '#3b82f6';
    if (!this.settings.customActiveColor) this.settings.customActiveColor = '#3b82f6';
    if (this.settings.enableSound === undefined) this.settings.enableSound = true;
    if (this.settings.soundVolume === undefined) this.settings.soundVolume = 50;
    if (!this.settings.dockPosition) this.settings.dockPosition = 'left';
    if (!this.settings.hierarchyMode) this.settings.hierarchyMode = 'hover-expand';
    if (this.settings.showProgressRail === undefined) this.settings.showProgressRail = false;
    if (this.settings.tooltipGlassmorphism === undefined) this.settings.tooltipGlassmorphism = true;
    if (this.settings.showChapterOrder === undefined) this.settings.showChapterOrder = false;
    if (this.settings.readingBookmarksEnabled === undefined) this.settings.readingBookmarksEnabled = false;

    this.settings.readingState = normalizeReadingState(this.settings.readingState);`,
  `    this.settings = Object.assign({}, defaults, loadedSettings);
    const settings = this.settings as Record<string, any>;

    if (settings.showExcerpt === undefined) settings.showExcerpt = true;
    if (typeof settings.excerptLength !== 'number' || settings.excerptLength < 60 || settings.excerptLength > 300) {
      settings.excerptLength = 140;
    }
    if (settings.activeColor === '#10b981') settings.activeColor = '#3b82f6';
    if (!settings.customActiveColor) settings.customActiveColor = '#3b82f6';
    if (settings.enableSound === undefined) settings.enableSound = true;
    if (settings.soundVolume === undefined) settings.soundVolume = 50;
    if (!settings.dockPosition) settings.dockPosition = 'left';
    if (!settings.hierarchyMode) settings.hierarchyMode = 'hover-expand';
    if (settings.showProgressRail === undefined) settings.showProgressRail = false;
    if (settings.tooltipGlassmorphism === undefined) settings.tooltipGlassmorphism = true;
    if (settings.showChapterOrder === undefined) settings.showChapterOrder = false;
    if (settings.readingBookmarksEnabled === undefined) settings.readingBookmarksEnabled = false;

    settings.readingState = normalizeReadingState(settings.readingState);`,
  'settings narrowing'
);

replaceOnce(
  "      : this.app?.workspace?.getActiveViewOfType?.(null);",
  "      : this.app?.workspace?.getActiveViewOfType?.(MarkdownView);",
  'active MarkdownView lookup'
);

replaceOnce(
  "      this.showNotice?.(this.translateReadingString?.('resumeUnavailable') ?? 'No saved reading position in this note.');",
  "      this.showNotice?.(readingNoticeText('resumeUnavailable'));",
  'resume unavailable notice'
);

replaceOnce(
  "      this.showNotice?.(this.translateReadingString?.('resumeNotFound') ?? 'The saved chapter is no longer available.');",
  "      this.showNotice?.(readingNoticeText('resumeNotFound'));",
  'resume not found notice'
);

replaceOnce(
  `    const fileState = this.getReadingFileState?.(file, false) as ReadingFileState | null;
    const savedResume = fileState?.resume;
    if (!savedResume?.chapterId) return;

    this.resumePromptedPaths?.add(file.path);
    const chapters = this.extractAllChapters?.(content, file) as ChapterNode[];
    this.fileChapterSnapshots ??= new Map<string, ChapterNode[]>();
    this.fileChapterSnapshots.set(file.path, chapters);`,
  `    const chapters = this.extractAllChapters?.(content, file) as ChapterNode[];
    this.fileChapterSnapshots ??= new Map<string, ChapterNode[]>();
    this.fileChapterSnapshots.set(file.path, chapters);

    const fileState = this.getReadingFileState?.(file, false) as ReadingFileState | null;
    const savedResume = fileState?.resume;
    if (!savedResume?.chapterId) return;

    this.resumePromptedPaths?.add(file.path);`,
  'snapshot before marker rendering'
);

replaceOnce(
  "      const message = this.translateReadingString?.('resumeAvailable', { title }) ?? `Resume available: ${title}`;",
  "      const message = readingNoticeText('resumeAvailable', title);",
  'resume available notice'
);

fs.writeFileSync(path, source);
console.log('Finalized issue #13 main.ts compatibility patch.');
