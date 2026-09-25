import { getLanguage } from 'obsidian';
import type { PluginSettings } from './types';

export const DEFAULT_SETTINGS: PluginSettings = {
  minHeadingLevel: 1,
  maxHeadingLevel: 2,
  ignoreFirstH1: false,
  showExcerpt: true,
  excerptLength: 140,
  activeColor: '#3b82f6',
  customActiveColor: '#3b82f6',
  narrowThreshold: 600,
  enableSound: false,
  enableScrollSound: false,
  soundVolume: 50,
  dockPosition: 'left',
  hierarchyMode: 'hover-expand',
  showProgressRail: false,
  tooltipGlassmorphism: false,
  showChapterOrder: false,
  readingBookmarksEnabled: false,
  readingState: { version: 2, files: {} }
};

/** Stable DOM hooks shared by views and UI modules. */
export const DOM_CLASSES = {
  stepper: 'codex-stepper-container',
  dash: 'codex-chapter-dash',
  tooltip: 'codex-floating-tooltip',
  modal: 'codex-suggest-modal',
  collapsed: 'is-collapsed',
  narrow: 'is-narrow',
  progressRail: 'codex-progress-rail'
} as const;

export type Locale = 'en' | 'zh';
export type I18nDictionary = Record<string, string>;

/** UI copy kept in one module so future translations do not touch behavior. */
export const I18N: Record<Locale, I18nDictionary> = {
  en: {
    tabTitle: 'Chapter Pipeline Settings',
    searchPlaceholder: 'Search chapter or formula...',
    revisitLabel: 'Revisit',
    importantLabel: 'Important',
    resumeAvailable: 'Resume available: {title}',
    resumeUnavailable: 'No saved reading position in this note.',
    resumeNotFound: 'The saved chapter is no longer available.',
    readingBookmarksCleared: 'Reading progress and bookmarks cleared for this note.',
    cleanupSuccessNotice: 'Cleaned up {count} invalid note record(s).',
    cleanupNoneNotice: 'No invalid records found. Everything is up to date.',
    commandJumpPrev: 'Chapter Pipeline: Jump to previous chapter',
    commandJumpNext: 'Chapter Pipeline: Jump to next chapter',
    commandOpenPalette: 'Chapter Pipeline: Search & switch chapter (Palette)',
    commandResumeLastChapter: 'Chapter Pipeline: Resume last chapter',
    commandToggleRevisit: 'Chapter Pipeline: Toggle revisit bookmark for current chapter',
    commandToggleImportant: 'Chapter Pipeline: Toggle important bookmark for current chapter',
    commandClearReadingBookmarks: 'Chapter Pipeline: Clear reading progress & bookmarks for current note',
    commandCleanupReadingBookmarks: 'Chapter Pipeline: Clean up invalid reading progress & bookmarks'
  },
  zh: {
    tabTitle: 'Chapter Pipeline 设置',
    searchPlaceholder: '搜索章节或公式…',
    revisitLabel: '稍后回看',
    importantLabel: '重点',
    resumeAvailable: '可恢复上次阅读：{title}',
    resumeUnavailable: '这篇笔记没有保存的阅读位置。',
    resumeNotFound: '保存的章节已不存在，无法恢复。',
    readingBookmarksCleared: '已清除本笔记的阅读断点与书签。',
    cleanupSuccessNotice: '已清理 {count} 条失效笔记的记录。',
    cleanupNoneNotice: '未发现失效记录，当前配置非常整洁。',
    commandJumpPrev: 'Chapter Pipeline：跳转至上一章节',
    commandJumpNext: 'Chapter Pipeline：跳转至下一章节',
    commandOpenPalette: 'Chapter Pipeline：搜索并快速跳转章节',
    commandResumeLastChapter: 'Chapter Pipeline：恢复上次阅读章节',
    commandToggleRevisit: 'Chapter Pipeline：切换当前章节的稍后回看书签',
    commandToggleImportant: 'Chapter Pipeline：切换当前章节的重点书签',
    commandClearReadingBookmarks: 'Chapter Pipeline：清除当前笔记的阅读断点与书签',
    commandCleanupReadingBookmarks: 'Chapter Pipeline：清理已失效阅读断点与书签'
  }
};

export function getLocale(): Locale {
  let language = '';
  try {
    language = typeof getLanguage === 'function' ? getLanguage() : '';
  } catch {
    // getLanguage may throw outside of Obsidian runtime
  }
  if (!language && typeof navigator !== 'undefined') {
    language = navigator.language;
  }
  return String(language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function translate(key: string, variables: Record<string, string | number | boolean | null | undefined> = {}): string {
  const strings = I18N[getLocale()] || I18N.en;
  const value = strings[key] ?? I18N.en[key] ?? key;
  return value.replace(/\{(\w+)\}/g, (match, name: string) => {
    const val = variables[name];
    return val === undefined || val === null ? match : String(val);
  });
}
