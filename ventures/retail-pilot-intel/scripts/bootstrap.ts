import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(module: string, args: string[] = []): void {
  const result = spawnSync("node", ["--import", "tsx", module, ...args], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("packages/analytics/src/cli.ts", ["init"]);
run("packages/edge/src/cli.ts", ["--sample"]);
run("packages/pos/src/cli.ts", ["--sample"]);
run("packages/analytics/src/cli.ts", ["sync"]);
run("packages/analytics/src/cli.ts", ["report", "--date", "today"]);

console.log("\nDocs (dev):  pnpm docs:dev");
console.log("Docs (built): apps/docs/dist/index.html");
