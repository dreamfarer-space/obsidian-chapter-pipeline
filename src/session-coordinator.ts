export interface DisposableSession {
  dispose(): void;
}

/**
 * Owns per-view session generations and disposal independently from the legacy
 * plugin coordinator. A generation token prevents stale async attaches from
 * reclaiming a view after a newer attach or detach has already won.
 */
export class SessionCoordinator<
  TView extends object = object,
  TSession extends DisposableSession = DisposableSession,
> {
  private readonly sessions = new Map<TView, TSession>();
  private readonly generations = new WeakMap<TView, number>();
  private readonly knownViews = new Set<TView>();

  /** Start a new attach generation and dispose any currently owned session. */
  begin(view: TView): number {
    this.knownViews.add(view);
    const generation = (this.generations.get(view) ?? 0) + 1;
    this.generations.set(view, generation);
    this.disposeCurrent(view);
    return generation;
  }

  /** Return whether an async attach still owns the current generation. */
  isCurrent(view: TView, generation: number): boolean {
    return this.generations.get(view) === generation;
  }

  /** Return the currently mounted session for a view, if one exists. */
  get(view: TView): TSession | undefined {
    return this.sessions.get(view);
  }

  /**
   * Adopt a newly created session only if its generation is still current.
   * Stale sessions are disposed immediately so observers/listeners cannot leak.
   */
  adopt(view: TView, generation: number, session: TSession): boolean {
    if (!this.isCurrent(view, generation)) {
      session.dispose();
      return false;
    }

    const previous = this.sessions.get(view);
    if (previous && previous !== session) previous.dispose();
    this.sessions.set(view, session);
    return true;
  }

  /** Dispose one view and invalidate any in-flight async attach for it. */
  detach(view: TView): void {
    this.knownViews.add(view);
    this.generations.set(view, (this.generations.get(view) ?? 0) + 1);
    this.disposeCurrent(view);
  }

  /** Dispose sessions whose views are no longer mounted. */
  disposeUnmounted(mountedViews: ReadonlySet<TView>): void {
    for (const view of Array.from(this.sessions.keys())) {
      if (!mountedViews.has(view)) this.detach(view);
    }
  }

  /** Dispose every owned session and invalidate every known attach generation. */
  disposeAll(): void {
    for (const view of this.knownViews) {
      this.generations.set(view, (this.generations.get(view) ?? 0) + 1);
    }
    for (const session of this.sessions.values()) session.dispose();
    this.sessions.clear();
    this.knownViews.clear();
  }

  private disposeCurrent(view: TView): void {
    const current = this.sessions.get(view);
    if (!current) return;
    current.dispose();
    this.sessions.delete(view);
  }
}

export default SessionCoordinator;
