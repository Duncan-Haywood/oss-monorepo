// Screenshots of the real app for the marketing site (apps/cmmc-site), not part of any test suite.
//
//   cp .dev.vars.example .dev.vars          # FAKE_EXTERNALS=true: offline, no email verification
//   rm -rf .wrangler && pnpm db:migrate:local && pnpm dev
//   node scripts/stills.mjs                  # in a second shell; STILLS_BASE_URL overrides :5173
//
// It signs up on the empty local database, creates one invented shop and records a Level 2
// self-assessment through the app's own API (the spreadsheet import and the POA&M endpoint, the
// same calls the pages make), then photographs the pages. The shop is put on the Level 2 plan with a
// local "comp" row in D1, because checkout is dark; the site's captions say the plan is not on sale.
// Before each shot the script asserts the score and counts on the page against the arithmetic below,
// so a still can never show a number the scoring rules don't back.
//
// PNGs go to scripts/stills-out/ (ignored); the ones the site shows are re-encoded as WebP by the
// same Chromium (no image library) into apps/cmmc-site/assets/shot-*.webp.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { POAM_EXCLUDED, REQUIREMENTS } from "../../cmmc-site/src/sprs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..");
const OUT = join(HERE, "stills-out");
const SITE_ASSETS = join(APP, "..", "cmmc-site", "assets");
const BASE = process.env.STILLS_BASE_URL || "http://localhost:5173";

/** Playwright from the project if present, else the copy preinstalled in the cloud container. */
async function loadPlaywright() {
  try {
    return createRequire(import.meta.url)("playwright");
  } catch {
    return (await import("/opt/node-tools/node_modules/playwright/index.js")).default;
  }
}

// ---- the invented shop's assessment ----

// Open gaps: four 1-point requirements, each allowed on a POA&M (32 CFR 170.21), with an item each.
const GAPS = [
  {
    nistId: "3.1.10",
    weakness: "Screen lock is not enforced on the two CNC programming workstations.",
    remediation: "Push a 15-minute lock with pattern-hiding screen saver by group policy.",
    responsible: "IT lead",
    due: "2027-01-15",
  },
  {
    nistId: "3.1.11",
    weakness: "Remote sessions to the file server do not end after inactivity.",
    remediation: "Set a 30-minute idle disconnect on the VPN and RDP gateway.",
    responsible: "IT lead",
    due: "2027-01-15",
  },
  {
    nistId: "3.8.9",
    weakness: "Backup drives taken off site are not encrypted.",
    remediation: "Replace with encrypted drives; record each rotation in the backup log.",
    responsible: "Office manager",
    due: "2027-02-01",
  },
  {
    nistId: "3.10.6",
    weakness: "No written safeguards for staff who work on drawings from home.",
    remediation: "Write the alternate work site rule into the remote work policy and train staff.",
    responsible: "Quality manager",
    due: "2027-02-15",
  },
];
for (const g of GAPS) {
  const r = REQUIREMENTS.find((x) => x.nistId === g.nistId);
  if (r?.weight !== 1 || POAM_EXCLUDED.includes(g.nistId))
    throw new Error(`${g.nistId} is not a 1-point requirement allowed on a POA&M`);
}
const EXPECTED_SCORE = 110 - GAPS.length; // every other requirement is recorded implemented
const IMPLEMENTED = REQUIREMENTS.length - GAPS.length;

const csvCell = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
function assessmentCsv() {
  const rows = [["Requirement", "Status", "Notes"]];
  for (const r of REQUIREMENTS) {
    const gap = GAPS.find((g) => g.nistId === r.nistId);
    rows.push([
      r.code,
      gap ? "Not implemented" : "Implemented",
      gap ? `On the POA&M: ${gap.weakness}` : "",
    ]);
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

// ---- helpers ----

async function api(page, path, method = "GET", json) {
  return page.evaluate(
    async ({ path, method, json }) => {
      const res = await fetch(path, {
        method,
        headers: json ? { "content-type": "application/json" } : {},
        body: json ? JSON.stringify(json) : undefined,
        credentials: "same-origin",
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
      return text ? JSON.parse(text) : null;
    },
    { path, method, json },
  );
}

async function toSite(page, name) {
  const png = readFileSync(join(OUT, `${name}.png`)).toString("base64");
  const dataUrl = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d")?.drawImage(img, 0, 0);
    return c.toDataURL("image/webp", 0.86);
  }, png);
  if (!dataUrl.startsWith("data:image/webp;base64,"))
    throw new Error("this Chromium cannot encode WebP");
  mkdirSync(SITE_ASSETS, { recursive: true });
  writeFileSync(
    join(SITE_ASSETS, `shot-${name}.webp`),
    Buffer.from(dataUrl.split(",")[1] ?? "", "base64"),
  );
}

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
}

async function shot(page, name) {
  mkdirSync(OUT, { recursive: true });
  await settle(page);
  await page.screenshot({ path: join(OUT, `${name}.png`), animations: "disabled", caret: "hide" });
  await toSite(page, name);
}

async function expectText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 15_000 });
}

async function tab(page, label) {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await page.waitForLoadState("networkidle");
}

// ---- run ----

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
try {
  await page.goto(`${BASE}/`);
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Name").fill("Pat Example");
  await page.getByLabel("Email").fill("pat@example.com");
  await page.getByLabel("Password").fill("stills-password-only");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "I agree" }).click();
  await page.getByLabel("Company name").fill("Example Precision Machining");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expectText(page, "Dashboard");

  const me = await api(page, "/api/me");
  const orgId = me.memberships[0].id;
  // The Level 2 plan, granted locally: checkout ships dark, so there is no other way to it offline.
  const now = Math.floor(Date.now() / 1000);
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--command",
      `INSERT INTO subscriptions (org_id, plan_key, status, created_at, updated_at) VALUES ('${orgId.replace(/'/g, "")}', 'level2', 'comp', ${now}, ${now})`,
    ],
    { cwd: APP, stdio: "ignore", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
  );

  const org = `/api/orgs/${orgId}`;
  await api(page, `${org}/profile`, "PATCH", {
    targetLevel: 2,
    legalName: "Example Precision Machining LLC",
    systemName: "Shop network and ERP",
    systemDescription:
      "Twelve-person CNC job shop. Drawings marked CUI arrive by email from two primes and are kept on one file server.",
    boundaryDescription:
      "The office file server, six Windows workstations (two of them CNC programming stations) and the firewall. The CNC machines take programs by USB from the programming stations and hold no drawings.",
    sspUpdateFrequency: "Every year, and whenever the network changes",
    affirmingOfficial: "Pat Example, President",
  });
  const imported = await api(page, `${org}/controls/import`, "POST", {
    level: 2,
    csv: assessmentCsv(),
    apply: true,
  });
  console.log("import:", JSON.stringify(imported).slice(0, 200));
  for (const g of GAPS) {
    const r = REQUIREMENTS.find((x) => x.nistId === g.nistId);
    await api(page, `${org}/poam`, "POST", {
      controlId: r.code,
      weakness: g.weakness,
      remediation: g.remediation,
      responsible: g.responsible,
      scheduledCompletion: g.due,
    });
  }

  await page.reload();
  await expectText(page, String(EXPECTED_SCORE));
  await shot(page, "dashboard-desktop");

  await tab(page, "Controls");
  await expectText(page, "3.1.1");
  // One open gap, picked: the detail pane shows its points, objectives and POA&M item.
  await page.getByText("AC.L2-3.1.10", { exact: false }).first().click();
  await expectText(page, GAPS[0].weakness);
  await shot(page, "controls-desktop");

  await tab(page, "POA&M");
  await expectText(page, GAPS[0].weakness);
  await shot(page, "poam-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await tab(page, "Dashboard");
  await expectText(page, String(EXPECTED_SCORE));
  await shot(page, "dashboard-phone");
  console.log(
    `ok: score ${EXPECTED_SCORE}, ${IMPLEMENTED} implemented, ${GAPS.length} on the POA&M`,
  );
} finally {
  await browser.close();
}
