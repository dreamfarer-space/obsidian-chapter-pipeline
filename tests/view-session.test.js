const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

function loadViewSessionModule() {
  const filename = path.join(__dirname, '../src/views/view-session.ts');
  const result = buildSync({
    entryPoints: [filename],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    write: false,
    external: ['obsidian'],
  });

  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(result.outputFiles[0].text, filename);
  return compiled.exports;
}

test('getLivePreviewViewportLine converts the screen baseline into CodeMirror document coordinates', () => {
  const { getLivePreviewViewportLine } = loadViewSessionModule();
  let measuredHeight = null;
  let lineAtPosition = null;

  const container = {
    getBoundingClientRect() {
      return { top: 100 };
    },
  };
  const view = {
    editor: {
      cm: {
        documentTop: 130,
        scaleY: 2,
        lineBlockAtHeight(height) {
          measuredHeight = height;
          return { from: 42 };
        },
        state: {
          doc: {
            lineAt(position) {
              lineAtPosition = position;
              return { number: 501 };
            },
          },
        },
      },
    },
  };

  assert.equal(getLivePreviewViewportLine(view, container), 500);
  assert.equal(measuredHeight, 20, 'screen baseline 170 should map to document height (170 - 130) / 2');
  assert.equal(lineAtPosition, 42);
});

test('getLivePreviewViewportLine clamps above-document baselines and falls back from invalid scaleY', () => {
  const { getLivePreviewViewportLine } = loadViewSessionModule();
  const measuredHeights = [];

  const container = {
    getBoundingClientRect() {
      return { top: 10 };
    },
  };
  const view = {
    editor: {
      cm: {
        documentTop: 100,
        scaleY: 0,
        lineBlockAtHeight(height) {
          measuredHeights.push(height);
          return { from: 0 };
        },
        state: {
          doc: {
            lineAt() {
              return { number: 1 };
            },
          },
        },
      },
    },
  };

  assert.equal(getLivePreviewViewportLine(view, container), 0);
  assert.deepEqual(measuredHeights, [0]);
});
