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

## Real-app compatibility evidence

The most recent recorded real-app smoke run was performed on 2026-09-23 against the packaged `1.2.2` plugin files (`main.js`, `manifest.json`, `styles.css`). The package was loaded into isolated vaults using official Linux AppImages under Xvfb, with Restricted Mode disabled through Obsidian's plugin manager before loading the community plugin.

| Environment | Verification | Result |
| --- | --- | --- |
| Obsidian Desktop 0.15.9 | Plugin load; Reading View chapter rail; editor/Live Preview chapter rail; command registration; unload/reload | **PASS** (`1.2.2` package) |
| Obsidian Desktop 1.13.7 | Plugin load; Reading View chapter rail; editor/Live Preview chapter rail; command registration; unload/reload | **PASS** (`1.2.2` package) |
| Android | Mobile support is intentionally not claimed yet | Deferred; `isDesktopOnly: true` |
| iOS/iPadOS | Mobile support is intentionally not claimed yet | Deferred; `isDesktopOnly: true` |

Release `1.2.3` keeps the same plugin ID, declared minimum Obsidian version, and desktop-only platform policy as `1.2.2`, while adding review-blocker/UI implementation fixes and refreshed release metadata. It is therefore the current release, but the table above should not be misread as a separate real-app smoke run of the `1.2.3` package.

When the minimum-version claim or runtime implementation changes materially, rerun the real-app smoke matrix against the exact release candidate package and update this section.

Mobile support can be enabled later by setting `isDesktopOnly: false` only after Android and iOS/iPadOS smoke tests cover narrow-view hiding, touch tooltip activation, chapter navigation, palette use, rotation/resume, and plugin reload.

## Obsidian review lint

Run `npm run lint:obsidian` before submission. The command runs the current Obsidian-specific ESLint rules against production source and `manifest.json` using an isolated, pinned review toolchain. The isolation is intentional: Chapter Pipeline currently builds with TypeScript 7, while the current `typescript-eslint` release used by the Obsidian lint ecosystem supports TypeScript versions below 6.1.

The lint runner follows the Community Plugin scanner's source-oriented ignore model for generated bundles, tests, build scripts, documentation, localization, and vault fixtures. Blocking lint errors fail the command and therefore fail CI. Rule suppressions should stay narrow and include a reason at the use site rather than disabling review rules globally.

## Pre-submission release checks

1. Confirm `manifest.json`, `package.json`, and `versions.json` agree on the release version and compatibility mapping.
2. Run `npm ci`, `npm audit --audit-level=moderate`, `npx --no-install tsc --noEmit`, `npm run lint:obsidian`, `npm test`, and `npm run build`.
3. Confirm the committed `main.js` matches the production build.
4. Confirm runtime source and the production bundle contain no legacy `Pro` startup/debug branding and use the final `Chapter Pipeline` display name.
5. Confirm the GitHub release tag exactly matches `manifest.json.version` and includes `main.js`, `manifest.json`, and `styles.css` as individual assets.
6. Confirm README installation instructions describe the distribution path that is actually available before Community Plugins approval (BRAT/manual release install).
7. Keep the real-app compatibility evidence above current whenever the compatibility floor or relevant production runtime changes.
8. Keep Android/iOS claims disabled until explicit mobile testing exists.

## Current readiness status

- Plugin identity: decided (`chapter-pipeline`, display name `Chapter Pipeline`).
- Current release: `1.2.3`.
- Release lineage: exact no-prefix tags are used for current releases; historical `v1.2.1` / `1.2.1` collision is retained only as repository history.
- Release tag/assets: automated and available.
- Pre-approval installation docs: BRAT/manual path documented.
- Obsidian review lint: available locally through `npm run lint:obsidian` and enforced by CI.
- Mobile claim: disabled conservatively with `isDesktopOnly: true` until explicit mobile testing exists.
- Declared minimum Obsidian version: `0.15.9`.
- Latest recorded real-app compatibility evidence: `1.2.2` package passed the desktop smoke matrix on Obsidian `0.15.9` and `1.13.7`.
- Community Directory repository-location migration is tracked separately in issue #27.
