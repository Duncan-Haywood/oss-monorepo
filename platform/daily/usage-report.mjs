// Daily and weekly "how are usage and income going" blog posts, composed only
// from files committed under portfolio/ (owner request, 2026-11-02: "daily and
// weekly reports on how monetization and usage is going blog post").
//
// Pure functions: build.mjs reads the files and writes docs/posts/. Nothing
// here is typed by hand. A source that is missing is said to be missing, a
// day the counter was not yet running is "not counted", and a day after it
// started with no row is a counted zero.

/** Prefixed keys in site-visits.json are breakdowns of the same loads, never pages. */
const BREAKDOWN = { 'ref:': 'channels', 'src:': 'sources', 'geo:': 'countries', 'dev:': 'devices', 'bot:': 'bots' };

export const SITE = 'https://marisstella.app/';

/** Human names for the site's own pages; any other slug is a tool page. */
const PAGE_NAMES = {
  c: 'the catalogue',
  ask: 'Ask (the assistant page)',
  about: 'About',
  feedback: 'Feedback',
  writing: 'the blog',
};

export const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const daysBetween = (from, to) => {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

const add = (o, k, n) => { o[k] = (o[k] || 0) + n; };
const sortDesc = (o) => Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

/** One day's row → { pages, loads, channels, sources, countries, devices, bots, crawled }. */
export function dayStats(row = {}) {
  const s = { pages: {}, loads: 0, channels: {}, sources: {}, countries: {}, devices: {}, bots: {}, crawled: 0 };
  for (const [key, n] of Object.entries(row)) {
    if (!Number.isInteger(n) || n < 0) continue;
    if (key.startsWith('botpage:')) { s.crawled += 1; continue; } // distinct pages a crawler fetched
    const prefix = Object.keys(BREAKDOWN).find((p) => key.startsWith(p));
    if (prefix) { add(s[BREAKDOWN[prefix]], key.slice(prefix.length), n); continue; }
    if (key.includes(':')) continue; // a breakdown this reader does not know yet
    add(s.pages, key, n);
    s.loads += n;
  }
  return s;
}

/** The first day any key with `prefix` appears: when that breakdown started being recorded. */
export const firstKeyDay = (visitDays, prefix) =>
  Object.keys(visitDays).sort().find((d) => Object.keys(visitDays[d] || {}).some((k) => k.startsWith(prefix))) ?? null;

/** Sum of dayStats over `days`; `counted` is how many of them the counter was running for. */
export function windowStats(visitDays, days, firstDay, firstBotDay = firstKeyDay(visitDays, 'bot:')) {
  const total = dayStats({});
  total.perDay = [];
  total.counted = 0;
  for (const day of days) {
    const running = firstDay != null && day >= firstDay;
    const s = dayStats(visitDays[day] || {});
    total.perDay.push({ day, running, loads: running ? s.loads : null, bots: running && firstBotDay != null && day >= firstBotDay ? Object.values(s.bots).reduce((a, b) => a + b, 0) : null });
    if (!running) continue;
    total.counted += 1;
    total.loads += s.loads;
    total.crawled = Math.max(total.crawled, s.crawled);
    for (const k of ['pages', 'channels', 'sources', 'countries', 'devices', 'bots']) {
      for (const [x, n] of Object.entries(s[k])) add(total[k], x, n);
    }
  }
  return total;
}

/**
 * Income on file. `ledger` is the latest month's ledger text (YAML; only
 * `mrr_end:` lines are read), `funding` is .github/FUNDING.yml's text,
 * `income` is portfolio/usage/income.json (may be null).
 */
export function incomeFacts({ ledger = '', ledgerName = null, funding = '', income = null } = {}) {
  const mrr = [...ledger.matchAll(/^\s*mrr_end:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  const positive = mrr.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const channels = [];
  if (/^\s*github:\s*\S/m.test(funding)) channels.push('GitHub Sponsors');
  if (/^\s*buy_me_a_coffee:\s*\S/m.test(funding)) channels.push('Buy Me a Coffee');
  if (/^\s*ko_fi:\s*\S/m.test(funding)) channels.push('Ko-fi');
  if (/^\s*open_collective:\s*\S/m.test(funding)) channels.push('Open Collective');
  const entries = Array.isArray(income?.entries) ? income.entries.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e?.day || '') && Number.isFinite(e?.amount_usd)) : [];
  return {
    ledgerName,
    ledgerEntries: mrr.length,
    ledgerRecorded: mrr.filter((v) => v !== 'null' && v !== '~').length,
    ledgerMrr: positive.reduce((a, b) => a + b, 0),
    ledgerPaying: positive.length,
    channels,
    entries,
  };
}

/** Income entries (from income.json) whose day falls in `days`. */
const incomeIn = (facts, days) => {
  const set = new Set(days);
  const hit = facts.entries.filter((e) => set.has(e.day));
  return { count: hit.length, usd: hit.reduce((a, e) => a + e.amount_usd, 0) };
};

const fmt = (n) => (n == null ? 'n/a' : n.toLocaleString('en-US'));
const usd = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pageLink = (slug) => `[${PAGE_NAMES[slug] || slug}](${SITE}${slug}/)`;
const list = (o, k = 5, label = (x) => x) => sortDesc(o).slice(0, k).map(([x, n]) => `${label(x)} ${fmt(n)}`).join(', ') || 'none';
const longDay = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const pct = (a, b) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%` : 'no earlier baseline');

function change(now, before, unit) {
  if (before == null) return 'There is no earlier period to compare with.';
  if (now === before) return `Flat on the period before (${fmt(before)} ${unit}).`;
  return `${now > before ? 'Up' : 'Down'} from ${fmt(before)} ${unit} in the period before (${pct(now, before)}).`;
}

function incomeSection(facts, days, label, short = false) {
  const lines = ['## Income', ''];
  const got = incomeIn(facts, days);
  if (got.count) {
    lines.push(`${fmt(got.count)} payment(s) totalling ${usd(got.usd)} are recorded for ${label} in \`portfolio/usage/income.json\`.`);
  } else if (short) {
    lines.push(`None recorded for ${label}; the ledger shows ${facts.ledgerPaying ? usd(facts.ledgerMrr) : '$0'} of recurring revenue. [What counts as recorded](${ABOUT}).`);
    return lines;
  } else {
    lines.push(`No income is recorded for ${label}. Everything in the catalogue is free and full-featured; the open ways to pay are ${facts.channels.join(' and ') || 'none on file'}, and their balances sit in the owner's accounts, so a payment shows here only once it is written into \`portfolio/usage/income.json\`.`);
  }
  if (facts.ledgerName) {
    lines.push('');
    lines.push(facts.ledgerPaying
      ? `The ledger (\`${facts.ledgerName}\`) records ${usd(facts.ledgerMrr)} of monthly recurring revenue across ${fmt(facts.ledgerPaying)} product(s).`
      : `The ledger (\`${facts.ledgerName}\`) records no recurring revenue: ${fmt(facts.ledgerRecorded)} of its ${fmt(facts.ledgerEntries)} entries state \`mrr_end\` and every stated value is 0.`);
  }
  return lines;
}

function coverage(split, loads, since) {
  const n = Object.values(split).reduce((a, b) => a + b, 0);
  return n < loads && since ? ` (recorded for ${fmt(n)} of the ${fmt(loads)} loads: this split started on ${since})` : '';
}

function audienceLines(s, since = {}) {
  const out = [];
  out.push(`- **Where readers came from** (kind of referring site): ${list(s.sources)}. Loads with no referrer are not split out.`);
  out.push(`- **Countries:** ${list(s.countries, 6)}${coverage(s.countries, s.loads, since.geo)}.`);
  out.push(`- **Devices:** ${list(s.devices)}${coverage(s.devices, s.loads, since.dev)}.`);
  if (Object.keys(s.channels).length) out.push(`- **Tagged channel links:** ${list(s.channels)}.`);
  const bots = Object.values(s.bots).reduce((a, b) => a + b, 0);
  out.push(`- **Crawler beacons** (not page loads, not people): ${fmt(bots)}${bots ? ` (${list(s.bots, 4)})` : ''}${since.bot && s.perDay?.some((d) => d.running && d.day < since.bot) ? `; counted only from ${since.bot}` : ''}.`);
  return out;
}

const sinceOf = (visits) => ({ geo: firstKeyDay(visits, 'geo:'), dev: firstKeyDay(visits, 'dev:'), bot: firstKeyDay(visits, 'bot:') });

export const ABOUT = `${SITE}writing/daily-and-weekly-usage-and-income-reports/`;

const METHOD = 'Counts come from the site\'s first-party, cookieless counter (`platform/counter/`), copied into `portfolio/usage/site-visits.json`. A page load is one browser opening one page; it is not a person, and nothing identifies anyone. Browsers sending Do Not Track or Global Privacy Control are not counted. Written by `platform/daily/usage-report-build.mjs` from committed files only.';

const frontMatter = ({ title, date, description, tags }) => [
  '---',
  `title: ${JSON.stringify(title)}`,
  `date: ${date}`,
  `tags: [${tags.join(', ')}]`,
  `description: ${JSON.stringify(description)}`,
  '---',
  '',
];

/** The daily post for `day` (a complete UTC day), published on `date`. */
export function composeDaily({ day, date = addDays(day, 1), visits, feedback = [], income, firstDay }) {
  const s = windowStats(visits, [day], firstDay);
  const prior = windowStats(visits, daysBetween(addDays(day, -7), addDays(day, -1)), firstDay);
  const avg = prior.counted ? prior.loads / prior.counted : null;
  const top = sortDesc(s.pages);
  const notes = feedback.filter((f) => f?.day === day).length;
  const running = s.counted === 1;
  const loads = running ? s.loads : null;
  const got = incomeIn(income, [day]);
  const money = got.count ? `${usd(got.usd)} in` : '$0 recorded';
  const title = running
    ? `Usage and income, ${longDay(day)}: ${fmt(loads)} page load${loads === 1 ? '' : 's'}, ${money}`
    : `Usage and income, ${longDay(day)}: not yet counted`;
  const lead = top[0] ? ` The most-opened page was ${PAGE_NAMES[top[0][0]] || top[0][0]}.` : '';
  const description = (running ? `${fmt(loads)} counted page loads on the site on ${day}.${lead}` : `The site counter was not running on ${day}.`).slice(0, 160);
  const lines = frontMatter({ title, date, description, tags: ['usage-report', 'daily-report', 'usage', 'monetization'] });
  lines.push(`The daily reading for ${longDay(day)} (UTC): how many times people opened pages on [the site](${SITE}), which ones, and whether any money came in. The [weekly reports](${SITE}writing/?tag=weekly-report) add the trend.`, '');
  lines.push('## Usage', '');
  if (!running) {
    lines.push('The counter had not started on this day, so there is nothing to report.');
  } else {
    lines.push(`**${fmt(loads)} page load${loads === 1 ? '' : 's'}** across ${fmt(top.length)} page${top.length === 1 ? '' : 's'}. ${avg == null ? 'There is no earlier week to compare with.' : `The ${fmt(prior.counted)} counted day(s) before averaged ${avg.toFixed(1)}, so this day was ${pct(loads, avg)} on that.`}`, '');
    if (top.length) {
      lines.push('| Page | Loads |', '|---|---:|');
      for (const [slug, n] of top.slice(0, 10)) lines.push(`| ${pageLink(slug)} | ${fmt(n)} |`);
      if (top.length > 10) lines.push(`| ${fmt(top.length - 10)} other page(s) | ${fmt(top.slice(10).reduce((a, [, n]) => a + n, 0))} |`);
      lines.push('');
    }
    lines.push(...audienceLines(s, sinceOf(visits)));
    lines.push(`- **Feedback-form messages:** ${fmt(notes)}.`, '');
  }
  lines.push(...incomeSection(income, [day], 'this day', true), '');
  lines.push(`Counted by the site's cookieless counter; page loads are not people. [How these reports are made](${ABOUT}).`, '');
  return { name: `${date}-usage-and-income-${day}.md`, text: lines.join('\n') };
}

/** The weekly post for the seven UTC days ending on `end`, published on `date`. */
export function composeWeekly({ end, date = addDays(end, 1), visits, feedback = [], income, firstDay }) {
  const days = daysBetween(addDays(end, -6), end);
  const before = daysBetween(addDays(end, -13), addDays(end, -7));
  const s = windowStats(visits, days, firstDay);
  const p = windowStats(visits, before, firstDay);
  const top = sortDesc(s.pages);
  const seenBefore = new Set(Object.keys(windowStats(visits, daysBetween(firstDay || end, addDays(end, -7)), firstDay).pages));
  const fresh = top.filter(([slug]) => !seenBefore.has(slug));
  const notes = feedback.filter((f) => days.includes(f?.day)).length;
  const got = incomeIn(income, days);
  const title = `Usage and income, week to ${longDay(end).replace(/^\w+, /, '')}: ${fmt(s.loads)} page loads, ${got.count ? `${usd(got.usd)} in` : '$0 recorded'}`;
  const description = `${fmt(s.loads)} counted page loads over the week to ${end}${p.counted === 7 ? ` (${pct(s.loads, p.loads)} on the week before)` : ''}; ${got.count ? `${usd(got.usd)} of income` : 'no income recorded'}.`.slice(0, 160);
  const lines = frontMatter({ title, date, description, tags: ['usage-report', 'weekly-report', 'usage', 'monetization'] });
  lines.push(`The weekly reading for ${days[0]} to ${end} (UTC): how use of [the site](${SITE}) moved, what people opened, and what money came in. Each day also has a [daily report](${SITE}writing/?tag=daily-report).`, '');
  lines.push('## Usage', '');
  const partial = s.counted < 7 ? ` The counter ran on ${fmt(s.counted)} of the 7 days.` : '';
  const cmp = !p.counted
    ? 'There is no earlier counted week to compare with.'
    : p.counted < 7
      ? `The week before was counted on only ${fmt(p.counted)} of its 7 days (${fmt(p.loads)} loads), too little to compare with.`
      : change(s.loads, p.loads, 'loads');
  lines.push(`**${fmt(s.loads)} page loads** across ${fmt(top.length)} pages.${partial} ${cmp}`, '');
  lines.push('| Day | Page loads | Crawler beacons |', '|---|---:|---:|');
  for (const d of s.perDay) lines.push(`| ${d.day} | ${d.running ? fmt(d.loads) : 'not counted'} | ${d.bots == null ? 'not counted' : fmt(d.bots)} |`);
  lines.push('');
  if (top.length) {
    lines.push('Most-opened pages (the last column reads n/a until a whole earlier week was counted):', '', '| Page | Loads | Week before |', '|---|---:|---:|');
    for (const [slug, n] of top.slice(0, 10)) lines.push(`| ${pageLink(slug)} | ${fmt(n)} | ${p.counted === 7 ? fmt(p.pages[slug] || 0) : 'n/a'} |`);
    lines.push('');
  }
  if (fresh.length) lines.push(`First counted this week: ${fresh.slice(0, 10).map(([slug]) => pageLink(slug)).join(', ')}.`, '');
  lines.push(...audienceLines(s, sinceOf(visits)));
  lines.push(`- **Feedback-form messages:** ${fmt(notes)}.`, '');
  lines.push(...incomeSection(income, days, 'this week'), '');
  lines.push('## How this is counted', '', METHOD, '');
  return { name: `${date}-usage-and-income-week-to-${end}.md`, text: lines.join('\n') };
}
