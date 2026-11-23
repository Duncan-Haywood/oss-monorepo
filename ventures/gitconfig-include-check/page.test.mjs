import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "why-git-uses-the-wrong-email.html"];

test("every page carries the no-warranty clause, independence line and sponsor link", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not legal, security or professional advice/, p);
    assert.match(html, /Not affiliated with or endorsed by the Git project/, p);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, p);
  }
  assert.match(page("index.html"), /Everything runs in your browser/);
});

test("JSON-LD blocks parse and each FAQ matches the visible questions", () => {
  for (const p of PAGES) {
    const html = page(p);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq, p);
    assert.ok(faq.mainEntity.length >= 3, p);
    for (const q of faq.mainEntity) {
      assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
      assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
    }
  }
  const app = [...page("index.html").matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]))[0];
  assert.equal(app["@type"], "SoftwareApplication");
  assert.equal(app.offers.price, "0");
  assert.ok(!/AggregateRating|"Review"/.test(page("index.html")));
});

test("SEO basics on every page", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /<title>[^<]{20,}<\/title>/, p);
    assert.match(html, /<meta name="description" content="[^"]{80,320}"/, p);
    assert.match(html, new RegExp(`<link rel="canonical" href="\\./${p.replace(".", "\\.")}">`), p);
    assert.match(html, /<meta property="og:title"/, p);
    assert.equal((html.match(/<h1>/g) || []).length, 1, p);
    assert.match(html, /<html lang="en">/, p);
    assert.match(page("sitemap.xml"), new RegExp(p === "index.html" ? "gitconfig-include-check/<" : p.replace(".", "\\.")));
  }
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 5);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`<label for="${id}">`), `unlabelled: ${tag}`);
  }
  for (const f of [...PAGES, "gitconfig.mjs", "usage.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/, f);
  assert.doesNotMatch(page("gitconfig.mjs"), /^\s*import\s|import\(|Date\.now|Math\.random/m);
});

test("the inline script imports only exported names and every element it uses exists", async () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./gitconfig.mjs", "./usage.mjs"]);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
  const names = html.match(/import \{([^}]+)\} from "\.\/gitconfig\.mjs"/)[1].split(",").map((s) => s.trim());
  const engine = await import("./gitconfig.mjs");
  for (const n of names) assert.ok(n in engine, n);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("#([\w-]+)"/g)) assert.ok(ids.has(m[1]), m[1]);
  for (const m of html.matchAll(/for \(const id of \[([^\]]+)\]\)/g)) for (const id of m[1].match(/"([\w-]+)"/g)) assert.ok(ids.has(id.replace(/"/g, "")), id);
});

test("usage events are documented where they are recorded", () => {
  const html = page("index.html");
  for (const e of ["config_checked", "example_loaded", "why_shown", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /id="optout"/);
});

test("the guide's six cases are what the engine (checked against git) says", async () => {
  const { analyze } = await import("./gitconfig.mjs");
  const g = page("why-git-uses-the-wrong-email.html");
  const ctx = { home: "/home/sam", repo: "~/work/api", branch: "main" };
  const kinds = (files, extra = {}) => analyze({ ...ctx, files, ...extra }).findings.map((f) => f.kind);
  const work = "==> ~/.gitconfig-work <==\n[user]\n\temail = sam@company.example\n";
  assert.ok(kinds(`[includeIf "gitdir:~/work"]\n\tpath = ~/.gitconfig-work\n${work}`).includes("gitdir-no-trailing-slash"));
  assert.ok(kinds(`[includeIf "gitdir:~/work/api"]\n\tpath = ~/.gitconfig-work\n${work}`).includes("gitdir-names-work-tree"));
  const order = analyze({ ...ctx, files: `[includeIf "gitdir:~/work/"]\n\tpath = ~/.gitconfig-work\n[user]\n\temail = sam@personal.example\n${work}` });
  assert.equal(order.effective["user.email"].value, "sam@personal.example");
  assert.ok(kinds(`[includeIf "GitDir:~/work/"]\n\tpath = x\n`).includes("unknown-condition"));
  assert.ok(kinds(`[includeIf "hasconfig:remote.origin.url:x"]\n\tpath = x\n`).includes("unknown-condition"));
  assert.ok(kinds(`[includeIf "gitdir: ~/work/"]\n\tpath = x\n`).includes("condition-whitespace"));
  assert.ok(kinds(`[include]\n\tpath = $HOME/.gitconfig-work\n`).includes("include-env-var"));
  assert.ok(kinds(`[includeIf "gitdir:~/work/"]\n\tpath = ~/.gitconfig-work\n`, { realGitdir: "/mnt/data/work/api/.git" }).includes("gitdir-symlink"));
  assert.ok(kinds(`[includeIf "onbranch:main"]\n\tpath = x\n`, { branch: null }).includes("onbranch-detached"));
  assert.equal(analyze({ ...ctx, branch: "feature/a/b", files: `[includeIf "onbranch:feature/"]\n\tpath = x\n` }).directives[0].matched, true);
  assert.equal(analyze({ home: "/home/sam", gitdir: "~/work/api/.git/worktrees/fix", files: `[includeIf "gitdir:~/work/"]\n\tpath = x\n` }).directives[0].matched, true);
  for (const s of ["/home/sam/work/**", "exceeded maximum include depth", "bad config line N in file F"]) assert.ok(g.includes(s), s);
});

test("links: sibling, guide, robots, sitemap, README, llms.txt, LICENSE and VENTURE.yaml", () => {
  assert.match(page("index.html"), /href="\.\.\/gitignore-explainer\/"/);
  assert.match(page("index.html"), /href="\.\.\/gitattributes-explainer\/"/);
  assert.match(page("index.html"), /href="why-git-uses-the-wrong-email\.html"/);
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("llms.txt"), /^# gitconfig includeIf checker/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: gitconfig-include-check$/m);
});
