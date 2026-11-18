/** Worker-thread entry for `cellParallel` (poolCapCell.ts): one seeded run, posted back as two numbers. */
import { parentPort, workerData } from "node:worker_threads";
import { cellRun, type CellPolicy } from "@/lib/poolCapCell";

const { policy, items, budget, seed } = workerData as { policy: CellPolicy; items: number; budget: number; seed: number };
parentPort!.postMessage(cellRun(policy, items, budget, seed));
