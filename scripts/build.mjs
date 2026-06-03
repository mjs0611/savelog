// Custom build script: uses Vite Node API with write:false to avoid hang
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist');

// Clean dist so stale chunk files don't accumulate and confuse the deploy tool
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
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

// Copy public/ directory to outDir (Vite skips this with write:false)
// Use readFileSync+writeFileSync to avoid hang on files with extended attributes (macOS)
const publicDir = path.join(root, 'public');
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.writeFileSync(destPath, fs.readFileSync(srcPath));
    }
  }
}
if (fs.existsSync(publicDir)) {
  copyDirSync(publicDir, outDir);
}

console.log('Built ' + outputs.length + ' files to dist/');
process.exit(0);
