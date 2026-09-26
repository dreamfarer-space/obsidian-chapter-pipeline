import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

// Keep the scanner toolchain isolated from the plugin's build toolchain.
// The project currently builds with TypeScript 7, while the current
// typescript-eslint release used by Obsidian review tooling supports TypeScript
// versions below 6.1. Running the review lint in its own tool directory avoids
// downgrading or perturbing the production dependency graph.
const toolVersions = {
  eslint: '9.39.4',
  obsidianPlugin: '0.4.2',
  globals: '17.6.0',
  typescriptEslint: '8.70.1',
  typescript: '6.0.3',
  eslintJs: '9.39.4',
  eslintJson: '0.14.0',
  obsidian: '1.13.1'
};

const cacheKey = [
  toolVersions.eslint,
  toolVersions.obsidianPlugin,
  toolVersions.typescriptEslint,
  toolVersions.typescript
].join('-');
const toolRoot = join(tmpdir(), `chapter-pipeline-obsidian-lint-${cacheKey}`);
const markerPath = join(toolRoot, '.installed');
const configPath = join(toolRoot, 'eslint.config.mjs');
const eslintBin = join(
  toolRoot,
  'node_modules',
  'eslint',
  'bin',
  'eslint.js'
);

function run(command, args, options = {}) {
  const isWinCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: isWinCmd,
    ...options
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureToolchain() {
  await mkdir(toolRoot, { recursive: true });

  const expectedMarker = JSON.stringify(toolVersions);
  const markerMatches = await fileExists(markerPath)
    ? (await readFile(markerPath, 'utf8')) === expectedMarker
    : false;

  if (!markerMatches || !(await fileExists(eslintBin))) {
    await writeFile(
      join(toolRoot, 'package.json'),
      JSON.stringify({ private: true, type: 'module' }, null, 2) + '\n',
      'utf8'
    );

    const packages = [
      `eslint@${toolVersions.eslint}`,
      `eslint-plugin-obsidianmd@${toolVersions.obsidianPlugin}`,
      `globals@${toolVersions.globals}`,
      `typescript-eslint@${toolVersions.typescriptEslint}`,
      `typescript@${toolVersions.typescript}`,
      `@eslint/js@${toolVersions.eslintJs}`,
      `@eslint/json@${toolVersions.eslintJson}`,
      `obsidian@${toolVersions.obsidian}`
    ];

    run(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      [
        'install',
        '--prefix', toolRoot,
        '--no-save',
        '--package-lock=false',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        ...packages
      ]
    );

    await writeFile(markerPath, expectedMarker, 'utf8');
  }
}

async function writeLintConfig() {
  const config = `import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

const recommendedRules = Object.assign(
  {},
  ...obsidianmd.configs.recommended
    .filter((entry) => !entry.files || entry.files.some((f) => f.includes('ts')))
    .map((entry) => entry.rules ?? {})
);

function withSeverity(value, severity) {
  if (value === 0 || value === 'off') return 'off';
  if (Array.isArray(value)) return [severity, ...value.slice(1)];
  return severity;
}

const scannerRules = Object.fromEntries(
  Object.entries(recommendedRules).map(([name, value]) => [
    name,
    withSeverity(value, 'warn')
  ])
);

// Match the Community Plugin scanner's documented policy: most findings are
// advisory warnings; only security-critical findings remain blocking errors.
for (const name of [
  'no-eval',
  'no-implied-eval',
  'no-unsanitized/method',
  'no-unsanitized/property',
  'obsidianmd/regex-lookbehind',
  'obsidianmd/no-forbidden-elements'
]) {
  scannerRules[name] = withSeverity(recommendedRules[name] ?? 'error', 'error');
}


for (const name of [
  'no-undef',
  '@typescript-eslint/restrict-template-expressions',
  '@typescript-eslint/no-base-to-string',
  'import/no-unresolved',
  'obsidianmd/validate-manifest',
  'obsidianmd/validate-license'
]) {
  scannerRules[name] = 'off';
}

export default defineConfig(
  globalIgnores([
    'node_modules',
    'dist',
    'build',
    'pkg',
    '.obsidian',
    '**/.obsidian/**',
    'test-vault',
    'main.js',
    'esbuild.config.mjs',
    'version-bump.mjs',
    '**/*.test.*',
    '**/*.tests.*',
    '**/*.spec.*',
    '**/*.specs.*',
    '**/test/**',
    '**/tests/**',
    '**/__tests__/**',
    '**/mocks/**',
    '**/__mocks__/**',
    '**/testUtils**',
    '**/*.cjs',
    '**/*.mjs',
    '**/*.cts',
    '**/*.mts',
    '**/vite*',
    '**/scripts/**',
    '**/docs/**',
    '**/i18n/**',
    '**/i18next/**',
    '**/locale/**',
    '**/locales/**',
    '**/translations/**',
    '**/l10n/**',
    'automation/**',
    'e2e-tests/**'
  ]),
  ...obsidianmd.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    linterOptions: {
      reportUnusedDisableDirectives: 'warn'
    },
    languageOptions: {
      globals: {
        ...globals.browser
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd()
      }
    },
    rules: scannerRules
  }
);
`;

  await writeFile(configPath, config, 'utf8');
}

await ensureToolchain();
await writeLintConfig();

run(process.execPath, [
  eslintBin,
  'src',
  '--config', configPath,
  '--no-error-on-unmatched-pattern'
]);
