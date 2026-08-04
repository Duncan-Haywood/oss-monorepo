/**
 * offer-claims.test.ts — `npm test` (tsx, no test framework dependency).
 *
 * Holds the customer-facing copy to what the pipeline can actually deliver.
 *
 * The one-pager sold a $19 concierge shoot including "sky replacement where
 * needed, and perspective/vertical correction applied to every kept shot".
 * enhance.ts does `.rotate().resize().normalise().sharpen().jpeg()` — it has
 * never done either of those, and process/mls-compliance.ts says so in as many
 * words ("The current enhance.ts pipeline does NOT do virtual staging, sky
 * replacement, or object removal"). So the compliance file was right and the
 * page a paying customer reads was wrong, on a site that is live.
 *
 * That is two problems, not one. The obvious one is that a customer is
 * promised an edit nobody can perform. The second is regulatory: every
 * alteration listed below is exactly the class that triggers a disclosure
 * obligation under the strict-disclosure rules mls-compliance.ts tracks
 * (CA AB 723, NY, TX) — a visible "Virtually Staged" label plus the original
 * unaltered photo. Advertising one of these edits therefore also advertises a
 * delivery this venture does not produce.
 *
 * The rule this file enforces: customer-facing copy may not claim a restricted
 * alteration unless the pipeline has gained the capability to perform it. Each
 * entry carries the code signal that would make its claim true, so when a real
 * "Polish" step lands (decisions-log.ts scopes one), the claim unlocks on its
 * own — this is a contract, not a word blocklist.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const VENTURE = join(HERE, "..", "..");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

/**
 * Every file whose text a prospective or paying customer reads. The one-pager
 * renders on the live pricing page; the outreach templates are pasted into
 * cold emails and DMs; the delivery message ships with the finished folder;
 * the follow-up and booking-link messages are sent to customers and prospects.
 *
 * This list is not the whole surface, and hardcoding it is how the contract
 * came to pass while the site published all five restricted alterations:
 * `docs-site` renders STRATEGY.md as a public page, and STRATEGY.md was in no
 * list here. `publishedDocSurface()` below reads that registry off disk so a
 * page added to the site is scanned without anyone remembering to add it.
 */
const CUSTOMER_FACING = [
  "process/pricing-one-pager.tsx",
  "process/outreach-templates.ts",
  "process/delivery-message.ts",
  "process/referral-followup.ts",
  "process/booking-link.ts",
];

/**
 * The markdown the docs site publishes, read from its own registry rather than
 * mirrored. `DOC_REGISTRY` in docs-site/src/lib/docs.ts is the list of files
 * the site renders, each `file:` resolved against the venture root.
 */
async function publishedDocSurface(): Promise<string[]> {
  const registrySource = await readFile(
    join(VENTURE, "docs-site/src/lib/docs.ts"),
    "utf8",
  );
  const files = [...registrySource.matchAll(/^\s*file:\s*"([^"]+)"/gm)].map(
    (match) => match[1]!,
  );
  assert(
    files.length > 0,
    "docs-site/src/lib/docs.ts declares no `file:` entries — either the registry " +
      "moved or its shape changed, and this scan would silently cover nothing",
  );
  return files;
}

/**
 * A published page may name a restricted alteration when the same line says it
 * is not available yet. A strategy document has to be able to describe what the
 * product intends to build; what it may not do is read as an offer.
 *
 * This is deliberately per-claim rather than a directory exemption. Exempting
 * `docs-site` wholesale would restore exactly the hole this change closes: a
 * region of the site where the claim may be untrue and nothing says so.
 */
const NOT_YET_AVAILABLE =
  /\b(planned|roadmap|not (yet )?(built|available|implemented|offered|shipped)|nothing in the pipeline|unbuilt|does not (yet )?exist)\b/i;

/**
 * Split copy into the blocks a reader takes as one statement: a markdown list
 * item or a paragraph. The qualifier has to sit in the same block as the claim.
 *
 * Line granularity looked equivalent and is not — it depends on where the text
 * happens to wrap, so re-flowing a paragraph could silently strip a claim of
 * its disclaimer. Block granularity is also why this cannot become a whole-file
 * allowance: a disclaimer at the top of a long page does not qualify an offer
 * five sections below it.
 */
function claimBlocks(text: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) {
      blocks.push(current.join(" "));
      current = [];
    }
  };
  for (const line of text.split("\n")) {
    const startsBlock = /^\s*(\d+\.|[-*+]|#{1,6}\s)/.test(line);
    if (line.trim() === "" || startsBlock) {
      flush();
    }
    if (line.trim() !== "") {
      current.push(line.trim());
    }
  }
  flush();
  return blocks;
}

/**
 * Alterations that (a) enhance.ts cannot perform and (b) trigger a disclosure
 * obligation in strict-disclosure states. `capability` is the signal that must
 * appear in the pipeline source before the claim may be made — matched against
 * enhance.ts, so adding the real feature is what unlocks the copy.
 */
const RESTRICTED_ALTERATIONS: Array<{
  name: string;
  claim: RegExp;
  capability: RegExp;
}> = [
  {
    name: "sky replacement",
    claim: /sky\s+(replacement|swap|replace)/i,
    // Replacing a sky means compositing a second image over a mask.
    capability: /\.composite\(|skyReplace|replaceSky/,
  },
  {
    name: "perspective / vertical correction",
    claim: /perspective\s*\/?\s*(and\s+)?vertical|vertical\s+correction|perspective\s+correction/i,
    // sharp exposes this as an affine/homography transform; `.rotate()` with
    // no argument is EXIF auto-orientation and is not the same thing.
    capability: /\.affine\(|homograph|perspectiveCorrect/,
  },
  {
    name: "virtual staging",
    claim: /virtual(ly)?\s+stag/i,
    capability: /virtualStag|stageRoom/,
  },
  {
    name: "object or item removal",
    claim: /(object|item|clutter)\s+removal|remove\s+(objects|items|clutter)/i,
    capability: /objectRemov|inpaint/,
  },
  {
    name: "twilight conversion",
    claim: /twilight\s+(conversion|shot|edit)|day\s*-?\s*to\s*-?\s*dusk/i,
    capability: /twilight/,
  },
];

/**
 * Claims the copy is allowed to make because enhance.ts demonstrably performs
 * them. Verified against the source rather than assumed, so deleting a step
 * from the pipeline fails here instead of silently leaving the promise behind.
 */
const DELIVERED_OPERATIONS: Array<{ name: string; signal: RegExp }> = [
  { name: "auto-orientation", signal: /\.rotate\(\)/ },
  { name: "exposure/contrast normalisation", signal: /\.normalise\(|\.normalize\(/ },
  { name: "sharpening", signal: /\.sharpen\(/ },
  { name: "consistent resize", signal: /\.resize\(/ },
  { name: "JPEG re-encode", signal: /\.jpeg\(/ },
];

async function run() {
  const enhanceSource = await readFile(join(VENTURE, "pipeline/src/enhance.ts"), "utf8");

  const published = await publishedDocSurface();
  const surface = [...CUSTOMER_FACING, ...published];

  const copy = new Map<string, string>();
  for (const relative of surface) {
    copy.set(relative, await readFile(join(VENTURE, relative), "utf8"));
  }

  // A silent miss here would make every assertion below vacuous.
  assert(copy.size === surface.length, "every customer-facing file must be readable");
  for (const [relative, text] of copy) {
    assert(text.trim().length > 0, `${relative} is empty — the scan would pass vacuously`);
  }
  assert(
    copy.has("STRATEGY.md"),
    "STRATEGY.md is rendered as a public docs-site page and must be scanned — " +
      "it was the file that published all five restricted alterations while this " +
      "contract passed",
  );

  // 1. The pipeline still does what the copy is permitted to claim.
  for (const op of DELIVERED_OPERATIONS) {
    assert(
      op.signal.test(enhanceSource),
      `enhance.ts no longer performs ${op.name}, but the offer copy still promises it — ` +
        `update process/pricing-one-pager.tsx in the same change`,
    );
  }

  // 2. No customer-facing file claims an alteration the pipeline cannot do.
  for (const alteration of RESTRICTED_ALTERATIONS) {
    const capable = alteration.capability.test(enhanceSource);

    for (const [relative, text] of copy) {
      const claimed = alteration.claim.test(text);
      if (!claimed) continue;

      // The qualifier has to sit with the claim, in the same block, rather than
      // anywhere in a long document.
      const claiming = claimBlocks(text).filter((block) => alteration.claim.test(block));
      const allQualified =
        claiming.length > 0 && claiming.every((block) => NOT_YET_AVAILABLE.test(block));
      if (allQualified) continue;

      assert(
        capable,
        `${relative} advertises ${alteration.name}, which pipeline/src/enhance.ts ` +
          `cannot perform (no ${alteration.capability} in the source). Either build it — ` +
          `and then satisfy the disclosure rule in process/mls-compliance.ts, since this ` +
          `alteration requires a visible label and the original photo in strict states — ` +
          `or describe the edits the pipeline actually applies.`,
      );
    }
  }

  // 3. mls-compliance.ts is the source of this rule; if its claim about the
  //    pipeline is retired, this contract needs rewriting rather than passing.
  const compliance = await readFile(join(VENTURE, "process/mls-compliance.ts"), "utf8");
  assert(
    /virtual-staging-disclosure/.test(compliance),
    "process/mls-compliance.ts no longer carries the virtual-staging-disclosure rule " +
      "this contract is derived from — re-derive RESTRICTED_ALTERATIONS before removing it",
  );

  console.log(
    `offer-claims: ${CUSTOMER_FACING.length} customer-facing files + ` +
      `${published.length} published docs-site pages clear of ` +
      `${RESTRICTED_ALTERATIONS.length} restricted alterations; ` +
      `${DELIVERED_OPERATIONS.length} promised operations present in enhance.ts`,
  );
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
