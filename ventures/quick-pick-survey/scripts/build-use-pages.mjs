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
    shortlist: { k: 3, label: "Only need the 3 to build next? Find your top 3" },
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
    shortlist: { k: 3, label: "Down to a final three? Find your top 3" },
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
  {
    slug: "use-team-goals",
    title: "Prioritise team goals or OKRs by picking pairs",
    description: "Too many objectives for one quarter? Each person answers 'which matters more this quarter?' between two goals at a time, then you combine the picks into one order with the contested goals flagged. Free.",
    lede: "A planning meeting with twelve candidate objectives usually ends with eight of them \"top priority\". Choosing between two goals at a time forces the trade-off the meeting avoided, and the team's order falls out of everyone's answers.",
    question: "Which goal matters more this quarter?",
    items: ["Cut churn", "Launch in a new market", "Ship the self-serve plan", "Reduce support backlog", "Hire two engineers", "Improve onboarding", "Raise prices", "Pay down tech debt", "Win three enterprise deals", "Improve site speed", "Start a partner programme", "Get SOC 2 ready"],
    why: [
      "Each person answers alone before the meeting, so the plan starts from everyone's view rather than the first person to speak.",
      "The team table shows each goal's 90% rank range two ways: for these people, and for the wider group they stand for. A goal whose range runs from 2nd to 10th is one the team has not agreed on yet.",
      "The agreement score (0 to 1) and each goal's best-to-worst place across people show whether you have one plan or two camps.",
    ],
    caveat: "It ranks what people think matters, not what is feasible. Size the work separately, and put hard commitments (a contract, a legal deadline) outside the list rather than letting a vote rank them.",
    alternatives: "Dot voting on a whiteboard, a shared spreadsheet with 1 to 5 scores, or a paid planning tool. Scores cluster at the top and dot votes follow whoever goes first; pairwise picks give a full order and show the disagreement instead of averaging it away.",
  },
  {
    slug: "use-customer-pain-points",
    title: "Rank customer pain points by picking pairs: a free MaxDiff alternative",
    description: "Ask a handful of customers 'which is the bigger problem for you?' between two pain points at a time, then combine their result codes into one ranked list with rank ranges. Free, nothing uploaded.",
    lede: "\"How much of a problem is this, 1 to 5?\" gets you a column of 4s. MaxDiff surveys fix that by making people choose, but the tools cost money. Asking which of two problems is bigger makes the same trade-off, and a few customers' answers give an order.",
    shortlist: { k: 3, label: "Only need the 3 to fix first? Find each customer's top 3" },
    question: "Which is the bigger problem for you?",
    items: ["Setup takes too long", "Too expensive for what it does", "Reports are hard to read", "Missing integrations", "Slow customer support", "Hard to train new staff", "Data export is clunky", "Mobile app is limited", "Too many notifications", "Unclear pricing tiers"],
    why: [
      "Send the link to the customers you interview. Each answers on their own phone and sends you back a short result code; paste the codes in to combine them.",
      "The \"wider\" rank range estimates the order for the customers your respondents stand for, not just these people, so you can see how much a handful of answers settles.",
      "Nothing about the respondents is collected: no names, emails or accounts. You get only the codes they choose to send.",
    ],
    caveat: "It is built for a handful to a few dozen respondents who paste codes back, not a panel of thousands, and it is not a market-research sample. Write each pain point in the customer's words, or you rank your own framing.",
    alternatives: "MaxDiff modules in paid survey tools, 1 to 5 rating questions in a free form builder, or reading interview notes. Ratings don't force a choice; paid MaxDiff does but costs a subscription. This asks the same kind of forced choice for free.",
  },
  {
    slug: "use-wedding-priorities",
    title: "Decide your wedding priorities together, two at a time",
    description: "Before you set the budget, each of you answers 'which matters more for our wedding?' between two things at a time, then compare codes to see where you agree and where you differ. Free, private, no sign-up.",
    lede: "Wedding budgets go wrong when every line feels essential. Picking which of two things matters more is quick, and doing it separately shows each of you what the other actually cares about before the deposits go down.",
    question: "Which matters more for our wedding?",
    items: ["The venue", "Photography", "Food and drink", "Inviting everyone we want", "Music or a band", "Flowers and decor", "The dress or suit", "A honeymoon", "Video", "The date we want", "Staying within budget", "Guests' travel being easy"],
    why: [
      "You each answer alone on your own phone, then paste each other's result codes to see one combined order and the items you rank far apart.",
      "Each item's best-to-worst place across the two of you points straight at the conversation to have.",
      "Nothing is uploaded: the list travels in the link and your answers stay in your browser.",
    ],
    caveat: "It ranks what you care about, not what things cost. Use the order to decide where the money goes, then price it.",
    alternatives: "Wedding budget worksheets, planning apps with checklists, or a long talk. A worksheet starts from costs; this starts from what each of you would give up first.",
  },
  {
    slug: "use-home-must-haves",
    title: "Rank your house-hunting must-haves before you start viewing",
    description: "Answer 'which matters more in our next home?' between two features at a time, alone or with a partner, and get a ranked list of must-haves with how settled each place is. Free, in the browser.",
    lede: "Everyone's list of must-haves is longer than any house. Deciding which of two matters more (a shorter commute or a bigger garden?) tells you what to hold out for and what to give up when the right house is missing something.",
    question: "Which matters more in our next home?",
    items: ["Short commute", "Good schools nearby", "A garden or yard", "Off-street parking", "An extra bedroom", "A home office", "Walkable shops and cafes", "Quiet street", "Move-in ready, no renovation", "Lower price", "Natural light", "Close to family"],
    why: [
      "Edit the list first: add the features you are actually weighing and remove the ones you don't care about.",
      "If you are buying with someone, each answers alone and you combine codes; the table shows the features you split on.",
      "The rank range says which places your answers settle and which are close calls, so you know where you are flexible.",
    ],
    caveat: "It is a way to sort out preferences, not financial or property advice. Price, survey results and what you can borrow come first.",
    alternatives: "Checklists from property sites and house-hunting worksheets. A checklist treats every item as yes or no; ranking pairs tells you which yes to trade away.",
  },
  {
    slug: "use-book-club-next-read",
    title: "Pick your book club's next read: rank the shortlist together",
    description: "Send the shortlist to the club. Everyone answers 'which would you rather read next?' between two books at a time, then paste the codes back for one order. Free, no accounts, works on any phone.",
    lede: "A show of hands picks the book with the loudest fan. Ranking pairs gives everyone the same weight, and the combined order tells you the next two or three reads, not just one.",
    question: "Which would you rather read next?",
    items: ["Middlemarch", "The Remains of the Day", "Beloved", "Pride and Prejudice", "One Hundred Years of Solitude", "The Left Hand of Darkness", "Rebecca", "Things Fall Apart", "The Count of Monte Cristo", "Frankenstein"],
    why: [
      "Each member weighs the same however many questions they answered, so nobody's enthusiasm counts twice.",
      "The agreement score says whether the club wants the same kind of book or is split, and the best-to-worst column marks the divisive picks.",
      "Swap in your own shortlist: titles, genres or themes all work.",
    ],
    caveat: "It ranks what people would rather read, not what is available at the library or in paperback. Drop titles that are hard to get first.",
    alternatives: "Polls in a group chat or a reading app's poll. A poll gives each person one vote and hides second choices; pairwise picks use everyone's whole order.",
  },
  {
    slug: "use-todo-priorities",
    title: "Prioritise a to-do list when everything feels urgent",
    description: "Stuck on a long to-do list? Answer 'which should I do first?' between two tasks at a time and get an ordered list with the close calls marked. An Eisenhower matrix alternative, free and private.",
    lede: "When every task feels important, sorting the whole list is paralysing. Choosing which of two to do first takes a second each, and a few dozen of those choices give you an order you can start on.",
    question: "Which should I do first?",
    items: ["Reply to the overdue emails", "Finish the quarterly report", "Book the dentist", "File expense receipts", "Prepare for Monday's meeting", "Fix the leaking tap", "Call the bank about the fee", "Update my CV", "Plan next week's meals", "Clear the inbox", "Renew the car insurance", "Back up my laptop"],
    why: [
      "Replace the starter tasks with your own; paste a list straight from your notes app, one task per line (bullets are stripped).",
      "\"Be sure of the favourite\" mode spends its questions on the front-runners when you only need to know what to start on.",
      "Nothing leaves your browser, so work and personal tasks can share the list.",
    ],
    caveat: "It orders the tasks by what you judge more pressing in each pair; it does not know your deadlines. Put tasks with a fixed date first yourself.",
    alternatives: "An Eisenhower matrix, numbering tasks 1 to 3, or a task app's priority flags. Those ask you to label each task in isolation; comparing two at a time is easier when everything feels like a 1.",
  },
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const HUB_SLUG = "ready-lists";
export const HUB = {
  title: "Ready lists to rank by picking pairs",
  description: "Starter lists that open a free pairwise ranker already filled in: a backlog, team goals, customer pain points, values, names, trips, a wedding, a house hunt, a book club pick, a to-do list.",
};

export function rankLink(page, { mode, k } = {}) {
  return `rank.html#l=${encodeList({ title: page.question, items: parseList(page.items.join("\n")), mode, k })}`;
}

/** The page's "find my top k" link, when a shortlist is a common job for its list. */
export function shortlistLink(page) {
  return page.shortlist ? rankLink(page, { mode: "top", k: page.shortlist.k }) : null;
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
${page.shortlist ? `  <p><a href="${esc(shortlistLink(page))}" data-event="use_page_shortlist">${esc(page.shortlist.label)} &rarr;</a> <span class="muted">(asks about the options near the cut instead of the whole order; <a href="how-many-pairwise-comparisons.html">how many picks that takes</a>)</span></p>
` : ""}  <p class="muted">Opens the free ranker with the list below already filled in. Change it there with "Start over", or <a href="rank.html">paste your own list</a>.</p>

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

  <p class="muted">More ready lists: ${others} &middot; <a href="${HUB_SLUG}.html">all ready lists</a></p>

  <footer>
    <p><strong>Disclaimer.</strong> A ranking inferred from a limited number of picks is a statistical estimate, not a fact. Don't use it as the sole basis for a hiring, financial, medical or relationship decision.</p>
    <p><strong>No warranty.</strong> This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, financial, medical or professional advice. You are responsible for reviewing its output before relying on it. FSL-1.1-MIT licensed (<a href="LICENSE">licence</a>).</p>
    <p>This page counts anonymous events in your browser's local storage: a view of the page and, if you click through, a start (nothing about you or the list; off with Do Not Track, Global Privacy Control, or the switch on the <a href="rank.html">ranker</a>).</p>
    <p><a href="./">About Quick Pick</a> &middot; <a href="https://github.com/sponsors/Duncan-Haywood">Sponsor the creator</a></p>
  </footer>
</main>
<script type="module">
  import { record } from "./usage.mjs";
  record("use_page_viewed:${page.slug}");
  document.querySelector("a.cta").addEventListener("click", () => record("use_page_start:${page.slug}"));${page.shortlist ? `
  document.querySelector('a[data-event="use_page_shortlist"]').addEventListener("click", () => record("use_page_shortlist:${page.slug}"));` : ""}
</script>
</body>
</html>
`;
}

export function renderHub() {
  const ld = JSON.stringify({ "@context": "https://schema.org", "@type": "CollectionPage", name: HUB.title, description: HUB.description, url: `${BASE}${HUB_SLUG}.html`, hasPart: USE_PAGES.map((p) => ({ "@type": "WebPage", name: p.title, url: `${BASE}${p.slug}.html` })) });
  const page = renderUsePage(USE_PAGES[0]);
  const head = page.slice(page.indexOf("  <style>"), page.indexOf("</head>"));
  const foot = page.slice(page.indexOf("  <footer>"), page.indexOf("</main>"));
  return `<!doctype html>
<!-- GENERATED by scripts/build-use-pages.mjs. Edit the lists there, then run it. -->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(HUB.title)} | Quick Pick</title>
  <meta name="description" content="${esc(HUB.description)}">
  <link rel="canonical" href="${BASE}${HUB_SLUG}.html">
  <meta property="og:title" content="${esc(HUB.title)}">
  <meta property="og:description" content="${esc(HUB.description)}">
  <script type="application/ld+json">${ld.replace(/</g, "\\u003c")}</script>
${head}</head>
<body>
<main>
  <p class="muted"><a href="./">Quick Pick</a> / <a href="rank.html">rank a list</a> / ready lists</p>
  <h1>${esc(HUB.title)}</h1>
  <p class="lede">Each page opens the free ranker with a starter list already filled in. Edit the list to fit, answer "this or that?" a few dozen times, and send the link to anyone whose picks you want combined.</p>
${USE_PAGES.map((p) => `  <section>
    <h2><a href="${p.slug}.html">${esc(p.title)}</a></h2>
    <p>${esc(p.description)}</p>
    <p class="muted">Question: "${esc(p.question)}" &middot; ${parseList(p.items.join("\n")).length} starter options &middot; <a href="${esc(rankLink(p))}">start now &rarr;</a></p>
  </section>`).join("\n")}

  <p class="muted">Or <a href="rank.html">paste your own list</a>. <a href="how-many-pairwise-comparisons.html">How many pairwise comparisons does a list take?</a></p>

${foot}</main>
<script type="module">
  import { record } from "./usage.mjs";
  record("use_page_viewed:${HUB_SLUG}");
</script>
</body>
</html>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const page of USE_PAGES) writeFileSync(join(SITE, `${page.slug}.html`), renderUsePage(page));
  writeFileSync(join(SITE, `${HUB_SLUG}.html`), renderHub());
  console.log(`wrote ${USE_PAGES.length} pages and ${HUB_SLUG}.html`);
}
export { SITE };
