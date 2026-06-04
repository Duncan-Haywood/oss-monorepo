/**
 * TypeScript CI orchestrator — single entry for local and GitHub Actions.
 */
import { spawnSync } from "node:child_process";
import { accessSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd: string, args: string[]): void {
  const label = [cmd, ...args].join(" ");
  console.log(`\n▶ ${label}`);
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function requireNode22(): void {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) {
    console.error(
      `Node ${process.versions.node} detected; bootstrap requires Node 22+ (node:sqlite).`,
    );
    console.error("Install Node 22 (see .nvmrc) and re-run pnpm run ci.");
    process.exit(1);
  }
}

const steps: Array<() => void> = [
  () => run("pnpm", ["run", "docs:sync"]),
  () => run("pnpm", ["run", "typecheck"]),
  () => run("pnpm", ["run", "lint"]),
  () => run("pnpm", ["run", "build"]),
  () => {
    requireNode22();
    run("pnpm", ["run", "bootstrap"]);
  },
  () => {
    const docsDist = join(root, "apps/docs/dist/index.html");
    accessSync(docsDist);
    console.log(`✓ Docs build present: ${docsDist}`);
  },
  () => {
    const portalDist = join(root, "apps/portal/dist/index.html");
    accessSync(portalDist);
    console.log(`✓ Portal build present: ${portalDist}`);
  },
];

for (const step of steps) {
  step();
}

console.log("\n✓ CI pipeline passed");
