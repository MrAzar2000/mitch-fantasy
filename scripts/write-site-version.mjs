import { readFile, writeFile } from 'node:fs/promises';

// Public, human-readable release metadata. No deployment environment is read.
const file = new URL('../site-version.json', import.meta.url);
const release = JSON.parse(await readFile(file, 'utf8'));
release.version = release.version.split('+')[0];
if (!/^\d+\.\d+\.\d+$/.test(release.version)) throw new Error('Use a major.minor.patch release version');
release.updatedAt = new Date().toISOString();
await writeFile(file, JSON.stringify(release, null, 2) + '\n');
