/** Worker-thread entry for `pairMixParallel` (pairMix.ts): one seeded run, posted back as its rows. */
import { parentPort, workerData } from "node:worker_threads";
import { pairMixRun, type MixPolicy } from "@/lib/pairMix";

const { policy, seed, n, budget } = workerData as { policy: MixPolicy; seed: number; n: number; budget: number };
parentPort!.postMessage(pairMixRun(policy, seed, n, budget));
