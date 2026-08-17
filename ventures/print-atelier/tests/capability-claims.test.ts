import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Every capability this venture sells a visitor must be a capability it has.
 *
 * `tests/catalog-print-file-provenance.test.ts` guards the *file* a print
 * partner fetches. `tests/artist-payout-claims.test.ts` guards what the copy
 * says about *paying* an artist. This is the same contract one step earlier:
 * it binds the advertised *capability* to whether the code to deliver it
 * exists. It is the control this venture did not have — grep for "claims" here
 * returns `print-damage-claims` (warranty) and `artist-payout-claims`
 * (disbursement), so the venture with the most capability copy in the
 * portfolio looked covered and was not.
 *
 * The claim that forced this is the AI capture pipeline. Every audience-facing
 * surface — the artist pitch, the storefront, the buyer portal, the outbound
 * DM template, and the site-wide `<meta name="description">` — describes
 * software that turns a phone photograph into a print-ready master:
 * "automatically color-corrects, deskews, and upscales", "upscales via ESRGAN",
 * "print-ready master in under 60 seconds". No such software exists.
 * `package.json` declares `lucide-react`, `next`, `react`, `react-dom` and
 * `stripe`; `sharp` appears only under `overrides`, which is a transitive
 * version pin and imports nothing. `src/lib/capture.ts` is 91 lines of
 * localStorage bookkeeping whose stage names — `"edge-detect"`, `"upscale"`,
 * `"mockups"` — are string literals in a union type. The uploaded `File` is
 * never read. `src/app/capture/page.tsx` advances a progress bar on a
 * `setInterval`.
 *
 * The venture's own code says so plainly, which is the part worth noticing:
 * `src/lib/catalog-intelligence.ts` tells an operator to "Run AI tagger on
 * capture upload" — a remediation step that only makes sense because the
 * tagger is not wired — while the copy a buyer reads before paying says the
 * tagging already happened. Nothing compared the two, so they could drift
 * indefinitely in the direction that sells better.
 *
 * This is not a cosmetic finding. It is the same gap that blocks the venture's
 * revenue: `hasUsablePrintFile` refuses to sell an artwork with no print-ready
 * file, and no artwork in `catalogArtworks` has one, because the pipeline that
 * was supposed to produce them is an animation. The copy describes the missing
 * half of the funnel as finished.
 *
 * The rule is two-directional, like the ratchets in `scripts/ci/`. Today the
 * capability is absent, so an unlabelled claim is forbidden. When a real image
 * pipeline lands — a provider declared in `dependencies` *and* imported under
 * `src/` — `imagePipelineIntegrated()` starts returning true, this test stops
 * forbidding the claim, and the copy may say it, without anybody having to
 * remember that this file exists. A control that has to be switched off by
 * hand to permit the improvement it is waiting for is a control that gets
 * deleted instead.
 */

const VENTURE_ROOT = path.resolve(__dirname, "..");
const SRC = path.join(VENTURE_ROOT, "src");

/**
 * Packages that would constitute an actual image pipeline: raster processing,
 * on-device or hosted inference, or a managed image/vision API.
 *
 * Matched against `dependencies` and `devDependencies` only. `overrides` is
 * deliberately excluded — `sharp` sits there today as a transitive security
 * pin, and a version constraint on somebody else's dependency does not deskew
 * a photograph. `imagePipelineIntegratedIn` is exercised against exactly that
 * shape below, because "the package name appears in package.json" is the
 * cheapest possible way to make this control vacuous.
 */
const IMAGE_PIPELINE_PROVIDERS = [
  "sharp",
  "jimp",
  "canvas",
  "@napi-rs/canvas",
  "opencv4nodejs",
  "@techstark/opencv-js",
  "onnxruntime-node",
  "@tensorflow/tfjs-node",
  "replicate",
  "openai",
  "@google-cloud/vision",
  "@aws-sdk/client-rekognition",
  "cloudinary",
  "@imgix/js-core",
];

/**
 * Copy that asserts software performs the capture-to-master conversion.
 *
 * Deliberately narrow, and aimed at the *agency* of the claim rather than at
 * the word "AI". Copy that describes an intent, a model, an estimate or an
 * instruction to a human must keep passing: `catalog-intelligence.ts` saying
 * "Run AI tagger on capture upload" is a work item, "AI-ready listings"
 * describes listings prepared *for* a tagger, and `ArtistEarningsCalculator`
 * saying "Model your 30% net-profit share" is arithmetic that genuinely runs.
 * Each pattern below is a statement that a machine already did the work.
 */
const CAPTURE_CAPABILITY_CLAIMS: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  {
    pattern: /\bprint-(ready|perfect)\b[^.!?]{0,60}\b(in|under|within)\s+(under\s+)?\d/i,
    why: "promises a print-ready master inside a stated time",
  },
  {
    pattern: /\b(phone\s+)?photo\b[^.!?]{0,40}(→|->|into|to)\s*[^.!?]{0,30}\bprint-(ready|perfect)\b/i,
    why: "claims a photograph is converted into a print-ready master",
  },
  {
    pattern: /\b(ESRGAN|LUT\s+calibration|color-checker\s+LUT)\b/i,
    why: "names a specific processing technique as one the product applies",
  },
  {
    pattern: /\bAI\s+upscal(ing|es|ed)\b/i,
    why: "claims the product upscales images with a model",
  },
  {
    pattern: /\bautomatically\s+(color-corrects?|deskews?|upscales?|places?|generates?|detects?)\b/i,
    why: "asserts an automated image operation the product performs",
  },
  {
    pattern: /\b(our|the)\s+(AI|software)\b[^.!?]{0,40}\b(creates?|makes?|generates?|turns?|scales?|automates?)\b/i,
    why: "attributes finished work to the product's own AI",
  },
  {
    pattern: /\bAI-(enhanced|generated|curated)\b/i,
    why: "presents output as having been produced by a model",
  },
  {
    pattern: /\b(digitiz|digitis)(ed|es)\b/i,
    why: "states in the past or present tense that artwork was digitized",
  },
  {
    // `scan|monitor` alone missed "Custom scrapers identify visual artists on
    // Instagram, TikTok and Pinterest" — the same claim, one verb away, in a
    // file whose other instance the control did catch.
    pattern: /\b(scrapers?|proprietary\s+tools?)\b[^.!?]{0,40}\b(scan|monitor|identify|find|harvest|collect)\b/i,
    why: "claims a running scraper harvests third-party platforms",
  },
  {
    // The shape the outbound DM template used: no "print-ready", no timing, so
    // neither of the first two patterns reached it — and this is the one claim
    // written to be copied out of the app and sent to a named artist.
    pattern: /\bturns?\s+(phone\s+)?photos?\s+into\b/i,
    why: "claims the product converts photographs into finished prints",
  },
  {
    pattern: /\bmockups?\b[^.!?]{0,40}\bin\s+(under\s+)?\d+\s*(seconds?|minutes?)\b/i,
    why: "promises a generated room mockup inside a stated time",
  },
  {
    pattern: /\bML\s+classifiers?\s+score\b/i,
    why: "claims a classifier scores accounts",
  },
];

/**
 * Packages that would constitute an actual Convex deployment.
 *
 * Same bar as `IMAGE_PIPELINE_PROVIDERS`: declared in `dependencies` or
 * `devDependencies`, and imported under `src/`. A `convex/` directory alone is
 * not enough — this venture has none, but a schema file with no client behind
 * it would still write nothing.
 */
const CONVEX_PROVIDERS = ["convex", "@convex-dev"];

/**
 * Copy that asserts a database is provisioned, live, or in sync.
 *
 * The claim that forced this: `PartnerCredentialVault.tsx` rendered a
 * "Convex Database Persistence Sync / **Live Schema & Record Health**" panel
 * with a green "6/6 Tables Synced" pill and six cards each naming a table and
 * an index count — every one a hardcoded JSX literal with no data source, on
 * `/partner-setup`, which is unauthenticated. This venture has no Convex
 * client, no `convex` dependency and no `convex/` directory; the six "tables"
 * are process-local arrays. `src/lib/convex-sync-status.ts` says so in its own
 * comment, and nothing outside `tests/` imports it.
 *
 * Aimed at asserted *state*, not at the word "Convex". A roadmap line, a
 * refusal, or a note about what happens once Convex ships must keep passing:
 * `CheckoutLab` writes "until Convex order records ship" and that is honest.
 * A count of indexes or a "synced" pill is a measurement, and a measurement
 * has to come from somewhere.
 */
const DATABASE_STATE_CLAIMS: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  {
    pattern: /\b\d+\s*\/\s*\d+\s+tables?\s+(synced|live|healthy|online)\b/i,
    why: "reports a table sync count as a measured fact",
  },
  {
    pattern: /\btables?\s+(synced|in\s+sync)\b/i,
    why: "states that database tables are in sync",
  },
  {
    pattern: /\blive\s+(schema|database|db|tables?)\b/i,
    why: "describes a schema or database as live",
  },
  {
    pattern: /\b\d+\s+indexes\b/i,
    why: "states an index count, which is a fact about a database that must be read from one",
  },
  {
    pattern: /\b(schema|record|database|db)\s+health\b/i,
    why: "presents database health as something being reported",
  },
  {
    pattern: /\bconvex\b[^.!?]{0,30}\b(connected|synced|provisioned|healthy|is\s+live)\b/i,
    why: "claims a Convex deployment is connected",
  },
];

/**
 * Copy roots. Both are rendered to a human: `src/app` is every route and
 * `src/components` is what those routes compose. There is no middleware in
 * this venture — `find ventures/print-atelier -name "middleware*"` outside
 * `.next/` returns nothing — so every route below is anonymously reachable in
 * production, including `/buyer-portal`, `/b2b-portal` and `/ops`.
 */
const COPY_ROOTS = [path.join(SRC, "app"), path.join(SRC, "components")];

/**
 * How far an honesty label may sit from the claim it qualifies.
 *
 * A label in a page footer does not reach a claim in the header: a reader
 * meeting the claim has to meet the correction too, without scrolling to look
 * for it. `src/app/capture/page.tsx` is the case that sets this — line 31
 * lists "AI upscaling to print resolution" as a pipeline stage and the honest
 * sub-header ("real file metadata persists locally until backend upload
 * ships") is 83 lines further down, in a different visual block.
 */
const LABEL_PROXIMITY_LINES = 4;

/**
 * Copy that tells the reader the capability is not yet real.
 *
 * These are the hedges this codebase already uses correctly elsewhere —
 * `InvestorDashboard` writes "Revenue (modeled)", `OperatorAccessNotice`
 * writes "The figures below are not live", `CheckoutLab` writes "until Convex
 * order records ship". The bar is that the word appears next to the claim, not
 * that it appears somewhere in the venture.
 */
const HONESTY_LABELS: ReadonlyArray<RegExp> = [
  /\b(planned|roadmap|phase\s+[2-9]|not\s+(yet\s+)?(live|built|shipped)|once\s+\w+\s+ships?|until\s+\w+\s+ships?)\b/i,
  /\b(simulat(ed|es|ion)|mocked|illustrative|placeholder|sample\s+data)\b/i,
  /\b(projected|modeled|modelled|estimated|target|est\.)\b/i,
];

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
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...walk(full));
      continue;
    }
    if (!/\.(tsx?|mdx?)$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

function copyFiles(): string[] {
  return COPY_ROOTS.flatMap(walk).sort();
}

function rel(file: string): string {
  return path.relative(VENTURE_ROOT, file);
}

/**
 * A copy file as a reader sees it: comments blanked, line structure kept.
 *
 * A comment is not copy. Nothing in `{/* … *\/}` or after `//` is rendered to a
 * visitor, and the comments in these files are largely the explanations of why
 * a claim was removed — which quote the claim. Scanning them makes the control
 * answer questions about its own documentation: the first version of
 * `DATABASE_STATE_CLAIMS` failed on the comment left in
 * `PartnerCredentialVault.tsx` explaining that "6/6 Tables Synced" had been
 * deleted, which would have forced the explanation to be reworded until the
 * scanner could no longer see it. The standing rule here is to strip comments,
 * never to exempt the file or edit the prose — see `strip_ts_comments` in
 * `scripts/ci/cap_ratchet.py` and `stripShellComment` in
 * `platform/ci/test/mktemp-template.test.mjs`.
 *
 * Blocks are blanked rather than deleted so reported line numbers stay right.
 * The `//` rule refuses to fire after a `:`, because `href="https://…"` is copy
 * and the rest of that line must stay visible.
 */
export function stripCommentsPreservingLines(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (span) =>
    span.replace(/[^\n]/g, " "),
  );
  return withoutBlocks.replace(/(^|[^:])\/\/[^\n]*/g, (_match, before: string) => before);
}

function copyLines(file: string): string[] {
  return stripCommentsPreservingLines(readFileSync(file, "utf8")).split("\n");
}

/** True when `lines[index]` sits within the label window of an honesty marker. */
export function labelNear(lines: string[], index: number): boolean {
  const from = Math.max(0, index - LABEL_PROXIMITY_LINES);
  const to = Math.min(lines.length - 1, index + LABEL_PROXIMITY_LINES);
  return lines.slice(from, to + 1).some((line) => HONESTY_LABELS.some((l) => l.test(line)));
}

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
};

/**
 * Whether a real image pipeline is both declared and used.
 *
 * Split from `imagePipelineIntegrated` so the manifest half can be exercised
 * against a hand-built manifest in the tests below.
 */
export function providerDeclaredIn(manifest: PackageManifest): boolean {
  const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
  return declared.some((name) =>
    IMAGE_PIPELINE_PROVIDERS.some(
      (p) => name === p || name.startsWith(`${p}/`) || name.startsWith(`${p}-`),
    ),
  );
}

function imagePipelineIntegrated(): boolean {
  const manifest = JSON.parse(
    readFileSync(path.join(VENTURE_ROOT, "package.json"), "utf8"),
  ) as PackageManifest;
  if (!providerDeclaredIn(manifest)) return false;

  // A dependency nothing imports does not deskew a photograph.
  return walk(SRC).some((file) => {
    const body = readFileSync(file, "utf8");
    return IMAGE_PIPELINE_PROVIDERS.some((p) =>
      new RegExp(`from\\s+["']${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(body),
    );
  });
}

/**
 * Whether Convex is both declared and used. Split like `providerDeclaredIn` so
 * the manifest half can be exercised against a hand-built manifest.
 */
export function convexDeclaredIn(manifest: PackageManifest): boolean {
  const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
  return declared.some((name) =>
    CONVEX_PROVIDERS.some((p) => name === p || name.startsWith(`${p}/`)),
  );
}

function convexIntegrated(): boolean {
  const manifest = JSON.parse(
    readFileSync(path.join(VENTURE_ROOT, "package.json"), "utf8"),
  ) as PackageManifest;
  if (!convexDeclaredIn(manifest)) return false;

  // A dependency nothing imports stores no orders.
  return walk(SRC).some((file) =>
    /from\s+["'](convex|@convex-dev)(\/|["'])/.test(readFileSync(file, "utf8")),
  );
}

describe("capability claims", () => {
  it("finds the copy surface at all", () => {
    const files = copyFiles();
    // Guards against the whole contract passing because a path was renamed and
    // the walk returned nothing.
    assert.ok(files.length > 40, `expected the copy surface, walked ${files.length} files`);
    const names = files.map(rel);
    assert.ok(names.includes(path.join("src", "app", "page.tsx")));
    assert.ok(names.includes(path.join("src", "app", "layout.tsx")));
    assert.ok(names.includes(path.join("src", "components", "ArtistPitch.tsx")));
  });

  it("has a detector that matches the claims it was built for", () => {
    // Without this, a typo in a pattern would make the contract vacuous: it
    // would scan the real files, match nothing, and pass forever.
    const wasSold = [
      "Phone photo → print-ready master in under 60 seconds",
      "upscales via ESRGAN, then generates 4 lifestyle mockups automatically",
      "automatically color-corrects, deskews, and upscales artwork",
      "Our AI creates museum-quality prints",
      "Showing 6 of 1,492 AI-enhanced prints",
      'Your piece "Coast" has been digitized and needs your review.',
      "Proprietary tools scan Instagram, TikTok, and Pinterest",
      "ML classifiers score accounts on follower count",
      "AI upscaling to print resolution",
      // The three shapes that slipped past the first version of this detector.
      "Custom scrapers identify visual artists on Instagram, TikTok, and Pinterest",
      "We built software that turns phone photos into museum-quality prints",
      "Want to see a living-room mockup of your work in 60 seconds?",
    ];
    for (const claim of wasSold) {
      assert.ok(
        CAPTURE_CAPABILITY_CLAIMS.some((c) => c.pattern.test(claim)),
        `no pattern matched a claim this control exists for: ${claim}`,
      );
    }
  });

  it("does not match the honest copy this venture already ships", () => {
    // The other half of non-vacuity: a detector that matches everything would
    // force the copy to be rewritten into something equally untrue.
    const stillTrue = [
      "Run AI tagger on capture upload",
      "AI-ready listings",
      "Model your 30% net-profit share before listing goes live",
      "Cart persists in localStorage until Convex order records ship",
      "The figures below are not live",
      "Meta, Google, and Pinterest server-side events fire live when credentials pass",
      "Upload metadata stored in localStorage",
      "submits real POD orders instead of placeholder IDs",
    ];
    for (const line of stillTrue) {
      const hit = CAPTURE_CAPABILITY_CLAIMS.find((c) => c.pattern.test(line));
      assert.equal(hit, undefined, `pattern "${hit?.why}" wrongly matched honest copy: ${line}`);
    }
  });

  it("counts a provider only where it is a real dependency", () => {
    // `sharp` sits in `overrides` in this venture's package.json today. If
    // that counted, `imagePipelineIntegrated()` would already be true and this
    // whole contract would be switched off by a transitive security pin.
    assert.equal(providerDeclaredIn({ overrides: { sharp: "^0.35.3" } }), false);
    assert.equal(providerDeclaredIn({ dependencies: { sharp: "^0.35.3" } }), true);
    assert.equal(providerDeclaredIn({ dependencies: { next: "16.2.12" } }), false);

    // And the real manifest must still be in the "not integrated" state, so a
    // reader of this file is not misled about why it passes.
    const manifest = JSON.parse(
      readFileSync(path.join(VENTURE_ROOT, "package.json"), "utf8"),
    ) as PackageManifest;
    assert.equal(
      providerDeclaredIn(manifest),
      false,
      "an image provider is now a real dependency — check whether it is actually wired, " +
        "then this control should start permitting the capture claims",
    );
  });

  it("accepts an honesty label only next to the claim", () => {
    // A blanket per-directory exemption is just a region where the claim is
    // allowed to be untrue, so the replacement has to be shown to discriminate.
    const labelled = [
      "<p>",
      "  Planned: AI upscaling to print resolution.",
      "</p>",
    ];
    assert.equal(labelNear(labelled, 1), true);

    const bare = ["<li>", "  AI upscaling to print resolution", "</li>"];
    assert.equal(labelNear(bare, 1), false);

    // A label elsewhere on a long page does not reach the claim.
    const distant = [
      "  AI upscaling to print resolution",
      ...Array<string>(LABEL_PROXIMITY_LINES + 1).fill("  <div>unrelated</div>"),
      "  <p>Phase 2 — not yet built.</p>",
    ];
    assert.equal(labelNear(distant, 0), false);
  });

  it("does not present the capture pipeline as built while none is integrated", () => {
    if (imagePipelineIntegrated()) {
      // The capability landed. The claim is now the venture's to make.
      return;
    }

    const offences: string[] = [];
    for (const file of copyFiles()) {
      const lines = copyLines(file);
      lines.forEach((line, index) => {
        for (const { pattern, why } of CAPTURE_CAPABILITY_CLAIMS) {
          if (!pattern.test(line)) continue;
          if (labelNear(lines, index)) continue;
          offences.push(`${rel(file)}:${index + 1} — ${why}\n    ${line.trim()}`);
        }
      });
    }

    assert.deepEqual(
      offences,
      [],
      "Copy presents the AI capture pipeline as built, and no image provider " +
        `(${IMAGE_PIPELINE_PROVIDERS.slice(0, 5).join(", ")}, …) is both declared in ` +
        "package.json dependencies and imported under src/. src/lib/capture.ts records " +
        "file metadata in localStorage and never reads the file. Either integrate a " +
        "pipeline, describe what ships, or label the claim as planned next to where it " +
        `is made (within ${LABEL_PROXIMITY_LINES} lines).\n\n${offences.join("\n")}`,
    );
  });

  it("scans what a reader sees, not the comments explaining it", () => {
    // The failure this prevents, exactly: the comment left where the fabricated
    // panel used to be quotes the pill it replaced, and the first version of
    // this control reported that comment as an offence — which would have
    // forced the explanation to be reworded until the scanner went blind.
    const explained = [
      "      {/*",
      '        A green "6/6 Tables Synced" pill stood here, with six cards each',
      "        naming a table and an index count. All hardcoded.",
      "      */}",
      "      <p>Partner credential vault</p>",
    ].join("\n");
    const stripped = stripCommentsPreservingLines(explained);
    assert.equal(
      DATABASE_STATE_CLAIMS.some((c) => c.pattern.test(stripped)),
      false,
      "a comment describing the removed claim is still visible to the scanner",
    );
    assert.equal(
      stripped.split("\n").length,
      explained.split("\n").length,
      "block comments must be blanked, not deleted, or reported line numbers drift",
    );
    assert.ok(stripped.includes("<p>Partner credential vault</p>"), "live copy was eaten");

    // Rendered copy on the same line as a URL survives: `//` after `:` is not a
    // comment, and treating it as one would blind the scanner to the rest of
    // the line.
    const withUrl = '<a href="https://example.com">6/6 Tables Synced</a>';
    assert.ok(
      DATABASE_STATE_CLAIMS.some((c) =>
        c.pattern.test(stripCommentsPreservingLines(withUrl)),
      ),
      "a claim after a URL on the same line was stripped away with the URL",
    );

    // A real line comment still goes.
    assert.equal(
      stripCommentsPreservingLines("const x = 1; // 6/6 Tables Synced").trim(),
      "const x = 1;",
    );
  });

  it("has a database-state detector that matches the panel it was built for", () => {
    const wasRendered = [
      "6/6 Tables Synced",
      "Live Schema &amp; Record Health",
      "<h4>Live Schema & Record Health</h4>",
      "5 Indexes",
      "3 Indexes",
      "Convex is connected",
      "All tables in sync",
    ];
    for (const claim of wasRendered) {
      assert.ok(
        DATABASE_STATE_CLAIMS.some((c) => c.pattern.test(claim)),
        `no pattern matched a claim this control exists for: ${claim}`,
      );
    }
  });

  it("does not match honest copy about a database that has not shipped", () => {
    const stillTrue = [
      "Cart persists in localStorage until Convex order records ship",
      "Orders are held in a process-local array and are lost on restart",
      "The figures below are not live",
      "Convex order records ship in phase 2",
      "Set NEXT_PUBLIC_CONVEX_URL to enable durable persistence",
      "Partner credential vault",
      "3 orders in the last 90 days",
    ];
    for (const line of stillTrue) {
      const hit = DATABASE_STATE_CLAIMS.find((c) => c.pattern.test(line));
      assert.equal(hit, undefined, `pattern "${hit?.why}" wrongly matched honest copy: ${line}`);
    }
  });

  it("counts Convex only where it is a real dependency", () => {
    assert.equal(convexDeclaredIn({ dependencies: { convex: "^1.0.0" } }), true);
    assert.equal(convexDeclaredIn({ devDependencies: { "@convex-dev/react": "^1" } }), true);
    assert.equal(convexDeclaredIn({ dependencies: { "convex-helpers": "^1" } }), false);
    assert.equal(convexDeclaredIn({ overrides: { convex: "^1.0.0" } }), false);
    assert.equal(convexDeclaredIn({ dependencies: { next: "16.2.12" } }), false);

    // And the real manifest must still be in the "not integrated" state, so a
    // reader of this file is not misled about why the contract below passes.
    const manifest = JSON.parse(
      readFileSync(path.join(VENTURE_ROOT, "package.json"), "utf8"),
    ) as PackageManifest;
    assert.equal(
      convexDeclaredIn(manifest),
      false,
      "convex is now a real dependency — check whether it is actually wired, then this " +
        "control should start permitting database-state copy",
    );
  });

  it("does not present a database as live while none is integrated", () => {
    if (convexIntegrated()) {
      // The database landed. What it reports is now a measurement, and the
      // panel may say so — through a guarded route, not a server render on an
      // unauthenticated page.
      return;
    }

    const offences: string[] = [];
    for (const file of copyFiles()) {
      const lines = copyLines(file);
      lines.forEach((line, index) => {
        for (const { pattern, why } of DATABASE_STATE_CLAIMS) {
          if (!pattern.test(line)) continue;
          if (labelNear(lines, index)) continue;
          offences.push(`${rel(file)}:${index + 1} — ${why}\n    ${line.trim()}`);
        }
      });
    }

    assert.deepEqual(
      offences,
      [],
      "Copy reports database state, and no Convex client is both declared in package.json " +
        "dependencies and imported under src/. Every persistence module in src/lib/ writes " +
        "to a process-local array; src/lib/convex-sync-status.ts is the only thing that " +
        "would compute this honestly and nothing outside tests/ imports it. A status a " +
        "reader cannot distinguish from a measurement must be measured — and /partner-setup, " +
        "/ops and /b2b-portal are anonymously reachable, so it must be measured behind " +
        `requireOperator.\n\n${offences.join("\n")}`,
    );
  });
});
