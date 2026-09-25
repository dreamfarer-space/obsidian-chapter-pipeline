export interface HeadingSequenceItem {
  level?: unknown;
  heading?: unknown;
  position?: { start?: { line?: unknown } };
}

export interface CalibrationState {
  frames: number;
  stableFrames: number;
  converged: boolean;
  hitCap: boolean;
  shouldContinue: boolean;
}

export interface CalibrationOptions {
  maxFrames?: number;
  threshold?: number;
  stableFramesRequired?: number;
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Compute a deterministic 32-bit FNV-1a fingerprint over a heading sequence. */
export function hashHeadingSequence(headings: HeadingSequenceItem[] = []): string {
  let hash = FNV_OFFSET_BASIS;

  const mix = (value: string | number | boolean | null | undefined): void => {
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
    // Field separator so adjacent values cannot collapse into the same stream.
    hash ^= 0x1f;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  };

  headings.forEach((heading, index) => {
    mix(index);
    mix(heading?.level);
    mix(heading?.heading);
    mix(heading?.position?.start?.line);
  });

  return hash.toString(36);
}

/** Advance frame-bounded Reading View scroll calibration state. */
export function nextCalibrationState(
  state: { frames?: number; stableFrames?: number } = {},
  error = Number.POSITIVE_INFINITY,
  options: CalibrationOptions = {}
): CalibrationState {
  const maxFrames = Number.isFinite(options.maxFrames) ? Math.max(1, options.maxFrames!) : 24;
  const threshold = Number.isFinite(options.threshold) ? Math.max(0, options.threshold!) : 2;
  const stableFramesRequired = Number.isFinite(options.stableFramesRequired)
    ? Math.max(1, options.stableFramesRequired!)
    : 2;

  const frames = (Number.isFinite(state.frames) ? state.frames! : 0) + 1;
  const absoluteError = Number.isFinite(error) ? Math.abs(error) : Number.POSITIVE_INFINITY;
  const stableFrames = absoluteError < threshold
    ? (Number.isFinite(state.stableFrames) ? state.stableFrames! : 0) + 1
    : 0;
  const converged = stableFrames >= stableFramesRequired;
  const hitCap = frames >= maxFrames;

  return {
    frames,
    stableFrames,
    converged,
    hitCap,
    shouldContinue: !converged && !hitCap
  };
}

/** Merge persisted settings while keeping fresh sound/glassmorphism defaults lightweight. */
export function mergeSettingsWithLightweightDefaults<T extends Record<string, any>>(
  defaults: T,
  persisted: unknown
): T {
  const saved = persisted && typeof persisted === 'object' && !Array.isArray(persisted)
    ? (persisted as Record<string, unknown>)
    : {};
  const merged = Object.assign({}, defaults, saved) as Record<string, any>;

  if (typeof merged.enableSound !== 'boolean') merged.enableSound = false;
  if (typeof merged.enableScrollSound !== 'boolean') merged.enableScrollSound = false;
  if (typeof merged.tooltipGlassmorphism !== 'boolean') merged.tooltipGlassmorphism = false;

  return merged as T;
}
