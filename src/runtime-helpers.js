'use strict';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function hashHeadingSequence(headings = []) {
  let hash = FNV_OFFSET_BASIS;

  const mix = (value) => {
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

function nextCalibrationState(state = {}, error = Number.POSITIVE_INFINITY, options = {}) {
  const maxFrames = Number.isFinite(options.maxFrames) ? Math.max(1, options.maxFrames) : 24;
  const threshold = Number.isFinite(options.threshold) ? Math.max(0, options.threshold) : 2;
  const stableFramesRequired = Number.isFinite(options.stableFramesRequired)
    ? Math.max(1, options.stableFramesRequired)
    : 2;

  const frames = (Number.isFinite(state.frames) ? state.frames : 0) + 1;
  const absoluteError = Number.isFinite(error) ? Math.abs(error) : Number.POSITIVE_INFINITY;
  const stableFrames = absoluteError < threshold
    ? (Number.isFinite(state.stableFrames) ? state.stableFrames : 0) + 1
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

function mergeSettingsWithLightweightDefaults(defaults, persisted) {
  const saved = persisted && typeof persisted === 'object' && !Array.isArray(persisted)
    ? persisted
    : {};
  const merged = Object.assign({}, defaults, saved);

  if (typeof merged.enableSound !== 'boolean') merged.enableSound = false;
  if (typeof merged.enableScrollSound !== 'boolean') merged.enableScrollSound = false;
  if (typeof merged.tooltipGlassmorphism !== 'boolean') merged.tooltipGlassmorphism = false;

  return merged;
}

module.exports = {
  hashHeadingSequence,
  nextCalibrationState,
  mergeSettingsWithLightweightDefaults
};
