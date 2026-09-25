const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const originalLoad = Module._load;
Module._load = function loadWithObsidianStub(request, parent, isMain) {
  if (request === 'obsidian') {
    return {
      getLanguage: () => 'en',
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function loadStepperModule() {
  const filename = path.join(__dirname, '../src/ui/stepper.ts');
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

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor() {
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.parentElement = null;
    this.removed = false;
    this.style = {};
    this.offsetTop = 0;
    this.offsetHeight = 0;
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    this.listeners.set(type, handlers.filter((candidate) => candidate !== handler));
  }

  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }

  append(child) {
    child.parentElement = this;
    this.children.push(child);
  }

  contains(candidate) {
    if (candidate === this) return true;
    return this.children.some((child) => child === candidate || child.contains(candidate));
  }

  remove() {
    this.removed = true;
  }
}

global.createEl = () => new FakeElement();

function chapter(title, level, line) {
  return { title, rawHeading: title, level, line, headingIndex: line, id: `${level}:${line}`, summaryMarkdown: '' };
}

test('Focus mode expands deep headings for keyboard traversal and resets after focus leaves', () => {
  const { StepperView } = loadStepperModule();
  const root = new FakeElement();
  const dashes = [new FakeElement(), new FakeElement(), new FakeElement(), new FakeElement()];
  dashes.forEach((dash) => root.append(dash));
  const chapters = [
    chapter('H1', 1, 0),
    chapter('H2', 2, 1),
    chapter('H3', 3, 2),
    chapter('H4', 4, 3),
  ];

  const stepper = new StepperView({
    container: new FakeElement(),
    chapters,
    onSelect() {},
    hierarchyMode: 'hover-expand',
    existingElement: root,
    existingDashes: dashes,
  });

  assert.equal(root.getAttribute('tabindex'), '0', 'rail is a keyboard entry point');
  assert.equal(root.getAttribute('aria-expanded'), 'false');
  assert.equal(dashes[0].getAttribute('tabindex'), '0');
  assert.equal(dashes[1].getAttribute('tabindex'), '0');
  assert.equal(dashes[2].getAttribute('tabindex'), '-1');
  assert.equal(dashes[3].getAttribute('tabindex'), '-1');
  assert.equal(dashes[2].getAttribute('aria-hidden'), 'true');
  assert.equal(dashes[2].classList.contains('is-collapsed'), true);

  root.dispatch('focusin', { target: root });

  assert.equal(root.getAttribute('aria-expanded'), 'true');
  assert.equal(root.classList.contains('is-keyboard-expanded'), true);
  assert.equal(dashes[2].getAttribute('tabindex'), '0');
  assert.equal(dashes[3].getAttribute('tabindex'), '0');
  assert.equal(dashes[2].getAttribute('aria-hidden'), 'false');
  assert.equal(dashes[2].classList.contains('is-collapsed'), false);
  assert.equal(dashes[3].classList.contains('is-collapsed'), false);

  root.dispatch('focusout', { relatedTarget: dashes[0] });
  assert.equal(root.getAttribute('aria-expanded'), 'true', 'moving focus within the rail must stay expanded');
  assert.equal(dashes[2].getAttribute('tabindex'), '0');

  root.dispatch('focusout', { relatedTarget: new FakeElement() });
  assert.equal(root.getAttribute('aria-expanded'), 'false');
  assert.equal(root.classList.contains('is-keyboard-expanded'), false);
  assert.equal(dashes[2].getAttribute('tabindex'), '-1');
  assert.equal(dashes[3].getAttribute('tabindex'), '-1');
  assert.equal(dashes[2].getAttribute('aria-hidden'), 'true');
  assert.equal(dashes[2].classList.contains('is-collapsed'), true);

  stepper.dispose();
  assert.equal(root.removed, true);
});

test('pointer hover keeps the existing collapsed CSS hook while synchronizing reachability', () => {
  const { StepperView } = loadStepperModule();
  const root = new FakeElement();
  const dashes = [new FakeElement(), new FakeElement()];
  dashes.forEach((dash) => root.append(dash));

  const stepper = new StepperView({
    container: new FakeElement(),
    chapters: [chapter('H1', 1, 0), chapter('H3', 3, 1)],
    onSelect() {},
    hierarchyMode: 'hover-expand',
    existingElement: root,
    existingDashes: dashes,
  });

  assert.equal(dashes[1].classList.contains('is-collapsed'), true);
  assert.equal(dashes[1].getAttribute('tabindex'), '-1');
  assert.equal(dashes[1].getAttribute('aria-hidden'), 'true');

  root.dispatch('pointerover', { target: dashes[0] });

  assert.equal(root.getAttribute('aria-expanded'), 'true');
  assert.equal(dashes[1].classList.contains('is-collapsed'), true,
    'the existing :hover CSS selector must remain responsible for pointer visuals');
  assert.equal(dashes[1].getAttribute('tabindex'), '0');
  assert.equal(dashes[1].getAttribute('aria-hidden'), 'false');

  root.dispatch('pointerout', { relatedTarget: dashes[0] });
  assert.equal(root.getAttribute('aria-expanded'), 'true', 'moving the pointer inside the rail must not collapse state');

  root.dispatch('pointerout', { relatedTarget: new FakeElement() });
  assert.equal(root.getAttribute('aria-expanded'), 'false');
  assert.equal(dashes[1].classList.contains('is-collapsed'), true);
  assert.equal(dashes[1].getAttribute('tabindex'), '-1');
  assert.equal(dashes[1].getAttribute('aria-hidden'), 'true');

  stepper.dispose();
});

test('non-Focus hierarchy modes do not add an extra rail tab stop', () => {
  const { StepperView } = loadStepperModule();
  const root = new FakeElement();
  const dashes = [new FakeElement(), new FakeElement()];
  dashes.forEach((dash) => root.append(dash));

  const stepper = new StepperView({
    container: new FakeElement(),
    chapters: [chapter('H1', 1, 0), chapter('H3', 3, 1)],
    onSelect() {},
    hierarchyMode: 'all',
    existingElement: root,
    existingDashes: dashes,
  });

  assert.equal(root.getAttribute('tabindex'), null);
  assert.equal(root.getAttribute('aria-expanded'), null);
  assert.equal(dashes[1].getAttribute('tabindex'), '0');
  assert.equal(dashes[1].getAttribute('aria-hidden'), 'false');

  stepper.dispose();
});


test('adopted stepper owns active classes and progress indicator state', () => {
  const { StepperView } = loadStepperModule();
  const root = new FakeElement();
  const dashes = [new FakeElement(), new FakeElement(), new FakeElement()];
  dashes.forEach((dash) => root.append(dash));
  dashes[1].offsetTop = 30;
  dashes[1].offsetHeight = 10;
  const progressIndicator = new FakeElement();

  const stepper = new StepperView({
    container: new FakeElement(),
    chapters: [chapter('H1', 1, 0), chapter('H2', 2, 1), chapter('H2b', 2, 2)],
    onSelect() {},
    hierarchyMode: 'all',
    existingElement: root,
    existingDashes: dashes,
    existingProgressIndicator: progressIndicator,
  });

  stepper.setActive(1, 'all');
  assert.equal(dashes[0].classList.contains('active'), false);
  assert.equal(dashes[1].classList.contains('active'), true);
  assert.equal(dashes[2].classList.contains('active'), false);
  assert.equal(progressIndicator.style.height, '35px');

  stepper.setActive(2, 'all');
  assert.equal(dashes[1].classList.contains('active'), false);
  assert.equal(dashes[2].classList.contains('active'), true);
  assert.equal(progressIndicator.style.height, '100%');

  stepper.dispose();
});
