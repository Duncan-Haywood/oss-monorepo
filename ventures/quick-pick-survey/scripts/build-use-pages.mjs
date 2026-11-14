// node scripts/build-use-pages.mjs
//
// Writes one landing page per common job a pairwise ranking does well
// (site/use-*.html), each with a ready list that opens the ranker with one
// click. The list rides in the link's # fragment, made by the ranker's own
// encodeList, so a page is plain HTML that works without JavaScript and the
// list never reaches a server. The pages are generated so the list, the link
// and the page can't drift apart; site/use-pages.test.mjs fails if a page
// is stale or a link does not decode back to its list.
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { encodeList, parseList } from "../site/rank-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SITE = join(here, "..", "site");
const BASE = "https://marisstella.app/quick-pick-survey/";

export const USE_PAGES = [
  {
    slug: "use-feature-backlog",
    title: "Prioritise a feature backlog by picking pairs",
    description: "Rank your product backlog by answering 'which first?' between two features at a time, then combine your team's picks into one order with the features you disagree on flagged. Free, in the browser.",
    lede: "Scoring twenty features 1 to 10 gives you twenty 8s. Asking \"which would you build first?\" between two at a time makes people trade off, and the order falls out of the answers.",
    question: "Which would you build first?",
    items: ["Dark mode", "CSV export", "Faster search", "Mobile app", "Team accounts", "Calendar sync", "Offline mode", "Single sign-on", "Public API", "Better onboarding", "Usage dashboard", "Slack integration"],
    why: [
      "Each person answers alone on their own phone, so the loudest voice in the meeting doesn't set the order.",
      "The combined result shows the team's order, how much people agree (a 0 to 1 score), and each feature's best-to-worst place across people. A feature one person ranks 1st and another 11th is the one to talk about before you commit.",
      "Every place comes with a range (\"rank 3, plausibly 2 to 5\"), so you can see which positions the answers actually settle and which are close.",
    ],
    caveat: "It ranks what your team prefers, not what customers will pay for. Put customer evidence in the list (\"Requested by 14 accounts: CSV export\") if you want it weighed.",
    alternatives: "RICE or ICE scoring, dot voting, MoSCoW, or a paid pairwise tool. Scoring frameworks need numbers nobody has; dot voting rewards whoever votes last. This is free and keeps each person's picks private until they share a code.",
  },
  {
    slug: "use-personal-values",
    title: "Rank your personal values, two at a time",
    description: "A values exercise without the agonising: answer 'which matters more to you?' between two values at a time and get your ranked list with how settled each place is. Free, private, runs in your browser.",
    lede: "Most values exercises ask you to sort thirty words into order in one go. Choosing which of two matters more is easier and more honest, and enough of those choices give you the order.",
    question: "Which matters more to you?",
    items: ["Family", "Health", "Freedom", "Security", "Achievement", "Creativity", "Learning", "Friendship", "Adventure", "Honesty", "Faith", "Community", "Wealth", "Recognition", "Peace of mind", "Fun"],
    why: [
      "Edit the list before you start: add values that matter to you and delete ones that don't. Twelve to twenty works well.",
      "The result marks places your answers did not settle, so you can see which values you genuinely hold equal rather than forcing a tie-break.",
      "Nothing is uploaded or stored anywhere but your browser. Close the tab and it's gone.",
    ],
    caveat: "It's a reflection exercise, not a psychological assessment. A ranking from a few dozen picks is an estimate, and how you answer can change with your mood that day.",
    alternatives: "Card-sort worksheets, paid values assessments, or a coach. A worksheet makes you hold the whole list in your head; this asks one small question at a time.",
  },
  {
    slug: "use-name-shortlist",
    title: "Choose a name from a shortlist by picking pairs",
    description: "Narrow a shortlist of baby names, business names or project names by answering 'which do you prefer?' two at a time, then compare your picks with a partner's or a team's. Free, nothing uploaded.",
    lede: "When fifteen names all sound fine, saying which of two you prefer is easy. Do that a few dozen times and you have an order, plus a chance for each name to be the one you'd actually choose.",
    question: "Which name do you prefer?",
    items: ["Juniper", "Atlas", "Willow", "Felix", "Iris", "Theo", "Hazel", "Arlo", "Clara", "Silas", "Mabel", "Otis"],
    why: [
      "Send the list to your partner (or co-founders) as a link. You each answer alone, then paste each other's result codes to see the combined order and where you differ.",
      "\"Be sure of the favourite\" mode spends its questions on the front-runners, if you only need the winner.",
      "The list travels inside the link after the #, which browsers never send to a server.",
    ],
    caveat: "For a business name, check trademarks and domains separately: this only ranks what you like.",
    alternatives: "Name-voting apps and swiping apps. Swiping says yes or no to each name on its own; picking between two makes you compare, which separates names you merely like from the ones you love.",
  },
  {
    slug: "use-trip-shortlist",
    title: "Decide where to go: rank trip ideas with your group",
    description: "Everyone in the group answers 'which would you rather?' between two destinations at a time on their own phone, then paste the codes back for one combined order and the places you split on. Free, no sign-up.",
    lede: "Group chats are bad at choosing a destination: the first suggestion anchors everyone and quiet people don't vote. Send one link, let each person pick between pairs privately, and combine.",
    question: "Which trip would you rather take?",
    items: ["Lisbon", "Mexico City", "Kyoto", "Iceland road trip", "Scottish Highlands", "Croatian islands", "New Orleans", "Montreal", "A beach week in Portugal", "Hiking in the Dolomites"],
    why: [
      "Each person weighs the same, however many questions they answered.",
      "The agreement score tells you whether the group really wants the same thing or is split into camps, and the best-to-worst column shows which places are divisive.",
      "No accounts, no app to install: it works in any phone browser.",
    ],
    caveat: "It ranks what people would rather do, not what fits the budget or the dates. Take the clear losers off the list first if money or time rules them out.",
    alternatives: "Polls in a group chat, shared spreadsheets, or trip-planning apps with voting. A poll picks a winner but hides how much people care. Pairwise picks give an order and show where people disagree.",
  },
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function rankLink(page) {
  return `rank.html#l=${encodeList({ title: page.question, items: parseList(page.items.join("\n")) })}`;
}

export function renderUsePage(page) {
  const link = rankLink(page);
  const others = USE_PAGES.filter((p) => p.slug !== page.slug).map((p) => `<a href="${p.slug}.html">${esc(p.title)}</a>`).join(" &middot; ");
  const ld = JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", name: page.title, description: page.description, url: `${BASE}${page.slug}.html`, isPartOf: { "@type": "WebApplication", name: "Quick Pick", url: `${BASE}rank.html`, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } } });
  return `<!doctype html>
<!-- GENERATED by scripts/build-use-pages.mjs. Edit the list there, then run it. -->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(page.title)} | Quick Pick</title>
  <meta name="description" content="${esc(page.description)}">
  <link rel="canonical" href="${BASE}${page.slug}.html">
  <meta property="og:title" content="${esc(page.title)}">
  <meta property="og:description" content="${esc(page.description)}">
  <script type="application/ld+json">${ld.replace(/</g, "\\u003c")}</script>
  <style>
    :root{font:16px/1.55 system-ui,sans-serif;--ink:#20252b;--muted:#4f585f;--line:#d9d2c5;--accent:#8f3420;--panel:#fffdf8;--bg:#f5f1e8;color:var(--ink);background:var(--bg)}
    @media (prefers-color-scheme: dark){:root{--ink:#ece7dd;--muted:#b4aca0;--line:#4a443b;--accent:#f0a183;--panel:#26231f;--bg:#1a1815}}
    *{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--bg)}
    main{max-width:760px;margin:auto;padding:2rem 1rem 3rem}
    h1{font-size:clamp(1.7rem,5vw,2.5rem);line-height:1.15;margin:0 0 .75rem}
    p.lede{font-size:1.1rem;color:var(--muted);margin-top:0}
    section{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:1.25rem;margin:1.25rem 0}
    h2{margin:0 0 .5rem;font-size:1.2rem}
    a{color:var(--accent)}
    a.cta{display:inline-block;padding:.7rem 1.2rem;border-radius:8px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600}
    @media (prefers-color-scheme: dark){a.cta{color:#1a1815}}
    ol.items{columns:2;column-gap:2rem;padding-left:1.4rem}@media (max-width:520px){ol.items{columns:1}}
    .muted{color:var(--muted);font-size:.9rem}
    footer{color:var(--muted);font-size:.85rem;border-top:1px solid var(--line);padding-top:1rem;margin-top:2rem}
  </style>
</head>
<body>
<main>
  <p class="muted"><a href="./">Quick Pick</a> / <a href="rank.html">rank a list</a> / ${esc(page.title.toLowerCase())}</p>
  <h1>${esc(page.title)}</h1>
  <p class="lede">${esc(page.lede)}</p>
  <p><a class="cta" href="${esc(link)}" data-event="use_page_start">Start ranking this list &rarr;</a></p>
  <p class="muted">Opens the free ranker with the list below already filled in. Change it there with "Start over", or <a href="rank.html">paste your own list</a>.</p>

  <section>
    <h2>The starter list</h2>
    <p class="muted">Question: "${esc(page.question)}"</p>
    <ol class="items">${parseList(page.items.join("\n")).map((i) => `<li>${esc(i)}</li>`).join("")}</ol>
  </section>

  <section>
    <h2>Why picking pairs works here</h2>
    <ul>${page.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
    <p><strong>What it doesn't do:</strong> ${esc(page.caveat)}</p>
  </section>

  <section>
    <h2>Compared with what you'd use today</h2>
    <p>${esc(page.alternatives)}</p>
    <p class="muted">Under the hood: a Bradley-Terry model refit after every answer, an adaptive question picker, and a stop rule checked against simulated respondents, including ones whose picks are close calls. <a href="https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/quick-pick-survey/docs/RANK-PAGE.md">The method and its measurements</a>.</p>
  </section>

  <p class="muted">More ready lists: ${others}</p>

  <footer>
    <p><strong>Disclaimer.</strong> A ranking inferred from a limited number of picks is a statistical estimate, not a fact. Don't use it as the sole basis for a hiring, financial, medical or relationship decision.</p>
    <p><strong>No warranty.</strong> This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, financial, medical or professional advice. You are responsible for reviewing its output before relying on it. MIT licensed (<a href="LICENSE">licence</a>).</p>
    <p>This page counts one anonymous event in your browser's local storage when you start a list (nothing about you or the list; off with Do Not Track, Global Privacy Control, or the switch on the <a href="rank.html">ranker</a>).</p>
    <p><a href="./">About Quick Pick</a> &middot; <a href="https://github.com/sponsors/Duncan-Haywood">Sponsor the creator</a></p>
  </footer>
</main>
<script type="module">
  import { record } from "./usage.mjs";
  record("use_page_viewed:${page.slug}");
  document.querySelector("a.cta").addEventListener("click", () => record("use_page_start:${page.slug}"));
</script>
</body>
</html>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const page of USE_PAGES) writeFileSync(join(SITE, `${page.slug}.html`), renderUsePage(page));
  console.log(`wrote ${USE_PAGES.length} pages`);
}
export { SITE };
