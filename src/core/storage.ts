import type {
  BookmarkKind,
  ChapterMarker,
  FileLike,
  PluginSettings,
  ReadingFileState,
  ReadingResume,
  ReadingState
} from '../types';

export function createEmptyReadingState(): ReadingState {
  return { version: 1, files: {} };
}

/** Drop malformed/empty records when loading older plugin data. */
export function normalizeReadingState(input: unknown): ReadingState {
  const normalized = createEmptyReadingState();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return normalized;
  const files = (input as { files?: unknown }).files;
  if (!files || typeof files !== 'object' || Array.isArray(files)) return normalized;

  for (const [path, raw] of Object.entries(files)) {
    if (!path || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const source = raw as { resume?: unknown; markers?: unknown };
    const fileState: ReadingFileState = { markers: {} };
    const resume = source.resume;
    if (resume && typeof resume === 'object' && !Array.isArray(resume)) {
      const candidate = resume as Partial<ReadingResume>;
      if (typeof candidate.chapterId === 'string' && candidate.chapterId) {
        fileState.resume = {
          chapterId: candidate.chapterId,
          title: typeof candidate.title === 'string' ? candidate.title : '',
          updatedAt: Number.isFinite(candidate.updatedAt) ? Number(candidate.updatedAt) : 0
        };
      }
    }
    const markers = source.markers;
    if (markers && typeof markers === 'object' && !Array.isArray(markers)) {
      for (const [chapterId, value] of Object.entries(markers)) {
        if (!chapterId || !value || typeof value !== 'object' || Array.isArray(value)) continue;
        const candidate = value as Partial<ChapterMarker>;
        const marker: ChapterMarker = {
          revisit: candidate.revisit === true,
          important: candidate.important === true
        };
        if (marker.revisit || marker.important) fileState.markers[chapterId] = marker;
      }
    }
    if (fileState.resume || Object.keys(fileState.markers).length > 0) normalized.files[path] = fileState;
  }
  return normalized;
}

interface StorageHost {
  settings: PluginSettings;
  loadData: () => Promise<unknown>;
  saveData: (data: unknown) => Promise<void>;
  vault?: {
    getAbstractFileByPath?: (path: string) => unknown;
    on?: (event: string, callback: (file: FileLike) => void) => unknown;
  };
  registerEvent?: (eventRef: unknown) => void;
}

/** Persistence boundary for reading state; Markdown files are never touched. */
export class ReadingStorage {
  private readonly host: StorageHost;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(host: StorageHost) {
    this.host = host;
  }

  async load(): Promise<ReadingState> {
    const data = await this.host.loadData();
    const source = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const state = normalizeReadingState(source.readingState);
    this.host.settings.readingState = state;
    return state;
  }

  get state(): ReadingState {
    const state = this.host.settings.readingState;
    if (!state || !state.files) {
      this.host.settings.readingState = createEmptyReadingState();
    }
    return this.host.settings.readingState;
  }

  getFileState(fileOrPath: FileLike | string, create = false): ReadingFileState | null {
    const path = typeof fileOrPath === 'string' ? fileOrPath : fileOrPath?.path;
    if (!path) return null;
    let fileState = this.state.files[path];
    if (!fileState && create) fileState = this.state.files[path] = { markers: {} };
    return fileState || null;
  }

  setResume(fileOrPath: FileLike | string, resume: ReadingResume): boolean {
    const fileState = this.getFileState(fileOrPath, true);
    if (!fileState || fileState.resume?.chapterId === resume.chapterId) return false;
    fileState.resume = { ...resume };
    this.scheduleSave();
    return true;
  }

  toggleMarker(fileOrPath: FileLike | string, chapterId: string, kind: BookmarkKind): boolean {
    const fileState = this.getFileState(fileOrPath, true);
    if (!fileState) return false;
    const marker = fileState.markers[chapterId] || { revisit: false, important: false };
    marker[kind] = !marker[kind];
    if (marker.revisit || marker.important) fileState.markers[chapterId] = marker;
    else delete fileState.markers[chapterId];
    this.pruneEmpty(fileOrPath);
    void this.save();
    return marker[kind];
  }

  pruneDeletedPath(deletedPath: string): number {
    if (!deletedPath) return 0;
    const prefix = deletedPath.endsWith('/') ? deletedPath : `${deletedPath}/`;
    let removed = 0;
    for (const path of Object.keys(this.state.files)) {
      if (path === deletedPath || path.startsWith(prefix)) {
        delete this.state.files[path];
        removed += 1;
      }
    }
    if (removed) void this.save();
    return removed;
  }

  cleanupOrphans(): number {
    let removed = 0;
    for (const path of Object.keys(this.state.files)) {
      if (!this.host.vault?.getAbstractFileByPath?.(path)) {
        delete this.state.files[path];
        removed += 1;
      }
    }
    if (removed) void this.save();
    return removed;
  }

  registerVaultCleanup(): void {
    const eventRef = this.host.vault?.on?.('delete', (file) => this.pruneDeletedPath(file.path));
    if (eventRef !== undefined) this.host.registerEvent?.(eventRef);
  }

  async save(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.host.saveData({ ...this.host.settings, readingState: this.state });
  }

  dispose(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, 350);
  }

  private pruneEmpty(fileOrPath: FileLike | string): void {
    const path = typeof fileOrPath === 'string' ? fileOrPath : fileOrPath.path;
    const state = this.state.files[path];
    if (state && !state.resume && Object.keys(state.markers).length === 0) delete this.state.files[path];
  }
}

export default ReadingStorage;
