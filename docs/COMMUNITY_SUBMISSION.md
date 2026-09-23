# Obsidian Community Plugins submission checklist

This document records the release decisions and verified compatibility evidence for submitting Chapter Pipeline to the Obsidian Community Plugins directory.

## Final plugin identity

- Display name: `Chapter Pipeline`
- Plugin ID: `chapter-pipeline`
- Repository: `dreamfarer-space/obsidian-chapter-pipeline`
- Required release assets: `main.js`, `manifest.json`, `styles.css`
- Release tag: exactly the version from `manifest.json` (for example `1.2.2`, with no `v` prefix)

The plugin ID remains `chapter-pipeline`. It is the existing identifier and is aligned with the final Chapter Pipeline product/repository name. Do not change it after publication.

## Verified desktop compatibility

For release `1.2.2`, `manifest.json` declares `minAppVersion: 0.15.9`, and `versions.json` maps `1.2.2` to the same minimum. The previous unverified `0.15.0` declaration was intentionally raised to the oldest archived Obsidian build that could be reproduced and passed the real-app smoke test.

On 2026-09-23, the packaged plugin files (`main.js`, `manifest.json`, `styles.css`) were loaded into isolated vaults using official Linux AppImages under Xvfb. Restricted Mode was disabled through Obsidian's plugin manager before loading the community plugin.

| Environment | Verification | Result |
| --- | --- | --- |
| Obsidian Desktop 0.15.9 | Plugin load; Reading View chapter rail; editor/Live Preview chapter rail; command registration; unload/reload | **PASS** |
| Obsidian Desktop 1.13.7 | Plugin load; Reading View chapter rail; editor/Live Preview chapter rail; command registration; unload/reload | **PASS** |
| Android | Mobile support is intentionally not claimed yet | Deferred; `isDesktopOnly: true` |
| iOS/iPadOS | Mobile support is intentionally not claimed yet | Deferred; `isDesktopOnly: true` |

The real-app smoke run used archived official Obsidian AppImages rather than treating a successful TypeScript build as compatibility proof.

Mobile support can be enabled later by setting `isDesktopOnly: false` only after Android and iOS/iPadOS smoke tests cover narrow-view hiding, touch tooltip activation, chapter navigation, palette use, rotation/resume, and plugin reload.

## Pre-submission release checks

1. Confirm `manifest.json`, `package.json`, and `versions.json` agree on the release version/compatibility mapping.
2. Run `npm ci`, `npm audit --audit-level=moderate`, `npx --no-install tsc --noEmit`, `npm test`, and `npm run build`.
3. Confirm the committed `main.js` matches the production build.
4. Confirm runtime source and the production bundle contain no legacy `Pro` startup/debug branding and use the final `Chapter Pipeline` display name.
5. Confirm the GitHub release tag is the exact manifest version and includes `main.js`, `manifest.json`, and `styles.css` as individual assets.
6. Confirm README installation instructions describe the distribution path that is actually available before Community Plugins approval (BRAT/manual release install).
7. Keep the real-app desktop compatibility evidence above current when the compatibility floor changes.

## Current readiness status

- Plugin identity: decided (`chapter-pipeline`, display name `Chapter Pipeline`).
- Release version: `1.2.2`, avoiding the historical `v1.2.1` / `1.2.1` release collision.
- Release tag/assets: automated and ready.
- Pre-approval installation docs: BRAT/manual path documented.
- Mobile claim: disabled conservatively with `isDesktopOnly: true` until explicit mobile testing exists.
- Minimum Obsidian version: **verified at 0.15.9** with a real desktop smoke test; current public stable `1.13.7` passed the same matrix.
