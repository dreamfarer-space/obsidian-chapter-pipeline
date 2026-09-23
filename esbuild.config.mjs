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
  logLevel: 'info',
  drop: ['console', 'debugger']
};

if (production) {
  await build(options);
} else {
  const watchContext = await context(options);
  await watchContext.watch();
  console.log('Chapter Pipeline development build watching src/.');
}
