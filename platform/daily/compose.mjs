// Turns one day's facts (collect.mjs) into two scripts, each to read or hear:
//
//   - brief: the ~15-minute morning brief for an engineering manager who owns
//     the whole repository (health, decisions, every area that moved, the
//     agent fleet, a watch list),
//   - show: "The Merge Report", a few light minutes on the same day for the
//     general technical public.
//
// Deterministic: the same facts always give the same words, so a script can be
// tested and rebuilt. No model writes them. The show's jokes are framing only:
// every number and every title in it is copied from the facts.

export const WORDS_PER_MINUTE = 150;
const BRIEF_MAX_WORDS = 2400; // ~16 minutes aloud

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const usd = (v) => `$${v.toFixed(2)}`;
const pct = (v) => `${Math.round(v * 100)}%`;
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00 UTC`;
export const longDate = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const weekday = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
const some = (xs, n = 10) => (xs.length > n ? [...xs.slice(0, n), `${xs.length - n} more`] : xs);
const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const sentence = (s) => (/[.!?…]$/.test(s) ? s : `${s}.`);

export function wordCount(script) {
  let n = 0;
  for (const s of script.sections) {
    n += s.heading.split(/\s+/).length;
    for (const b of s.blocks) {
      const texts = b.items ? b.items.map((i) => i.text) : [b.text];
      for (const t of texts) n += t.split(/\s+/).filter(Boolean).length;
    }
  }
  return n;
}

const p = (text) => ({ text });
const ul = (items) => ({ items });
/** A title without the "slug: " or "research/slug: " prefix its group heading already says. */
export function within(title, name) {
  const re = new RegExp(`^(research[/(]|venture[s]?/)?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)?:\\s*`, 'i');
  const t = title.replace(re, '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : title;
}
const item = (m, { detail = false, group = null } = {}) => {
  const title = group ? within(m.title, group) : m.title;
  return { text: detail && m.detail && m.detail !== m.title ? `${sentence(title)} ${m.detail}` : title, pr: m.pr };
};

function comparison(f) {
  if (f.baseline_merges_per_day == null || f.baseline_merges_per_day === 0) return '';
  const diff = f.merges - f.baseline_merges_per_day;
  const rel = Math.abs(diff) / f.baseline_merges_per_day;
  if (rel < 0.1) return `, in line with the seven-day average of ${f.baseline_merges_per_day}`;
  return `, ${pct(rel)} ${diff > 0 ? 'above' : 'below'} the seven-day average of ${f.baseline_merges_per_day}`;
}

function groupBlocks(groups, { perGroup, maxGroups, details, noun }) {
  const blocks = [];
  for (const g of groups.slice(0, maxGroups)) {
    blocks.push(p(`${g.name}: ${plural(g.merges.length, 'merge')}.`));
    blocks.push(ul(g.merges.slice(0, perGroup).map((m, i) => item(m, { detail: details && i === 0, group: g.name }))));
    if (g.merges.length > perGroup) blocks.push(p(`Plus ${plural(g.merges.length - perGroup, `more ${noun} change`)}.`));
  }
  const rest = groups.slice(maxGroups);
  if (rest.length) {
    const n = rest.reduce((s, g) => s + g.merges.length, 0);
    blocks.push(p(`Also touched, ${plural(n, 'merge')} in all: ${list(rest.map((g) => g.name))}.`));
  }
  return blocks;
}

function briefAt(f, level) {
  const sections = [];
  const archive = !f.snapshot;

  // 1. Bottom line
  const areas = [
    f.products.length && plural(f.products.length, 'product'),
    f.research.length && plural(f.research.length, 'research project'),
    f.writing.length && plural(f.writing.length, 'blog post change'),
  ].filter(Boolean);
  const red = f.snapshot?.red_on_main;
  const bottom = [
    p(`Good morning. This is the engineering brief for ${longDate(f.day)}: everything that merged to main between midnight and midnight UTC, and what needs you.`),
    p(f.merges
      ? `${plural(f.merges, 'pull request')} merged${comparison(f)}. Together they changed ${plural(f.files_changed, 'file')}, adding ${f.lines_added.toLocaleString('en-US')} lines and removing ${f.lines_removed.toLocaleString('en-US')}.${areas.length ? ` The work reached ${list(areas)}.` : ''}`
      : 'Nothing merged to main that day.'),
  ];
  const head = [];
  if (red) head.push(red.length ? `${plural(red.length, 'workflow')} ${red.length === 1 ? 'is' : 'are'} red on main as of this build` : 'every workflow is green on main as of this build');
  if (f.reverts.length) head.push(`${plural(f.reverts.length, 'revert')} landed`);
  if (f.new_ventures.length) head.push(`${plural(f.new_ventures.length, 'new product')} joined the catalogue`);
  if (f.new_research.length) head.push(`${plural(f.new_research.length, 'new research project')} started`);
  if (f.asks?.length) head.push(`${plural(f.asks.length, 'decision')} still ${f.asks.length === 1 ? 'waits' : 'wait'} on the owner`);
  if (head.length) bottom.push(p(`The headlines: ${list(head)}.`));
  sections.push({ id: 'bottom-line', heading: 'The bottom line', blocks: bottom });

  // 2. Health
  const health = [];
  if (f.snapshot) {
    const s = f.snapshot;
    if (red?.length) {
      health.push(p(`Red on main right now: ${list(red.map((r) => `${r.workflow}, red for ${r.hours} hours`))}. That is the first thing to look at.`));
    } else if (red) {
      health.push(p('Main is green: no workflow’s latest run on main failed.'));
    }
    if (s.ci_pass_share != null) health.push(p(`Over the last fourteen days, ${pct(s.ci_pass_share)} of CI runs that reached a verdict passed${s.ci_failed_14d != null ? `, with ${plural(s.ci_failed_14d, 'failed run')}` : ''}.${s.worst_workflows?.length ? ` The workflows failing most: ${list(s.worst_workflows.map((w) => `${w.name} (${w.failed} failed)`))}.` : ''}`));
    if (s.main_recovery_p50 != null) health.push(p(`When main goes red, the median time to green again is ${s.main_recovery_p50} hours.`));
    if (s.open_prs) health.push(p(`${plural(s.open_prs.count, 'pull request')} ${s.open_prs.count === 1 ? 'is' : 'are'} open, ${s.open_prs.drafts ?? 0} of them drafts; ${s.open_prs.older_than_7d} ${s.open_prs.older_than_7d === 1 ? 'is' : 'are'} older than a week, and the oldest has waited ${s.open_prs.oldest_days} days.${s.pr_cycle_p50 != null ? ` The median pull request merges ${s.pr_cycle_p50} hours after it opens.` : ''}${s.first_try_green != null ? ` ${pct(s.first_try_green)} of branches go green on their first commit.` : ''}`));
    if (s.branches != null) health.push(p(`There are ${plural(s.branches, 'branch', 'branches')} on the remote.`));
  } else {
    health.push(p('This edition is from the archive, so the CI and pull-request state of that day was not recorded; the live numbers are in the newest edition and on the development dashboard.'));
  }
  if (f.reverts.length) {
    health.push(p(`Reverts: ${plural(f.reverts.length, 'merge')} undid earlier work.`));
    health.push(ul(f.reverts.map((m) => item(m))));
  }
  if (f.fix_forwards.length) {
    health.push(p(`Fix-forwards: ${plural(f.fix_forwards.length, 'merge')} repaired a red main or a failing check without reverting.`));
    health.push(ul(f.fix_forwards.slice(0, level.perGroup).map((m) => item(m, { detail: level.details }))));
  }
  if (!f.reverts.length && !f.fix_forwards.length) health.push(p('No reverts and no fix-forwards of a red main that day.'));
  sections.push({ id: 'health', heading: 'Health: CI, main and the queue', blocks: health });

  // 3. Decisions
  if (f.asks) {
    const asks = f.asks;
    const blocks = asks.length
      ? [
        p(`${plural(asks.length, 'decision')} only the owner can make ${asks.length === 1 ? 'is' : 'are'} queued. In the decision queue’s own order, highest leverage first:`),
        ul(asks.slice(0, level.asks).map((a) => ({ text: `${a.id}, waiting ${a.age_days ?? 'an unknown number of'} days${a.gates ? `, gates ${a.gates}` : ''}${a.blocked ? ', blocked by another ask' : ''}: ${a.action}` }))),
      ]
      : [p('The owner’s decision queue is empty.')];
    if (asks.length > level.asks) blocks.push(p(`The other ${asks.length - level.asks} are listed by the decision-queue tool.`));
    sections.push({ id: 'decisions', heading: 'Decisions waiting on you', blocks });
  }

  // 4-7. Areas
  if (f.products.length) {
    const blocks = [p(`Work landed on ${plural(f.products.length, 'product')}, ${plural(f.products.reduce((s, g) => s + g.merges.length, 0), 'merge')} in all.${f.new_ventures.length ? ` New in the catalogue: ${list(some(f.new_ventures))}.` : ''}`)];
    sections.push({ id: 'products', heading: 'Products', blocks: blocks.concat(groupBlocks(f.products, { ...level, noun: 'product' })) });
  }
  if (f.research.length) {
    const blocks = [p(`${plural(f.research.length, 'research project')} moved.${f.new_research.length ? ` Started that day: ${list(some(f.new_research))}.` : ''}`)];
    sections.push({ id: 'research', heading: 'Research', blocks: blocks.concat(groupBlocks(f.research, { ...level, noun: 'research' })) });
  }
  if (f.writing.length) {
    sections.push({ id: 'writing', heading: 'Writing', blocks: [p(`${plural(f.writing.length, 'merge')} touched the blog${f.new_posts.length ? `, with ${plural(f.new_posts.length, 'new post')}` : ''}.`), ul(f.writing.map((m) => item(m, { detail: level.details })))] });
  }
  const plumbing = [
    ...f.platform.map((g) => ({ name: `platform/${g.name}`, merges: g.merges })),
    ...(f.ci.length ? [{ name: 'CI and automation', merges: f.ci }] : []),
    ...(f.process.length ? [{ name: 'process, prompts and the ledger', merges: f.process }] : []),
  ].sort((a, b) => b.merges.length - a.merges.length);
  if (plumbing.length) {
    const n = plumbing.reduce((s, g) => s + g.merges.length, 0);
    sections.push({ id: 'platform', heading: 'Platform, CI and process', blocks: [p(`${plural(n, 'merge')} changed the machinery the products and research run on.`)].concat(groupBlocks(plumbing, { ...level, noun: 'platform' })) });
  }

  // 8. Fleet
  const r = f.runs;
  const fleet = [];
  if (f.agents.length) fleet.push(p(`By co-author: ${list(f.agents.map(([a, n]) => `${a} on ${plural(n, 'merge')}`))}.`));
  if (r.runs) {
    fleet.push(p(`${plural(r.runs, 'agent run')} filed a run record for the day. By track: ${list(r.by_track.map(([t, n]) => `${t} ${n}`))}. By outcome: ${list(r.by_outcome.map(([o, n]) => `${o} ${n}`))}.`));
    if (r.api_usd != null) fleet.push(p(`The ${plural(r.measured, 'run')} with measured usage came to ${usd(r.api_usd)} at API list prices, an equivalent rather than a charge, over ${plural(r.active_minutes, 'active minute')}.`));
    if (r.errors.length) fleet.push(p(`Runs recorded ${plural(r.errors.length, 'error')}; the first: ${sentence(String(r.errors[0]).slice(0, 200))}`));
    if (r.friction.length) {
      fleet.push(p('Documentation that cost runs time, most reported first:'));
      fleet.push(ul(r.friction.slice(0, 3).map((x) => ({ text: `${x.file}, ${plural(x.n, 'report')}${x.issue ? `: ${sentence(x.issue.slice(0, 200))}` : ''}` }))));
    }
  } else {
    fleet.push(p('No run records are dated that day.'));
  }
  sections.push({ id: 'fleet', heading: 'The agent fleet', blocks: fleet });

  // 9. What the runs said
  if (r.notes.length && level.notes) {
    sections.push({ id: 'notes', heading: 'In the runs’ own words', blocks: [p('A few notes runs left in their records, verbatim:'), ul(r.notes.slice(0, level.notes).map((n) => ({ text: sentence(n.length > 280 ? `${n.slice(0, 280).replace(/\s+\S*$/, '')}…` : n) })))] });
  }

  // 10. Watch list
  const watch = [];
  if (red?.length) watch.push(`Get ${red[0].workflow} green on main.`);
  if (f.reverts.length) watch.push(`Check why ${f.reverts.length === 1 ? 'the revert' : 'the reverts'} happened before the same change lands again.`);
  if (r.friction[0]) watch.push(`${r.friction[0].file} keeps slowing runs down; a clearer page there pays back on every run.`);
  if (f.snapshot?.open_prs?.older_than_7d) watch.push(`${plural(f.snapshot.open_prs.older_than_7d, 'pull request')} older than a week: land or close.`);
  const topAsk = f.asks?.[0];
  if (topAsk) watch.push(`The highest-leverage owner decision, ${topAsk.id}, has waited ${topAsk.age_days} days.`);
  if (!watch.length) watch.push('Nothing flagged. Keep shipping.');
  sections.push({ id: 'watch', heading: 'Watch list', blocks: [ul(watch.map((text) => ({ text }))), p(`That’s the brief for ${weekday(f.day)}. Every item links to its pull request on the page.${archive ? '' : ' The numbers come from git, the run records and the CI snapshot taken when this page was built.'}`)] });

  return { kind: 'brief', title: `Engineering brief, ${longDate(f.day)}`, day: f.day, sections };
}

const LEVELS = [
  { perGroup: 8, maxGroups: 40, details: true, asks: 6, notes: 6 },
  { perGroup: 5, maxGroups: 30, details: true, asks: 5, notes: 4 },
  { perGroup: 4, maxGroups: 20, details: false, asks: 5, notes: 3 },
  { perGroup: 3, maxGroups: 18, details: false, asks: 5, notes: 3 },
  { perGroup: 3, maxGroups: 14, details: false, asks: 4, notes: 2 },
  { perGroup: 2, maxGroups: 10, details: false, asks: 3, notes: 0 },
];

/** The EM brief: the most detailed version that still fits in about fifteen minutes aloud. */
export function composeBrief(f) {
  let script;
  for (const level of LEVELS) {
    script = briefAt(f, level);
    if (wordCount(script) <= BRIEF_MAX_WORDS) break;
  }
  const words = wordCount(script);
  return { ...script, words, minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)) };
}

// ---------------------------------------------------------------------------
// The Merge Report

/** A stable small integer from a string, so a day always gets the same lines. */
export function seed(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}
const pick = (pool, s, salt) => pool[seed(`${s}:${salt}`) % pool.length];

const STOP = new Set('with from into that this than then they them their there what when were your have will just only also each more most some such over under after before about which while page pages adds add added check checks first fix fixes record records track milestone research process main does doesn should using used make makes keep keeps calculator calculators tool tools venture ventures their'.split(' '));

export function wordOfTheDay(titles) {
  const counts = {};
  for (const t of titles) {
    for (const w of new Set(t.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/))) {
      if (w.length >= 5 && !STOP.has(w)) counts[w] = (counts[w] ?? 0) + 1;
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best && best[1] > 1 ? { word: best[0], n: best[1] } : null;
}

const OPENERS = [
  'Welcome back to The Merge Report, the daily show about a software studio whose staff never sleep, never take lunch, and never stop opening pull requests.',
  'Good evening and welcome to The Merge Report, where we read the commit log so you don’t have to.',
  'This is The Merge Report, coming to you live from the main branch of an open-source monorepo run mostly by AI agents.',
  'Welcome to The Merge Report. Grab a coffee. The agents won’t; they run on tokens.',
];
const CALM = [
  'No reverts, no fires, no red-faced rollbacks. Suspiciously calm. We’ll be watching.',
  'Plot twist: there was no plot twist. Nothing got reverted. The robots behaved.',
  'Not a single revert all day. Somewhere, a CI pipeline is quietly proud of itself.',
];
const SIGNOFFS = [
  'That’s the show. Same branch, same time tomorrow.',
  'That’s all from the main branch. Merge responsibly.',
  'That’s The Merge Report. Remember: it’s not shipped until it’s merged.',
  'We’re out of airtime and the agents are out of excuses. See you tomorrow.',
];

export function composeShow(f) {
  const d = f.day;
  const sections = [];
  const every = f.merges ? Math.round((24 * 60) / f.merges) : null;
  const open = [p(pick(OPENERS, d, 'open'))];
  if (f.merges) {
    open.push(p(`On ${weekday(d)}, ${longDate(d).replace(/^\w+,?\s+/, '')}, the agents merged ${plural(f.merges, 'pull request')} into main${every && every < 120 ? `. That’s one roughly every ${plural(every, 'minute')}, around the clock` : ''}${comparison(f)}.`));
  } else {
    open.push(p(`On ${weekday(d)}, nothing merged into main at all. A rare day off, or a long thinking session. We may never know.`));
  }
  sections.push({ id: 'open', heading: 'Tonight', blocks: open });

  if (f.biggest) {
    const b = f.biggest;
    sections.push({ id: 'headline', heading: 'The headline', blocks: [p(`The biggest change of the day, by lines touched: “${b.title}”. It added ${b.lines_added.toLocaleString('en-US')} lines and removed ${b.lines_removed.toLocaleString('en-US')} across ${plural(b.files, 'file')}.${b.detail && b.detail !== b.title ? ` In its own words: ${b.detail}` : ''}`)], pr: b.pr });
  }

  const faces = [];
  if (f.new_ventures.length) faces.push(`${plural(f.new_ventures.length, 'new product')} joined the lineup: ${list(f.new_ventures.slice(0, 6))}${f.new_ventures.length > 6 ? ', and more' : ''}.`);
  if (f.new_research.length) faces.push(`The lab opened ${plural(f.new_research.length, 'new research project')}: ${list(f.new_research.slice(0, 5))}.`);
  if (f.new_posts.length) faces.push(`And the blog got ${plural(f.new_posts.length, 'new post')}.`);
  if (faces.length) sections.push({ id: 'faces', heading: 'New faces', blocks: faces.map(p) });

  if (f.products.length) {
    const top = f.products.slice(0, 3);
    sections.push({ id: 'products', heading: 'Product corner', blocks: [p(`${plural(f.products.length, 'product')} got attention. The busiest:`), ul(top.map((g) => ({ text: `${g.name}, ${plural(g.merges.length, 'merge')}, including “${within(g.merges[0].title, g.name)}”`, pr: g.merges[0].pr })))] });
  }
  if (f.research.length) {
    sections.push({ id: 'lab', heading: 'From the lab', blocks: [p(`Over in research, ${plural(f.research.length, 'project')} moved forward.`), ul(f.research.slice(0, 3).map((g) => ({ text: `“${g.merges[0].title}”`, pr: g.merges[0].pr })))] });
  }

  const twist = [];
  if (f.reverts.length) twist.push(p(`Plot twist: ${plural(f.reverts.length, 'change')} got reverted, including “${f.reverts[0].title}”. Undo is a feature.`));
  if (f.fix_forwards.length) twist.push(p(`And ${plural(f.fix_forwards.length, 'merge')} rushed in to fix something that had broken, which is the software equivalent of changing a tyre on the motorway.`));
  if (!twist.length) twist.push(p(pick(CALM, d, 'calm')));
  sections.push({ id: 'twist', heading: 'The plot twist', blocks: twist });

  const nums = [];
  const net = f.lines_added - f.lines_removed;
  if (f.merges) nums.push(`${f.lines_added.toLocaleString('en-US')} lines in, ${f.lines_removed.toLocaleString('en-US')} lines out: a net ${net >= 0 ? 'gain' : 'loss'} of ${Math.abs(net).toLocaleString('en-US')}.`);
  if (f.busiest_hour && f.busiest_hour.merges > 1) nums.push(`Rush hour was ${hourLabel(f.busiest_hour.hour)}, with ${plural(f.busiest_hour.merges, 'merge')} in sixty minutes.`);
  const quiet = f.hours.filter((h) => h === 0).length;
  if (f.merges && quiet) nums.push(`The quietest stretch: ${plural(quiet, 'hour')} with no merges at all.`);
  if (f.runs.api_usd != null) nums.push(`The measured agent runs used ${usd(f.runs.api_usd)} of compute at API list prices. That’s an equivalent, not a bill.`);
  if (nums.length) sections.push({ id: 'numbers', heading: 'By the numbers', blocks: nums.map(p) });

  const wotd = wordOfTheDay([
    ...f.products.flatMap((g) => g.merges), ...f.research.flatMap((g) => g.merges), ...f.platform.flatMap((g) => g.merges), ...f.writing, ...f.ci, ...f.process,
  ].map((m) => m.title));
  if (wotd) sections.push({ id: 'word', heading: 'Word of the day', blocks: [p(`Today’s word is “${wotd.word}”, which turned up in ${plural(wotd.n, 'pull request title')}. Use it in a sentence at standup.`)] });

  if (f.agents.length) {
    sections.push({ id: 'leaderboard', heading: 'The leaderboard', blocks: [p(`Merges by co-author: ${list(f.agents.map(([a, n]) => `${a} with ${n}`))}. ${f.agents.length > 1 ? `${f.agents[0][0]} takes the day.` : 'An undisputed champion.'}`)] });
  }

  sections.push({ id: 'signoff', heading: 'Sign-off', blocks: [p(pick(SIGNOFFS, d, 'off'))] });
  const script = { kind: 'show', title: `The Merge Report, ${longDate(d)}`, day: d, sections };
  const words = wordCount(script);
  return { ...script, words, minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)) };
}
