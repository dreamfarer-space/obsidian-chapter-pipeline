import { existsSync, readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const manifest = readJson('manifest.json');
const pkg = readJson('package.json');
const versions = readJson('versions.json');

const errors = [];
const requireEqual = (label, actual, expected) => {
  if (actual !== expected) {
    errors.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

requireEqual('plugin id', manifest.id, 'chapter-pipeline');
requireEqual('display name', manifest.name, 'Chapter Pipeline');
requireEqual('manifest/package version', manifest.version, pkg.version);
requireEqual(
  `versions.json[${manifest.version}]`,
  versions[manifest.version],
  manifest.minAppVersion
);

for (const path of ['main.js', 'manifest.json', 'styles.css']) {
  if (!existsSync(path)) errors.push(`required release asset is missing: ${path}`);
}

if (errors.length > 0) {
  console.error('Release metadata validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Release metadata valid: ${manifest.name} ${manifest.version}, id=${manifest.id}, minAppVersion=${manifest.minAppVersion}`
);
