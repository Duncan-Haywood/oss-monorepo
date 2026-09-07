// Pure lockfile-evidence logic — no network, no DOM, no filesystem. Ports the
// same classification rules as npm_deployment_evidence.py (the CLI this venture
// shipped with first) so the browser tool and the CLI agree on every verdict.
// Loadable as a plain <script> in the browser (defines globals, no bundler) and
// requireable under `node --test`.

const LIMITATIONS = [
  "This report reads package-lock.json v2/v3 only; it does not inspect yarn or pnpm projects.",
  "A package is marked build-only when every installed location is reached through a known build dependency.",
  "This is static lockfile evidence, not proof: it cannot see dynamic imports or runtime loading.",
  "Build-only means absent from the deployed application artifact, not safe on the machine that runs the build.",
  "This is evidence, not a vulnerability determination, attestation, or compliance advice.",
];

function packageName(path) {
  const marker = "node_modules/";
  const idx = path.lastIndexOf(marker);
  if (idx === -1) return null;
  const name = path.slice(idx + marker.length);
  return name || null;
}

/**
 * Parses package-lock.json text into { root, packages }. `root` is the parsed
 * lockfile object; `packages` maps a package name to every install location
 * that resolved it. Throws with a message meant to be shown to the visitor
 * directly — this is the only place lockfile shape is validated.
 */
function parseLockfile(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON. Paste or drop the package-lock.json itself, not a different file.");
  }
  if (raw === null || typeof raw !== "object") {
    throw new Error("That file is not valid JSON. Paste or drop the package-lock.json itself, not a different file.");
  }
  const version = raw.lockfileVersion;
  if ((version !== 2 && version !== 3) || typeof raw.packages !== "object" || raw.packages === null || Array.isArray(raw.packages)) {
    throw new Error(
      "This needs package-lock.json v2 or v3 with a \"packages\" map (npm 7+). " +
        "Delete the lockfile and run `npm install` again to upgrade an older one, " +
        "or check package.json — yarn.lock and pnpm-lock.yaml are not supported.",
    );
  }
  // Package names are data, including names inherited by ordinary objects.
  const packages = Object.create(null);
  for (const [location, entry] of Object.entries(raw.packages)) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry) || !entry.version) continue;
    const name = packageName(location);
    if (!name) continue;
    if (!packages[name]) packages[name] = [];
    packages[name].push({ path: location, ...entry });
  }
  return { root: raw, packages };
}

function declaredDependencies(rootEntry) {
  const deps = rootEntry && typeof rootEntry === "object" ? rootEntry.dependencies : null;
  return new Set(deps && typeof deps === "object" ? Object.keys(deps) : []);
}

function classify(name, locations, declared) {
  if (declared.has(name)) {
    return { buildOnly: false, reason: "declared by the application; direct production use is possible" };
  }
  if (locations.some((location) => !location.dev)) {
    return { buildOnly: false, reason: "at least one install location is on a production path" };
  }
  return { buildOnly: true, reason: "every install location is marked dev-only by npm" };
}

/** Builds the full evidence report from raw lockfile text and a display file name. */
function buildReport(text, fileName) {
  const { root, packages } = parseLockfile(text);
  const declared = declaredDependencies(root.packages[""]);
  const rows = Object.keys(packages)
    .sort()
    .map((name) => {
      const locations = packages[name];
      const { buildOnly, reason } = classify(name, locations, declared);
      return {
        name,
        versions: [...new Set(locations.map((item) => item.version))].sort(),
        locations: locations.map((item) => item.path),
        surface: buildOnly ? "build-only" : "production",
        reason,
      };
    });
  const counts = { production: 0, "build-only": 0 };
  for (const row of rows) counts[row.surface] += 1;
  return {
    generatedOn: new Date().toISOString().slice(0, 10),
    lockfile: fileName || "package-lock.json",
    componentCount: rows.length,
    counts,
    components: rows,
    limitations: LIMITATIONS,
  };
}

function toMarkdown(report) {
  const lines = [
    "# npm deployment evidence",
    "",
    `Checked \`${report.lockfile}\` on ${report.generatedOn}: **${report.componentCount} components**.`,
    "",
    "This report shows package-lockfile evidence about dependency reachability. It does not claim that a project is secure or compliant.",
    "",
    "## Summary",
    "",
    `- Production-path components: **${report.counts.production || 0}**`,
    `- Build-only components: **${report.counts["build-only"] || 0}**`,
    "",
    "## Components",
    "",
    "| Package | Version(s) | Surface | Evidence |",
    "|---|---|---|---|",
  ];
  for (const row of report.components) {
    lines.push(`| \`${row.name}\` | ${row.versions.join(", ")} | ${row.surface} | ${row.reason} |`);
  }
  lines.push("", "## Limitations", "");
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  lines.push(
    "",
    "**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, medical, or engineering advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.",
  );
  return lines.join("\n") + "\n";
}

function toJson(report) {
  return JSON.stringify(report, null, 2) + "\n";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseLockfile, buildReport, toMarkdown, toJson, packageName, LIMITATIONS };
}
