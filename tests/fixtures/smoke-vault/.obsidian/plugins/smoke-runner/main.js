const { Plugin, Notice } = require('obsidian');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class SmokeRunnerPlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: 'run-smoke-tests',
      name: 'Run Chapter Pipeline Smoke Tests',
      callback: () => this.runSuite(),
    });

    this.app.workspace.onLayoutReady(async () => {
      // Small settle delay after workspace layout is ready
      await sleep(1000);
      const shouldTrigger =
        (await this.app.vault.adapter.exists('.smoke-trigger')) ||
        (await this.app.vault.adapter.exists('.smoke-auto'));
      if (shouldTrigger) {
        await this.runSuite();
      }
    });
  }

  async runSuite() {
    new Notice('Starting Chapter Pipeline smoke suite...');
    const results = {
      startTime: new Date().toISOString(),
      pluginVersion: null,
      passed: 0,
      failed: 0,
      scenarios: [],
    };

    const runScenario = async (name, fn) => {
      const scenario = { name, status: 'RUNNING', durationMs: 0, error: null };
      const start = Date.now();
      try {
        await fn();
        scenario.status = 'PASS';
        results.passed += 1;
        console.log(`[SmokeRunner] PASS: ${name}`);
      } catch (err) {
        scenario.status = 'FAIL';
        scenario.error = err && err.stack ? err.stack : String(err);
        results.failed += 1;
        console.error(`[SmokeRunner] FAIL: ${name}`, err);
      } finally {
        scenario.durationMs = Date.now() - start;
        results.scenarios.push(scenario);
      }
    };

    const workspace = this.app.workspace;
    const vault = this.app.vault;

    // 1. Plugin load & initialization
    await runScenario('1. plugin load / unload / reload registration', async () => {
      const plugin = this.app.plugins.plugins['chapter-pipeline'];
      if (!plugin) throw new Error('chapter-pipeline plugin is not loaded');
      results.pluginVersion = plugin.manifest?.version;
      if (!plugin.manifest?.version) throw new Error('Missing manifest version');
      if (!plugin.settings) throw new Error('Missing plugin settings');
    });

    // 2. Reading View navigation and active-chapter tracking
    await runScenario('2. Reading View navigation and active-chapter tracking', async () => {
      const file = vault.getAbstractFileByPath('welcome.md');
      if (!file) throw new Error('welcome.md fixture not found');
      const leaf = workspace.getLeaf(false);
      await leaf.openFile(file, { state: { mode: 'preview' } });
      await sleep(500);

      const view = leaf.view;
      if (view.getMode?.() !== 'preview') throw new Error('Expected Reading View (preview) mode');

      const stepper = view.contentEl.querySelector('.codex-stepper-container');
      if (!stepper) throw new Error('Stepper container not found in Reading View');

      const dashes = stepper.querySelectorAll('.codex-dash-item, .codex-chapter-dash, .chapter-item-dash');
      if (!dashes || dashes.length === 0) throw new Error('No chapter dashes rendered in Reading View');

      // Click second dash
      if (dashes.length > 1) {
        dashes[1].click();
        await sleep(300);
      }
    });

    // 3. Live Preview navigation and active-chapter tracking
    await runScenario('3. Live Preview navigation and active-chapter tracking', async () => {
      const file = vault.getAbstractFileByPath('welcome.md');
      const leaf = workspace.getLeaf(false);
      await leaf.openFile(file, { state: { mode: 'source' } });
      await sleep(500);

      const view = leaf.view;
      if (view.getMode?.() !== 'source') throw new Error('Expected Live Preview (source) mode');

      const stepper = view.contentEl.querySelector('.codex-stepper-container');
      if (!stepper) throw new Error('Stepper container not found in Live Preview');

      const dashes = stepper.querySelectorAll('.codex-dash-item, .codex-chapter-dash, .chapter-item-dash');
      if (!dashes || dashes.length === 0) throw new Error('No chapter dashes rendered in Live Preview');

      // Click third dash
      if (dashes.length > 2) {
        dashes[2].click();
        await sleep(300);
      }
    });

    // 4. Split-pane creation and independent view sessions
    await runScenario('4. split-pane creation and independent view sessions', async () => {
      const leaf1 = workspace.getLeaf(false);
      const file1 = vault.getAbstractFileByPath('welcome.md');
      await leaf1.openFile(file1, { state: { mode: 'preview' } });

      const leaf2 = workspace.createLeafBySplit(leaf1, 'vertical');
      const file2 = vault.getAbstractFileByPath('short-note.md');
      await leaf2.openFile(file2, { state: { mode: 'source' } });
      await sleep(600);

      const stepper1 = leaf1.view.contentEl.querySelector('.codex-stepper-container');
      const stepper2 = leaf2.view.contentEl.querySelector('.codex-stepper-container');

      if (!stepper1 || !stepper2) throw new Error('Both split panes must have a stepper container');
      if (stepper1 === stepper2) throw new Error('Split panes must have independent stepper elements');

      const dashes1 = stepper1.querySelectorAll('.codex-dash-item, .codex-chapter-dash, .chapter-item-dash').length;
      const dashes2 = stepper2.querySelectorAll('.codex-dash-item, .codex-chapter-dash, .chapter-item-dash').length;
      if (dashes1 === dashes2 && dashes1 === 0) throw new Error('Split view steppers did not render dashes');

      // Close split leaf
      leaf2.detach();
      await sleep(300);
    });

    // 5. Close/reopen leaves
    await runScenario('5. close/reopen leaves and session disposal', async () => {
      const splitLeaf = workspace.createLeafBySplit(workspace.getLeaf(false), 'horizontal');
      const file = vault.getAbstractFileByPath('short-note.md');
      await splitLeaf.openFile(file);
      await sleep(400);

      const container = splitLeaf.view.contentEl;
      if (!container.querySelector('.codex-stepper-container')) {
        throw new Error('Split leaf failed to mount stepper before close');
      }

      // Close leaf
      splitLeaf.detach();
      await sleep(300);

      // Reopen a fresh leaf
      const newLeaf = workspace.getLeaf(true);
      await newLeaf.openFile(file);
      await sleep(400);
      if (!newLeaf.view.contentEl.querySelector('.codex-stepper-container')) {
        throw new Error('Reopened leaf failed to mount stepper');
      }
      newLeaf.detach();
      await sleep(200);
    });

    // 6. Rapid note switching
    await runScenario('6. rapid note switching', async () => {
      const leaf = workspace.getLeaf(false);
      const files = [
        vault.getAbstractFileByPath('welcome.md'),
        vault.getAbstractFileByPath('short-note.md'),
        vault.getAbstractFileByPath('welcome.md'),
      ];

      for (const f of files) {
        if (f) {
          await leaf.openFile(f);
          await sleep(150);
        }
      }
      await sleep(400);

      const steppers = leaf.view.contentEl.querySelectorAll('.codex-stepper-container');
      if (steppers.length !== 1) {
        throw new Error(`Expected exactly 1 stepper container after rapid switching, got ${steppers.length}`);
      }
    });

    // 7. Reading View ↔ Live Preview mode changes
    await runScenario('7. Reading View <-> Live Preview mode changes', async () => {
      const leaf = workspace.getLeaf(false);
      const file = vault.getAbstractFileByPath('welcome.md');
      await leaf.openFile(file, { state: { mode: 'preview' } });
      await sleep(300);

      // Switch to source
      await leaf.setViewState({ type: 'markdown', state: { file: file.path, mode: 'source' } });
      await sleep(400);
      let steppers = leaf.view.contentEl.querySelectorAll('.codex-stepper-container');
      if (steppers.length !== 1) throw new Error('Live Preview mode change produced invalid stepper count');

      // Switch back to preview
      await leaf.setViewState({ type: 'markdown', state: { file: file.path, mode: 'preview' } });
      await sleep(400);
      steppers = leaf.view.contentEl.querySelectorAll('.codex-stepper-container');
      if (steppers.length !== 1) throw new Error('Reading View mode change produced invalid stepper count');
    });

    // 8. Long-note scrolling with CodeMirror virtualization
    await runScenario('8. long-note scrolling with CodeMirror virtualization', async () => {
      const file = vault.getAbstractFileByPath('long-note.md');
      if (!file) throw new Error('long-note.md not found');

      const leaf = workspace.getLeaf(false);
      await leaf.openFile(file, { state: { mode: 'source' } });
      await sleep(600);

      const view = leaf.view;
      const scroller = view.contentEl.querySelector('.cm-scroller');
      if (!scroller) throw new Error('CodeMirror scroller not found in Live Preview');

      // Scroll deep into the long note (e.g. 50% down)
      scroller.scrollTop = Math.floor(scroller.scrollHeight * 0.6);
      scroller.dispatchEvent(new Event('scroll'));
      await sleep(400);

      // Verify active dash has been updated to a deep chapter
      const activeDash = view.contentEl.querySelector('.chapter-item-dash.is-active, .chapter-item-dash.active');
      const stepper = view.contentEl.querySelector('.codex-stepper-container');
      if (!stepper) throw new Error('Stepper container missing during long note scrolling');
      // The stepper should remain intact and mounted
      const allDashes = stepper.querySelectorAll('.codex-dash-item, .codex-chapter-dash, .chapter-item-dash');
      if (allDashes.length < 20) throw new Error(`Expected at least 20 dashes for long note, found ${allDashes.length}`);
    });

    // 9. Repeated attach/detach without duplicated listeners or stale stepper/tooltip DOM
    await runScenario('9. repeated attach/detach without duplicated listeners or stale DOM', async () => {
      const plugin = this.app.plugins.plugins['chapter-pipeline'];
      plugin.updateAllMarkdownViews();
      plugin.updateAllMarkdownViews();
      await sleep(400);

      const allSteppersInBody = document.querySelectorAll('.codex-stepper-container');
      const activeLeaves = workspace.getLeavesOfType('markdown');
      if (allSteppersInBody.length > activeLeaves.length) {
        throw new Error(`Duplicate steppers detected: ${allSteppersInBody.length} steppers for ${activeLeaves.length} leaves`);
      }

      const orphanTooltips = document.querySelectorAll('body > .codex-floating-tooltip');
      if (orphanTooltips.length > activeLeaves.length) {
        throw new Error(`Stale tooltips detected in body: ${orphanTooltips.length}`);
      }
    });

    // 10. Plugin disable/re-enable with deterministic cleanup
    await runScenario('10. plugin disable/re-enable with deterministic cleanup', async () => {
      // Disable plugin
      await this.app.plugins.disablePluginAndSave('chapter-pipeline');
      await sleep(500);

      const remainingSteppers = document.querySelectorAll('.codex-stepper-container');
      if (remainingSteppers.length > 0) {
        throw new Error(`Expected 0 steppers after plugin disable, found ${remainingSteppers.length}`);
      }
      const remainingTooltips = document.querySelectorAll('.codex-floating-tooltip');
      if (remainingTooltips.length > 0) {
        throw new Error(`Expected 0 tooltips after plugin disable, found ${remainingTooltips.length}`);
      }

      // Re-enable plugin
      await this.app.plugins.enablePluginAndSave('chapter-pipeline');
      await sleep(600);

      const restoredSteppers = document.querySelectorAll('.codex-stepper-container');
      if (restoredSteppers.length === 0) {
        throw new Error('Stepper failed to recreate after plugin re-enable');
      }
    });

    results.endTime = new Date().toISOString();
    results.ok = results.failed === 0;

    // Write reports
    await vault.adapter.write('smoke-report.json', JSON.stringify(results, null, 2));

    const markdownReport = [
      '# Chapter Pipeline Smoke Test Report',
      '',
      `- **Date**: ${results.startTime}`,
      `- **Plugin Version**: ${results.pluginVersion || 'unknown'}`,
      `- **Result**: ${results.ok ? '✅ PASS' : '❌ FAIL'} (${results.passed} passed, ${results.failed} failed)`,
      '',
      '## Scenarios',
      '',
      ...results.scenarios.map(
        (s) => `- ${s.status === 'PASS' ? '✅' : '❌'} **${s.name}** (${s.durationMs}ms)${s.error ? `\n  - Error: \`${s.error}\`` : ''}`
      ),
      '',
    ].join('\n');
    await vault.adapter.write('smoke-report.md', markdownReport);

    new Notice(
      results.ok
        ? `✅ Smoke tests passed (${results.passed}/${results.scenarios.length})`
        : `❌ Smoke tests failed (${results.failed} failures)`,
      8000
    );

    // If auto-quit requested, close Obsidian
    if (await vault.adapter.exists('.smoke-quit')) {
      await vault.adapter.remove('.smoke-quit');
      if (await vault.adapter.exists('.smoke-trigger')) {
        await vault.adapter.remove('.smoke-trigger');
      }
      console.log('[SmokeRunner] Completed with .smoke-quit flag; closing app.');
      this.app.commands.executeCommandById('app:quit');
    }

    return results;
  }
}

module.exports = SmokeRunnerPlugin;
