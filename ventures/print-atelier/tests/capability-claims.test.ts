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
      const lines = readFileSync(file, "utf8").split("\n");
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
});
