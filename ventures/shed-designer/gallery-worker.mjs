// One gallery search in a worker thread (gallerySearchesParallel in gallery.mjs).
import { parentPort, workerData } from 'node:worker_threads';
import { gallerySearch } from './gallery.mjs';

parentPort?.postMessage(gallerySearch(workerData.key, workerData.prices));
