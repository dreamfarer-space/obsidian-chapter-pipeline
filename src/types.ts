/** Shared domain types for the Chapter Pipeline modules. */

export type DockPosition = 'left' | 'right';
export type HierarchyMode = 'all' | 'hover-expand' | 'active-branch';
export type BookmarkKind = 'revisit' | 'important';

export interface ChapterIdentity {
  version: 2;
  level: number;
  line: number;
  normalizedTitle: string;
  occurrence: number;
  titleCount: number;
  parent: string | null;
  previous: string | null;
  next: string | null;
}

export interface ReadingResume {
  chapterId: string;
  title: string;
  updatedAt: number;
  identity?: ChapterIdentity;
}

export interface ChapterMarker {
  revisit: boolean;
  important: boolean;
  identity?: ChapterIdentity;
}

export interface ReadingFileState {
  resume?: ReadingResume;
  markers: Record<string, ChapterMarker>;
}

export interface ReadingState {
  version: 2;
  files: Record<string, ReadingFileState>;
}

export interface PluginSettings {
  minHeadingLevel: number;
  maxHeadingLevel: number;
  ignoreFirstH1: boolean;
  showExcerpt: boolean;
  excerptLength: number;
  activeColor: string;
  customActiveColor: string;
  narrowThreshold: number;
  enableSound: boolean;
  enableScrollSound: boolean;
  soundVolume: number;
  dockPosition: DockPosition;
  hierarchyMode: HierarchyMode;
  showProgressRail: boolean;
  tooltipGlassmorphism: boolean;
  showChapterOrder: boolean;
  readingBookmarksEnabled: boolean;
  readingState: ReadingState;
  [key: string]: unknown;
}

export interface HeadingPosition {
  start: { line: number };
}

export interface HeadingCacheEntry {
  heading: string;
  level: number;
  position: HeadingPosition;
}

export interface ChapterNode {
  title: string;
  rawHeading: string;
  level: number;
  line: number;
  headingIndex: number;
  id: string;
  summaryMarkdown: string;
}

export interface MathRange {
  start: number;
  end: number;
}

export interface MathScanResult {
  ranges: MathRange[];
  unclosedIndex: number;
}

export interface ChapterStatusLabel {
  className: string;
  label: string;
}

export interface FileLike {
  path: string;
}

export interface ScrollerLike {
  scrollTop: number;
  addEventListener?: (type: string, listener: (event: Event) => void, options?: boolean) => void;
  removeEventListener?: (type: string, listener: (event: Event) => void, options?: boolean) => void;
}
