import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  processGuestbookEntry,
  type GuestbookEntry,
} from "../src/lib/gallery-guestbook-presale";
import {
  processMobileTicketPresale,
  clearQrAttributionStoreForTesting,
  type MobileTicketRequest,
} from "../src/lib/gallery-qr-attribution";
import { generateBoothQRCheckout, type ExhibitionArtwork } from "../src/lib/art-fair-checkout";
import {
  generateProvenanceQrUrl,
  verifyArtworkProvenance,
  type ProvenanceCertificate,
} from "../src/lib/provenance-royalty-dashboard";

/**
 * `src/lib/site-url.ts` closed the three surfaces named in its own docblock —
 * robots.txt, sitemap.xml and the ad-catalog sync route. Four call sites it
 * does not name kept the literal `https://printatelier.com`, a domain this
 * venture does not serve (its only declared ingress is
 * `atelier.marisstella.dev`, `platform/k8s/apps/print-atelier/ingress.yaml`):
 *
 *   src/lib/gallery-guestbook-presale.ts:103  the SMS invite text sent to a
 *                                             gallery guest's phone, carrying a
 *                                             live discount code
 *   src/lib/gallery-qr-attribution.ts:114     `accessPassUrl`, handed to an
 *                                             attendee who has just paid
 *   src/lib/art-fair-checkout.ts:111          a `baseUrl` DEFAULT PARAMETER
 *   src/lib/provenance-royalty-dashboard.ts:61 the same shape
 *
 * The last two are the reason this file exists as much as the first two. A
 * default parameter is the worst hiding place for a wrong constant: every call
 * site reads as correct and the value only appears in the output, so a fix that
 * greps call sites walks straight past it.
 *
 * These tests exercise the real modules with the real environment variable.
 * Nothing is mocked — in particular `site-url.ts` is not, because a stub of the
 * module a fix lives in stays green with the fix reverted, which is the one
 * thing a regression test must not do.
 */

const CONFIGURED_ORIGIN = "https://atelier.marisstella.dev";

/** Every domain this venture must never emit an absolute URL on. */
const UNOWNED = /printatelier\.com/i;

const savedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

function setOrigin(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = value;
  }
}

beforeEach(() => {
  clearQrAttributionStoreForTesting();
});

afterEach(() => {
  setOrigin(savedSiteUrl);
});

const guest: GuestbookEntry = {
  guestId: "guest-1",
  guestName: "Mira",
  email: "mira@example.com",
  phoneNumber: "+15550001111",
  preferredMediums: ["cotton_rag"],
  interestLevel: "serious_collector",
  optedInSms: true,
  exhibitionSlug: "abstract-coast",
  visitedAt: 1_770_000_000_000,
};

const ticketOrder: MobileTicketRequest = {
  ticketId: "tix-1",
  exhibitionSlug: "abstract-coast",
  guestName: "Mira",
  guestEmail: "mira@example.com",
  ticketTier: "collector_preview_pass",
  quantity: 2,
  unitPriceUsd: 45,
  purchasedAt: 1_770_000_000_000,
};

const artwork: ExhibitionArtwork = {
  artworkId: "art-101",
  title: "Neon Horizons",
  artistName: "Maya Lin",
  widthMeters: 1.5,
  heightMeters: 2,
  retailPriceUsd: 4500,
  category: "framed_print",
};

const certificate: ProvenanceCertificate = {
  certificateId: "CERT-8849",
  editionNumber: 3,
  editionTotal: 25,
  artworkTitle: "Neon Horizons",
  artistName: "Maya Lin",
  originalSalePriceUsd: 4500,
  originalSaleDate: "2026-01-04",
  currentOwnerName: "Mira",
  currentOwnerWalletOrEmail: "mira@example.com",
  signatureHash: "a1b2c3d4e5f6789000000000000000000000000000000000000000000000000f",
};

// --- unconfigured: nothing may name a domain we do not serve ----------------

test("an unconfigured deployment sends no SMS invite naming an unowned domain", () => {
  setOrigin(undefined);

  const result = processGuestbookEntry(guest);

  assert.equal(
    result.generatedSmsInviteText,
    undefined,
    "an SMS is unrecallable; with no origin there is no honest message to send",
  );
});

test("a withheld SMS invite says so in the result rather than vanishing", () => {
  setOrigin(undefined);

  const result = processGuestbookEntry(guest);

  // Silently dropping a send an operator believes happened is its own defect.
  // The guest opted in, so the refusal has to be visible in what the caller
  // reads back.
  const refusal = result.notes.find((note: string) => note.includes("SMS presale invite NOT generated"));
  assert.ok(refusal, `no note explains the withheld invite: ${JSON.stringify(result.notes)}`);
  assert.ok(
    refusal.includes("NEXT_PUBLIC_SITE_URL"),
    "the note must name the variable the operator has to set",
  );
  assert.ok(
    refusal.includes(result.discountCode),
    "the discount code was still assigned; the note must carry it so the invite can be sent by hand",
  );
});

test("an unconfigured deployment issues no ticket access pass on an unowned domain", () => {
  setOrigin(undefined);

  const ticket = processMobileTicketPresale(ticketOrder);

  assert.equal(ticket.accessPassUrl, null);
  assert.ok(
    ticket.accessPassUnavailableReason?.includes("NEXT_PUBLIC_SITE_URL"),
    "the attendee has paid; the reason no pass link exists must reach an operator",
  );
  assert.ok(
    ticket.accessPassUnavailableReason?.includes(ticket.confirmationCode),
    "the ticket is still valid at the door, so the reason must carry the code that admits them",
  );
});

test("an unconfigured deployment refuses to generate a booth QR checkout link", () => {
  setOrigin(undefined);

  // Printed and stuck to a wall at a paid stand. There is no later step that
  // could catch a wrong origin, and no relative form a scanner can resolve.
  assert.throws(
    () => generateBoothQRCheckout("booth-42", "Frieze London", artwork),
    (error: unknown) =>
      error instanceof Error && error.message.includes("NEXT_PUBLIC_SITE_URL"),
  );
});

test("an unconfigured deployment emits no provenance verification URL", () => {
  setOrigin(undefined);

  const result = verifyArtworkProvenance(certificate, certificate.signatureHash);

  // The authenticity decision itself does not depend on the origin and must
  // still be made; only the link is withheld.
  assert.equal(result.isValid, true);
  assert.equal(result.status, "AUTHENTIC_RECORDED");
  assert.equal(result.qrVerificationUrl, "");
});

test("a blank or non-absolute origin is treated as unconfigured, not as an origin", () => {
  // `""` and `"   "` reaching a template literal is how `${baseUrl}/drop/x`
  // silently becomes a relative-looking string that no SMS recipient can open.
  for (const value of ["", "   ", "not a url", "javascript:alert(1)", "/relative"]) {
    setOrigin(value);

    assert.equal(
      processGuestbookEntry(guest).generatedSmsInviteText,
      undefined,
      `NEXT_PUBLIC_SITE_URL=${JSON.stringify(value)} must not produce an SMS`,
    );
    assert.equal(
      processMobileTicketPresale(ticketOrder).accessPassUrl,
      null,
      `NEXT_PUBLIC_SITE_URL=${JSON.stringify(value)} must not produce a pass link`,
    );
  }
});

// --- configured: the configured origin is used, and only it -----------------

test("a configured origin is what every gallery link is built on", () => {
  setOrigin(CONFIGURED_ORIGIN);

  const invite = processGuestbookEntry(guest).generatedSmsInviteText;
  assert.ok(invite, "an opted-in guest with a configured origin must get an invite");
  assert.ok(invite.includes(`${CONFIGURED_ORIGIN}/drop/abstract-coast`));
  assert.doesNotMatch(invite, UNOWNED);

  const ticket = processMobileTicketPresale(ticketOrder);
  assert.ok(ticket.accessPassUrl?.startsWith(`${CONFIGURED_ORIGIN}/tickets/pass/`));
  assert.equal(ticket.accessPassUnavailableReason, undefined);

  const booth = generateBoothQRCheckout("booth-42", "Frieze London", artwork);
  assert.ok(booth.checkoutUrl.startsWith(`${CONFIGURED_ORIGIN}/checkout?`));
  assert.doesNotMatch(booth.checkoutUrl, UNOWNED);

  const provenance = verifyArtworkProvenance(certificate, certificate.signatureHash);
  assert.ok(provenance.qrVerificationUrl.startsWith(`${CONFIGURED_ORIGIN}/verify/CERT-8849`));
});

test("a configured origin does not leak into the ad-catalog domain by trailing slash", () => {
  setOrigin(`${CONFIGURED_ORIGIN}/`);

  // `parseSiteUrl` normalises to an origin, so no caller can emit a double
  // slash — the shape that makes a link look valid and resolve wrongly.
  const ticket = processMobileTicketPresale(ticketOrder);
  assert.ok(ticket.accessPassUrl?.startsWith(`${CONFIGURED_ORIGIN}/tickets/`));
  assert.ok(!ticket.accessPassUrl?.includes("//tickets/"));

  assert.equal(
    generateProvenanceQrUrl(`${CONFIGURED_ORIGIN}/`, "CERT-1", "abcdef123456789"),
    `${CONFIGURED_ORIGIN}/verify/CERT-1?hash=abcdef123456`,
  );
});

// --- the literal itself ------------------------------------------------------

/**
 * The behavioural tests above can only fail on a path they happen to call. This
 * one fails on the literal wherever it is reintroduced, including in a default
 * parameter that no test reaches — the exact shape that survived the previous
 * fix. `site-url.ts` is exempt because its docblock is the record of why the
 * domain is wrong; that exemption is one named file, not a directory, because a
 * blanket exemption is a region where the claim may quietly stop being true.
 */
test("no source file builds a URL on the unowned domain", () => {
  const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  walk(srcDir);

  // A scan that matches nothing is a gate that cannot fail, so prove the walk
  // and the pattern both work before asserting anything with them.
  assert.ok(files.length > 50, `expected to scan the whole src tree, walked ${files.length} files`);
  assert.match("const x = `https://printatelier.com/a`;", /https?:\/\/[\w.-]*printatelier\.com/i);

  const offenders: string[] = [];
  for (const file of files) {
    if (path.basename(file) === "site-url.ts") {
      continue;
    }
    const source = fs.readFileSync(file, "utf8");
    source.split("\n").forEach((line, index) => {
      // Only URL-forming occurrences. Prose in a comment recording why the
      // domain is wrong is the documentation this fix depends on.
      const trimmed = line.trim();
      const isComment = trimmed.startsWith("*") || trimmed.startsWith("//");
      if (!isComment && /https?:\/\/[\w.-]*printatelier\.com/i.test(line)) {
        offenders.push(`${path.relative(srcDir, file)}:${index + 1}: ${trimmed}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `these build a URL on a domain this venture does not serve:\n${offenders.join("\n")}`,
  );
});
