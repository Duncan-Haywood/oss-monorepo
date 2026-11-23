// The build-side half of cardpack.mjs: writes the packs the shard Worker reads.
// Called by split.mjs after the split. Node only.

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { CARD_FILE, PACK_DIR, packOf, packPath } from './cardpack.mjs';

/** Build one pack from [[urlPath, bytes], ...]. */
export function encodePack(entries) {
  const header = {};
  let offset = 0;
  for (const [p, bytes] of entries) {
    header[p] = [offset, bytes.length];
    offset += bytes.length;
  }
  const head = Buffer.from(JSON.stringify(header), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(head.length, 0);
  return Buffer.concat([len, head, ...entries.map(([, b]) => b)]);
}

/** Pack every card under `dir` (a Worker's asset directory) and delete the
 *  originals. Returns how many cards and packs were written. */
export async function packCards(dir) {
  const groups = new Map();
  let cards = 0;
  async function walk(d) {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (d === dir && e.name === PACK_DIR) continue;
        await walk(full);
      } else if (e.name === CARD_FILE) {
        const urlPath = '/' + path.relative(dir, full).split(path.sep).join('/');
        const n = packOf(urlPath);
        if (!groups.has(n)) groups.set(n, []);
        groups.get(n).push([urlPath, full]);
        cards++;
      }
    }
  }
  await walk(dir);
  if (!cards) return { cards: 0, packs: 0 };
  await fs.mkdir(path.join(dir, PACK_DIR), { recursive: true });
  for (const [n, items] of groups) {
    items.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const entries = [];
    for (const [urlPath, full] of items) entries.push([urlPath, await fs.readFile(full)]);
    await fs.writeFile(path.join(dir, packPath(n)), encodePack(entries));
    for (const [, full] of items) await fs.unlink(full);
  }
  return { cards, packs: groups.size };
}
