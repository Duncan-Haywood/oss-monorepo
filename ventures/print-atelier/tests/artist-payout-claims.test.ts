import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Binds print-atelier's artist-facing payout promises to code that can keep them.
 *
 * Every other venture in this repository has a claims contract —
 * `ventures/local-site-studio/src/lib/pricing/advertised-price-claims.test.ts`,
 * `ventures/quick-pick-survey/src/lib/pricingClaims.test.ts`,
 * `ventures/real-estate-agent-photo-app/pipeline/src/offer-claims.test.ts`,
 * `ventures/retail-pilot-intel/packages/analytics/tests/claims-contract.test.ts`.
 * print-atelier had none. It looked as though it did: `src/lib/print-damage-claims.ts`
 * matches a grep for "claims" and is about damaged-print warranty claims, an
 * unrelated sense of the word. So the venture carrying the most money-adjacent
 * copy in the repository was the one venture whose copy nothing checked.
 *
 * What that let through, found on 2026-08-05: `src/lib/artist-terms.ts` listed
 * "Automated monthly Stripe Connect disbursements" among the
 * `artistProtectionHighlights` an artist acknowledges under `payoutAcknowledgement`
 * — a consent `requireConsents` blocks listing release without, so it is contract
 * formation, not marketing. Nothing in the venture creates a Stripe transfer:
 * `src/lib/stripe-checkout-server.ts` makes the only outbound Stripe call in the
 * codebase, `checkout.sessions.create`, and it sets neither `transfer_data` nor
 * `application_fee_amount`. There is no `transfers.create` anywhere, and
 * `platform/k8s/apps/print-atelier/` declares no CronJob.
 *
 * WHAT IS ACTUALLY TRUE, and what a future reader should not "fix":
 * disbursement here is **operator-executed and manual**, and the rest of the
 * loop is real. `src/lib/payout-reconciliation.ts` computes what each artist is
 * owed and classifies an artist with no covering transfer as `"unpaid"` rather
 * than `"balanced"` — it does not flatter itself. `src/lib/stripe-connect.ts`
 * handles `transfer.created` and `payout.paid`, so a transfer an operator issues
 * by hand in the Stripe dashboard is ingested and reconciled. That is a coherent
 * human-in-the-loop design and this contract deliberately permits it.
 *
 * The defect was one word. "Automated" describes a machine doing it, and no
 * machine does. So this contract polices exactly that gap: copy may promise
 * Stripe Connect disbursement, and may promise a monthly cadence an operator
 * honours, but may not promise the *machine* performs it until the machine can.
 *
 * The surface is discovered by walking `src/`, not listed. A hardcoded file list
 * is how a claims control comes to read a surface that does not include the one
 * that ships — so a new module repeating the promise is caught by construction.
 */

const VENTURE = join(import.meta.dirname, "..");
const SRC = join(VENTURE, "src");
const REPO_ROOT = join(VENTURE, "..", "..");
const K8S_DIR = join(REPO_ROOT, "platform", "k8s", "apps", "print-atelier");

/** Every non-test source file under `src/`, discovered rather than declared. */
function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, acc);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    acc.push(full);
  }
  return acc;
}

type ClaimSite = { file: string; line: number; text: string };

/** Words that mean money leaving us and reaching an artist. */
const DISBURSEMENT = /\b(disburse\w*|payout\w*|transfer\w*|paid out)\b/i;
/** Words that assert a machine performs it with no human in the loop. */
const AUTOMATION = /\b(automat\w*|scheduled|hands-?free|without manual|no manual)\b/i;

/**
 * Comments are not claims. A module header reading "Automated Artist Payout FX
 * Optimizer" describes what the file is for; nobody signs it. Matching those
 * would bury the copy that an artist actually reads under a dozen file
 * docblocks, and the first fix would be to soften the docblocks — which changes
 * nothing about what we promise. Strip comments, then match.
 */
function stripComments(line: string): string {
  return line
    .replace(/\/\/.*$/, "") // trailing or whole-line //
    .replace(/^\s*\/?\*+.*$/, "") // /** ... */ and continuation ` * ...`
    .replace(/\/\*.*?\*\//g, ""); // inline /* ... */
}

function findClaimSites(files: string[]): ClaimSite[] {
  const sites: ClaimSite[] = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((raw, index) => {
      const text = stripComments(raw);
      if (DISBURSEMENT.test(text) && AUTOMATION.test(text)) {
        sites.push({ file: relative(VENTURE, file), line: index + 1, text: raw.trim() });
      }
    });
  }
  return sites;
}

/**
 * Does any code here actually create a Stripe transfer?
 *
 * A destination charge (`transfer_data`) and an explicit `transfers.create` are
 * the two ways money reaches a connected account. Reading a transfer back off a
 * webhook is not creating one, so `stripe-connect.ts`'s `transfer.created`
 * handler must not count — the pattern requires the creating call shape.
 */
const TRANSFER_CREATION =
  /transfers\s*\.\s*create\b|\btransfer_data\b|\bapplication_fee_amount\b|\bon_behalf_of\b/;

function findTransferCreationSites(files: string[]): ClaimSite[] {
  const sites: ClaimSite[] = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, index) => {
      // A comment describing the absence is not a capability.
      const code = text.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
      if (TRANSFER_CREATION.test(code)) {
        sites.push({ file: relative(VENTURE, file), line: index + 1, text: text.trim() });
      }
    });
  }
  return sites;
}

/** Something that fires on a cadence with nobody pressing a button. */
function findSchedulerSites(): string[] {
  const found: string[] = [];
  if (existsSync(K8S_DIR)) {
    for (const entry of readdirSync(K8S_DIR).sort()) {
      if (!/\.ya?ml$/.test(entry)) continue;
      const body = readFileSync(join(K8S_DIR, entry), "utf8");
      if (/^\s*kind:\s*CronJob\s*$/m.test(body)) {
        found.push(`platform/k8s/apps/print-atelier/${entry}`);
      }
    }
  }
  return found;
}

describe("artist payout claims are bound to code that can keep them", () => {
  const sourceFiles = collectSourceFiles(SRC);

  it("scans a source surface that is actually there", () => {
    // A claims control whose scan collects nothing passes truthfully over
    // everything. Pin the surface so a moved directory turns this red rather
    // than silently disarming every assertion below.
    assert.ok(
      sourceFiles.length > 50,
      `Expected to scan print-atelier's src/ tree; collected ${sourceFiles.length} files. ` +
        "If src/ moved, this contract is reading nothing and the assertions below are vacuous.",
    );
    assert.ok(
      sourceFiles.some((f) => f.endsWith("lib/artist-terms.ts")),
      "src/lib/artist-terms.ts is the module that carries the artist consent copy " +
        "and it was not collected — the scan is looking in the wrong place.",
    );
  });

  it("the disbursement-claim scanner still recognises the copy it exists to police", () => {
    // Guards the reverse failure: if the phrasing drifts far enough that
    // DISBURSEMENT no longer matches, the contract goes quiet instead of red.
    const termsFile = join(SRC, "lib", "artist-terms.ts");
    const disbursementLines = readFileSync(termsFile, "utf8")
      .split("\n")
      .filter((line) => DISBURSEMENT.test(line));
    assert.ok(
      disbursementLines.length >= 3,
      "src/lib/artist-terms.ts no longer reads as payout copy to this scanner " +
        `(${disbursementLines.length} matching lines). Either the promises moved — ` +
        "in which case point this contract at where they went — or DISBURSEMENT " +
        "needs widening. Do not leave it matching nothing.",
    );
  });

  it("promises no automated disbursement while nothing here creates a transfer", () => {
    const claims = findClaimSites(sourceFiles);
    const transfers = findTransferCreationSites(sourceFiles);
    const schedulers = findSchedulerSites();

    if (claims.length === 0) return; // Nothing claimed, nothing to back.

    const detail = claims
      .map((c) => `  ${c.file}:${c.line}  ${c.text}`)
      .join("\n");

    assert.ok(
      transfers.length > 0,
      `Copy promises automated disbursement, and no module under src/ creates a ` +
        `Stripe transfer (no transfers.create, transfer_data, application_fee_amount ` +
        `or on_behalf_of):\n${detail}\n\n` +
        "Disbursement in this venture is operator-executed: an operator issues the " +
        "transfer in Stripe and src/lib/stripe-connect.ts ingests the resulting " +
        "transfer.created webhook. That is fine, and the copy may say so. It may " +
        "not say a machine does it. Either build the disbursement path or describe " +
        "the manual one accurately — an artist accepts this text as a consent term.",
    );

    assert.ok(
      schedulers.length > 0,
      `Copy promises disbursement on an automated cadence, and nothing fires on a ` +
        `cadence: platform/k8s/apps/print-atelier/ declares no CronJob:\n${detail}\n\n` +
        "A monthly commitment an operator honours by hand is honest; describe it " +
        "that way. 'Automated' and 'scheduled' assert nobody has to remember.",
    );
  });

  it("does not treat reading a transfer webhook as the ability to send one", () => {
    // stripe-connect.ts handles `transfer.created`. If TRANSFER_CREATION ever
    // widens far enough to match that handler, the contract above would read
    // print-atelier as able to pay artists automatically when it cannot.
    const connect = join(SRC, "lib", "stripe-connect.ts");
    assert.ok(existsSync(connect), "src/lib/stripe-connect.ts is missing");
    const hits = findTransferCreationSites([connect]);
    assert.deepEqual(
      hits,
      [],
      "src/lib/stripe-connect.ts now matches the transfer-creation pattern. If it " +
        "genuinely creates transfers, delete this test. If the pattern merely " +
        `widened onto its transfer.created handler, tighten it — otherwise ` +
        `ingesting a payout would count as making one:\n` +
        hits.map((h) => `  ${h.file}:${h.line}  ${h.text}`).join("\n"),
    );
  });
});
