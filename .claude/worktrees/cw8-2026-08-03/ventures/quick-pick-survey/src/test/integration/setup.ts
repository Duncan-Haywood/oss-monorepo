import { applyTestEnv } from "./env";

// Runs in every worker before the test file's imports are evaluated, which is
// what matters: `src/lib/prisma.ts` reads the connection at module load.
applyTestEnv();
