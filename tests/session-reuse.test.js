const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

function loadRenderSignatureModule() {
  const filename = path.join(__dirname, '../src/views/render-signature.ts');
  const result = buildSync({
    entryPoints: [filename],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    write: false,
  });
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(result.outputFiles[0].text, filename);
  return compiled.exports;
}

function createSignatureHarness() {
  const headings = [
    { heading: 'First', level: 1, position: { start: { line: 0 } } },
    { heading: 'Second', level: 2, position: { start: { line: 4 } } },
  ];
  const file = { path: 'note.md', stat: { mtime: 100 } };
  const container = {};
  const view = { file, contentEl: container };
  const plugin = {
    documentRevisions: new Map([['note.md', 3]]),
    settings: {
      minHeadingLevel: 1,
      maxHeadingLevel: 2,
      ignoreFirstH1: false,
      showExcerpt: true,
      excerptLength: 140,
      activeColor: '#3b82f6',
      customActiveColor: '#3b82f6',
      narrowThreshold: 600,
      dockPosition: 'left',
      hierarchyMode: 'hover-expand',
      showProgressRail: false,
      tooltipGlassmorphism: true,
      showChapterOrder: false,
      readingBookmarksEnabled: false,
      readingState: { files: {} },
      enableSound: false,
      soundVolume: 50,
    },
    app: { metadataCache: { getFileCache: () => ({ headings }) } },
    isReadingMode: () => true,
  };
  return { headings, plugin, view };
}

function loadProductionPlugin() {
  class Plugin {
    constructor(app, manifest) {
      this.app = app;
      this.manifest = manifest;
    }
    async loadData() { return {}; }
    async saveData() {}
    addSettingTab() {}
    addCommand() {}
    registerEvent() {}
  }
  class MarkdownView {}
  class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; } }
  class SuggestModal { constructor(app) { this.app = app; } }
  class Setting { constructor() {} }
  class Menu { addItem() { return this; } }
  class Notice {}

  const originalLoad = Module._load;
  Module._load = function loadWithObsidianStub(request, parent, isMain) {
    if (request === 'obsidian') {
      return {
        Plugin,
        MarkdownView,
        PluginSettingTab,
        SuggestModal,
        Setting,
        Menu,
        Notice,
        MarkdownRenderer: { render() {} },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[require.resolve('../main.js')];
  const ProductionPlugin = require('../main.js');
  Module._load = originalLoad;
  return { MarkdownView, ProductionPlugin };
}

function createProductionReuseHarness() {
  const { MarkdownView, ProductionPlugin } = loadProductionPlugin();
  const headings = [
    { heading: 'First', level: 1, position: { start: { line: 0 } } },
    { heading: 'Second', level: 2, position: { start: { line: 4 } } },
  ];
  const stepper = { remove() {} };
  const scroller = {
    scrollTop: 0,
    clientHeight: 500,
    scrollHeight: 1000,
    addEventListener() {},
    removeEventListener() {},
  };
  const container = {
    querySelector(selector) {
      if (selector === '.codex-stepper-container') return stepper;
      if (selector === '.cm-scroller') return scroller;
      return null;
    },
  };
  const view = new MarkdownView();
  view.file = { path: 'note.md', stat: { mtime: 100 } };
  view.contentEl = container;
  view.getMode = () => 'source';

  let cachedReads = 0;
  const app = {
    workspace: {
      getLeavesOfType: () => [{ view }],
      getActiveViewOfType: () => view,
    },
    metadataCache: { getFileCache: () => ({ headings }) },
    vault: { cachedRead: () => { cachedReads += 1; return new Promise(() => {}); } },
  };
  const plugin = new ProductionPlugin(app, {});
  plugin.settings.maxHeadingLevel = 2;
  plugin.settings.hierarchyMode = 'hover-expand';
  plugin.documentRevisions.set('note.md', 3);

  return {
    getCachedReads: () => cachedReads,
    plugin,
    scroller,
    stepper,
    view,
  };
}

test('layout/active-leaf refreshes keep the same render signature when inputs are unchanged', () => {
  const { buildViewRenderSignature } = loadRenderSignatureModule();
  const { plugin, view } = createSignatureHarness();
  assert.equal(buildViewRenderSignature(plugin, view), buildViewRenderSignature(plugin, view));
});

test('heading, revision, and structural setting changes invalidate the render signature', () => {
  const { buildViewRenderSignature } = loadRenderSignatureModule();

  const headingHarness = createSignatureHarness();
  const headingBefore = buildViewRenderSignature(headingHarness.plugin, headingHarness.view);
  headingHarness.headings.push({ heading: 'Third', level: 2, position: { start: { line: 8 } } });
  assert.notEqual(buildViewRenderSignature(headingHarness.plugin, headingHarness.view), headingBefore);

  const revisionHarness = createSignatureHarness();
  const revisionBefore = buildViewRenderSignature(revisionHarness.plugin, revisionHarness.view);
  revisionHarness.plugin.documentRevisions.set('note.md', 4);
  assert.notEqual(buildViewRenderSignature(revisionHarness.plugin, revisionHarness.view), revisionBefore);

  const settingHarness = createSignatureHarness();
  const settingBefore = buildViewRenderSignature(settingHarness.plugin, settingHarness.view);
  settingHarness.plugin.settings.showProgressRail = true;
  assert.notEqual(buildViewRenderSignature(settingHarness.plugin, settingHarness.view), settingBefore);
});

test('non-render sound changes do not invalidate the mounted rail signature', () => {
  const { buildViewRenderSignature } = loadRenderSignatureModule();
  const { plugin, view } = createSignatureHarness();
  const before = buildViewRenderSignature(plugin, view);
  plugin.settings.enableSound = true;
  plugin.settings.soundVolume = 10;
  assert.equal(buildViewRenderSignature(plugin, view), before);
});

test('session reuse requires identical signature, stepper, and tracking scroller identity', () => {
  const { canReuseRenderedSession } = loadRenderSignatureModule();
  const stepper = {};
  const scroller = {};
  const session = {
    renderSignature: 'same',
    stepper: { element: stepper },
    trackingContainer: scroller,
  };
  assert.equal(canReuseRenderedSession(session, 'same', stepper, scroller), true);
  assert.equal(canReuseRenderedSession(session, 'changed', stepper, scroller), false);
  assert.equal(canReuseRenderedSession(session, 'same', {}, scroller), false);
  assert.equal(canReuseRenderedSession(session, 'same', stepper, {}), false);
  assert.equal(canReuseRenderedSession(undefined, 'same', stepper, scroller), false);
});

test('production updateAllMarkdownViews preserves an unchanged mounted session and skips cachedRead', () => {
  const { buildViewRenderSignature } = loadRenderSignatureModule();
  const harness = createProductionReuseHarness();
  let disposed = 0;
  const session = {
    renderSignature: buildViewRenderSignature(harness.plugin, harness.view),
    stepper: { element: harness.stepper },
    trackingContainer: harness.scroller,
    dispose() { disposed += 1; },
  };
  harness.plugin.viewSessions = new Map([[harness.view, session]]);
  harness.plugin.viewSessionVersions = new Map([[harness.view, 1]]);

  harness.plugin.updateAllMarkdownViews();
  harness.plugin.updateAllMarkdownViews();

  assert.equal(harness.plugin.viewSessions.get(harness.view), session);
  assert.equal(disposed, 0);
  assert.equal(harness.getCachedReads(), 0, 'unchanged workspace refreshes must not re-read and rebuild the note');
});

test('production updateAllMarkdownViews invalidates reuse when the tracking scroller is replaced', async () => {
  const { buildViewRenderSignature } = loadRenderSignatureModule();
  const harness = createProductionReuseHarness();
  global.MutationObserver = class MutationObserver { observe() {} disconnect() {} };

  let disposed = 0;
  const session = {
    renderSignature: buildViewRenderSignature(harness.plugin, harness.view),
    stepper: { element: harness.stepper },
    trackingContainer: {},
    dispose() { disposed += 1; },
  };
  harness.plugin.viewSessions = new Map([[harness.view, session]]);
  harness.plugin.viewSessionVersions = new Map([[harness.view, 1]]);

  harness.plugin.updateAllMarkdownViews();
  await Promise.resolve();

  assert.equal(disposed, 1);
  assert.equal(harness.getCachedReads(), 1, 'replaced tracking DOM must rebuild the session binding');
});

test('production updateAllMarkdownViews invalidates a session after a structural setting change', async () => {
  const { buildViewRenderSignature } = loadRenderSignatureModule();
  const harness = createProductionReuseHarness();
  global.MutationObserver = class MutationObserver { observe() {} disconnect() {} };

  let disposed = 0;
  const session = {
    renderSignature: buildViewRenderSignature(harness.plugin, harness.view),
    stepper: { element: harness.stepper },
    trackingContainer: harness.scroller,
    dispose() { disposed += 1; },
  };
  harness.plugin.viewSessions = new Map([[harness.view, session]]);
  harness.plugin.viewSessionVersions = new Map([[harness.view, 1]]);

  harness.plugin.settings.showProgressRail = true;
  harness.plugin.updateAllMarkdownViews();
  await Promise.resolve();

  assert.equal(disposed, 1);
  assert.equal(harness.getCachedReads(), 1, 'structural changes must route through the rebuild path');
});
