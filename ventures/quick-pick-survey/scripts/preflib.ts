/**
 * The two PrefLib panels the real-rankings scripts read, fetched at run time
 * and pinned by SHA-256 (not committed: PrefLib-Data is GPL-3.0 and the
 * rankings belong to their collectors). Cached in $REAL_RANKINGS_CACHE or the
 * OS temp directory. Used by real-rankings-eval.ts and real-favourite-set.ts.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://raw.githubusercontent.com/PrefLib/PrefLib-Data/main/datasets";
export const DATASETS = [
  {
    key: "breakfast",
    title: "Breakfast items, overall preference (Green and Rao 1972; 42 people, 15 items)",
    path: "00035%20-%20breakfast/00035-00000002.soc",
    sha256: "f3043c0ccd971325ca1ebcfee43341583071b75a0cef912f0ea1cf44ba337d7c",
    respondents: [5, 10, 20, 30],
    budgets: [10, 20, 30, 45],
  },
  {
    key: "shirt",
    title: "T-shirt designs, a research group's vote (PrefLib 00012; 30 people, 11 designs)",
    path: "00012%20-%20shirt/00012-00000001.soc",
    sha256: "b1a8731e90a1c837f6f0c28749cc829b232f02209e3c9c14c3f96881dcf8cd77",
    respondents: [5, 10, 20],
    budgets: [10, 20, 30],
  },
];

export function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  const v = Number(process.argv[i + 1]);
  if (!Number.isFinite(v) || v < 0) throw new Error(`${name} needs a number`);
  return v;
}

export async function load(path: string, sha256: string): Promise<string> {
  const dir = process.env.REAL_RANKINGS_CACHE ?? join(tmpdir(), "quick-pick-real-rankings");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, sha256 + ".soc");
  let text = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (!text) {
    const res = await fetch(`${BASE}/${path}`);
    if (!res.ok) throw new Error(`Fetch ${path}: HTTP ${res.status}`);
    text = await res.text();
  }
  const got = createHash("sha256").update(text).digest("hex");
  if (got !== sha256) throw new Error(`${path}: sha256 ${got}, expected ${sha256}`);
  writeFileSync(file, text);
  return text;
}
