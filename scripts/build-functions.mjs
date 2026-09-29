// Bundles the Firebase function together with server/places.ts (the function's upload only contains functions/).
import { build } from 'esbuild';

await build({
  entryPoints: ['functions/src/index.ts'],
  outfile: 'functions/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['firebase-functions', 'firebase-functions/*', 'firebase-admin'],
  logLevel: 'info',
});
