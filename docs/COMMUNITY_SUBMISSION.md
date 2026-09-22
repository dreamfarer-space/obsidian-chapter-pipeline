# Obsidian Community Plugins submission checklist

This document records the release decisions and the manual verification gate for submitting Charter Pipeline to the Obsidian Community Plugins directory.

## Final plugin identity

- Display name: `Charter Pipeline`
- Plugin ID: `charter-pipeline`
- Repository: `dreamfarer-space/obsidian-charter-pipeline`
- Required release assets: `main.js`, `manifest.json`, `styles.css`
- Release tag: exactly the version from `manifest.json` (for example `1.2.1`, with no `v` prefix)

The plugin ID is intentionally finalized before the first Community Plugins release so users do not inherit a directory rename after installation.

## Compatibility declaration

`manifest.json` currently declares `minAppVersion: 0.15.0`, and `versions.json` maps `1.2.1` to the same minimum. Do not lower this value without an explicit compatibility run.

The repository's automated checks verify TypeScript compatibility, unit tests, production bundling, dependency audit, and generated bundle consistency. They do **not** replace launching the plugin inside Obsidian.

Before opening the Community Plugins submission PR, complete this manual matrix and record the tested app versions in the submission PR description:

| Environment | Required checks | Status |
| --- | --- | --- |
| Desktop, declared minimum | Load plugin; Reading View navigation; Live Preview navigation; settings; chapter palette; unload/reload | Required before submission |
| Desktop, current stable | Same smoke test plus split panes and long note | Required before submission |
| Android, current stable | Enable plugin; open long note; tap navigation; palette; rotate/resume app | Required while `isDesktopOnly` is `false` |
| iOS/iPadOS, current stable | Enable plugin; open long note; tap navigation; palette; rotate/resume app | Required while `isDesktopOnly` is `false` |

If the declared minimum cannot pass the desktop smoke test, raise `minAppVersion` and update `versions.json` to the lowest version actually verified. If either mobile platform has a blocking issue, fix it or set `isDesktopOnly: true` before submission rather than claiming unsupported mobile compatibility.

## Pre-submission release checks

1. Confirm `manifest.json`, `package.json`, and `versions.json` agree on the release version/compatibility mapping.
2. Run `npm ci`, `npm audit --audit-level=moderate`, `npx --no-install tsc --noEmit`, `npm test`, and `npm run build`.
3. Confirm the committed `main.js` matches the production build.
4. Confirm the production bundle contains no `Charter Pipeline Pro` startup/debug branding.
5. Confirm the GitHub release tag is the exact manifest version and includes `main.js`, `manifest.json`, and `styles.css` as individual assets.
6. Confirm README installation instructions describe the distribution path that is actually available before Community Plugins approval (BRAT/manual release install).
7. Complete and record the manual desktop/mobile smoke-test matrix above.
