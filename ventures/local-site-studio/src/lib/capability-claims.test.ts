import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Every capability this venture sells a visitor must be a capability it has.
 *
 * `src/lib/pricing/advertised-price-claims.test.ts` binds the advertised
 * *price* to the price Stripe charges. This is the same contract one step out:
 * it binds the advertised *capability* to whether the code to deliver it
 * exists. A correct price attached to a feature nobody built is still a
 * customer paying for something they will not get.
 *
 * The claim that forced this was the phone agent. The Complete tier sells at
 * $500 + $199/mo, and until 2026-08-04 four public surfaces — the tier's
 * feature list, the hero paragraph, the pricing-section blurb, and the upsell
 * email whose only call to action is the checkout link — described "an AI phone
 * agent that answers your business line". No telephony integration existed:
 * `package.json` carried no Twilio, Vapi, Retell, Telnyx, Plivo or Vonage
 * dependency, and no module under `src/` imported one. The whole of
 * `src/lib/voice/` generates an FAQ and script pack that is emailed to the
 * operator's client for them to read themselves.
 *
 * The venture's own documentation said so plainly — `/docs/product-bundles`
 * reads "Until Twilio is live, operators fulfill with a generated FAQ/script
 * pack" — which is the part worth noticing. The truth was written down, on a
 * page reachable from the same site, while the surfaces a buyer actually reads
 * before paying said something else. Nothing compared them, so the two could
 * drift indefinitely in the direction that sells better.
 *
 * The rule is two-directional, like the ratchets in `scripts/ci/`. Today the
 * capability is absent, so the claim is forbidden. When a telephony integration
 * genuinely lands, PROVIDERS below starts matching, this test stops forbidding
 * the claim, and the copy may say it — without anybody having to remember that
 * this file exists. A control that has to be switched off by hand to permit the
 * improvement it is waiting for is a control that gets deleted instead.
 */

const VENTURE_ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(VENTURE_ROOT, "src");

/**
 * Package names that would constitute an actual phone-answering integration.
 * Matched against `package.json` dependencies and against import specifiers in
 * `src/`, because a dependency nothing imports does not answer a phone either.
 */
const PROVIDERS = ["twilio", "vapi", "@vapi-ai", "retell", "telnyx", "plivo", "@vonage"];

/**
 * Copy that asserts the product itself answers, takes or handles calls.
 *
 * Deliberately narrow. "AI call script pack" and "scripts for your line" are
 * accurate descriptions of what ships and must keep passing, so this matches
 * the *autonomous-agent* framing rather than the word "phone" or "call". Each
 * pattern is a claim that something other than the business owner picks up.
 */
const AUTONOMOUS_CALL_CLAIMS: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  {
    pattern: /\bAI phone agent\b/i,
    why: '"AI phone agent" names an agent that operates the line',
  },
  {
    pattern: /\b(agent|assistant|AI)\b[^.!?]{0,40}\banswers?\b[^.!?]{0,30}\b(your|their|the)\s+(business\s+)?(line|phone|calls?)\b/i,
    why: "claims something answers the customer's line",
  },
  {
    pattern: /\bnever miss a call\b/i,
    why: "promises no call goes unanswered, which requires answering calls",
  },
  {
    pattern: /\b(handles?|takes?|picks? up)\b[^.!?]{0,25}\b(your|their|incoming)\s+calls?\b/i,
    why: "claims the product handles inbound calls",
  },
];

/**
 * `src/proxy.ts` puts only `/dashboard` behind a password, so everything else
 * under `src/app` — including all of `/docs` — is copy a prospective customer
 * can read anonymously. `src/lib/email` is included because a marketing email
 * is a public claim that arrives in an inbox rather than a browser.
 */
const OPERATOR_ONLY_SEGMENT = "dashboard";
const COPY_ROOTS = [path.join(SRC, "app"), path.join(SRC, "email"), path.join(SRC, "lib", "email")];

function walk(dir: string): string[] {
  let stat;
  try {
    stat = statSync(dir);
  } catch {
    return [];
  }
  if (!stat.isDirectory()) return [];

  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === OPERATOR_ONLY_SEGMENT || entry === "node_modules") continue;
      out.push(...walk(full));
      continue;
    }
    if (!/\.(tsx?|mdx?)$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

function publicCopyFiles(): string[] {
  return COPY_ROOTS.flatMap(walk).sort();
}

function rel(file: string): string {
  return path.relative(VENTURE_ROOT, file);
}

/**
 * The `/docs` tree is the operator's own build log and generally states the gap
 * honestly ("Until Twilio is live, operators fulfill with a generated FAQ/script
 * pack"). Forbidding the phrase there would delete the sentence that tells the
 * truth. What must not carry the claim is the copy between a visitor and the
 * checkout button.
 *
 * The exemption is earned per claim, not granted per directory. `/docs` is not
 * behind the password — `src/proxy.ts` guards only `/dashboard` — so a docs page
 * is public copy like any other, and a blanket exemption is just a place the
 * claim is allowed to be untrue. It was: `docs/business-model` priced the
 * Complete tier at "$500 + $199/mo" against "Growth + full marketing + client AI
 * phone agent", in a table, with no caveat anywhere on the page. The honest
 * neighbour two files away is what made that invisible — the tree as a whole
 * looked truthful, so nobody read the row.
 *
 * So a docs page may carry the claim only where it also carries the fulfilment
 * reality within `CAVEAT_PROXIMITY_LINES`. `product-bundles` states it in the
 * same sentence, which is the standard: a reader meeting the claim has to meet
 * the correction too, without scrolling to look for it.
 */
const CAVEAT_PROXIMITY_LINES = 3;

/**
 * Copy that states what actually ships today instead of a caller-facing agent.
 * Matched near a claim, not anywhere on the page, so a caveat in the footer
 * cannot license a claim in the header.
 */
const FULFILMENT_CAVEATS: ReadonlyArray<RegExp> = [
  /\buntil\s+twilio\s+is\s+live\b/i,
  /\b(FAQ\/?|call\s+)?script\s+pack\b/i,
  /\bvoice\s+pack\b/i,
];

function isDocsPage(file: string): boolean {
  return rel(file).startsWith(path.join("src", "app", "docs") + path.sep);
}

/** True when `lines[index]` sits within the caveat window of an honest statement. */
function caveatNear(lines: string[], index: number): boolean {
  const from = Math.max(0, index - CAVEAT_PROXIMITY_LINES);
  const to = Math.min(lines.length - 1, index + CAVEAT_PROXIMITY_LINES);
  return lines
    .slice(from, to + 1)
    .some((line) => FULFILMENT_CAVEATS.some((caveat) => caveat.test(line)));
}

function telephonyIntegrationPresent(): boolean {
  const pkg = JSON.parse(readFileSync(path.join(VENTURE_ROOT, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const depMatch = declared.some((name) =>
    PROVIDERS.some((p) => name === p || name.startsWith(`${p}/`) || name.startsWith(`${p}-`)),
  );
  if (!depMatch) return false;

  // A dependency nothing imports does not answer a phone.
  return walk(SRC).some((file) => {
    const body = readFileSync(file, "utf8");
    return PROVIDERS.some((p) =>
      new RegExp(`from\\s+["']${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(body),
    );
  });
}

describe("capability claims", () => {
  it("finds the public copy surface at all", () => {
    const files = publicCopyFiles();
    expect(files.length).toBeGreaterThan(10);
    expect(files.map(rel)).toContain(path.join("src", "app", "page.tsx"));
  });

  it("has a claim detector that actually matches the claim it was built for", () => {
    // Without this, a typo in a pattern would make the contract below vacuous:
    // it would scan the real files, match nothing, and pass forever.
    const wasSold = "AI phone agent for your business line";
    expect(AUTONOMOUS_CALL_CLAIMS.some((c) => c.pattern.test(wasSold))).toBe(true);

    const stillTrue = "AI call script pack — FAQ, booking and lead capture, written from your site";
    expect(AUTONOMOUS_CALL_CLAIMS.some((c) => c.pattern.test(stillTrue))).toBe(false);
  });

  it("exempts a docs page only where the caveat is next to the claim", () => {
    // The blanket `/docs` exemption is what hid the business-model pricing row,
    // so the replacement has to be shown to discriminate. Without this, widening
    // FULFILMENT_CAVEATS until everything matches would look like a passing gate.
    const explained = [
      "<p>",
      "  Complete includes a client AI phone agent (answers their business line).",
      "  Until Twilio is live, operators fulfill with a generated FAQ/script pack.",
      "</p>",
    ];
    expect(caveatNear(explained, 1)).toBe(true);

    const bare = [
      "<tr>",
      "  <td>Growth + full marketing + client AI phone agent</td>",
      "</tr>",
    ];
    expect(caveatNear(bare, 1)).toBe(false);

    // A caveat elsewhere on a long page does not reach the claim.
    const distant = [
      "  <td>client AI phone agent</td>",
      ...Array<string>(CAVEAT_PROXIMITY_LINES + 1).fill("  <td>unrelated</td>"),
      "  <p>Until Twilio is live, operators fulfill with a script pack.</p>",
    ];
    expect(caveatNear(distant, 0)).toBe(false);
  });

  it("does not promise a caller-facing agent while none is integrated", () => {
    if (telephonyIntegrationPresent()) {
      // The capability landed. The claim is now the venture's to make.
      return;
    }

    const offences: string[] = [];
    for (const file of publicCopyFiles()) {
      const docs = isDocsPage(file);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        for (const { pattern, why } of AUTONOMOUS_CALL_CLAIMS) {
          if (!pattern.test(line)) continue;
          // A docs page may explain the claim; it may not make it unqualified.
          if (docs && caveatNear(lines, index)) continue;
          const scope = docs ? " (docs page, and no fulfilment caveat within reach)" : "";
          offences.push(`${rel(file)}:${index + 1} — ${why}${scope}\n    ${line.trim()}`);
        }
      });
    }

    expect(
      offences,
      "Public copy claims the product answers calls, and no telephony provider " +
        `(${PROVIDERS.join(", ")}) is both declared in package.json and imported under src/. ` +
        "src/lib/voice/ produces a script pack the operator's client reads themselves. " +
        "Either integrate a provider or describe the pack.\n\n" +
        offences.join("\n"),
    ).toEqual([]);
  });
});
