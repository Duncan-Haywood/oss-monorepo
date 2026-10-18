// Pure logic shared by cli.mjs (the only part of this tool that touches the
// network) and index.html (fully offline). No fetch, no fs, no globals --
// everything here is a plain function over data already handed to it.

// A package that exists but was published this recently, with this few
// versions, is treated as SUSPICIOUS_NEW rather than OK: that is the
// fingerprint of a name freshly registered after being hallucinated or
// typosquatted, not of an established dependency. Both thresholds are
// deliberately conservative -- a real new project can trip them too, which
// is why the CLI prints the raw age/version numbers for the reader to judge
// rather than a bare pass/fail.
export const AGE_THRESHOLD_DAYS = 180;
export const VERSION_COUNT_THRESHOLD = 3;

// Sourced and independently checked 2026-09-24, not restated from memory:
// Wikipedia's "Slopsquatting" article (citing the May 2025 USENIX Security
// paper "We Have a Package for You! A Comprehensive Analysis of Package
// Hallucinations by Code Generating LLMs") and a live fetch of the linked
// PhantomRaven writeup on The Hacker News.
export const RESEARCH_NOTE =
  "A May 2025 USENIX Security study (\"We Have a Package for You!\") tested " +
  "16 code-generating models and found 19.7% of recommended packages did " +
  "not exist at all -- 21.7% for open-source models vs. 5.2% for " +
  "proprietary ones -- collecting over 205,000 unique hallucinated package " +
  "names across the study.";

export const KNOWN_INCIDENTS = [
  {
    project: "huggingface-cli (proof of concept)",
    date: "2023",
    mechanism: "hallucinated package name, registered and left empty",
    note:
      "Security researcher Bar Lanyado registered a package under a name " +
      "he had seen an LLM hallucinate and published it empty. It was " +
      "downloaded more than 30,000 times in three months, and the same " +
      "hallucinated name turned up inside an Alibaba research repository's " +
      "own README -- evidence that developers copy a suggested install " +
      "command without checking the name is real.",
  },
  {
    project: "PhantomRaven campaign",
    date: "flagged October 2025 (active since November 2022)",
    mechanism: "slopsquatting and typosquatting to distribute malware",
    note:
      "Koi Security and DCODX documented 100+ malicious npm packages " +
      "distributed under slopsquatted and typosquatted names; CrowdStrike " +
      "assessed the malware itself was written with the help of an LLM. " +
      "The packages stole authentication tokens, CI/CD secrets, and " +
      "GitHub credentials from the machines that installed them.",
  },
];

// A short, deliberately non-exhaustive list of extremely well-established,
// unscoped npm package names, used only for the browser page's fully
// offline "does this look like a typo of something famous" heuristic. It is
// not a popularity database and it is not proof either name is real or
// fake -- see findNearMisses' own doc comment and the page's own FAQ.
export const WELL_KNOWN_PACKAGES = Object.freeze([
  "react", "react-dom", "react-router", "react-router-dom", "redux",
  "react-redux", "redux-thunk", "redux-saga", "zustand", "recoil", "mobx",
  "vue", "svelte", "next", "nuxt", "express", "koa", "fastify",
  "lodash", "underscore", "moment", "dayjs", "axios", "request",
  "node-fetch", "chalk", "commander", "yargs", "minimist", "inquirer",
  "ora", "figlet", "boxen", "dotenv", "cors", "body-parser",
  "cookie-parser", "morgan", "helmet", "passport", "express-session",
  "multer", "nodemailer", "socket.io", "ws", "uuid", "jsonwebtoken",
  "bcrypt", "bcryptjs", "mongoose", "sequelize", "prisma", "pg", "mysql",
  "mysql2", "sqlite3", "redis", "ioredis", "rxjs", "immutable",
  "classnames", "prop-types", "styled-components", "formik", "yup", "joi",
  "ajv", "glob", "rimraf", "fs-extra", "chokidar", "semver", "debug",
  "winston", "pino", "webpack", "rollup", "parcel", "vite", "gulp",
  "grunt", "eslint", "prettier", "jest", "mocha", "chai", "sinon",
  "supertest", "cypress", "playwright", "puppeteer", "typescript",
  "ts-node", "tslib", "jquery", "bootstrap", "tailwindcss", "sass", "less",
  "postcss", "autoprefixer", "nodemon", "cross-env", "concurrently",
  "husky", "lint-staged", "left-pad", "colors", "kleur", "picocolors",
  "table", "cli-table3", "node-cron", "cron", "bull", "agenda", "knex",
  "typeorm", "graphql", "apollo-server", "three", "d3", "chart.js",
  "leaflet", "xlsx", "pdfkit", "sharp", "jimp", "electron", "react-native",
  "expo",
]);

/** Classic edit-distance DP. Small inputs only (package names). */
export function levenshtein(a, b) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = Array.from({ length: bl + 1 }, (_, i) => i);
  for (let i = 1; i <= al; i += 1) {
    const cur = [i];
    for (let j = 1; j <= bl; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[bl];
}

/**
 * Fully offline heuristic: is `name` one or two edits away from a name on
 * WELL_KNOWN_PACKAGES, without being an exact match? A hit is not proof of
 * anything -- "reqeusts" and "requests" both being real npm names is exactly
 * as possible as one of them being a typosquat -- it is a prompt to read the
 * package before trusting it, the same "flag means read this one" framing
 * dependency-confusion-check and npm-lifecycle-script-check already use.
 */
export function findNearMisses(name, { maxDistance = 2 } = {}) {
  if (WELL_KNOWN_PACKAGES.includes(name)) return [];
  const hits = [];
  for (const known of WELL_KNOWN_PACKAGES) {
    if (Math.abs(known.length - name.length) > maxDistance) continue;
    const distance = levenshtein(name, known);
    if (distance > 0 && distance <= maxDistance) hits.push({ known, distance });
  }
  return hits.sort((a, b) => a.distance - b.distance);
}

/**
 * Is `specifier` the kind of value that resolves against the public npm
 * registry at all? Anything else (a local path, a git URL, a workspace
 * reference) points somewhere this tool cannot and should not check.
 */
export function isRegistrySpecifier(specifier) {
  const s = String(specifier ?? "").trim();
  if (!s || s === "*") return true;
  if (s.startsWith("npm:")) return true; // alias, resolved by the caller
  if (s.startsWith("file:") || s.startsWith("link:") || s.startsWith("workspace:")) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return false; // git+ssh:, git+https:, https:, ssh:, etc.
  return true; // a semver range or dist-tag
}

const MANIFEST_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

/**
 * Reads a package.json's dependency fields and returns one entry per unique
 * declared name, resolved to the registry name it would actually check (an
 * `npm:real-name@range` alias resolves to `real-name`), with non-registry
 * specifiers marked to skip rather than silently mis-checked.
 */
export function extractDependencies(packageJsonText) {
  let pkg;
  try {
    pkg = JSON.parse(packageJsonText);
  } catch (err) {
    throw new Error(`could not parse package.json: ${err.message}`);
  }
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) {
    throw new Error("package.json must contain a JSON object");
  }

  const seen = new Map();
  for (const field of MANIFEST_FIELDS) {
    const deps = pkg[field];
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) continue;
    for (const [name, rawSpecifier] of Object.entries(deps)) {
      if (seen.has(name)) continue; // first field wins; this is provenance, not a merge
      const specifier = String(rawSpecifier ?? "").trim();
      let registryName = name;
      let skip = false;
      let skipReason = null;
      if (specifier.startsWith("npm:")) {
        const aliasTarget = specifier.slice(4);
        const at = aliasTarget.lastIndexOf("@");
        registryName = at > 0 ? aliasTarget.slice(0, at) : aliasTarget;
      } else if (!isRegistrySpecifier(specifier)) {
        skip = true;
        skipReason = "not a registry specifier (git, file, link, workspace, or URL)";
      }
      seen.set(name, { name, field, specifier, registryName, skip, skipReason });
    }
  }
  return [...seen.values()];
}

/** The registry document URL for a (possibly scoped) package name. */
export function registryUrl(name) {
  return `https://registry.npmjs.org/${name.replace("/", "%2F")}`;
}

/**
 * Turns a fetched registry document into a verdict. `now` is injectable so
 * tests do not depend on the wall clock or on any fixture's age changing
 * meaning next year.
 */
export function classifyMetadata(meta, {
  now = Date.now(),
  ageThresholdDays = AGE_THRESHOLD_DAYS,
  versionCountThreshold = VERSION_COUNT_THRESHOLD,
} = {}) {
  const createdRaw = meta && meta.time && meta.time.created;
  const created = createdRaw ? new Date(createdRaw).getTime() : NaN;
  const versionCount = meta && meta.versions && typeof meta.versions === "object"
    ? Object.keys(meta.versions).length
    : 0;
  if (!Number.isFinite(created)) {
    return { status: "UNKNOWN", ageDays: null, versionCount };
  }
  const ageDays = Math.max(0, Math.floor((now - created) / 86400000));
  const suspicious = ageDays < ageThresholdDays && versionCount > 0 && versionCount <= versionCountThreshold;
  return { status: suspicious ? "SUSPICIOUS_NEW" : "OK", ageDays, versionCount };
}
