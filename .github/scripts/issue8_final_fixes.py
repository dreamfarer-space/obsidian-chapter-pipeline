from pathlib import Path

main = Path('src/main.ts')
s = main.read_text()

old_sound = """        if (previousIndex >= 0 && previousIndex !== index) {
          if (this.settings?.enableSound !== false) {
            const volume = typeof this.settings?.soundVolume === 'number' ? this.settings.soundVolume : 50;
            this.soundEngine?.playScrollTick?.(volume);
          }
          this.recordReadingPosition?.(view, chapters[index]);
        }
"""
new_sound = """        if (previousIndex >= 0 && previousIndex !== index) {
          const volume = typeof this.settings?.soundVolume === 'number' ? this.settings.soundVolume : 50;
          this.soundEngine?.playScrollTick?.(volume);
          this.recordReadingPosition?.(view, chapters[index]);
        }
"""
if old_sound not in s:
    raise SystemExit('sound block marker missing')
s = s.replace(old_sound, new_sound, 1)

old_validation = """    if (this.viewSessionVersions.get(view) !== sessionVersion || typedView.contentEl !== container) {
      session.dispose();
      return;
    }
    this.viewSessions.set(view, session);
"""
new_validation = """    const markdownLeaves = this.app?.workspace?.getLeavesOfType?.('markdown');
    const isMounted = markdownLeaves === undefined || markdownLeaves.some((leaf) => leaf?.view === view);
    if (this.viewSessionVersions.get(view) !== sessionVersion || typedView.contentEl !== container || !isMounted) {
      session.dispose();
      return;
    }
    this.viewSessions.set(view, session);
"""
if old_validation not in s:
    raise SystemExit('session validation marker missing')
s = s.replace(old_validation, new_validation, 1)
main.write_text(s)

tests = Path('main.test.js')
t = tests.read_text()
anchor = "test('typed sessions keep the rendered per-view chapter snapshot during resume lookup', async () => {\n"
if anchor not in t:
    raise SystemExit('test insertion anchor missing')

additions = """test('typed scroll ticks delegate independently of tactile click sound setting', async () => {
  const harness = createReadingHarness();
  harness.plugin.settings.enableSound = false;
  harness.plugin.settings.enableScrollSound = true;
  let scrollTicks = 0;
  harness.plugin.soundEngine.playScrollTick = () => { scrollTicks += 1; };

  await harness.plugin.attachStepperToView(harness.view);
  harness.scroller.scrollTop = 1;
  harness.scroller.dispatch('scroll');
  assert.equal(scrollTicks, 0);

  harness.scroller.scrollTop = 400;
  harness.scroller.dispatch('scroll');
  assert.equal(scrollTicks, 1);
});

test('typed attachment discards a session when the view closes during cachedRead', async () => {
  const harness = createReadingHarness();
  let resolveRead;
  harness.app.vault.cachedRead = () => new Promise((resolve) => { resolveRead = resolve; });

  const attach = harness.plugin.attachStepperToView(harness.view);
  harness.app.workspace.getLeavesOfType = () => [];
  resolveRead('# First\\nbody\\nbody\\nbody\\n## Second\\nbody');
  await attach;

  assert.equal(harness.plugin.viewSessions?.has(harness.view), false);
  assert.equal(harness.scroller.listeners.get('scroll')?.length ?? 0, 0);
  assert.equal(harness.plugin.scrollBindings.has(harness.container), false);
  assert.equal(harness.container.querySelector('.codex-stepper-container'), null);
});

"""
t = t.replace(anchor, additions + anchor, 1)
tests.write_text(t)
