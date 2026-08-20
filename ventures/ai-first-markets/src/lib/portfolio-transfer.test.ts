import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  distributionScore,
  evaluatePortfolioTransfer,
  isDispatchable,
  portfolioObservations,
  UNMEASURED_DIMENSIONS,
  type NextWorkEvidence,
} from "./portfolio-transfer";

// ventures/ is three levels up from this file (lib -> src -> ai-first-markets -> ventures).
const venturesDir = fileURLToPath(new URL("../../..", import.meta.url));

function venturesWithManifest(): string[] {
  return readdirSync(venturesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => {
      try {
        readFileSync(`${venturesDir}/${name}/VENTURE.yaml`, "utf8");
        return true;
      } catch {
        return false;
      }
    });
}

// Minimal, purpose-built reader for the two facts the transfer result depends
// on. These VENTURE.yaml files are machine-generated with consistent two-space
// indentation, so full YAML parsing is not needed to guard against drift.
function readObservableFacts(slug: string): {
  published: boolean;
  nextWorkEvidence: NextWorkEvidence;
} {
  const text = readFileSync(`${venturesDir}/${slug}/VENTURE.yaml`, "utf8");

  const productionMatch = text.match(/^\s*production:\s*(.+)$/m);
  const published = productionMatch !== null && productionMatch[1].trim() !== "null";

  // Isolate the hypotheses block: from `hypotheses:` at column 0 to the next
  // top-level key.
  const block = text.match(/^hypotheses:\n([\s\S]*?)(?=^\S)/m);
  const items = block ? block[1].split(/\n(?=  - )/).filter((s) => s.trim().length > 0) : [];

  const firstUntested = items.find((item) => /^\s*status:\s*untested\s*$/m.test(item));
  let nextWorkEvidence: NextWorkEvidence;
  if (!firstUntested) {
    nextWorkEvidence = "all-settled";
  } else {
    const ev = firstUntested.match(/^\s*evidence:\s*(\S+)\s*$/m);
    nextWorkEvidence = ev && ev[1] === "in-repo" ? "in-repo" : "customer-contact";
  }

  return { published, nextWorkEvidence };
}

describe("portfolio transfer: encoded observations match the repo", () => {
  it("covers exactly the venture directories that carry a VENTURE.yaml", () => {
    const encoded = portfolioObservations.map((v) => v.slug).sort();
    const onDisk = venturesWithManifest().sort();
    expect(encoded).toEqual(onDisk);
  });

  it("agrees with each VENTURE.yaml on published status and next-work evidence", () => {
    for (const v of portfolioObservations) {
      const facts = readObservableFacts(v.slug);
      expect({ slug: v.slug, ...facts }).toEqual({
        slug: v.slug,
        published: v.published,
        nextWorkEvidence: v.nextWorkEvidence,
      });
    }
  });
});

describe("evaluatePortfolioTransfer", () => {
  const result = evaluatePortfolioTransfer();

  it("finds exactly the two dispatchable ventures the router reports", () => {
    expect(result.totalVentures).toBe(11);
    expect(result.dispatchable.sort()).toEqual(["ai-first-markets", "photos-import-tools"]);
    expect(result.blocked).toHaveLength(9);
  });

  it("reproduces the dispatchable-vs-blocked split on the Distribution axis alone", () => {
    expect(result.distributionAxisMatchesSplit).toBe(true);
    for (const v of portfolioObservations) {
      expect(distributionScore(v) > 0).toBe(isDispatchable(v));
    }
  });

  it("cannot compute a six-dimension composite without fabricating five inputs", () => {
    expect(result.compositeComputable).toBe(false);
    expect(UNMEASURED_DIMENSIONS).toHaveLength(5);
    expect(result.unmeasuredDimensions).toEqual(UNMEASURED_DIMENSIONS);
    expect(result.verdict).toBe("transfers-on-distribution-axis-only");
  });
});
