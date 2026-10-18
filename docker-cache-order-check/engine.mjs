// Zero-dependency, deterministic Dockerfile instruction-order scanner. Pure
// text/regex analysis -- no Dockerfile-grammar library, no network call, and
// nothing here ever runs `docker build` or touches an image. Shared by both
// the CLI and the browser page (unlike this portfolio's other Dockerfile
// checkers, which keep a Python `check.py` and a hand-ported `classify.mjs`
// in lock-step -- see docker-base-image-pin-check for that shape), so there
// is exactly one implementation to keep correct.
//
// This checks a different object than this portfolio's existing Dockerfile
// checkers: docker-base-image-pin-check looks at whether a `FROM` line is
// pinned to a digest, and docker-build-secrets-check looks at whether a
// secret leaks into the build context or image layers. Both are about
// *security*. This is about *build performance* -- whether the order of
// `COPY`/`RUN` instructions defeats Docker's own layer cache, the exact
// anti-pattern Docker's own "Leverage build cache" documentation names and
// gives the fix for.
//
// Three findings, each tied to a documented, real cause:
//
// 1. `manifest-copy-after-broad-copy` -- a dependency manifest (package.json,
//    requirements.txt, go.mod, ...) is copied and installed, but only after a
//    whole-build-context `COPY . .` has already run earlier in the same
//    build stage. Docker's own docs give the canonical fix: copy the
//    manifest and install dependencies *before* copying the rest of the
//    source, so a source-only change reuses the cached install layer instead
//    of re-running it on every build.
// 2. `install-missing-manifest-copy` -- an install command (`npm ci`, `pip
//    install -r requirements.txt`, ...) runs with no earlier instruction that
//    names its manifest file specifically. The only route by which the
//    manifest reached the image is a broad copy, so there is no dependency
//    layer to cache at all: *any* changed file in the build context
//    invalidates the install, regardless of instruction order.
// 3. `apt-update-install-split` -- a `RUN` instruction runs `apt-get update`
//    (or `apt update`) without also running `install`/`upgrade` in the same
//    instruction. Docker's own Dockerfile best practices document this
//    exact split by name: "Always combine RUN apt-get update with apt-get
//    install in the same statement" -- a cached, stale `update` layer can
//    leave a later, separately-cached `install` layer resolving packages
//    against a package index that no longer matches what the registry
//    actually serves.
//
// What this does not do: validate that a Dockerfile builds, resolve
// `ARG`/`ENV` substitutions, or know whether a flagged pattern was
// deliberate (some multi-stage builds intentionally copy broadly in an early
// stage that is never a cache-sensitive one). It reports the pattern; the
// person reading the Dockerfile decides whether it is a mistake in their
// case.

/** One dependency ecosystem: how to recognize its manifest file(s) in a
 * `COPY`/`ADD` source list, and how to recognize its install command in a
 * `RUN` instruction. */
const ECOSYSTEMS = [
  {
    id: "npm",
    label: "npm/yarn/pnpm",
    manifestRe: /(^|\/)(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json)$/i,
    installRe: /\b(npm\s+(ci|install)|yarn(?:\s+install)?\b|pnpm\s+(install|i)\b)/i,
  },
  {
    id: "pip",
    label: "pip",
    manifestRe: /(^|\/)(requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|Pipfile(\.lock)?)$/i,
    installRe: /\bpip3?\s+install\b/i,
  },
  {
    id: "go",
    label: "Go modules",
    manifestRe: /(^|\/)(go\.mod|go\.sum)$/i,
    installRe: /\bgo\s+(mod\s+(download|tidy|verify)|build|install)\b/i,
  },
  {
    id: "bundler",
    label: "Bundler",
    manifestRe: /(^|\/)(Gemfile|Gemfile\.lock)$/i,
    installRe: /\bbundle\s+install\b/i,
  },
  {
    id: "composer",
    label: "Composer",
    manifestRe: /(^|\/)(composer\.json|composer\.lock)$/i,
    installRe: /\bcomposer\s+install\b/i,
  },
  {
    id: "cargo",
    label: "Cargo",
    manifestRe: /(^|\/)(Cargo\.toml|Cargo\.lock)$/i,
    installRe: /\bcargo\s+(build|fetch)\b/i,
  },
];

export const FINDING_KINDS = Object.freeze({
  MANIFEST_AFTER_BROAD_COPY: "manifest-copy-after-broad-copy",
  INSTALL_MISSING_MANIFEST_COPY: "install-missing-manifest-copy",
  APT_UPDATE_INSTALL_SPLIT: "apt-update-install-split",
});

// Every finding kind this tool produces is a real, actionable cache-busting
// pattern -- there is no "informational, not a problem" tier here, unlike a
// security scanner that might report both a hard risk and a soft note.
export const RISK_KINDS = new Set(Object.values(FINDING_KINDS));

/**
 * Splits raw Dockerfile text into logical instructions, joining
 * backslash-continued physical lines into one, and dropping blank lines,
 * full-line comments, and (per BuildKit) comment lines that appear *inside*
 * a backslash continuation. Returns `[{ lineNumber, instruction, args }]`,
 * `lineNumber` being the first physical line of that instruction.
 *
 * This is a best-effort line-oriented scan, not a Dockerfile grammar --
 * exactly the same trade-off this portfolio's other Dockerfile checkers make
 * (see docker-base-image-pin-check's check.py), because `FROM`/`COPY`/`RUN`
 * instructions are regular enough in practice that a full parser buys little
 * and costs a dependency.
 */
export function parseInstructions(text) {
  const raw = String(text).split(/\r\n|\r|\n/);
  const instructions = [];
  let building = false;
  let startLine = 0;
  let parts = [];

  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i];
    const lineNumber = i + 1;
    if (!building) {
      if (line.trim() === "" || /^\s*#/.test(line)) continue;
      building = true;
      startLine = lineNumber;
      parts = [];
    } else if (/^\s*#/.test(line)) {
      // A comment line inside a `\`-continuation is dropped, not treated as
      // ending the continuation -- BuildKit allows this and a naive scanner
      // that stopped here would silently truncate the instruction.
      continue;
    }
    const continues = /\\\s*$/.test(line);
    parts.push(line.replace(/\\\s*$/, ""));
    if (!continues) {
      const joined = parts.join(" ").replace(/\s+/g, " ").trim();
      const match = /^(\S+)\s*([\s\S]*)$/.exec(joined);
      if (match) {
        instructions.push({ lineNumber: startLine, instruction: match[1].toUpperCase(), args: match[2] });
      }
      building = false;
      parts = [];
    }
  }
  if (building && parts.length) {
    const joined = parts.join(" ").replace(/\s+/g, " ").trim();
    const match = /^(\S+)\s*([\s\S]*)$/.exec(joined);
    if (match) {
      instructions.push({ lineNumber: startLine, instruction: match[1].toUpperCase(), args: match[2] });
    }
  }
  return instructions;
}

/**
 * Parses a `COPY`/`ADD` instruction's argument string into
 * `{ fromStage, sources, dest }`. Handles the ordinary shell-word form
 * (`COPY --from=builder --chown=x:y src1 src2 dest`) and the JSON-array form
 * (`COPY ["src", "dest"]`). `fromStage` is the `--from=` value, or `null` for
 * an ordinary build-context copy.
 */
export function parseCopyArgs(argsText) {
  const text = String(argsText).trim();
  const bracketIndex = text.indexOf("[");
  let fromStage = null;
  let flagsText = text;
  let arrayText = null;
  if (bracketIndex !== -1) {
    flagsText = text.slice(0, bracketIndex);
    arrayText = text.slice(bracketIndex);
  }
  for (const token of flagsText.trim().split(/\s+/).filter(Boolean)) {
    if (token.startsWith("--from=")) fromStage = token.slice("--from=".length);
  }

  if (arrayText) {
    try {
      const arr = JSON.parse(arrayText);
      if (Array.isArray(arr) && arr.length >= 2) {
        return { fromStage, sources: arr.slice(0, -1).map(String), dest: String(arr[arr.length - 1]) };
      }
    } catch {
      // Malformed JSON-array form -- fall through and report no sources
      // rather than guessing.
    }
    return { fromStage, sources: [], dest: null };
  }

  const tokens = text.split(/\s+/).filter(Boolean).filter((t) => !t.startsWith("--"));
  if (tokens.length < 2) return { fromStage, sources: tokens, dest: null };
  return { fromStage, sources: tokens.slice(0, -1), dest: tokens[tokens.length - 1] };
}

/** A `COPY . .`-shaped whole-build-context copy: exactly one source, and
 * that source is `.` or `./` (a bare directory-glob source, not a named
 * file or subdirectory). `COPY src/ ./src/` is not broad; `COPY . /app` is. */
export function isBroadCopy({ sources }) {
  return sources.length === 1 && (sources[0] === "." || sources[0] === "./");
}

/** Does any source in this `COPY`/`ADD` instruction specifically name one of
 * `ecosystem`'s manifest files (not just include it incidentally via a broad
 * copy)? */
function copiesManifest(sources, ecosystem) {
  return sources.some((s) => ecosystem.manifestRe.test(s));
}

const APT_UPDATE_RE = /\bapt(?:-get)?\s+update\b/i;
const APT_INSTALL_OR_UPGRADE_RE = /\bapt(?:-get)?\s+(install|upgrade|dist-upgrade|full-upgrade)\b/i;

/**
 * Scans one Dockerfile's text for cache-order findings. `filename` is
 * carried through for display only.
 *
 * State (which manifest has been copied, whether a broad copy has happened
 * yet) is scoped **per build stage** -- reset at every `FROM` -- because
 * each stage is its own cache lineage; a pattern in one stage says nothing
 * about another.
 */
export function scanText(text, filename = "<Dockerfile>") {
  const instructions = parseInstructions(text);
  const findings = [];

  let stageIndex = 0;
  let firstBroadCopyLine = null;
  // ecosystemState[id] = { manifestCopyLine: number|null, installLine: number|null }
  let ecosystemState = {};
  const resetStage = () => {
    stageIndex += 1;
    firstBroadCopyLine = null;
    ecosystemState = Object.fromEntries(ECOSYSTEMS.map((e) => [e.id, { manifestCopyLine: null, installLine: null }]));
  };
  resetStage();

  for (const { lineNumber, instruction, args } of instructions) {
    if (instruction === "FROM") {
      resetStage();
      continue;
    }

    if (instruction === "COPY" || instruction === "ADD") {
      const { fromStage, sources } = parseCopyArgs(args);
      if (fromStage !== null) continue; // copies another build stage's output, not the build context
      if (isBroadCopy({ sources }) && firstBroadCopyLine === null) firstBroadCopyLine = lineNumber;
      for (const eco of ECOSYSTEMS) {
        const state = ecosystemState[eco.id];
        if (state.manifestCopyLine === null && copiesManifest(sources, eco)) {
          state.manifestCopyLine = lineNumber;
        }
      }
      continue;
    }

    if (instruction === "RUN") {
      for (const eco of ECOSYSTEMS) {
        const state = ecosystemState[eco.id];
        if (state.installLine !== null || !eco.installRe.test(args)) continue;
        state.installLine = lineNumber;
        if (state.manifestCopyLine === null) {
          findings.push({
            file: filename,
            stage: stageIndex,
            line: lineNumber,
            kind: FINDING_KINDS.INSTALL_MISSING_MANIFEST_COPY,
            ecosystem: eco.label,
          });
        } else if (firstBroadCopyLine !== null && firstBroadCopyLine < state.manifestCopyLine) {
          findings.push({
            file: filename,
            stage: stageIndex,
            line: state.manifestCopyLine,
            installLine: state.installLine,
            broadCopyLine: firstBroadCopyLine,
            kind: FINDING_KINDS.MANIFEST_AFTER_BROAD_COPY,
            ecosystem: eco.label,
          });
        }
      }

      if (APT_UPDATE_RE.test(args) && !APT_INSTALL_OR_UPGRADE_RE.test(args)) {
        findings.push({ file: filename, stage: stageIndex, line: lineNumber, kind: FINDING_KINDS.APT_UPDATE_INSTALL_SPLIT });
      }
      continue;
    }
  }

  return findings;
}

/** Scans one or more named Dockerfiles at once. `files` is `[{name, text}]`.
 * Returns the concatenated findings, in the order given. */
export function scanFiles(files) {
  const findings = [];
  for (const file of files) findings.push(...scanText(file.text, file.name || "<Dockerfile>"));
  return findings;
}

export function hasRisk(findings) {
  return findings.some((f) => RISK_KINDS.has(f.kind));
}

/** One human-readable line per finding, with its fix. Shared by the CLI's
 * text output and the browser page so the two never disagree about wording. */
export function describeFinding(f) {
  const where = `${f.file}:${f.line}`;
  if (f.kind === FINDING_KINDS.MANIFEST_AFTER_BROAD_COPY) {
    return (
      `${where}  ${f.ecosystem}: manifest copied/installed at line ${f.line}, but a whole-build-context ` +
      `COPY already ran at line ${f.broadCopyLine}. Move the manifest COPY and its install RUN above ` +
      `the broad COPY so a source-only change reuses the cached dependency layer.`
    );
  }
  if (f.kind === FINDING_KINDS.INSTALL_MISSING_MANIFEST_COPY) {
    return (
      `${where}  ${f.ecosystem} install runs with no earlier COPY naming its manifest file specifically -- ` +
      `only a broad context copy reaches it, so there is no dependency layer to cache at all. Add a COPY ` +
      `for the manifest file(s) alone, before this RUN and before any broad COPY.`
    );
  }
  if (f.kind === FINDING_KINDS.APT_UPDATE_INSTALL_SPLIT) {
    return (
      `${where}  apt-get/apt update runs without install/upgrade in the same RUN instruction. Docker's own ` +
      `Dockerfile best practices name this split directly: combine them in one RUN ("apt-get update && ` +
      `apt-get install -y ...") so a cached, stale update layer can never sit ahead of a separately-cached ` +
      `install layer.`
    );
  }
  return `${where}  ${f.kind}`;
}

/** One-line summary for the top of a report. */
export function summarize(findings) {
  if (findings.length === 0) {
    return "No cache-order issues found.";
  }
  const counts = {};
  for (const f of findings) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
  const parts = [];
  if (counts[FINDING_KINDS.MANIFEST_AFTER_BROAD_COPY]) {
    parts.push(`${counts[FINDING_KINDS.MANIFEST_AFTER_BROAD_COPY]} manifest copy/install ordered after a broad COPY`);
  }
  if (counts[FINDING_KINDS.INSTALL_MISSING_MANIFEST_COPY]) {
    parts.push(`${counts[FINDING_KINDS.INSTALL_MISSING_MANIFEST_COPY]} install with no isolated manifest COPY`);
  }
  if (counts[FINDING_KINDS.APT_UPDATE_INSTALL_SPLIT]) {
    parts.push(`${counts[FINDING_KINDS.APT_UPDATE_INSTALL_SPLIT]} apt update/install split across layers`);
  }
  return `${findings.length} cache-order issue(s) found: ${parts.join("; ")}.`;
}
