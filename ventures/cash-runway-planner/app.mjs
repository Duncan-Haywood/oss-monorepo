import { encodeInputs, decodeInputs } from './share.mjs';

// How many one-off rows the page carries. The rows are written into the HTML
// rather than created at runtime, so the form's field set is the same on every
// visit: the saved-bid band injected by the Pages build compares a restored
// field set against the form's in both directions and refuses a restore that
// differs, which a form that grew rows would fail.
export const MAX_ITEMS = 8;
// Rows visible before "Add another row" is pressed.
export const VISIBLE_ITEMS = 3;
const MAX_WEEKS = 52;

const money = (value) => {
  const format = (value) => `$${Number(value).toFixed(2)}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};

// Item descriptions are typed by the visitor and rendered into innerHTML, so
// they are escaped on the way out. A description that is markup renders as the
// characters typed.
export function escapeText(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

// The week a forecast row falls in, as a date. Week 1 is the week the visitor
// is looking at the page: a bill "in week 7" is a fact about the calendar, and
// an owner deciding whether to move it needs to know which week that is.
export function weekStart(week, from = new Date()) {
  const date = new Date(from.getTime());
  date.setDate(date.getDate() + (Number(week) - 1) * 7);
  return date;
}

function checkItems(items, span) {
  for (const [index, item] of items.entries()) {
    const amount = Number(item.amount);
    const week = Number(item.week);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`One-off row ${index + 1}: enter an amount above zero.`);
    }
    if (!Number.isInteger(week) || week < 1 || week > span) {
      throw new Error(`One-off row ${index + 1}: week must be a whole number from 1 to ${span}.`);
    }
    if (item.kind !== 'in' && item.kind !== 'out') {
      throw new Error(`One-off row ${index + 1}: choose money in or money out.`);
    }
  }
}

// Reads the one-off rows out of the flat form data. Returns only the rows the
// visitor actually filled in.
export function parseItems(data, weeks = 12) {
  const span = Number(weeks);
  // A forecast length that is itself invalid is `forecast`'s error to report,
  // in its own words. Skipping the range check here keeps a blank length field
  // from being explained to the visitor as a problem with row 1.
  const bounded = Number.isInteger(span) && span >= 1;
  const items = [];
  for (let index = 1; index <= MAX_ITEMS; index += 1) {
    const name = String(data[`item${index}Name`] ?? '').trim();
    const rawAmount = String(data[`item${index}Amount`] ?? '').trim();
    const rawWeek = String(data[`item${index}Week`] ?? '').trim();
    const kind = String(data[`item${index}Kind`] ?? 'out').trim() || 'out';
    if (!name && !rawAmount && !rawWeek) continue;
    // A half-filled row is a figure the visitor meant to include. Dropping it
    // silently would forecast a business they do not have, and they would never
    // learn the row was ignored -- the same failure the fractional collection
    // delay used to have.
    if (!rawAmount) throw new Error(`One-off row ${index} needs an amount, or clear the row.`);
    if (!rawWeek) throw new Error(`One-off row ${index} needs the week it lands in.`);
    const amount = Number(rawAmount);
    const week = Number(rawWeek);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`One-off row ${index}: enter an amount above zero.`);
    }
    if (!Number.isInteger(week) || week < 1) {
      throw new Error(`One-off row ${index}: week must be a whole number from 1.`);
    }
    if (bounded && week > span) {
      throw new Error(`One-off row ${index} lands in week ${week}, past this ${span}-week forecast. Lengthen the forecast or move the row.`);
    }
    if (kind !== 'in' && kind !== 'out') {
      throw new Error(`One-off row ${index}: choose money in or money out.`);
    }
    items.push({ name: name || (kind === 'in' ? 'Money in' : 'Money out'), amount, week, kind });
  }
  return items;
}

export function forecast({ cash, weeklyIncome, collectionWeeks, weeklyCosts, weeks = 12, items = [] }) {
  const [startingCash, incomePerWeek, delayWeeks, costsPerWeek] = [cash, weeklyIncome, collectionWeeks, weeklyCosts].map(Number);
  const values = [startingCash, incomePerWeek, delayWeeks, costsPerWeek];
  if (values.some((value) => !Number.isFinite(value) || value < 0) || delayWeeks > 52) {
    throw new Error('Enter non-negative numbers; collection delay must be 52 weeks or less.');
  }
  // The delay is compared against a whole-week index below, so a fraction is
  // silently rounded up: 1.5 weeks forecasts identically to 2 and the visitor
  // never learns their number was ignored. Reject it instead of quietly
  // answering a different question than the one they asked.
  if (!Number.isInteger(delayWeeks)) {
    throw new Error('Collection delay must be a whole number of weeks.');
  }
  const span = Number(weeks);
  if (!Number.isInteger(span) || span < 1) {
    throw new Error('Forecast length must be a whole number of weeks, at least 1.');
  }
  if (span > MAX_WEEKS) {
    throw new Error(`Forecast length must be ${MAX_WEEKS} weeks or less.`);
  }
  checkItems(items, span);
  let balance = startingCash;
  return Array.from({ length: span }, (_, index) => {
    const week = index + 1;
    const landing = items.filter((item) => Number(item.week) === week);
    const oneOffIn = landing.filter((item) => item.kind === 'in').reduce((sum, item) => sum + Number(item.amount), 0);
    const oneOffOut = landing.filter((item) => item.kind === 'out').reduce((sum, item) => sum + Number(item.amount), 0);
    const income = (index >= delayWeeks ? incomePerWeek : 0) + oneOffIn;
    const costs = costsPerWeek + oneOffOut;
    balance += income - costs;
    return { week, income, costs, balance, items: landing };
  });
}

export function status(rows) {
  if (!rows.length) throw new Error('At least one forecast week is required.');
  const low = rows.reduce((best, row) => row.balance < best.balance ? row : best, rows[0]);
  // The lowest week is not the week that matters. Cash runs out the first time
  // the balance goes negative, which can be weeks before the trough -- that is
  // the date the owner has to move an invoice or a bill in front of.
  const firstShortfall = rows.find((row) => row.balance < 0);
  return { lowest: low.balance, week: low.week, shortfall: low.balance < 0, shortfallWeek: firstShortfall?.week ?? null };
}

// Every contiguous run of negative-balance weeks in the forecast, in order.
// A forecast can dip negative, recover, and dip again -- a mid-year cost
// spike after an early one resolves is the ordinary case for a seasonal
// business, not an edge case.
function negativeRuns(rows) {
  const runs = [];
  let index = 0;
  while (index < rows.length) {
    if (rows[index].balance < 0) {
      let end = index;
      while (end + 1 < rows.length && rows[end + 1].balance < 0) end += 1;
      runs.push({ startIndex: index, endIndex: end });
      index = end + 1;
    } else {
      index += 1;
    }
  }
  return runs;
}

// Naming the week cash runs out tells an owner they have a problem. It does
// not tell them what to do about it, which is the only reason they opened the
// page. This names the single payment whose date would close the gap, and --
// when nothing dated can close it -- says so plainly instead of offering a
// move that only postpones the same week.
//
// A forecast can carry more than one shortfall: cash recovers after the first
// dip and then runs short again later, from a second cost spike or a delayed
// invoice. `status()` reports the single deepest week across the whole
// forecast, but that week can fall inside a *later* run than the first one --
// so a plan that only ever looked at the first run could name a "low point"
// week that does not match the headline lowest balance at all, and would say
// nothing about the dip that headline balance is actually reporting. This
// returns one plan per run, each measured against its own trough, so every
// shortfall gets its own answer.
export function shortfallPlans(rows, { items = [], weeklyIncome = 0, weeklyCosts = 0 } = {}) {
  if (!rows.length) throw new Error('At least one forecast week is required.');
  const recurringGap = Number(weeklyCosts) - Number(weeklyIncome);
  const structural = recurringGap > 0;
  // A payment already named as the fix for an earlier shortfall is not a free
  // lever for a later one too -- moving one bill cannot close two different
  // gaps at once, and suggesting that would overstate what either move does.
  const usedOutflow = new Set();
  const usedInflow = new Set();

  return negativeRuns(rows).map(({ startIndex, endIndex }) => {
    const run = rows.slice(startIndex, endIndex + 1);
    const trough = run.reduce((worst, row) => row.balance < worst.balance ? row : worst, run[0]);
    // What has to be found: the deepest point of this run of negative weeks,
    // not the first week's gap. Covering only the first week leaves the owner
    // short again a fortnight later, which is the shortfall they came here to
    // avoid.
    const deficit = -trough.balance;

    // Delaying a payment lifts every week from its own week onward, so it can
    // only help the deficit this plan reports -- the trough, not the first
    // negative week -- when it lands at or before that trough. A payment that
    // lands after the run starts but still inside the window (say, a tax bill
    // in week 3 of a run that first went negative in week 2) still deepens the
    // trough and is still a lever to name, not a payment to ignore.
    const outflow = items
      .filter((item) => item.kind === 'out' && Number(item.week) <= trough.week && !usedOutflow.has(item))
      .sort((a, b) => Number(b.amount) - Number(a.amount))[0] ?? null;
    // Pulling money in only helps if it is not already inside the gap.
    const inflow = items
      .filter((item) => item.kind === 'in' && Number(item.week) > trough.week && !usedInflow.has(item))
      .sort((a, b) => Number(a.week) - Number(b.week) || Number(b.amount) - Number(a.amount))[0] ?? null;
    if (outflow) usedOutflow.add(outflow);
    if (inflow) usedInflow.add(inflow);

    const withVerdict = (item) => item && { ...item, amount: Number(item.amount), week: Number(item.week), clears: Number(item.amount) >= deficit };
    return {
      week: rows[startIndex].week,
      troughWeek: trough.week,
      recoveryWeek: endIndex + 1 < rows.length ? rows[endIndex + 1].week : null,
      runEndWeek: rows[endIndex].week,
      deficit,
      structural,
      recurringGap: structural ? recurringGap : 0,
      delay: withVerdict(outflow),
      pullForward: withVerdict(inflow),
    };
  });
}

// The single earliest shortfall, for callers that only ever handled one.
export function shortfallPlan(rows, options) {
  return shortfallPlans(rows, options)[0] ?? null;
}

export function csv(rows) {
  // The item column exists because a spreadsheet copy that shows $9,000 leaving
  // in week 7 without saying it was the tax bill is a worse document than the
  // page it came from.
  const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
  return ['week,income,costs,projected_balance,one_off_items', ...rows.map((row) =>
    [
      row.week,
      row.income.toFixed(2),
      row.costs.toFixed(2),
      row.balance.toFixed(2),
      quote((row.items ?? []).map((item) => `${item.name} ${item.kind === 'in' ? '+' : '-'}${Number(item.amount).toFixed(2)}`).join('; ')),
    ].join(','))].join('\n');
}

if (typeof document !== 'undefined') {
  const form = document.querySelector('#forecast');
  const output = document.querySelector('#output');
  const usage = document.querySelector('#usage');
  // Storage can throw outright when a browser is set to block site data. That
  // is a preference, not a failure: the forecast still works, so a blocked
  // write must never take down the render that follows it.
  const store = (key, value) => { try { localStorage.setItem(key, value); } catch { /* site data blocked */ } };
  const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const countable = () => usage.checked && !navigator.doNotTrack && !navigator.globalPrivacyControl;
  const bump = (key) => { if (countable()) store(key, String(Number(read(key) || 0) + 1)); };
  const showError = (error) => {
    output.innerHTML = `<strong>Check the figures</strong><p>${escapeText(error.message)}</p>`;
  };
  const rowNode = (index) => document.querySelector(`#item-row-${index}`);
  const rowFilled = (index) => [`item${index}Name`, `item${index}Amount`, `item${index}Week`]
    .some((name) => String(form.elements[name]?.value ?? '').trim() !== '');
  const revealRow = (index) => { const node = rowNode(index); if (node) node.hidden = false; };
  const shown = () => {
    let count = VISIBLE_ITEMS;
    for (let index = 1; index <= MAX_ITEMS; index += 1) if (rowNode(index) && !rowNode(index).hidden) count = index;
    return count;
  };

  const planLines = (plans, span) => {
    if (!plans.length) return `<p>No projected negative balance in this ${span}-week window.</p>`;
    // A forecast can carry more than one shortfall run -- cash recovers after
    // the first dip, then runs short again later. Each gets its own heading
    // and its own delay/pull-forward suggestion.
    const lines = plans.map((plan, index) => {
      const heading = index === 0 ? 'First projected shortfall' : `Shortfall ${index + 1}`;
      const parts = [
        `<p>${heading}: <strong>week ${plan.week}</strong>. You are ${money(plan.deficit)} short at the low point (week ${plan.troughWeek}).</p>`,
      ];
      if (plan.delay) {
        const move = plan.recoveryWeek ? `past week ${plan.runEndWeek}` : 'out of this window';
        parts.push(`<p>Moving <strong>${escapeText(plan.delay.name)}</strong> (${money(plan.delay.amount)}, week ${plan.delay.week}) ${move} ${
          plan.delay.clears ? 'closes the gap.' : `covers ${money(plan.delay.amount)} of it.`}</p>`);
      }
      if (plan.pullForward) {
        parts.push(`<p>Collecting <strong>${escapeText(plan.pullForward.name)}</strong> (${money(plan.pullForward.amount)}, due week ${plan.pullForward.week}) before week ${plan.week} ${
          plan.pullForward.clears ? 'closes the gap.' : `covers ${money(plan.pullForward.amount)} of it.`}</p>`);
      }
      if (!plan.delay && !plan.pullForward) {
        parts.push('<p>Nothing dated is available to move. Bring collection forward or move a cost out before that week.</p>');
      }
      return parts.join('');
    });
    if (plans[0].structural) {
      // Saying "move the tax bill" to someone whose weekly costs exceed their
      // weekly collections sells them a week. They need to hear the real
      // shape. Structural is a property of the whole forecast, the same for
      // every run, so it is said once rather than repeated after each one.
      lines.push(`<p><strong>This is not a timing problem.</strong> Week to week you spend ${money(plans[0].recurringGap)} more than you collect, so moving one payment postpones each shortfall rather than fixing it.</p>`);
    }
    return lines.join('');
  };

  const save = (event) => {
    if (event) event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    let rows;
    let result;
    let items;
    try {
      items = parseItems(data, data.weeks ?? 12);
      rows = forecast({ ...data, items });
      result = status(rows);
    } catch (error) {
      showError(error);
      return;
    }
    const plans = shortfallPlans(rows, { items, weeklyIncome: data.weeklyIncome, weeklyCosts: data.weeklyCosts });
    const today = new Date();
    output.innerHTML = `<strong>${result.shortfall ? 'Cash shortfall' : 'Cash stays positive'}</strong>`
      + `<p>Lowest projected balance: ${money(result.lowest)} in week ${result.week}.</p>`
      + planLines(plans, rows.length)
      + `<ol>${rows.map((row) => {
        const dated = weekStart(row.week, today).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        const note = row.items.length
          ? ` — ${escapeText(row.items.map((item) => `${item.name} ${item.kind === 'in' ? '+' : '-'}${Number(item.amount).toFixed(2)}`).join(', '))}`
          : '';
        return `<li>Week ${row.week} (w/c ${dated}): ${row.income ? `+${money(row.income)} collected, ` : ''}-${money(row.costs)} costs, balance ${money(row.balance)}${note}</li>`;
      }).join('')}</ol>`;
    store('cash-runway-draft', JSON.stringify(data));
    bump('cash-runway-events');
    if (items.length) bump('cash-runway-item-events');
  };

  // A shared link takes priority over a local draft: someone who opens a link
  // a colleague sent them wants that colleague's figures, not whatever they
  // themselves last typed on this device.
  const fromLink = decodeInputs(location.hash || location.search);
  const sharedLink = Object.keys(fromLink).length > 0;
  let saved = fromLink;
  if (!sharedLink) {
    try { saved = JSON.parse(read('cash-runway-draft') || 'null'); } catch { saved = null; }
  }
  if (saved) Object.entries(saved).forEach(([key, value]) => { const field = form.elements[key]; if (field) field.value = value; });
  // A restored draft that used row 5 has to show row 5. Otherwise the forecast
  // includes a payment the visitor cannot see, edit, or remove.
  for (let index = VISIBLE_ITEMS + 1; index <= MAX_ITEMS; index += 1) if (rowFilled(index)) revealRow(index);
  // The whole point of opening a shared link is seeing the forecast, not
  // re-entering numbers to see it -- run it immediately.
  if (sharedLink) save();

  form.addEventListener('submit', save);
  document.querySelector('#add-item')?.addEventListener('click', () => {
    const next = shown() + 1;
    if (next > MAX_ITEMS) return;
    revealRow(next);
    if (next >= MAX_ITEMS) { const button = document.querySelector('#add-item'); if (button) button.hidden = true; }
  });
  // Download is a plain button, so it bypasses the form's own validation. A
  // bad figure used to throw here and leave a button that visibly did nothing.
  document.querySelector('#download').addEventListener('click', () => {
    let rows;
    try {
      const data = Object.fromEntries(new FormData(form));
      rows = forecast({ ...data, items: parseItems(data, data.weeks ?? 12) });
    } catch (error) {
      showError(error);
      return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv' }));
    link.download = 'cash-runway-forecast.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    bump('cash-runway-csv-events');
  });
  document.querySelector('#reset').addEventListener('click', () => {
    try { localStorage.removeItem('cash-runway-draft'); } catch { /* site data blocked; the reset still clears the form */ }
    form.reset();
    output.textContent = 'Enter your numbers to see the forecast.';
  });
  // A share link has to reproduce the sender's forecast exactly, including
  // which one-off rows are filled in -- not just the four headline numbers --
  // or the recipient sees a different shortfall than the one they were sent.
  document.querySelector('#share')?.addEventListener('click', async () => {
    const status = document.querySelector('#shareStatus');
    const data = Object.fromEntries(new FormData(form));
    const query = encodeInputs(data);
    history.replaceState(null, '', `${location.pathname}#${query}`);
    try {
      await navigator.clipboard.writeText(location.href);
      if (status) status.textContent = 'Link copied — it reopens this forecast with the same figures.';
    } catch {
      if (status) status.textContent = 'Link is in your address bar — copy it to share this forecast.';
    }
    bump('cash-runway-share-events');
  });
}
