import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = await readFile(path.join(root, 'worker/index.js'), 'utf8');
const assetNames = [
  ['__HTML__', 'src/index.html'],
  ['__CSS__', 'src/style.css'],
  ['__JAVASCRIPT__', 'src/app.js']
];
let built = source;
for (const [marker, filename] of assetNames) {
  if (!built.includes(marker)) throw new Error(`缺少资源占位符 ${marker}`);
  built = built.replace(marker, JSON.stringify(await readFile(path.join(root, filename), 'utf8')));
}
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'server'), { recursive: true });
await mkdir(path.join(dist, '.openai'), { recursive: true });
await writeFile(path.join(dist, 'server/index.js'), built);
await copyFile(path.join(root, '.openai/hosting.json'), path.join(dist, '.openai/hosting.json'));
console.log(`Built ${dist}`);
