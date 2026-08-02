import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * No `"use client"` module reads the server environment.
 *
 * `"use client"` marks the hydration boundary, not the boundary of where the
 * code runs. Every one of these modules is also executed during the server
 * render, where `process.env` is the real environment — so an environment read
 * here is serialised into the HTML handed to whoever requested the URL. This
 * venture has no login, so that is an anonymous visitor.
 *
 * Two components did exactly that. `PartnerCredentialVault` built the vault
 * from `getPartnerCredentialEnvFromProcess()` and rendered `maskedValue`, which
 * `maskSecretValue` deliberately builds from the key's real prefix and its last
 * four characters — the precise material `withoutMaskedValues` exists to strip
 * before a response leaves the process. `CheckoutRetargetingPanel` read the
 * same environment for ad-platform readiness. Both now ask an operator-guarded
 * route instead, which is the only place the environment is read.
 *
 * The guard on those routes was never the weak part. The hole was a second,
 * unguarded path to the same data that no route test could see, because it did
 * not go through a route.
 */

const SRC = join(process.cwd(), "src");

/** Directories that hold build output or dependencies, never source. */
const NOT_SOURCE = new Set(["node_modules", ".next", ".turbo", "dist", "build", "coverage"]);

/**
 * Every `.ts`/`.tsx` module under src/, as `[path relative to src, source]`.
 *
 * An array rather than a Map because this venture's `tsconfig` predates
 * downlevel iteration, and iterating a Map here is a typecheck error.
 */
function sourceFiles(dir: string = SRC): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (NOT_SOURCE.has(entry.name)) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      found.push([relative(SRC, path), readFileSync(path, "utf8")]);
    }
  }
  return found;
}

/**
 * A module is client-side if its first non-empty, non-comment line is the
 * directive. Checking position matters: the string can appear anywhere in a
 * file — in prose, or in this very test — without making it a client module.
 */
function isClientModule(source: string): boolean {
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) {
      continue;
    }
    return line === '"use client";' || line === "'use client';";
  }
  return false;
}

/**
 * Removes comments, so that a file explaining why it must not read the
 * environment does not read as a file that does. Crude on purpose: it does not
 * parse, and a `//` inside a string literal costs that line. That direction is
 * safe here — it can only hide code from the scan if the code sits after a
 * false comment start on the same line, and the checks below are for imports
 * and property reads that stand on their own lines.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

/** Reads of the server environment, by the two spellings that reach it here. */
const ENV_READS = [/\bprocess\.env\b/, /\bgetPartnerCredentialEnvFromProcess\b/];

test("no client component reads the server environment", () => {
  const offenders: string[] = [];
  for (const [path, source] of sourceFiles()) {
    if (!isClientModule(source)) {
      continue;
    }
    const code = stripComments(source);
    for (const pattern of ENV_READS) {
      if (pattern.test(code)) {
        offenders.push(`${path} matches ${pattern.source}`);
      }
    }
  }
  assert.deepEqual(
    offenders.sort(),
    [],
    "these modules run during the server render, so what they read from the environment " +
      "ships in the HTML. Move the read behind an operator-guarded route and fetch it with " +
      "`fetchOperatorJson`.",
  );
});

test("the scan actually reaches this venture's client components", () => {
  // Without this, a walker that silently returned nothing would report a clean
  // result — the failure mode that makes a contract test worse than no test.
  const clientModules = sourceFiles().filter(([, source]) => isClientModule(source));
  assert.ok(
    clientModules.length >= 10,
    `expected the scan to find this venture's client components, found ${clientModules.length}`,
  );
});

test("the client-module detector reads the directive's position, not its presence", () => {
  assert.equal(isClientModule('"use client";\nexport default function A() {}'), true);
  assert.equal(isClientModule("// a comment\n\n'use client';\n"), true);
  assert.equal(isClientModule('import x from "y";\n// mentions "use client" in prose\n'), false);
  assert.equal(isClientModule('const s = \'"use client";\';\n'), false);
});

test("the masked form of a credential is not rendered by any component", () => {
  // `maskedValue` is built from real key characters. It exists for an operator
  // reading a terminal, and there is no component context in this venture where
  // that reader is authenticated.
  const rendering: string[] = [];
  for (const [path, source] of sourceFiles()) {
    if (path.startsWith("lib/")) {
      continue;
    }
    if (stripComments(source).includes("maskedValue")) {
      rendering.push(path);
    }
  }
  assert.deepEqual(rendering.sort(), [], "components must render `configured`, never the mask");
});
