interface HeadingLike {
  heading?: string;
  level?: number;
  position?: { start?: { line?: number } };
}

interface FileLike {
  path?: string;
  stat?: { mtime?: number };
}

export interface RenderSignaturePluginLike {
  settings?: Record<string, unknown>;
  documentRevisions?: Map<string, number>;
  app?: {
    metadataCache?: {
      getFileCache?: (file: unknown) => { headings?: HeadingLike[] } | null;
    };
  };
}

interface ViewLike {
  file?: FileLike;
}

/** Compact deterministic FNV-1a hash for potentially large heading/marker inputs. */
export function hashRenderInput(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Build the structural signature that determines whether a mounted rail can be
 * retained. Sound settings are intentionally excluded because event handlers
 * read them lazily and they do not change the mounted DOM/resources.
 */
export function buildViewRenderSignature(pluginValue: unknown, view: object): string {
  const plugin = pluginValue as RenderSignaturePluginLike;
  const host = view as ViewLike;
  const file = host.file && typeof host.file === 'object' ? host.file : undefined;
  const filePath = typeof file?.path === 'string' ? file.path : '';
  const headings = filePath
    ? (plugin.app?.metadataCache?.getFileCache?.(file)?.headings ?? [])
    : [];
  const headingSignature = hashRenderInput(headings.map((heading) => (
    `${heading.level ?? ''}:${heading.heading ?? ''}:${heading.position?.start?.line ?? ''}`
  )).join('\u0001'));

  const settings = plugin.settings ?? {};
  const readingState = settings.readingState as {
    files?: Record<string, { markers?: Record<string, { revisit?: boolean; important?: boolean }> }>;
  } | undefined;
  const markers = settings.readingBookmarksEnabled === true
    ? (readingState?.files?.[filePath]?.markers ?? {})
    : {};
  const markerSignature = hashRenderInput(Object.keys(markers).sort().map((chapterId) => {
    const marker = markers[chapterId];
    return `${chapterId}:${marker?.revisit === true ? 1 : 0}:${marker?.important === true ? 1 : 0}`;
  }).join('\u0001'));
  return [
    filePath,
    Number(file?.stat?.mtime) || 0,
    plugin.documentRevisions?.get(filePath) ?? 0,
    headings.length,
    headingSignature,
    settings.minHeadingLevel ?? 1,
    settings.maxHeadingLevel ?? 6,
    settings.ignoreFirstH1 === true ? 1 : 0,
    settings.showExcerpt === false ? 0 : 1,
    settings.excerptLength ?? 140,
    settings.activeColor ?? '',
    settings.customActiveColor ?? '',
    settings.narrowThreshold ?? 600,
    settings.dockPosition ?? 'left',
    settings.hierarchyMode ?? 'all',
    settings.showProgressRail === true ? 1 : 0,
    settings.tooltipGlassmorphism === false ? 0 : 1,
    settings.showChapterOrder === true ? 1 : 0,
    settings.readingBookmarksEnabled === true ? 1 : 0,
    markerSignature,
  ].join('|');
}

/** Return true only when the structural signature matches and the session still owns the current mount. */
export function canReuseRenderedSession(
  session: {
    renderSignature: string;
    isCurrentMount: () => boolean;
  } | undefined,
  renderSignature: string
): boolean {
  return Boolean(
    session
    && session.renderSignature === renderSignature
    && session.isCurrentMount()
  );
}
