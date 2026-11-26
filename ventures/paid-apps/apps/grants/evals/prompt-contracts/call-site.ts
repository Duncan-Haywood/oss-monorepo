// Reads a purpose's ctx.llm call options (effort, maxTokens) straight from the module's source, so
// prompt-contract tests and the live smoke suite use exactly what production sends. Also lists
// every purpose the app calls (for the "every purpose has a contract" test). Node-only (fs).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Effort } from "./registry";

export const APP_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SERVICES = join(APP_ROOT, "src/worker/services");

/** AnthropicLlm's defaults when a call leaves the option out (ports/anthropic-llm.ts). */
export const ADAPTER_DEFAULTS = { effort: "high" as Effort, maxTokens: 16_000 };

export interface CallOptions {
  /** As written at the call site; null = not set (the adapter default applies). */
  effort: Effort | null;
  maxTokens: number | null;
  file: string;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") && !e.name.includes("fake-llm")
      ? [p]
      : [];
  });
}

const PURPOSE_CONST = /export const (\w+)\s*=\s*"([a-z_]+\.[a-z_]+)"/g;

function fileConstants(file: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of readFileSync(file, "utf8").matchAll(PURPOSE_CONST)) {
    if (m[1] && m[2]) out.set(m[1], m[2]);
  }
  return out;
}

/** Resolves a purpose constant used in `file`: defined there, or imported from a sibling module. */
function resolvePurpose(file: string, name: string): string | undefined {
  const own = fileConstants(file).get(name);
  if (own) return own;
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"(\.[^"]+)"/g)) {
    const names = (m[1] ?? "").split(",").map((x) => x.trim().replace(/^type\s+/, ""));
    const hit = names.find((x) => x === name || x.endsWith(` as ${name}`));
    if (!hit || !m[2]) continue;
    const original = hit.split(/\s+as\s+/)[0] ?? name;
    const base = join(dirname(file), m[2]);
    for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
      if (!existsSync(candidate)) continue;
      const value = fileConstants(candidate).get(original);
      if (value) return value;
    }
  }
  return undefined;
}

/** The `{ ... }` object literal that contains `index` (brace matching, strings skipped). */
function enclosingObject(src: string, index: number): string {
  let depth = 0;
  let start = -1;
  for (let i = index; i >= 0; i--) {
    const ch = src[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      if (depth === 0) {
        start = i;
        break;
      }
      depth--;
    }
  }
  if (start < 0) return "";
  depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return "";
}

interface CallSite {
  purpose: string;
  file: string;
  options: string;
}

/** Every `purpose: X` inside a request object literal in services (fakes and tests excluded). */
let cachedSites: CallSite[] | null = null;

export function findCallSites(): CallSite[] {
  if (cachedSites) return cachedSites;
  const out: CallSite[] = [];
  for (const f of walk(SERVICES)) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bpurpose:\s*(?:"([a-z_]+\.[a-z_]+)"|([A-Z][A-Z0-9_]+))\s*,/g)) {
      const purpose = m[1] ?? (m[2] ? resolvePurpose(f, m[2]) : undefined);
      if (!purpose || m.index === undefined) continue;
      const options = enclosingObject(src, m.index);
      // A request literal carries the prompt too; this skips type declarations and log payloads.
      if (!/\bsystem\b/.test(options) || !/\bprompt\b/.test(options)) continue;
      out.push({ purpose, file: relative(APP_ROOT, f), options });
    }
  }
  cachedSites = out;
  return out;
}

export function callOptions(purpose: string): CallOptions {
  const sites = findCallSites().filter((s) => s.purpose === purpose);
  const site = sites[0];
  if (!site) throw new Error(`no ctx.llm call site found for ${purpose}`);
  if (sites.length > 1) {
    const all = sites.map((s) => s.file).join(", ");
    throw new Error(`${purpose} has ${sites.length} call sites (${all}); expected one`);
  }
  const effort = site.options.match(/\beffort:\s*"(low|medium|high|xhigh|max)"/)?.[1] ?? null;
  const max = site.options.match(/\bmaxTokens:\s*([\d_]+)/)?.[1];
  return {
    effort: effort as Effort | null,
    maxTokens: max ? Number(max.replace(/_/g, "")) : null,
    file: site.file,
  };
}

/** Effective options (adapter defaults filled in). */
export function effectiveOptions(purpose: string): { effort: Effort; maxTokens: number } {
  const o = callOptions(purpose);
  return {
    effort: o.effort ?? ADAPTER_DEFAULTS.effort,
    maxTokens: o.maxTokens ?? ADAPTER_DEFAULTS.maxTokens,
  };
}
