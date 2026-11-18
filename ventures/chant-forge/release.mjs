// Release kit: checks a release.json (and the files it names) before a distributor upload.
// Rules here are the common distributor/DSP ones; each check says what it tests. Not legal advice.
// The rules live in release-core.mjs (browser-safe); this file reads them off a folder.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { readWav } from './master.mjs';
import { checkReleaseWith } from './release-core.mjs';
export { isrcOk, gtinOk, imageSize, checkReleaseWith } from './release-core.mjs';

export function folderIo(baseDir = '.') {
  return {
    exists: (p) => existsSync(resolve(baseDir, p)),
    bytes: (p) => readFileSync(resolve(baseDir, p)),
    wav: (p) => readWav(readFileSync(resolve(baseDir, p))),
  };
}
export function checkRelease(rel, baseDir = '.', opts = {}) { return checkReleaseWith(rel, folderIo(baseDir), opts); }
export function loadRelease(file) { return { rel: JSON.parse(readFileSync(file, 'utf8')), dir: dirname(resolve(file)) }; }
