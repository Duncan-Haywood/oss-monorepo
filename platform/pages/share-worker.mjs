// One worker in `share.mjs`'s card pool: render a card, write it, ask for more.

import fs from 'node:fs';
import path from 'node:path';
import { parentPort } from 'node:worker_threads';

import { renderCard } from './sharecard.mjs';

parentPort.on('message', ({ file, options }) => {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, renderCard(options));
    parentPort.postMessage({ ok: true });
  } catch (error) {
    parentPort.postMessage({ error: String(error?.stack ?? error) });
  }
});
