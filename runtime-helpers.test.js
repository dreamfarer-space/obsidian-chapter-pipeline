const assert = require('node:assert/strict');
const test = require('node:test');

const {
  hashHeadingSequence,
  nextCalibrationState,
  mergeSettingsWithLightweightDefaults
} = require('./src/runtime-helpers.js');

function heading(title, level, line) {
  return { heading: title, level, position: { start: { line } } };
}

test('heading fingerprint changes when an arbitrary middle heading changes', () => {
  const original = Array.from({ length: 100 }, (_, index) => heading(`Chapter ${index}`, 2, index * 3));
  const changed = original.map((item) => ({
    ...item,
    position: { start: { ...item.position.start } }
  }));
  changed[73].heading = 'Changed middle chapter';

  assert.notEqual(hashHeadingSequence(original), hashHeadingSequence(changed));
});

test('calibration stops after two consecutive sub-2px errors', () => {
  let state = { frames: 0, stableFrames: 0 };
  state = nextCalibrationState(state, 8);
  assert.equal(state.shouldContinue, true);
  state = nextCalibrationState(state, 1.5);
  assert.equal(state.shouldContinue, true);
  state = nextCalibrationState(state, 0.5);

  assert.equal(state.converged, true);
  assert.equal(state.shouldContinue, false);
  assert.equal(state.frames, 3);
});

test('calibration still terminates at the 24-frame hard cap', () => {
  let state = { frames: 0, stableFrames: 0 };
  for (let index = 0; index < 24; index += 1) {
    state = nextCalibrationState(state, 20);
  }

  assert.equal(state.hitCap, true);
  assert.equal(state.converged, false);
  assert.equal(state.shouldContinue, false);
  assert.equal(state.frames, 24);
});

test('fresh defaults are silent while persisted click sound remains respected', () => {
  const defaults = {
    enableSound: false,
    enableScrollSound: false,
    tooltipGlassmorphism: false
  };

  assert.deepEqual(mergeSettingsWithLightweightDefaults(defaults, {}), defaults);
  assert.equal(mergeSettingsWithLightweightDefaults(defaults, { enableSound: true }).enableSound, true);
  assert.equal(mergeSettingsWithLightweightDefaults(defaults, { enableSound: true }).enableScrollSound, false);
});
