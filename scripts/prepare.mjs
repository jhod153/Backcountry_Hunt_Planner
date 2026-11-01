import { mkdir, copyFile, rm } from 'node:fs/promises';
import { build } from 'esbuild';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const name of ['index.html','styles.css','app.js','data.js','service-worker.js','manifest.webmanifest','icon.svg','hero-alpine.jpg']) await copyFile(name, `dist/${name}`);
await build({ entryPoints: ['collaboration.js'], bundle: true, outfile: 'dist/collaboration.js', format: 'esm', platform: 'browser', minify: true });
