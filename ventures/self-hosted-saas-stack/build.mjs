// Writes index.html from stack.mjs. `node build.mjs` regenerates it and
// `node build.mjs --check` exits 1 if the committed page is stale.
import { readFileSync, writeFileSync } from "node:fs";
import { GROUPS, ALL } from "./stack.mjs";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const TITLE = "Self-Hosted SaaS Stack: Open-Source Alternatives to Calendly, Sentry, LaunchDarkly and Help Scout";
const DESC = `${ALL.length} open-source, self-hosted tools that replace the small-SaaS subscriptions a founder pays for: booking, help center, error tracking, feature flags, analytics, email, referrals, billing metrics and e-signature. MIT licensed, zero dependencies, one-click deploy.`;

const FAQ = [
  ["Are these really free?", "Yes. Every tool is MIT licensed. You pay only for wherever you choose to run it, which for most of them is a single small Node process on a free or low-cost host. There is no per-seat fee and no usage cap beyond your own server."],
  ["How do I deploy one?", "Each tool is a zero-dependency Node server with a Dockerfile, a docker-compose file, and Render and Fly.io configuration. Clone the repository, open the tool's folder and run node server.mjs, or use the one-click deploy button where the tool's page offers it. Your data stays on the server you run."],
  ["How do these compare with Calendly, Sentry or LaunchDarkly?", "They cover the core job a small team needs, not every feature of a paid platform. Each tool's page has an honest limits section naming what it does not do, for example single admin key instead of team logins. If you need enterprise permissions, audit certifications or a vendor to call, a paid product is still the right call."],
  ["Who maintains them?", "They are built and maintained in the open in one repository, with automated tests for every tool. They are provided as-is, with no warranty and no uptime or delivery guarantee, so read the code and test it against your own needs before relying on it."],
  ["Can I use only one?", "Yes. Each tool stands alone and shares nothing with the others. Those that talk to Stripe use your own webhook or a read-only key, and none of them needs another tool in this list."],
];

const LD = [
  { "@context": "https://schema.org", "@type": "ItemList", name: "Self-hosted SaaS stack", numberOfItems: ALL.length,
    itemListElement: ALL.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, url: `../${t.slug}/` })) },
  { "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
];

export function render() {
  const groups = GROUPS.map((g) => `  <section class="card" aria-labelledby="g-${g.id}">
    <h2 id="g-${g.id}">${esc(g.title)}</h2>
    <table><thead><tr><th scope="col">Tool</th><th scope="col">Instead of</th><th scope="col">What it does</th></tr></thead><tbody>
${g.items.map((t) => `      <tr><td><a href="../${t.slug}/">${esc(t.name)}</a></td><td>${esc(t.replaces)}</td><td>${esc(t.does)}</td></tr>`).join("\n")}
    </tbody></table>
  </section>`).join("\n\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='7'%20fill='%237e5f1b'/%3E%3Ctext%20x='16'%20y='23'%20font-size='20'%20font-family='system-ui,sans-serif'%20font-weight='700'%20text-anchor='middle'%20fill='%23fff'%3ES%3C/text%3E%3C/svg%3E">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(TITLE)}</title>
  <meta name="description" content="${esc(DESC)}">
  <meta property="og:title" content="${esc(TITLE)}">
  <meta property="og:description" content="${esc(DESC)}">
  <link rel="canonical" href="./index.html">
${LD.map((o) => `  <script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n")}
  <style>
    :root { font: 16px system-ui, sans-serif; color: #1c2030; background: #f6f7fb; }
    body { max-width: 980px; margin: auto; padding: 28px; }
    a { color: #2342b8; }
    h1 { font-size: clamp(1.8rem, 4.8vw, 2.8rem); line-height: 1.08; margin: 0 0 14px; color: #14204f; }
    h2 { font-size: 1.15rem; margin: 0 0 10px; color: #14204f; }
    p, li { line-height: 1.55; }
    .note, footer { font-size: .86rem; color: #46506b; }
    .card { background: #fff; border: 1px solid #dde1ec; border-radius: 14px; padding: 22px; margin: 18px 0; overflow-x: auto; }
    pre { background: #eef0f8; padding: 10px; border-radius: 8px; overflow-x: auto; font-size: .82rem; white-space: pre-wrap; }
    table { border-collapse: collapse; width: 100%; font-size: .92rem; }
    th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #e3e6f1; vertical-align: top; }
  </style>
</head>
<body>
  <main>
  <h1>The small-SaaS stack you can host yourself.</h1>
  <p>${ALL.length} open-source tools, each replacing a subscription a founder or small team usually pays for: booking pages, a help center, error tracking, feature flags, web analytics, lifecycle email, referral programs, Stripe revenue metrics and e-signature. Every one is MIT licensed, a zero-dependency Node server, and deployable to your own cloud with no vendor in between. Pick the one you need; none requires another.</p>

${groups}

  <section class="card">
    <h2>Run any of them yourself</h2>
    <pre>git clone https://github.com/Duncan-Haywood/oss-monorepo &amp;&amp; cd oss-monorepo/ventures/slot-keeper
node --test
ADMIN_KEY=$(openssl rand -hex 16) node server.mjs</pre>
    <p class="note">Swap <code>slot-keeper</code> for any folder above. Each tool's page lists its settings, its honest limits, and Render, Fly.io and Docker deploy files.</p>
  </section>

  <section class="card">
    <h2>Questions</h2>
${FAQ.map(([q, a]) => `    <h3>${esc(q)}</h3>\n    <p>${esc(a)}</p>`).join("\n")}
  </section>
  </main>
  <footer>
    <p><strong>No warranty.</strong> Free and as-is, with no uptime or delivery guarantee. This is not legal, tax, or financial advice, and product names above are used only to say what each tool is compared with; they belong to their owners and none of them endorses this project. Everything on this page runs in your browser and nothing is uploaded or tracked.</p>
    <p>MIT licence. <a href="https://github.com/sponsors/Duncan-Haywood">Sponsor on GitHub</a> to support the work.</p>
  </footer>
</body>
</html>
`;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const out = new URL("./index.html", import.meta.url);
  if (process.argv.includes("--check")) {
    let cur = ""; try { cur = readFileSync(out, "utf8"); } catch {}
    if (cur !== render()) { console.error("index.html is stale: run node build.mjs"); process.exit(1); }
  } else writeFileSync(out, render());
}
