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
    ProductionPlugin,
    scroller,
    stepper,
    view,
  };
}

function seedSession(harness, session) {
  const coordinator = new harness.ProductionPlugin.SessionCoordinator();
  const generation = coordinator.begin(harness.view);
  assert.equal(coordinator.adopt(harness.view, generation, session), true);
  harness.plugin.sessionCoordinator = coordinator;
  return coordinator;
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

test('session reuse requires an identical signature and a current mount contract', () => {
  const { canReuseRenderedSession } = loadRenderSignatureModule();
  const currentSession = { renderSignature: 'same', isCurrentMount: () => true };
  const replacedSession = { renderSignature: 'same', isCurrentMount: () => false };
  assert.equal(canReuseRenderedSession(currentSession, 'same'), true);
  assert.equal(canReuseRenderedSession(currentSession, 'changed'), false);
  assert.equal(canReuseRenderedSession(replacedSession, 'same'), false);
  assert.equal(canReuseRenderedSession(undefined, 'same'), false);
});

test('session coordinator rejects stale async adoption and disposes the stale session', () => {
  const { ProductionPlugin } = loadProductionPlugin();
  const coordinator = new ProductionPlugin.SessionCoordinator();
  const view = {};
  let staleDisposed = 0;
  let currentDisposed = 0;

  const staleGeneration = coordinator.begin(view);
  const currentGeneration = coordinator.begin(view);
  assert.equal(coordinator.adopt(view, staleGeneration, { dispose() { staleDisposed += 1; } }), false);
  const currentSession = { dispose() { currentDisposed += 1; } };
  assert.equal(coordinator.adopt(view, currentGeneration, currentSession), true);
  assert.equal(coordinator.get(view), currentSession);
  assert.equal(staleDisposed, 1);

  coordinator.detach(view);
  assert.equal(currentDisposed, 1);
  assert.equal(coordinator.get(view), undefined);
});

test('production updateAllMarkdownViews preserves an unchanged mounted session and skips cachedRead', () => {
  const { buildViewRenderSignature } = loadRenderSignatureModule();
  const harness = createProductionReuseHarness();
  let disposed = 0;
  const session = {
    renderSignature: buildViewRenderSignature(harness.plugin, harness.view),
    stepper: { element: harness.stepper },
    trackingContainer: harness.scroller,
    isCurrentMount: () => true,
    dispose() { disposed += 1; },
  };
  const coordinator = seedSession(harness, session);

  harness.plugin.updateAllMarkdownViews();
  harness.plugin.updateAllMarkdownViews();

  assert.equal(coordinator.get(harness.view), session);
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
    isCurrentMount: () => false,
    dispose() { disposed += 1; },
  };
  seedSession(harness, session);

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
    isCurrentMount: () => true,
    dispose() { disposed += 1; },
  };
  seedSession(harness, session);

  harness.plugin.settings.showProgressRail = true;
  harness.plugin.updateAllMarkdownViews();
  await Promise.resolve();

  assert.equal(disposed, 1);
  assert.equal(harness.getCachedReads(), 1, 'structural changes must route through the rebuild path');
});

test('buildViewRenderSignature and updateAllMarkdownViews safely handle deferred views without file', async () => {
  const { buildViewRenderSignature } = loadRenderSignatureModule();
  const harness = createProductionReuseHarness();
  global.MutationObserver = class MutationObserver { observe() {} disconnect() {} };

  harness.plugin.app.metadataCache.getFileCache = (targetFile) => {
    if (!targetFile || typeof targetFile.path !== 'string') {
      throw new TypeError("Cannot read properties of undefined (reading 'path')");
    }
    return { headings: [] };
  };

  const deferredView = { contentEl: {} };
  assert.doesNotThrow(() => buildViewRenderSignature(harness.plugin, deferredView));

  const extracted = harness.plugin.extractChapters('# Heading 1\n\nBody\n\n## Heading 2', undefined);
  assert.equal(extracted.length, 2, 'extractChapters must fall back to markdown headings without calling getFileCache(undefined)');
  assert.deepEqual(extracted.map((chapter) => chapter.title), ['Heading 1', 'Heading 2']);

  harness.plugin.app.workspace.getLeavesOfType = () => [
    { isDeferred: true, view: deferredView },
    { isDeferred: false, view: harness.view },
  ];

  assert.doesNotThrow(() => harness.plugin.updateAllMarkdownViews());
  await Promise.resolve();
  assert.equal(harness.getCachedReads(), 1, 'deferred tab without file must not abort subsequent active note attachment');
});

test('production entry point retires legacy-main.js and uses typed class hierarchy without prototype monkey-patching', () => {
  const fs = require('node:fs');
  const mainSource = fs.readFileSync(path.join(__dirname, '../src/main.ts'), 'utf8');
  const typedCoordinatorPath = path.join(__dirname, '../src/plugin-coordinator.ts');
  assert.equal(mainSource.includes('legacy-main'), false, 'src/main.ts must not require src/legacy-main.js');
  assert.equal(fs.existsSync(typedCoordinatorPath), true, 'src/plugin-coordinator.ts must own base coordinator');
  assert.deepEqual(require('../src/legacy-main.js'), {}, 'src/legacy-main.js must have zero runtime responsibility');

  const { ProductionPlugin } = loadProductionPlugin();
  assert.equal(
    Boolean(ProductionPlugin.prototype.__chapterIssue14Patched || ProductionPlugin.prototype.__readingIdentityV2Installed || ProductionPlugin.prototype.__typedSessionsInstalled),
    false,
    'production prototype must use class inheritance rather than monkey-patch flags'
  );
});


