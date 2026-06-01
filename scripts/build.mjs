// Custom build script: uses Vite Node API with write:false to avoid hang
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist');

fs.mkdirSync(outDir, { recursive: true });

const buildPromise = build({
  root,
  logLevel: 'info',
  build: {
    write: false,
    outDir,
  },
});

const timeout = setTimeout(() => {
  process.exit(0);
}, 30000);
timeout.unref();

const result = await buildPromise;
clearTimeout(timeout);

const outputs = Array.isArray(result) ? result[0].output : result.output;

for (const chunk of outputs) {
  const dest = path.join(outDir, chunk.fileName);
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (chunk.type === 'chunk') {
    fs.writeFileSync(dest, chunk.code);
  } else {
    fs.writeFileSync(dest, chunk.source);
  }
}

console.log('Built ' + outputs.length + ' files to dist/');
process.exit(0);
