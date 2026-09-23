import { existsSync, readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const manifest = readJson('manifest.json');
const pkg = readJson('package.json');
const versions = readJson('versions.json');

const errors = [];
const strictVersionPattern = /^\d+\.\d+\.\d+$/;

const requireEqual = (label, actual, expected) => {
  if (actual !== expected) {
    errors.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

const requireStrictVersion = (label, value) => {
  if (typeof value !== 'string' || !strictVersionPattern.test(value)) {
    errors.push(`${label} must use x.y.z numeric format; got ${JSON.stringify(value)}`);
    return false;
  }
  return true;
};

requireEqual('plugin id', manifest.id, 'chapter-pipeline');
requireEqual('display name', manifest.name, 'Chapter Pipeline');

const hasValidManifestVersion = requireStrictVersion('manifest.version', manifest.version);
const hasValidPackageVersion = requireStrictVersion('package.json version', pkg.version);
if (hasValidManifestVersion && hasValidPackageVersion) {
  requireEqual('manifest/package version', manifest.version, pkg.version);
}

const hasValidMinAppVersion = requireStrictVersion('manifest.minAppVersion', manifest.minAppVersion);
const hasVersionEntry =
  hasValidManifestVersion && Object.prototype.hasOwnProperty.call(versions, manifest.version);

if (hasValidManifestVersion && !hasVersionEntry) {
  errors.push(`versions.json must contain an entry for ${manifest.version}`);
}
if (hasVersionEntry) {
  const mappedMinAppVersion = versions[manifest.version];
  const hasValidMappedMinAppVersion = requireStrictVersion(
    `versions.json[${manifest.version}]`,
    mappedMinAppVersion
  );
  if (hasValidMinAppVersion && hasValidMappedMinAppVersion) {
    requireEqual(
      `versions.json[${manifest.version}]`,
      mappedMinAppVersion,
      manifest.minAppVersion
    );
  }
}

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
