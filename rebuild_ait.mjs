import { AppsInTossBundle } from '@apps-in-toss/ait-format';
import fs from 'fs';
import path from 'path';

const backupBuf = new Uint8Array(fs.readFileSync('savelog.ait.bak'));
const reader = AppsInTossBundle.reader(backupBuf);

const meta = reader.metadata;
console.log('Original deploymentId:', reader.deploymentId);
console.log('runtimeVersion:', meta.runtimeVersion);

const writer = AppsInTossBundle.writer({ appName: 'savelog' });
writer.setMetadata({
  isGame: meta.isGame,
  platform: meta.platform,
  runtimeVersion: meta.runtimeVersion,
  bundleFiles: meta.bundleFiles,
  packageJson: meta.packageJson,
  sdkVersion: meta.sdkVersion,
  extra: meta.extra,
});

const rnBundles = [
  'bundle.ios.0_84_0.js', 'bundle.ios.0_84_0.js.map',
  'bundle.android.0_84_0.js', 'bundle.android.0_84_0.js.map',
  'bundle.ios.0_72_6.js', 'bundle.ios.0_72_6.js.map',
  'bundle.android.0_72_6.js', 'bundle.android.0_72_6.js.map',
];
for (const name of rnBundles) {
  const data = await reader.readEntry(name);
  writer.addFile(name, data);
}

writer.addFile('web/index.html', new Uint8Array(fs.readFileSync('dist/web/index.html')));

for (const fname of fs.readdirSync('dist/web/images')) {
  writer.addFile(`web/images/${fname}`, new Uint8Array(fs.readFileSync(`dist/web/images/${fname}`)));
}

for (const fname of fs.readdirSync('dist/web/assets')) {
  writer.addFile(`web/assets/${fname}`, new Uint8Array(fs.readFileSync(`dist/web/assets/${fname}`)));
}

console.log('New deploymentId:', writer.deploymentId);
const buf = await writer.toBuffer();
fs.writeFileSync('savelog.ait', buf);
console.log('Written savelog.ait, size:', buf.length);
