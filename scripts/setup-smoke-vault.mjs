import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixtureRoot = join(repoRoot, 'tests', 'fixtures', 'smoke-vault');
const targetPluginDir = join(fixtureRoot, '.obsidian', 'plugins', 'chapter-pipeline');

console.log('[setup-smoke-vault] Building production bundle...');
execSync('node esbuild.config.mjs production', { cwd: repoRoot, stdio: 'inherit' });

for (const asset of ['main.js', 'manifest.json', 'styles.css']) {
  const assetPath = join(repoRoot, asset);
  if (!existsSync(assetPath)) {
    throw new Error(`Required production asset missing: ${asset}`);
  }
}

mkdirSync(targetPluginDir, { recursive: true });

for (const asset of ['main.js', 'manifest.json', 'styles.css']) {
  const src = join(repoRoot, asset);
  const dest = join(targetPluginDir, asset);
  cpSync(src, dest);
}

const manifest = JSON.parse(readFileSync(join(repoRoot, 'manifest.json'), 'utf8'));
console.log(`[setup-smoke-vault] Installed Chapter Pipeline v${manifest.version} into ${targetPluginDir}`);
console.log('[setup-smoke-vault] Fixture vault ready at:', fixtureRoot);
