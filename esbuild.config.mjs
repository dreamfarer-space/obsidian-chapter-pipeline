import { build, context } from 'esbuild';

const production = process.argv[2] === 'production';
const options = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['es2022'],
  outfile: 'main.js',
  external: ['obsidian'],
  sourcemap: production ? false : 'inline',
  minify: production,
  legalComments: 'none',
  logLevel: 'info'
};

if (production) {
  await build(options);
  console.log('Charter Pipeline production build complete.');
} else {
  const watchContext = await context(options);
  await watchContext.watch();
  console.log('Charter Pipeline development build watching src/.');
}
