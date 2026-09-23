# Obsidian Community Plugins submission checklist

This document records the release decisions and the manual verification gate for submitting Chapter Pipeline to the Obsidian Community Plugins directory.

## Final plugin identity

- Display name: `Chapter Pipeline`
- Plugin ID: `chapter-pipeline`
- Repository: `dreamfarer-space/obsidian-chapter-pipeline`
- Required release assets: `main.js`, `manifest.json`, `styles.css`
- Release tag: exactly the version from `manifest.json` (for example `1.2.1`, with no `v` prefix)

The plugin ID remains `chapter-pipeline`. It is the existing identifier and is now aligned with the final Chapter Pipeline product/repository name. Do not change it after publication.

## Compatibility declaration

`manifest.json` currently declares `minAppVersion: 0.15.0`, and `versions.json` maps `1.2.1` to the same minimum. That value is **not considered verified merely because the project builds**. Do not submit the plugin with an unverified minimum version.

The repository's automated checks verify TypeScript compatibility, unit tests, production bundling, dependency audit, release metadata consistency, and generated bundle consistency. They do **not** replace launching the plugin inside Obsidian.

Before opening the Community Plugins submission PR, complete this desktop matrix and record the exact tested app versions in the submission PR description:

| Environment | Required checks | Status |
| --- | --- | --- |
| Desktop, declared minimum | Load plugin; Reading View navigation; Live Preview navigation; settings; chapter palette; unload/reload | **Required before submission** |
| Desktop, current stable | Same smoke test plus split panes and a long note | **Required before submission** |
| Android | Mobile support is intentionally not claimed yet | Deferred; `isDesktopOnly: true` |
| iOS/iPadOS | Mobile support is intentionally not claimed yet | Deferred; `isDesktopOnly: true` |

If the declared minimum cannot pass the desktop smoke test, raise `minAppVersion` and update `versions.json` to the lowest version actually verified.

Mobile support can be enabled later by setting `isDesktopOnly: false` only after Android and iOS/iPadOS smoke tests cover narrow-view hiding, touch tooltip activation, chapter navigation, palette use, rotation/resume, and plugin reload.

## Pre-submission release checks

1. Confirm `manifest.json`, `package.json`, and `versions.json` agree on the release version/compatibility mapping.
2. Run `npm ci`, `npm audit --audit-level=moderate`, `npx --no-install tsc --noEmit`, `npm test`, and `npm run build`.
3. Confirm the committed `main.js` matches the production build.
4. Confirm the production bundle contains no legacy `Pro` startup/debug branding and uses the final `Chapter Pipeline` display name.
5. Confirm the GitHub release tag is the exact manifest version and includes `main.js`, `manifest.json`, and `styles.css` as individual assets.
6. Confirm README installation instructions describe the distribution path that is actually available before Community Plugins approval (BRAT/manual release install).
7. Complete and record the manual desktop smoke-test matrix above.

## Current readiness status

- Plugin identity: decided (`chapter-pipeline`, display name `Chapter Pipeline`).
- Release tag/assets: automated and ready.
- Pre-approval installation docs: BRAT/manual path required.
- Mobile claim: disabled conservatively with `isDesktopOnly: true` until explicit mobile testing exists.
- Minimum Obsidian version: **manual desktop verification still required** before the Community Plugins submission PR.
