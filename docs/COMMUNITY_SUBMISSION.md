# Obsidian Community Plugins submission checklist

This document is the authoritative repository record for the current release state, declared platform support, and real-app compatibility evidence used when submitting Chapter Pipeline to the Obsidian Community Plugins directory.

## Current plugin identity and release

- Display name: `Chapter Pipeline`
- Plugin ID: `chapter-pipeline`
- Repository: `dreamfarer-space/obsidian-chapter-pipeline`
- Current release: `1.2.3`
- Required release assets: `main.js`, `manifest.json`, `styles.css`
- Release tag: exactly the version from `manifest.json` (for example `1.2.3`, with no `v` prefix)
- Declared minimum Obsidian version: `0.15.9`
- Declared platforms: desktop only (`isDesktopOnly: true`)

The plugin ID remains `chapter-pipeline`. It is the existing identifier and is aligned with the final Chapter Pipeline product/repository name. Do not change it after publication.

`manifest.json`, `package.json`, and `versions.json` currently agree on release `1.2.3`; `versions.json` maps `1.2.3` to Obsidian `0.15.9`.

## Repeatable real-Obsidian lifecycle smoke harness

To prevent workspace and CodeMirror lifecycle regressions prior to publication, the repository provides a repeatable smoke-test procedure and harness exercising the exact production bundle (`main.js`, `manifest.json`, `styles.css`).

### Commands

- `npm run smoke:setup`: Builds the production bundle (`esbuild` production mode) and installs it alongside the companion test-runner into the deterministic fixture vault at `tests/fixtures/smoke-vault/`.
- `npm run smoke:run`: Prepares the fixture vault, runs the repeatable Node lifecycle test suite (`tests/lifecycle-smoke.test.js`), and if an Obsidian desktop installation is detected (or specified via `OBSIDIAN_BIN` / `--app`), launches Obsidian to execute and verify the in-vault smoke suite.
- `npm run test:smoke`: Runs the production-bundle lifecycle smoke suite in headless mode (fully automated, no GUI display required; ideal for CI and pre-commit checks).
- `npm test`: Runs all unit, tracking, virtualization, session-reuse, and lifecycle smoke tests.

### Minimum lifecycle scenarios verified

1. **Plugin load / unload / reload**: Verifies clean registration of commands, settings initialization, and complete teardown on unload without memory leaks.
2. **Reading View navigation and active-chapter tracking**: Opens documents in Reading View (`preview`), asserts stepper mount, confirms chapter dashes match document headings, and tests navigation.
3. **Live Preview navigation and active-chapter tracking**: Opens documents in Live Preview (`source`), verifies `.cm-scroller` / `.cm-editor` integration, and tests chapter click navigation.
4. **Split-pane creation and independent view sessions**: Opens multiple split leaves simultaneously, verifying independent `ViewSession` instances and stepper elements per pane without cross-leaf state contamination.
5. **Close and reopen leaves**: Closes leaves and asserts immediate disposal of view sessions and stepper DOM; reopens leaves and confirms healthy reattachment.
6. **Rapid note switching**: Cycles active notes in quick succession, verifying race-free outline updates and zero duplicate stepper elements.
7. **Reading View ↔ Live Preview mode changes**: Toggles between view modes, confirming seamless teardown and re-anchoring of scroller listeners and UI elements.
8. **Long-note scrolling with CodeMirror virtualization**: Exercises notes with 40+ sections spanning 1,600+ lines where off-screen heading DOM nodes are unmounted by CodeMirror 6, verifying active-chapter tracking through document-coordinate line mapping.
9. **Repeated attach/detach without duplicated listeners or stale DOM**: Executes successive layout/view update triggers, verifying exactly 1 stepper per leaf and 0 orphan tooltips in `document.body`.
10. **Plugin disable/re-enable with deterministic cleanup**: Disables the plugin, asserting 100% removal of all steppers and tooltips; re-enables the plugin, verifying clean re-initialization.

## Real-app compatibility evidence

In addition to automated regression coverage, release candidates are verified against real Obsidian desktop instances using the repeatable fixture vault (`tests/fixtures/smoke-vault`):

| Environment | Verification Procedure | Result |
| --- | --- | --- |
| Obsidian Desktop 0.15.9 (Linux AppImage via Xvfb) | Automated smoke harness (`npm run test:smoke`) + in-vault runner covering 10 minimum lifecycle scenarios | **PASS** (`1.2.3` package) |
| Obsidian Desktop 1.13.7 (Windows / Linux) | Automated smoke harness (`npm run test:smoke`) + in-vault runner covering 10 minimum lifecycle scenarios | **PASS** (`1.2.3` package) |
| Android | Mobile support is intentionally not claimed yet | Deferred; `isDesktopOnly: true` |
| iOS/iPadOS | Mobile support is intentionally not claimed yet | Deferred; `isDesktopOnly: true` |

When the minimum-version claim or runtime implementation changes materially, rerun the real-app smoke matrix against the exact release candidate package and update this section.

Mobile support can be enabled later by setting `isDesktopOnly: false` only after Android and iOS/iPadOS smoke tests cover narrow-view hiding, touch tooltip activation, chapter navigation, palette use, rotation/resume, and plugin reload.

## Obsidian review lint

Run `npm run lint:obsidian` before submission. The command runs the current Obsidian-specific ESLint rules against production source using an isolated, pinned review toolchain. The isolation is intentional: Chapter Pipeline currently builds with TypeScript 7, while the current `typescript-eslint` release used by the Obsidian lint ecosystem supports TypeScript versions below 6.1.

The lint runner follows the Community Plugin scanner's documented source-oriented ignore model and severity policy: generated bundles, tests, build scripts, documentation, localization, and vault fixtures are excluded; most code-quality findings remain advisory warnings; security-critical findings stay blocking errors; and scanner-disabled high-noise rules remain disabled. Blocking lint errors fail the command and therefore fail CI. Rule suppressions should stay narrow and include a reason at the use site rather than disabling Obsidian review rules globally.

Release metadata remains covered separately by `scripts/validate-release.mjs` and the existing release checks below.

## Pre-submission release checks

1. Confirm `manifest.json`, `package.json`, and `versions.json` agree on the release version and compatibility mapping.
2. Run `npm ci`, `npm audit --audit-level=moderate`, `npx --no-install tsc --noEmit`, `npm run lint:obsidian`, `npm test`, `npm run test:smoke`, and `npm run build`.
3. Confirm the committed `main.js` matches the production build (`git diff --exit-code -- main.js`).
4. Confirm runtime source and the production bundle contain no legacy `Pro` startup/debug branding and use the final `Chapter Pipeline` display name.
5. Confirm the GitHub release tag exactly matches `manifest.json.version` and includes `main.js`, `manifest.json`, and `styles.css` as individual assets.
6. Confirm README installation instructions describe the distribution path that is actually available before Community Plugins approval (BRAT/manual release install).
7. Execute `npm run smoke:setup` and verify the production bundle in the repeatable fixture vault (`tests/fixtures/smoke-vault`) before tag creation.
8. Keep Android/iOS claims disabled until explicit mobile testing exists.

## Current readiness status

- Plugin identity: decided (`chapter-pipeline`, display name `Chapter Pipeline`).
- Current release: `1.2.3`.
- Release lineage: exact no-prefix tags are used for current releases; historical `v1.2.1` / `1.2.1` collision is retained only as repository history.
- Release tag/assets: automated and available.
- Pre-approval installation docs: BRAT/manual path documented.
- Repeatable smoke-test harness: established in `tests/lifecycle-smoke.test.js`, `tests/fixtures/smoke-vault`, `scripts/setup-smoke-vault.mjs`, and `scripts/run-smoke.mjs`.
- Obsidian review lint: available locally through `npm run lint:obsidian` and enforced by CI.
- Mobile claim: disabled conservatively with `isDesktopOnly: true` until explicit mobile testing exists.
- Declared minimum Obsidian version: `0.15.9`.
- Latest recorded real-app compatibility evidence: `1.2.3` package passed the desktop smoke matrix on Obsidian `0.15.9` and `1.13.7`.
- Community Directory repository-location migration is tracked separately in issue #27.
