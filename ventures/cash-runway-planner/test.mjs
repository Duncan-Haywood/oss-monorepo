import assert from 'node:assert/strict';
import test from 'node:test';
import { forecast, status, csv, parseItems, shortfallPlan, shortfallPlans, weekStart, escapeText } from './app.mjs';

test('accumulates cash week by week instead of rewriting earlier weeks', () => {
  const rows = forecast({ cash: 5000, weeklyIncome: 1800, collectionWeeks: 2, weeklyCosts: 1400 });
  assert.equal(rows.length, 12);
  assert.equal(rows[0].balance, 3600);
  assert.equal(rows[1].balance, 2200);
  assert.equal(rows[2].income, 1800);
  assert.equal(rows[2].balance, 2600);
  assert.deepEqual(status(rows), { lowest: 2200, week: 2, shortfall: false, shortfallWeek: null });
  assert.match(csv(rows), /^week,income,costs,projected_balance,one_off_items\n1,0\.00,1400\.00,3600\.00,""/m);
});

test('rejects negative cash and collection delays over a year', () => {
  assert.throws(() => forecast({ cash: -1, weeklyIncome: 1, collectionWeeks: 0, weeklyCosts: 1 }));
  assert.throws(() => forecast({ cash: 1, weeklyIncome: 1, collectionWeeks: 53, weeklyCosts: 1 }));
});

test('rejects a fractional collection delay instead of silently rounding it up', () => {
  // index >= 1.5 is true from index 2, so 1.5 used to forecast exactly like 2
  // and the visitor was never told the number they typed had been ignored.
  assert.throws(
    () => forecast({ cash: 1000, weeklyIncome: 100, collectionWeeks: 1.5, weeklyCosts: 50 }),
    /whole number of weeks/,
  );
  assert.throws(() => forecast({ cash: 1000, weeklyIncome: 100, collectionWeeks: 1, weeklyCosts: 50, weeks: 0 }));
  assert.throws(() => forecast({ cash: 1000, weeklyIncome: 100, collectionWeeks: 1, weeklyCosts: 50, weeks: 4.5 }));
  assert.throws(
    () => forecast({ cash: 1000, weeklyIncome: 100, collectionWeeks: 1, weeklyCosts: 50, weeks: 53 }),
    /52 weeks or less/,
  );
});

test('names the first week cash goes negative, not just the trough', () => {
  // Collection lands in week 3, so the balance dips negative in week 2 and
  // recovers: the week to act on is 2, while the lowest week is 3.
  const rows = forecast({ cash: 100, weeklyIncome: 500, collectionWeeks: 3, weeklyCosts: 75, weeks: 4 });
  assert.deepEqual(rows.map((row) => row.balance), [25, -50, -125, 300]);
  assert.deepEqual(status(rows), { lowest: -125, week: 3, shortfall: true, shortfallWeek: 2 });
});

test('refuses to report on an empty forecast rather than reading undefined', () => {
  assert.throws(() => status([]), /At least one forecast week/);
});

test('a one-off bill lands in its own week and nowhere else', () => {
  // The whole reason this tool exists: a business that looks fine on a smooth
  // weekly average is short the week the quarterly tax bill clears.
  const items = [{ name: 'Quarterly tax', amount: 6000, week: 3, kind: 'out' }];
  const smooth = forecast({ cash: 5000, weeklyIncome: 1800, collectionWeeks: 0, weeklyCosts: 1400, weeks: 5 });
  const lumpy = forecast({ cash: 5000, weeklyIncome: 1800, collectionWeeks: 0, weeklyCosts: 1400, weeks: 5, items });
  assert.equal(status(smooth).shortfall, false);
  assert.deepEqual(lumpy.map((row) => row.balance), [5400, 5800, 200, 600, 1000]);
  assert.equal(lumpy[2].costs, 7400);
  assert.deepEqual(lumpy[2].items, items);
  assert.equal(lumpy[1].items.length, 0);
});

test('money in and money out land in the same week without cancelling in the wrong direction', () => {
  const rows = forecast({
    cash: 0, weeklyIncome: 0, collectionWeeks: 0, weeklyCosts: 0, weeks: 2,
    items: [
      { name: 'Deposit', amount: 900, week: 1, kind: 'in' },
      { name: 'Materials', amount: 400, week: 1, kind: 'out' },
    ],
  });
  assert.equal(rows[0].income, 900);
  assert.equal(rows[0].costs, 400);
  assert.equal(rows[0].balance, 500);
  assert.equal(rows[1].balance, 500);
});

test('rejects an item outside the forecast rather than dropping it from the answer', () => {
  const outside = [{ name: 'Tax', amount: 100, week: 20, kind: 'out' }];
  assert.throws(() => forecast({ cash: 1, weeklyIncome: 0, collectionWeeks: 0, weeklyCosts: 0, weeks: 12, items: outside }), /week must be a whole number from 1 to 12/);
  assert.throws(() => forecast({ cash: 1, weeklyIncome: 0, collectionWeeks: 0, weeklyCosts: 0, items: [{ name: 'x', amount: 0, week: 1, kind: 'out' }] }), /above zero/);
  assert.throws(() => forecast({ cash: 1, weeklyIncome: 0, collectionWeeks: 0, weeklyCosts: 0, items: [{ name: 'x', amount: 5, week: 1, kind: 'sideways' }] }), /money in or money out/);
});

test('parseItems reads filled rows and leaves blank ones alone', () => {
  const items = parseItems({
    item1Name: ' Quarterly tax ', item1Amount: '6000', item1Week: '3', item1Kind: 'out',
    item2Name: '', item2Amount: '', item2Week: '', item2Kind: 'out',
    item3Name: '', item3Amount: '2400', item3Week: '5', item3Kind: 'in',
  }, 12);
  assert.deepEqual(items, [
    { name: 'Quarterly tax', amount: 6000, week: 3, kind: 'out' },
    { name: 'Money in', amount: 2400, week: 5, kind: 'in' },
  ]);
});

test('parseItems refuses a half-filled row instead of silently ignoring it', () => {
  // A row with a week and no amount is a payment the visitor meant to include.
  // Skipping it would forecast a business they do not have and say nothing.
  assert.throws(() => parseItems({ item1Name: 'Tax', item1Week: '3', item1Amount: '' }, 12), /row 1 needs an amount/);
  assert.throws(() => parseItems({ item1Name: 'Tax', item1Amount: '600', item1Week: '' }, 12), /row 1 needs the week/);
  assert.throws(() => parseItems({ item1Amount: '600', item1Week: '2.5' }, 12), /whole number/);
  assert.throws(() => parseItems({ item1Amount: '600', item1Week: '30' }, 12), /past this 12-week forecast/);
});

test('parseItems leaves an invalid forecast length for forecast to explain', () => {
  // Otherwise a blank "forecast length" field is reported to the visitor as a
  // problem with row 1, which is not where they would go to fix it.
  assert.deepEqual(parseItems({ item1Amount: '600', item1Week: '30' }, ''), [
    { name: 'Money out', amount: 600, week: 30, kind: 'out' },
  ]);
});

test('the plan names the payment to move and whether moving it closes the gap', () => {
  const items = [
    { name: 'Quarterly tax', amount: 6000, week: 2, kind: 'out' },
    { name: 'Invoice 118', amount: 4000, week: 6, kind: 'in' },
  ];
  const rows = forecast({ cash: 3000, weeklyIncome: 1000, collectionWeeks: 0, weeklyCosts: 1000, weeks: 8, items });
  const plan = shortfallPlan(rows, { items, weeklyIncome: 1000, weeklyCosts: 1000 });
  assert.equal(plan.week, 2);
  assert.equal(plan.deficit, 3000);
  assert.equal(plan.delay.name, 'Quarterly tax');
  assert.equal(plan.delay.clears, true);
  assert.equal(plan.pullForward.name, 'Invoice 118');
  assert.equal(plan.pullForward.clears, true);
  // Income covers costs week to week, so this really is a timing problem.
  assert.equal(plan.structural, false);
});

test('the plan measures the deepest week of the run, not the first negative week', () => {
  // Covering only the first week's gap leaves the owner short again a
  // fortnight later, which is the shortfall they came here to avoid.
  const items = [{ name: 'Van', amount: 1000, week: 3, kind: 'out' }];
  const rows = forecast({ cash: 500, weeklyIncome: 0, collectionWeeks: 0, weeklyCosts: 400, weeks: 4, items });
  assert.deepEqual(rows.map((row) => row.balance), [100, -300, -1700, -2100]);
  const plan = shortfallPlan(rows, { items, weeklyIncome: 0, weeklyCosts: 400 });
  assert.equal(plan.week, 2);
  assert.equal(plan.troughWeek, 4);
  assert.equal(plan.deficit, 2100);
  assert.equal(plan.runEndWeek, 4);
  assert.equal(plan.recoveryWeek, null);
  // The van payment lands after the first negative week but at or before the
  // trough (week 4), so it still deepens the deficit this plan reports and
  // is still offered -- it just does not clear the whole gap on its own.
  assert.equal(plan.delay.name, 'Van');
  assert.equal(plan.delay.clears, false);
  assert.equal(plan.structural, true);
  assert.equal(plan.recurringGap, 400);
});

test('a payment that lands after the first negative week but at or before the trough is still offered', () => {
  // The run goes negative in week 2 from recurring costs alone. A tax bill
  // hits in week 3 -- inside the same run, before the deepest week -- and is
  // the single biggest lever the owner has. Because the deficit the plan
  // reports is the trough (week 5), not the first negative week, a payment
  // is eligible to fix it exactly when it lands at or before the trough --
  // not only when it lands at or before the run's first week.
  const items = [{ name: 'Tax bill', amount: 500, week: 3, kind: 'out' }];
  const rows = forecast({ cash: 100, weeklyIncome: 0, collectionWeeks: 0, weeklyCosts: 90, weeks: 5, items });
  assert.deepEqual(rows.map((row) => row.balance), [10, -80, -670, -760, -850]);
  const plan = shortfallPlan(rows, { items, weeklyIncome: 0, weeklyCosts: 90 });
  assert.equal(plan.week, 2);
  assert.equal(plan.troughWeek, 5);
  assert.equal(plan.deficit, 850);
  // The tax bill is inside the window (week 3 <= trough week 5) and is the
  // only dated item there, so it must be offered -- not reported as nothing
  // dated being available to move.
  assert.ok(plan.delay, 'a dated payment inside the shortfall window should be offered');
  assert.equal(plan.delay.name, 'Tax bill');
  assert.equal(plan.delay.clears, false);
});

test('a partial fix is named as partial rather than sold as a solution', () => {
  const items = [{ name: 'Insurance', amount: 500, week: 1, kind: 'out' }];
  const rows = forecast({ cash: 100, weeklyIncome: 0, collectionWeeks: 0, weeklyCosts: 800, weeks: 2, items });
  const plan = shortfallPlan(rows, { items, weeklyIncome: 0, weeklyCosts: 800 });
  assert.equal(plan.delay.name, 'Insurance');
  assert.equal(plan.delay.clears, false);
});

test('a healthy forecast has no plan at all', () => {
  const rows = forecast({ cash: 5000, weeklyIncome: 1800, collectionWeeks: 0, weeklyCosts: 1400 });
  assert.equal(shortfallPlan(rows, { items: [], weeklyIncome: 1800, weeklyCosts: 1400 }), null);
  assert.throws(() => shortfallPlan([]), /At least one forecast week/);
  assert.deepEqual(shortfallPlans(rows, { items: [], weeklyIncome: 1800, weeklyCosts: 1400 }), []);
});

test('a forecast that recovers and dips again gets a plan for each dip, not just the first', () => {
  // Income covers costs on its own (recurringGap is 0), so the two dips are
  // both timing problems caused entirely by the one-off rows: an early bill,
  // a deposit that patches it, then a second, larger bill after recovery.
  const items = [
    { name: 'Insurance', amount: 500, week: 2, kind: 'out' },
    { name: 'Deposit', amount: 600, week: 3, kind: 'in' },
    { name: 'Repair bill', amount: 700, week: 6, kind: 'out' },
  ];
  const rows = forecast({ cash: 0, weeklyIncome: 1000, collectionWeeks: 0, weeklyCosts: 1000, weeks: 8, items });
  assert.deepEqual(rows.map((row) => row.balance), [0, -500, 100, 100, 100, -600, -600, -600]);

  // The forecast's own headline low point (status()) falls inside the
  // *second* run -- a plan that only ever looked at the first run would name
  // a different "low point" week than the one the headline reports.
  assert.deepEqual(status(rows), { lowest: -600, week: 6, shortfall: true, shortfallWeek: 2 });

  const plans = shortfallPlans(rows, { items, weeklyIncome: 1000, weeklyCosts: 1000 });
  assert.equal(plans.length, 2);

  assert.equal(plans[0].week, 2);
  assert.equal(plans[0].troughWeek, 2);
  assert.equal(plans[0].deficit, 500);
  assert.equal(plans[0].recoveryWeek, 3);
  assert.equal(plans[0].delay.name, 'Insurance');
  assert.equal(plans[0].delay.clears, true);
  assert.equal(plans[0].pullForward.name, 'Deposit');
  assert.equal(plans[0].pullForward.clears, true);

  // The second run's trough (week 6) matches the headline lowest week above.
  assert.equal(plans[1].week, 6);
  assert.equal(plans[1].troughWeek, 6);
  assert.equal(plans[1].deficit, 600);
  assert.equal(plans[1].recoveryWeek, null);
  // Insurance already fixed the first shortfall -- it must not be offered a
  // second time as the lever for a different, later gap.
  assert.equal(plans[1].delay.name, 'Repair bill');
  assert.equal(plans[1].delay.clears, true);
  // The deposit already used for run 1 is not reoffered, and nothing else
  // dated lands after week 6.
  assert.equal(plans[1].pullForward, null);

  // shortfallPlan (singular) still answers only the first run, for callers
  // that never handled more than one.
  const single = shortfallPlan(rows, { items, weeklyIncome: 1000, weeklyCosts: 1000 });
  assert.deepEqual(single, plans[0]);
});

test('a payment already used to fix an earlier shortfall is not reoffered for a later one', () => {
  // The only "money out" row on the list lands early enough (week 2) to be a
  // candidate lever for both runs below. Offering it a second time would
  // claim the same bill closes two different gaps at once.
  const items = [
    { name: 'Bill', amount: 20, week: 2, kind: 'out' },
    { name: 'FixIt', amount: 50, week: 4, kind: 'in' },
  ];
  const rows = forecast({ cash: 15, weeklyIncome: 90, collectionWeeks: 0, weeklyCosts: 100, weeks: 8, items });
  assert.deepEqual(rows.map((row) => row.balance), [5, -25, -35, 5, -5, -15, -25, -35]);

  const plans = shortfallPlans(rows, { items, weeklyIncome: 90, weeklyCosts: 100 });
  assert.equal(plans.length, 2);
  assert.equal(plans[0].delay.name, 'Bill');
  // Run 1 already claimed "Bill"; run 2 has nothing else dated to offer.
  assert.equal(plans[1].delay, null);
  assert.equal(plans[0].pullForward.name, 'FixIt');
  // Both runs share the same structural, whole-forecast gap.
  assert.equal(plans[0].structural, true);
  assert.equal(plans[1].structural, true);
  assert.equal(plans[0].recurringGap, 10);
});

test('csv carries the one-off items and quotes a description containing a comma', () => {
  const items = [{ name: 'Tax, Q3', amount: 600, week: 1, kind: 'out' }];
  const rows = forecast({ cash: 1000, weeklyIncome: 0, collectionWeeks: 0, weeklyCosts: 0, weeks: 1, items });
  assert.equal(csv(rows).split('\n')[1], '1,0.00,600.00,400.00,"Tax, Q3 -600.00"');
});

test('week numbers carry the date they fall on', () => {
  const from = new Date('2026-09-01T12:00:00Z');
  assert.equal(weekStart(1, from).getTime(), from.getTime());
  assert.equal(weekStart(3, from).toISOString().slice(0, 10), '2026-09-15');
});

test('a description that is markup renders as the characters typed', () => {
  assert.equal(escapeText('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeText(`Tax & "fees" 'now'`), 'Tax &amp; &quot;fees&quot; &#39;now&#39;');
});
