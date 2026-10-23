import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';

// Only public release metadata is emitted. No deployment environment is read.
const root = new URL('../', import.meta.url);
const release = JSON.parse(await readFile(new URL('site-version.json', root), 'utf8'));
const files = ['index.html', 'tutorial.html', 'manager-experience.css', 'manager-experience.mjs',
  'lineup-tools.mjs', 'site-version.mjs', 'sw.js', 'manifest.webmanifest', 'package.json'];
async function includeDirectory(path) {
  for (const entry of await readdir(new URL(path, root), { withFileTypes: true })) {
    const name = `${path}/${entry.name}`;
    if (entry.isDirectory()) await includeDirectory(name);
    else files.push(name);
  }
}
await includeDirectory('netlify/functions');
await includeDirectory('netlify/lib');
const hash = createHash('sha256');
for (const file of files.sort()) {
  hash.update(file).update('\0').update(await readFile(new URL(file, root))).update('\0');
}
hash.update(JSON.stringify(release.changes));
release.version = `${release.version.split('+')[0]}+${hash.digest('hex').slice(0, 8)}`;
release.updatedAt = new Date().toISOString();
await writeFile(new URL('site-version.json', root), JSON.stringify(release, null, 2) + '\n');
