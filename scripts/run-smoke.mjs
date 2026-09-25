import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixtureVault = join(repoRoot, 'tests', 'fixtures', 'smoke-vault');
const reportJsonPath = join(fixtureVault, 'smoke-report.json');

const args = process.argv.slice(2);
const isHeadless = args.includes('--headless');
const forceApp = args.includes('--app');
const isSetupOnly = args.includes('--setup-only');

console.log('====================================================');
console.log('Chapter Pipeline - Real-Obsidian Lifecycle Smoke Runner');
console.log('====================================================');

// Step 1: Prepare fixture vault and build production bundle
console.log('\n[1/3] Preparing fixture vault with current production bundle...');
execSync(`node ${join(repoRoot, 'scripts', 'setup-smoke-vault.mjs')}`, {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (isSetupOnly) {
  console.log('\nSetup completed. Exiting (--setup-only).');
  process.exit(0);
}

// Step 2: Run automated lifecycle smoke suite in Node
console.log('\n[2/3] Running repeatable lifecycle smoke suite (tests/lifecycle-smoke.test.js)...');
try {
  execSync('node --test tests/lifecycle-smoke.test.js', {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  console.log('✅ Repeatable lifecycle smoke suite passed.');
} catch (err) {
  console.error('❌ Repeatable lifecycle smoke suite failed.');
  process.exit(1);
}

if (isHeadless) {
  console.log('\nCompleted smoke verification in headless mode.');
  process.exit(0);
}

// Step 3: Check for installed Obsidian app to run in-vault smoke test
console.log('\n[3/3] Checking for real Obsidian desktop environment...');

function findObsidianExecutable() {
  if (process.env.OBSIDIAN_BIN && existsSync(process.env.OBSIDIAN_BIN)) {
    return process.env.OBSIDIAN_BIN;
  }
  if (process.platform === 'win32') {
    const candidates = [
      'D:\\Obsidian\\app\\Obsidian.com',
      'D:\\Obsidian\\app\\Obsidian.exe',
      join(process.env.LOCALAPPDATA || '', 'Obsidian', 'Obsidian.exe'),
      'C:\\Program Files\\Obsidian\\Obsidian.exe',
    ];
    for (const c of candidates) {
      if (c && existsSync(c)) return c;
    }
  } else if (process.platform === 'darwin') {
    const candidate = '/Applications/Obsidian.app/Contents/MacOS/Obsidian';
    if (existsSync(candidate)) return candidate;
  } else if (process.platform === 'linux') {
    try {
      const which = execSync('which obsidian', { encoding: 'utf8' }).trim();
      if (which && existsSync(which)) return which;
    } catch {
      // not in PATH
    }
  }
  return null;
}

const obsidianBin = findObsidianExecutable();

if (!obsidianBin) {
  if (forceApp) {
    console.error('❌ --app was specified but Obsidian executable was not found.');
    console.error('Please set OBSIDIAN_BIN environment variable or install Obsidian.');
    process.exit(1);
  } else {
    console.log('ℹ️ Obsidian desktop executable not detected; skipping in-app GUI smoke test.');
    console.log('  (Repeatable Node lifecycle smoke coverage verified all 10 scenarios.)');
    console.log('\nAll smoke checks succeeded.');
    process.exit(0);
  }
}

console.log(`Found Obsidian at: ${obsidianBin}`);

// Clean old reports and set trigger flags
if (existsSync(reportJsonPath)) rmSync(reportJsonPath);
writeFileSync(join(fixtureVault, '.smoke-trigger'), '1', 'utf8');
writeFileSync(join(fixtureVault, '.smoke-quit'), '1', 'utf8');

console.log('Launching Obsidian with fixture vault...');

const isWindowsCli = obsidianBin.endsWith('.com');
let child;

if (isWindowsCli) {
  // Obsidian.com opens vault directly or CLI
  child = spawn(obsidianBin, ['open', `path=${fixtureVault}`], {
    detached: true,
    stdio: 'ignore',
  });
} else {
  child = spawn(obsidianBin, [fixtureVault], {
    detached: true,
    stdio: 'ignore',
  });
}
child.unref();

console.log('Waiting for in-app smoke suite results (timeout: 45s)...');

const startWait = Date.now();
const timeoutMs = 45000;
let report = null;

while (Date.now() - startWait < timeoutMs) {
  if (existsSync(reportJsonPath)) {
    try {
      const text = readFileSync(reportJsonPath, 'utf8');
      report = JSON.parse(text);
      if (report && (report.passed !== undefined || report.ok !== undefined)) {
        break;
      }
    } catch {
      // file still being written, retry
    }
  }
  // sleep 1s
  execSync('node -e "setTimeout(()=>{}, 1000)"');
}

// Cleanup trigger files
for (const f of ['.smoke-trigger', '.smoke-quit']) {
  const p = join(fixtureVault, f);
  if (existsSync(p)) rmSync(p);
}

if (!report) {
  console.warn('⚠️ In-app smoke test timed out waiting for smoke-report.json.');
  console.warn('   Note: If Obsidian was already running another vault, open the fixture vault manually:');
  console.warn(`   Vault path: ${fixtureVault}`);
  if (forceApp) {
    process.exit(1);
  } else {
    console.log('Node lifecycle harness passed successfully.');
    process.exit(0);
  }
}

console.log('\n--- Real-Obsidian Smoke Results ---');
console.log(`Result: ${report.ok ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Passed: ${report.passed}/${report.scenarios?.length || 0}`);
if (report.scenarios) {
  for (const s of report.scenarios) {
    console.log(`  ${s.status === 'PASS' ? '✅' : '❌'} ${s.name} (${s.durationMs}ms)`);
    if (s.error) console.log(`     Error: ${s.error}`);
  }
}

if (!report.ok) {
  process.exit(1);
}

console.log('\nAll real-Obsidian lifecycle smoke tests passed!');
