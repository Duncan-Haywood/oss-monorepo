#!/usr/bin/env node
// UI QA: screenshots every page at desktop (1280x800) and mobile (390x844), collects console errors and
// runs a lightweight in-page accessibility pass. Runs against scripts/qa-server.sh (offline demo mode).
//
//   node scripts/qa-screens.mjs [tag]          # tag defaults to "before"; output in $QA_OUT/<tag>/
//   QA_BASE_URL=http://localhost:5177  QA_OUT=/tmp/claude-0/qa-shots  QA_ONLY=dashboard,facts
//
// Data setup (first run only; reused from $QA_OUT/state.json while the server keeps its state):
//   sign up through the UI -> create the org through onboarding -> POST /api/demo/seed if it exists,
//   otherwise build data through the API (pasted doc + confirmed facts, projects, sample opportunities,
//   imported RFP, a drafted application, an interview).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.QA_BASE_URL ?? "http://localhost:5177";
const OUT_ROOT = process.env.QA_OUT ?? "/tmp/claude-0/qa-shots";
const TAG = process.argv[2] ?? "before";
const OUT = join(OUT_ROOT, TAG);
const STATE = join(OUT_ROOT, "state.json");
const ONLY = process.env.QA_ONLY ? new Set(process.env.QA_ONLY.split(",")) : null;
const INTERNAL_TOKEN = process.env.QA_INTERNAL_TOKEN ?? "qa-only-internal-token";
const PASSWORD = "qa-Correct-Horse-42";
const fixture = (n) =>
  readFileSync(fileURLToPath(new URL(`../test/e2e/fixtures/${n}`, import.meta.url)), "utf8");
const executablePath = existsSync("/opt/pw-browsers/chromium")
  ? "/opt/pw-browsers/chromium"
  : undefined;

mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[qa]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const origin = { Origin: new URL(BASE).origin };

async function json(res, what) {
  const text = await res.text();
  if (!res.ok()) throw new Error(`${what} -> ${res.status()} ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function poll(fn, { timeout = 30_000, every = 750 } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn().catch(() => undefined);
    if (v) return v;
    await sleep(every);
  }
  return undefined;
}

// ---------------------------------------------------------------- data setup
async function setup(browser) {
  if (existsSync(STATE)) {
    const s = JSON.parse(readFileSync(STATE, "utf8"));
    const ctx = await browser.newContext({ baseURL: BASE, storageState: s.storageState });
    const me = await ctx.request.get("/api/me");
    const body = me.ok() ? await me.json().catch(() => null) : null;
    await ctx.close();
    if (body?.memberships?.some((m) => m.orgId === s.ids.orgId)) {
      log("reusing state for org", s.ids.orgId);
      return s;
    }
    log("stale state.json; setting up again");
  }

  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const email = `qa-${Date.now().toString(36)}@example.org`;

  log("sign up via UI", email);
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Rosa Begay");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("checkbox", { name: /I agree/i }).check();
  await Promise.all([
    page.waitForURL(/\/onboarding/, { timeout: 30_000 }),
    page.getByRole("button", { name: /create account/i }).click(),
  ]);

  log("create org via onboarding UI");
  await page.getByLabel("Organization name").fill("Mesa Ridge Community Pantry");
  await page.getByLabel("Legal name").fill("Mesa Ridge Community Pantry, Inc.");
  const city = page.getByLabel("City");
  if (await city.count()) await city.fill("Farmington");
  const state = page.locator("#org-state");
  if (await state.count()) {
    const tag = await state.evaluate((el) => el.tagName);
    if (tag === "SELECT") await state.selectOption("NM").catch(() => undefined);
    else await state.fill("NM");
  }
  await page.getByRole("checkbox", { name: /I agree/i }).check();
  const created = page.waitForResponse(
    (r) => r.request().method() === "POST" && /^\/api\/orgs\/?$/.test(new URL(r.url()).pathname),
  );
  await page.getByRole("button", { name: /create organization/i }).click();
  const orgRes = await created;
  const { orgId } = await orgRes.json();
  log("org", orgId, orgRes.status());
  await sleep(1000);
  // Screenshot the onboarding step 2 the wizard moved to (it's part of "every page").
  const ids = { orgId };
  const api = ctx.request;
  const o = (p) => `/api/orgs/${orgId}${p}`;

  const seed = await api.post("/api/demo/seed", { headers: origin });
  ids.demoSeed = seed.status();
  if (seed.ok()) {
    const b = await seed.json().catch(() => ({}));
    ids.demoOrgId = b.orgId ?? b.org?.id ?? b.id;
    log("demo seed ok", ids.demoOrgId);
  } else {
    log(`demo seed -> ${seed.status()}; building data through the API`);
  }

  await api.patch(o("/settings"), { headers: origin, data: { autoDraftTopN: 0 } }).catch(() => 0);

  const doc = await json(
    await api.post(o("/documents/text"), {
      headers: origin,
      data: {
        title: "Mission statement",
        kind: "mission_statement",
        text: fixture("mission-statement.txt"),
      },
    }),
    "paste doc",
  );
  ids.documentId = doc.id ?? doc.documentId ?? doc.document?.id;

  const proposed = await poll(async () => {
    const r = await api.get(o("/facts?status=proposed"));
    const items = (await r.json()).items ?? [];
    return items.length ? items : undefined;
  });
  if (proposed?.length) {
    // Confirm most facts but leave a couple unconfirmed so the review UI shows both states.
    const confirm = proposed.slice(0, Math.max(1, proposed.length - 2)).map((f) => f.id);
    await json(
      await api.post(o("/facts/bulk-confirm"), { headers: origin, data: { ids: confirm } }),
      "bulk-confirm",
    );
  }

  const project = await json(
    await api.post(o("/projects"), {
      headers: origin,
      data: {
        title: "Mobile pantry expansion",
        summary: "A refrigerated van bringing fresh produce to three rural chapter houses weekly.",
        problem: "Families in outlying chapters drive 60+ miles for fresh food.",
        approach: "Weekly scheduled stops with volunteer drivers and SNAP enrollment help.",
        populationServed: "Low-income households in San Juan County",
        location: "San Juan County, NM",
        budgetNeededCents: 8_500_000,
        status: "active",
        priority: 1,
      },
    }),
    "project",
  ).catch((e) => {
    log(String(e));
    return {};
  });
  ids.projectId = project.id;
  await api
    .post(o("/projects"), {
      headers: origin,
      data: { title: "Community garden & cooking classes", priority: 3 },
    })
    .catch(() => 0);

  const samples = await api.post("/api/internal/discovery/seed-samples", {
    headers: { Authorization: `Bearer ${INTERNAL_TOKEN}` },
  });
  log("seed-samples", samples.status());
  await api.post(o("/matches/rescore"), { headers: origin }).catch(() => 0);

  const rfp = await api.post(o("/imports/rfp"), {
    headers: origin,
    multipart: {
      file: { name: "rfp.txt", mimeType: "text/plain", buffer: Buffer.from(fixture("rfp.txt")) },
    },
  });
  if (rfp.ok()) ids.rfpOpportunityId = (await rfp.json()).id;
  log("import rfp", rfp.status());

  const opps = await poll(
    async () => {
      const r = await api.get(o("/opportunities"));
      const items = (await r.json()).items ?? [];
      return items.length ? items : undefined;
    },
    { timeout: 20_000 },
  );
  ids.opportunityId = ids.rfpOpportunityId ?? opps?.[0]?.id;

  if (ids.opportunityId) {
    const app = await api.post(o("/applications"), {
      headers: origin,
      data: { opportunityId: ids.opportunityId, projectId: ids.projectId ?? null },
    });
    log("application", app.status());
    if (app.ok()) {
      const a = await app.json();
      ids.applicationId = a.id ?? a.application?.id;
      await poll(
        async () => {
          const r = await api.get(o(`/applications/${ids.applicationId}`));
          const b = await r.json();
          const st = b.status ?? b.application?.status;
          return st && !["draft_queued", "drafting", "verifying"].includes(st) ? st : undefined;
        },
        { timeout: 90_000, every: 1500 },
      );
    }
  }

  const iv = await api.post(o("/interviews"), {
    headers: origin,
    data: { kind: "onboarding", mode: "ai_chat" },
  });
  log("interview", iv.status());
  if (iv.ok()) {
    const b = await iv.json();
    ids.interviewId = b.id ?? b.interview?.id;
  }

  const s = { email, ids, storageState: await ctx.storageState() };
  writeFileSync(STATE, JSON.stringify(s, null, 2));
  await ctx.close();
  return s;
}

// ---------------------------------------------------------------- in-page a11y audit
// Runs inside the page. Returns findings for: images without alt, unnamed buttons/links, unlabeled
// form controls, low text contrast, heading order, horizontal overflow.
function auditInPage() {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const desc = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 3);
    if (cls.length) s += `.${cls.join(".")}`;
    const t = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return t ? `${s} "${t}"` : s;
  };
  const nameOf = (el) => {
    const lb = el.getAttribute("aria-labelledby");
    if (lb)
      return lb
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || "")
        .join(" ")
        .trim();
    const al = el.getAttribute("aria-label");
    if (al?.trim()) return al.trim();
    const parts = [];
    const walk = (n) => {
      if (n.nodeType === 3) parts.push(n.textContent);
      else if (n.nodeType === 1) {
        if (n.getAttribute("aria-hidden") === "true") return;
        if (n.tagName === "IMG") parts.push(n.getAttribute("alt") || "");
        else n.childNodes.forEach(walk);
      }
    };
    el.childNodes.forEach(walk);
    const t = parts.join("").trim();
    return t || el.getAttribute("title") || "";
  };

  const out = {
    imgNoAlt: [],
    unnamedButtons: [],
    unnamedLinks: [],
    unlabeledInputs: [],
    lowContrast: [],
    headings: [],
    headingIssues: [],
    overflow: null,
  };

  for (const img of document.querySelectorAll("img"))
    if (!img.hasAttribute("alt")) out.imgNoAlt.push(desc(img));
  for (const svg of document.querySelectorAll('svg[role="img"]'))
    if (!nameOf(svg)) out.imgNoAlt.push(desc(svg));

  for (const b of document.querySelectorAll(
    'button, [role="button"], [role="tab"], [role="menuitem"], [role="switch"]',
  ))
    if (!nameOf(b))
      out.unnamedButtons.push(desc(b) + (b.outerHTML.length < 200 ? ` ${b.outerHTML}` : ""));
  for (const a of document.querySelectorAll("a[href]"))
    if (vis(a) && !nameOf(a)) out.unnamedLinks.push(desc(a));

  for (const el of document.querySelectorAll("input, select, textarea")) {
    if (["hidden", "submit", "button", "reset"].includes(el.type)) continue;
    const labelled =
      el.getAttribute("aria-label")?.trim() ||
      el.getAttribute("aria-labelledby") ||
      el.getAttribute("title") ||
      el.closest("label") ||
      (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
    if (!labelled)
      out.unlabeledInputs.push(
        `${desc(el)} [type=${el.type}${el.placeholder ? ` placeholder="${el.placeholder}"` : ""}]`,
      );
  }

  // Colour contrast: resolve any CSS colour (oklch, color-mix, ...) to sRGB via a canvas.
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const g = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (c) => {
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = "#000";
    g.fillStyle = c;
    g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const blend = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
  const lum = ([r, gg, b]) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };
  const bgOf = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null; // gradient/image: skip
      const c = rgba(cs.backgroundColor);
      if (c[3] > 0) {
        layers.push(c);
        if (c[3] >= 1) break;
      }
    }
    let bg = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) bg = blend(layers[i], bg);
    return bg;
  };
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el || seen.has(el) || !vis(el)) continue;
    seen.add(el);
    if (el.closest('.sr-only, [aria-hidden="true"], svg, option')) continue;
    const cs = getComputedStyle(el);
    if (Number(cs.opacity) < 0.6) continue;
    if (el.closest(":disabled, [aria-disabled='true']")) continue;
    const bg = bgOf(el);
    if (!bg) continue;
    const fg = blend(rgba(cs.color), bg);
    const size = Number.parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;
    const r = ratio(fg, bg);
    if (r < need)
      out.lowContrast.push(
        `${r.toFixed(2)}:1 (need ${need}) ${size}px ${cs.color} on rgb(${bg.slice(0, 3).map(Math.round)}) ${desc(el)}`,
      );
  }

  let prev = 0;
  for (const h of document.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
    if (!vis(h)) continue;
    const lvl = Number(h.tagName[1]);
    out.headings.push(`h${lvl} ${(h.textContent || "").trim().slice(0, 50)}`);
    if (prev && lvl > prev + 1)
      out.headingIssues.push(
        `skip h${prev} -> h${lvl}: "${(h.textContent || "").trim().slice(0, 50)}"`,
      );
    prev = lvl;
  }
  const h1s = out.headings.filter((h) => h.startsWith("h1")).length;
  if (h1s !== 1) out.headingIssues.push(`${h1s} visible <h1> elements`);

  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) {
    const culprits = [];
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 0 && vis(el)) {
        // Skip descendants of an element already reported or of a scroll container.
        let p = el.parentElement;
        let skip = false;
        while (p && p !== document.body) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === "auto" || ox === "scroll" || ox === "hidden") skip = true;
          p = p.parentElement;
        }
        if (!skip && culprits.length < 6) culprits.push(`${desc(el)} right=${Math.round(r.right)}`);
      }
    }
    out.overflow = { scrollWidth: document.documentElement.scrollWidth, vw, culprits };
  }
  return out;
}

// Tab through the page; report focused elements that show no visible focus indicator.
async function focusAudit(page, presses = 30) {
  const bad = new Set();
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const outline = cs.outlineStyle !== "none" && Number.parseFloat(cs.outlineWidth) > 0;
      const ring = cs.boxShadow && cs.boxShadow !== "none";
      // A focused label wrapper (FileDrop) or :has() parent can carry the ring instead.
      const parent = el.parentElement ? getComputedStyle(el.parentElement) : null;
      const parentRing = parent && parent.boxShadow !== "none" && el.classList.contains("sr-only");
      const t = (el.getAttribute("aria-label") || el.textContent || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 40);
      return outline || ring || parentRing ? null : `${el.tagName.toLowerCase()} "${t}"`;
    });
    if (r) bad.add(r);
  }
  return [...bad];
}

// ---------------------------------------------------------------- pages
function pageList(ids) {
  const org = (p = "") => `/orgs/${ids.orgId}${p}`;
  const list = [
    { name: "landing", path: "/", auth: false },
    { name: "login", path: "/login", auth: false },
    { name: "signup", path: "/signup", auth: false },
    { name: "legal-terms", path: "/legal/terms", auth: false },
    { name: "legal-privacy", path: "/legal/privacy", auth: false },
    { name: "accept-invite", path: "/invite/does-not-exist", auth: false },
    { name: "not-found", path: "/no-such-page", auth: false },
    { name: "onboarding", path: "/onboarding", auth: true },
    { name: "dashboard", path: org() },
    { name: "documents", path: org("/knowledge/documents") },
    { name: "facts", path: org("/knowledge/facts") },
    { name: "search", path: org("/knowledge/search?q=food") },
    { name: "projects", path: org("/projects") },
    { name: "interviews", path: org("/interviews") },
    { name: "opportunities", path: org("/opportunities") },
    { name: "applications", path: org("/applications") },
    { name: "reviews", path: org("/reviews") },
    { name: "submissions", path: org("/submissions") },
    { name: "settings-general", path: org("/settings/general") },
    { name: "settings-members", path: org("/settings/members") },
    { name: "settings-autopilot", path: org("/settings/autopilot") },
    { name: "settings-privacy", path: org("/settings/privacy") },
    { name: "settings-billing", path: org("/settings/billing") },
    { name: "org-not-found", path: "/orgs/not-a-real-org" },
  ];
  if (ids.documentId)
    list.push({ name: "document-detail", path: org(`/knowledge/documents/${ids.documentId}`) });
  if (ids.projectId) list.push({ name: "project-detail", path: org(`/projects/${ids.projectId}`) });
  if (ids.interviewId)
    list.push({ name: "interview-session", path: org(`/interviews/${ids.interviewId}`) });
  if (ids.opportunityId)
    list.push({ name: "opportunity-detail", path: org(`/opportunities/${ids.opportunityId}`) });
  if (ids.applicationId)
    list.push({ name: "application-detail", path: org(`/applications/${ids.applicationId}`) });
  return ONLY ? list.filter((p) => ONLY.has(p.name)) : list;
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
  await page
    .waitForFunction(
      () => !document.querySelector('[aria-label^="Loading"], [aria-busy="true"]'),
      null,
      { timeout: 8_000 },
    )
    .catch(() => undefined);
  await sleep(400);
}

async function shoot(page, file) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const w = page.viewportSize().width;
  await page.screenshot({
    path: file,
    fullPage: true,
    clip: { x: 0, y: 0, width: w, height: Math.min(h, w < 600 ? 2600 : 2200) },
    animations: "disabled",
  });
}

async function run() {
  const browser = await chromium.launch({ executablePath });
  const state = await setup(browser);
  const { ids } = state;
  log("ids", JSON.stringify(ids));
  const pages = pageList(ids);
  const report = { tag: TAG, ids, console: [], pages: {} };

  const viewports = [
    { key: "desktop", viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
    { key: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  ];
  for (const vp of viewports) {
    const mk = (auth) =>
      browser.newContext({
        baseURL: BASE,
        viewport: vp.viewport,
        deviceScaleFactor: 1,
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
        reducedMotion: "reduce",
        ...(auth ? { storageState: state.storageState } : {}),
      });
    const authed = await mk(true);
    const anon = await mk(false);
    for (const p of pages) {
      const ctx = p.auth === false ? anon : authed;
      const page = await ctx.newPage();
      const errs = [];
      page.on("console", (m) => {
        if (m.type() === "error" || m.type() === "warning")
          errs.push(`${m.type()}: ${m.text().slice(0, 300)}`);
      });
      page.on("pageerror", (e) => errs.push(`pageerror: ${String(e).slice(0, 300)}`));
      page.on("response", (r) => {
        if (r.status() >= 500)
          errs.push(`http ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
      });
      try {
        await page.goto(p.path, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await settle(page);
        await shoot(page, join(OUT, `${p.name}.${vp.key}.png`));
        const audit = await page.evaluate(auditInPage);
        report.pages[p.name] ??= {};
        const entry = report.pages[p.name];
        entry[vp.key] = audit;
        if (vp.key === "desktop") entry.focusInvisible = await focusAudit(page);
      } catch (e) {
        errs.push(`qa-script: ${String(e).slice(0, 300)}`);
      }
      for (const e of errs) report.console.push({ page: p.name, vp: vp.key, msg: e });
      await page.close();
    }

    // Overlay states: mobile nav drawer, dialog + toast stacking, user menu.
    const page = await authed.newPage();
    page.on("pageerror", (e) =>
      report.console.push({ page: "overlays", vp: vp.key, msg: `pageerror: ${e}` }),
    );
    try {
      if (vp.key === "mobile" && (!ONLY || ONLY.has("drawer"))) {
        await page.goto(`/orgs/${ids.orgId}`);
        await settle(page);
        await page.getByRole("button", { name: "Open navigation" }).click();
        await sleep(400);
        await page.screenshot({
          path: join(OUT, "overlay-drawer.mobile.png"),
          animations: "disabled",
        });
        const trapped = [];
        for (let i = 0; i < 25; i++) {
          await page.keyboard.press("Tab");
          trapped.push(
            await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')),
          );
        }
        report.drawerFocusTrapped = trapped.every(Boolean);
        await page.keyboard.press("Escape");
        await sleep(200);
        report.drawerClosedOnEsc =
          (await page.locator('[role="dialog"][aria-label="Navigation"]').count()) === 0;
      }
      if (!ONLY || ONLY.has("dialog")) {
        await page.goto(`/orgs/${ids.orgId}/knowledge/documents`);
        await settle(page);
        // Open the first button that opens a dialog (e.g. "Paste text") and fire toasts on top.
        const trigger = page.getByRole("button", { name: /paste|add|upload|new/i }).first();
        if (await trigger.count()) {
          await trigger.click();
          await sleep(400);
        }
        await page.evaluate(async () => {
          const m = await import("/src/client/components/ui/toast.tsx");
          m.toast.success(
            "Document uploaded",
            "We're reading it now — facts will appear for review.",
          );
          m.toast.error("Upload failed", "The file is larger than 25 MB.");
          m.toast({
            title: "Draft ready",
            description: "3 sections need your review.",
            action: { label: "Open draft", onClick() {} },
          });
        });
        await sleep(500);
        await page.screenshot({
          path: join(OUT, `overlay-dialog-toast.${vp.key}.png`),
          animations: "disabled",
        });
        // Is the toast clickable above the dialog backdrop?
        report[`toastAboveDialog_${vp.key}`] = await page.evaluate(() => {
          const t = document.querySelector(
            'section[aria-label="Notifications"] [role="status"], section[aria-label="Notifications"] [role="alert"]',
          );
          if (!t) return "no toast";
          const r = t.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return t.contains(hit) ? "yes" : `no (hit ${hit?.tagName}.${hit?.className})`;
        });
      }
    } catch (e) {
      report.console.push({
        page: "overlays",
        vp: vp.key,
        msg: `qa-script: ${String(e).slice(0, 300)}`,
      });
    }
    await page.close();
    await authed.close();
    await anon.close();
  }
  await browser.close();
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  log("wrote", join(OUT, "report.json"));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
