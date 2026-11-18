// Runs settings of the agreed-changes panel in a Node worker thread (the CLI's
// counterpart of consensus-worker.mjs, which is the page's Web Worker). It takes
// one setting at a time from the parent and answers with runSetting's result.
import { parentPort } from 'node:worker_threads';
import { PANEL, runSetting } from './consensus.mjs';

parentPort.on('message', ({ id, base, setting }) => {
  parentPort.postMessage({ id, setting, run: runSetting(base, PANEL[setting]) });
});
