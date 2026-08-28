// Moving a contractor's saved bids off one browser.
//
// Why this exists
// ---------------
// `jobs.mjs` keeps a finished bid so the tool still has it on Friday, and the
// hub's index answers "which of 162 tools priced it". Both of them stand on one
// `localStorage` key in one browser, and the hub's own copy says so plainly:
// "clearing your browser data clears them." That sentence is honest and it is
// also the whole problem — the portfolio's clearest return-visit feature has a
// single point of loss and, until this file, no way out of it:
//
//   - The contractor priced Tuesday's job on the phone and is at the desk on
//     Friday. The laptop's browser has never seen any of it.
//   - The phone is replaced, or the browser is reinstalled, or "clear browsing
//     data" is tapped to fix something unrelated.
//   - Safari's storage policy evicts script-written storage on a site the
//     visitor has not opened in seven days. A tool used once a fortnight is
//     exactly the shape these are.
//
// Any one of those ends with a blank form and a customer on the phone asking
// what the number was — the failure the saved-bid feature exists to prevent,
// arriving through the storage instead of through the tool.
//
// So: a file. `Download a backup` writes every saved bid on this device, plus
// the shop rates, into one JSON file the visitor keeps. `Restore from a backup`
// reads one back on any browser on this origin. No account, no server, no sync
// service — the same client-only shape as everything else here, and the only
// one available to a site that has nowhere to upload to and does not want one.
//
// Two rules shape the merge
// -------------------------
// **A restore never deletes.** The file is merged into what is already on the
// device, never written over it. Someone restoring last month's backup onto the
// phone that has this week's bids must not lose this week — and cannot be
// expected to know that in advance.
//
// **Nothing is dropped silently.** Names the file could not carry, entries that
// failed validation, and bids pushed past the 25-per-tool cap are all counted
// and reported back. The alternative is the defect this whole feature area
// keeps re-learning: a list that quietly stops looks exactly like a tool that
// forgot, and the visitor has no way to tell the two apart.
//
// Where the same job appears in both, the newer `at` wins the *numbers*, but
// not the decision: `resolveBidPair` resolves an outcome on its own clock,
// because marking a bid won does not re-price it and so does not move `at`.
//
// The pure functions live here and are tested here. The hub cannot import, so
// the two that decide what a bid *is* — `normalizeBid` and `mergeBids` — are
// embedded into its script as their own source rather than written out beside
// it. They were transcribed by hand once, and the copy went stale the day bids
// gained outcomes: see `BACKUP_MERGE_HELPERS`.

import { BID_RECORD_HELPERS, MAX_SAVED_BIDS, normalizeBid, stripForInjection } from './jobs.mjs';
import { normalizeRates, SHOP_RATE_FIELDS } from './rates.mjs';

/**
 * What the file says it is.
 *
 * Namespaced rather than a bare `portfolio-backup`, because the visitor picks
 * this file out of a Downloads folder with a file picker that will happily hand
 * us any JSON on the disk. A wrong file has to fail as "that is not one of
 * ours" and not as a half-import of something that happened to have a `bids`
 * key.
 */
export const BACKUP_KIND = 'monorepo-projects/saved-bids';

export const BACKUP_VERSION = 1;

/**
 * Refuse a file larger than this rather than parse it.
 *
 * A full store is 25 bids across some tools with a few dozen short fields each
 * — tens of kilobytes. Two megabytes is far above any real backup and far below
 * the size at which `JSON.parse` on a phone becomes a frozen tab.
 */
export const MAX_BACKUP_BYTES = 2_000_000;

/**
 * Slugs are used to build a `querySelector` and an `href` on the hub, so the
 * shape is checked at the point the value enters the store rather than at each
 * of the places that later reads it. This is the only path by which a string
 * from outside the browser reaches this key.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Above this the file is not a backup of this site; it is something else. */
const MAX_BACKUP_SLUGS = 500;

/** `saved-bids-2026-08-27.json` — sorts by date in a Downloads folder. */
export function backupFilename(at) {
  const day = typeof at === 'string' && /^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : 'export';
  return `saved-bids-${day}.json`;
}

/**
 * The file contents.
 *
 * `at` is stamped so a visitor holding three backups can tell which is which
 * without opening them, and so a restore can say what it is restoring. Rates
 * are omitted entirely when there are none rather than written as `null`: an
 * absent key restores nothing, where a null one invites a reader to treat it as
 * "clear the rates on the target device", which this never does.
 */
export function buildBackup({ bids, rates, at } = {}) {
  const out = {};
  for (const [slug, list] of Object.entries(bids ?? {})) {
    if (!SLUG_RE.test(slug) || !Array.isArray(list)) continue;
    const kept = list.map(normalizeBid).filter(Boolean).slice(0, MAX_SAVED_BIDS);
    if (kept.length > 0) out[slug] = kept;
  }
  const backup = {
    kind: BACKUP_KIND,
    v: BACKUP_VERSION,
    at: typeof at === 'string' && at ? at : null,
    bids: out,
  };
  const cleanRates = normalizeRates(rates);
  if (cleanRates) backup.rates = cleanRates;
  return backup;
}

/** How many bids a store holds, across every tool. */
export function countBids(bids) {
  let total = 0;
  for (const list of Object.values(bids ?? {})) {
    if (Array.isArray(list)) total += list.length;
  }
  return total;
}

/**
 * Read a file the visitor chose.
 *
 * Returns `{ ok: false, error }` with a sentence for the visitor rather than
 * throwing, because every failure here is an ordinary thing a person does with
 * a file picker — the wrong file, a truncated download, a file edited by hand —
 * and none of them should reach the page as an exception.
 *
 * `skipped` counts entries that parsed as JSON but were not bids this site can
 * hold: an unusable slug, a missing name or timestamp, a field set that
 * normalised to nothing. It is reported rather than swallowed so a file that
 * restores 3 of its 40 rows cannot look like a file that held 3.
 */
export function parseBackup(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: 'That file is empty.' };
  }
  if (text.length > MAX_BACKUP_BYTES) {
    return { ok: false, error: 'That file is too large to be a backup from this site.' };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not a backup from this site.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'That file is not a backup from this site.' };
  }
  if (parsed.kind !== BACKUP_KIND) {
    return { ok: false, error: 'That file is not a backup from this site.' };
  }
  // A file from a *later* version of this site may hold shapes this build does
  // not understand. Refusing it is better than importing the half of it that
  // happens to parse, which would leave the visitor with a partial restore they
  // were told was a whole one.
  if (parsed.v !== BACKUP_VERSION) {
    return {
      ok: false,
      error: 'That backup was written by a different version of this site and cannot be read here.',
    };
  }

  const source = parsed.bids && typeof parsed.bids === 'object' && !Array.isArray(parsed.bids)
    ? parsed.bids
    : null;
  if (!source) {
    return { ok: false, error: 'That backup holds no saved bids.' };
  }

  const entries = Object.entries(source);
  if (entries.length > MAX_BACKUP_SLUGS) {
    return { ok: false, error: 'That file is not a backup from this site.' };
  }

  const bids = {};
  let skipped = 0;
  for (const [slug, list] of entries) {
    if (!SLUG_RE.test(slug)) {
      skipped += Array.isArray(list) ? list.length : 1;
      continue;
    }
    if (!Array.isArray(list)) {
      skipped += 1;
      continue;
    }
    const kept = [];
    for (const entry of list) {
      const bid = normalizeBid(entry);
      if (bid) kept.push(bid);
      else skipped++;
    }
    if (kept.length > 0) bids[slug] = kept;
  }

  if (countBids(bids) === 0) {
    return {
      ok: false,
      error: skipped > 0
        ? 'That backup holds no saved bids this site can read.'
        : 'That backup holds no saved bids.',
    };
  }

  return {
    ok: true,
    at: typeof parsed.at === 'string' && parsed.at ? parsed.at : null,
    bids,
    rates: normalizeRates(parsed.rates) || null,
    skipped,
  };
}

const bidKey = (bid) => bid.name;

/**
 * Which of two copies of the same job this device should keep.
 *
 * The fields are decided by `at`, which is the rule this merge has always
 * used: the later pricing is the current one.
 *
 * The outcome cannot ride along with them, and that is the whole reason this
 * function exists. Marking a bid won does not re-price it, so `at` does not
 * move — a contractor who marks "14 Oak St" won on the phone and then restores
 * that backup onto the laptop has two records with an identical `at`, one
 * decided and one not. Under `at` alone the laptop's copy is "unchanged" and
 * the win is silently dropped, which is the same class of defect as the bid
 * link that quietly lost `quantity`: nothing fails, and the number the
 * contractor sees afterwards is wrong.
 *
 * So the outcome is resolved on its own two rules, in order:
 *
 *   1. A decided bid beats an undecided one, whichever side it came from.
 *      Waiting is the absence of information, not a competing claim — no
 *      device ever asserts "this is still out", it only fails to say otherwise.
 *   2. Between two decided copies, the later `decidedAt` wins. A bid marked
 *      lost in June and won in August was won.
 *
 * Returns the record to keep, which may be a blend of the two sides.
 */
export function resolveBidPair(mine, theirs) {
  const base = theirs.at > mine.at ? theirs : mine;
  const other = base === theirs ? mine : theirs;

  if (base.outcome && other.outcome) {
    // Missing `decidedAt` sorts before any real timestamp, so a copy that
    // records when it was decided beats one that only records that it was.
    const keep = (other.decidedAt ?? '') > (base.decidedAt ?? '') ? other : base;
    if (keep === base) return base;
    return withDecision(base, keep);
  }

  const decided = base.outcome ? base : other.outcome ? other : null;
  if (!decided || decided === base) return base;
  return withDecision(base, decided);
}

/**
 * `base`'s pricing with `decided`'s decision written over it.
 *
 * `lostTo` — what a lost job went for — belongs to the outcome, not to the
 * pricing, which is the same distinction this function's caller was written to
 * draw and the same way it goes wrong. Two rules, and they are not symmetric:
 *
 *   - **The decision is no longer a loss.** Drop the figure. Keeping it would
 *     leave the winning price from one device's loss attached to a record this
 *     merge has just decided was won on the other, and `undercutSentence` would
 *     average that price against a bid that was never lost.
 *   - **Both sides call it lost.** Prefer the incoming figure and fall back to
 *     the one already here. `mergeBids` is never subtractive, and a device that
 *     recorded what the job went for should not lose that because the *other*
 *     device marked the same loss a minute later without it.
 *
 * `decidedAt` is untouched by this and keeps the behaviour it had: `decided`'s
 * timestamp when it has one, otherwise whatever `base` carried.
 */
function withDecision(base, decided) {
  const { lostTo, cost, ...rest } = base;
  const kept = decided.outcome === 'lost' ? decided.lostTo || lostTo : '';
  // `cost` — what a won job came to once it was delivered — is the same shape
  // of fact pointed at the other outcome, and it follows the same two rules for
  // the same two reasons. Dropping it when the merge decides the job was lost
  // matters more than the symmetry suggests: `marginSentence` divides by the
  // bid's own price, so a delivered cost left on a record this merge has just
  // called a loss would report a margin on a job that was never done.
  const spent = decided.outcome === 'won' ? decided.cost || cost : '';
  return {
    ...rest,
    outcome: decided.outcome,
    ...(decided.decidedAt ? { decidedAt: decided.decidedAt } : {}),
    ...(kept ? { lostTo: kept } : {}),
    ...(spent ? { cost: spent } : {}),
  };
}

/**
 * Merge a backup into what this device already holds.
 *
 * Never subtractive: every bid on the device is still in the result unless the
 * per-tool cap pushed it out, and a bid pushed out by the cap is counted in
 * `dropped` so the page can say so. A job present on both sides is matched by
 * name within its tool — the same key `jobs.mjs` uses when saving replaces a
 * row — and `resolveBidPair` above decides what to keep of each: the later `at`
 * takes the pricing, and the outcome is resolved separately because marking a
 * bid won does not move `at`.
 *
 * `added` / `replaced` / `unchanged` are counts of the *incoming* bids, so they
 * always sum to the number of bids in the file that this device could take.
 * "Unchanged" means the stored record came through the merge untouched — a file
 * that carries only the news that a bid was won counts as `replaced`, because
 * something on this device did change.
 */
export function mergeBids(current, incoming) {
  const result = {};
  let added = 0;
  let replaced = 0;
  let unchanged = 0;
  let dropped = 0;

  const slugs = new Set([
    ...Object.keys(current ?? {}),
    ...Object.keys(incoming ?? {}),
  ]);

  for (const slug of slugs) {
    const mine = (current?.[slug] ?? []).map(normalizeBid).filter(Boolean);
    const theirs = (incoming?.[slug] ?? []).map(normalizeBid).filter(Boolean);

    const byName = new Map();
    for (const bid of mine) {
      // A store that somehow holds the same name twice keeps the newer one; the
      // merge is also the only pass that would ever notice.
      const existing = byName.get(bidKey(bid));
      byName.set(bidKey(bid), existing ? resolveBidPair(existing, bid) : bid);
    }

    for (const bid of theirs) {
      const existing = byName.get(bidKey(bid));
      if (!existing) {
        byName.set(bidKey(bid), bid);
        added++;
        continue;
      }
      const kept = resolveBidPair(existing, bid);
      byName.set(bidKey(bid), kept);
      if (kept === existing) unchanged++;
      else replaced++;
    }

    const merged = [...byName.values()].sort(
      (a, b) => b.at.localeCompare(a.at) || a.name.localeCompare(b.name),
    );
    if (merged.length > MAX_SAVED_BIDS) dropped += merged.length - MAX_SAVED_BIDS;
    const kept = merged.slice(0, MAX_SAVED_BIDS);
    if (kept.length > 0) result[slug] = kept;
  }

  return { bids: result, added, replaced, unchanged, dropped };
}

/**
 * The record shape and the merge, as source, for the hub's inline script.
 *
 * The hub used to carry its own `normalizedBid` and its own `mergeBidStores`,
 * written out by hand beside the tested ones. Both were the pre-outcome
 * versions: the normaliser returned `{ name, at, fields }`, and the merge
 * resolved a name collision on `at` alone. Together they meant a contractor
 * could mark a job won, download a backup, restore it, and find every decision
 * they had recorded quietly gone — including on bids the file never mentioned,
 * because a restore normalises the device's own store on the way in.
 *
 * `resolveBidPair`'s own comment describes exactly this failure and exists to
 * prevent it. It was never reachable from the browser. Embedding the tested
 * definitions is the fix, and the drift test below is what keeps it fixed:
 * there is now one implementation, and the page runs it.
 *
 * `MAX_SAVED_BIDS` is not emitted here — the script that takes this block
 * already declares it, and a second declaration in the same scope is a
 * syntax error rather than a shadow.
 */
export const BACKUP_MERGE_HELPERS = [
  BID_RECORD_HELPERS,
  // `withDecision` before `resolveBidPair`, which calls it. Declaration order
  // is what this list guarantees; `var` hoisting would not carry the
  // assignment. Leaving it out is how the hub's merge threw
  // `withDecision is not defined` the moment a backup touched a decided bid.
  ...[bidKey, withDecision, resolveBidPair, mergeBids].map(
    (fn) => `var ${fn.name} = ${stripForInjection(fn.toString())};`,
  ),
].join('\n');

/**
 * What the page says after a restore.
 *
 * Built here rather than in the hub script so the wording is tested: this
 * sentence is the whole of what the visitor learns about an operation that
 * touched every saved bid they have, and the counts in it are the difference
 * between "it worked" and "some of it worked".
 */
export function restoreSummary({ added, replaced, unchanged, dropped, skipped, ratesKept, ratesApplied } = {}) {
  const parts = [];
  const bidWord = (n) => (n === 1 ? '1 bid' : `${n} bids`);

  if (added) parts.push(`${bidWord(added)} added`);
  if (replaced) parts.push(`${bidWord(replaced)} updated to the newer version`);
  if (unchanged) parts.push(`${bidWord(unchanged)} already here`);
  if (parts.length === 0) parts.push('nothing new to add');

  let text = `Restored: ${parts.join(', ')}.`;
  if (skipped) {
    text += ` ${skipped} entr${skipped === 1 ? 'y' : 'ies'} in the file could not be read and ${
      skipped === 1 ? 'was' : 'were'
    } left out.`;
  }
  if (dropped) {
    text += ` ${bidWord(dropped)} went over the ${MAX_SAVED_BIDS}-per-tool limit and the oldest ${
      dropped === 1 ? 'was' : 'were'
    } dropped.`;
  }
  if (ratesApplied) text += ' Your shop rates were restored too.';
  else if (ratesKept) {
    text += ' The shop rates already set in this browser were kept — this never overwrites them.';
  }
  return text;
}

// ---------------------------------------------------------------------------
// The hub widget
// ---------------------------------------------------------------------------

/**
 * Shown whenever script runs, with or without saved bids on the device.
 *
 * The restore half has to be reachable on a browser that has *nothing* — that
 * is the case it exists for. Putting it inside "Your saved bids", which is
 * `hidden` until there is at least one, would have hidden the control exactly
 * on the new phone or the fresh laptop where it is the only thing that helps.
 * So the section stands on its own and re-words itself instead: an offer to
 * restore when there is nothing, both halves when there is something.
 *
 * `hidden` until the script un-hides it, because a file picker and a download
 * button that cannot work without script should not be drawn for a visitor who
 * has none.
 */
export const BACKUP_WIDGET_HTML = `    <section class="support backup" id="backup-box" hidden>
      <strong id="backup-title">Move your saved bids to another browser</strong>
      <p id="backup-copy">
        Saved bids live in this browser only. Download them as a file to keep a
        copy, or to open them on your laptop, your phone, or a new device.
      </p>
      <p class="backup-actions">
        <button type="button" id="backup-download" hidden>Download a backup</button>
      </p>
      <p class="backup-actions">
        <label for="backup-file">Restore from a backup file</label>
        <input type="file" id="backup-file" accept="application/json,.json">
      </p>
      <p class="backup-note">
        The file holds the job names and numbers you typed, so keep it
        somewhere you would keep a customer list. Restoring adds to what is
        already here and never deletes a bid.
      </p>
      <p id="backup-status" role="status" aria-live="polite"></p>
    </section>`;

/**
 * The transcription of the functions above into the hub page.
 *
 * Interpolated into the hub's one inline module, where `record()` and
 * `showSavedBids()` are already in scope — the list has to redraw the moment a
 * restore lands, or the visitor is told 12 bids arrived and sees the same eight
 * rows as before.
 */
export const BACKUP_WIDGET_SCRIPT = `
    // Backup and restore for saved bids.
    //
    // The saved-bid feature stands on one localStorage key in one browser. That
    // is the right shape for a site with nothing to upload to, and it means a
    // cleared browser, a replaced phone, or a storage policy that evicts a site
    // nobody opened for a week takes every bid with it. This is the way out
    // that does not need an account or a server: a file the visitor holds.
    const backupBox = document.getElementById('backup-box');
    const backupTitle = document.getElementById('backup-title');
    const backupCopy = document.getElementById('backup-copy');
    const backupDownload = document.getElementById('backup-download');
    const backupFile = document.getElementById('backup-file');
    const backupStatus = document.getElementById('backup-status');
    const RATES_KEY = 'portfolio-shop-rates';
    const BACKUP_KIND = ${JSON.stringify(BACKUP_KIND)};
    const BACKUP_VERSION = ${BACKUP_VERSION};
    const MAX_SAVED_BIDS = ${MAX_SAVED_BIDS};
    const MAX_BACKUP_BYTES = ${MAX_BACKUP_BYTES};
    const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
    // The four shop-rate fields rates.mjs carries between tools, with the same
    // ceilings: a backup restores the rates bar, not an arbitrary map of values
    // a file claims are rates, and never a value a calculator would then
    // reject.
    const RATE_FIELDS = ${JSON.stringify(SHOP_RATE_FIELDS.map(({ id, max }) => ({ id, max })))};

    // normalizeBid() and mergeBids(), as this repository's tests run them.
    // Embedded rather than transcribed: the hand-written pair that stood here
    // predated bid outcomes and silently dropped every won/lost decision
    // through a backup round trip. See BACKUP_MERGE_HELPERS.
${BACKUP_MERGE_HELPERS}

    function readBidStore() {
      let parsed;
      try { parsed = JSON.parse(localStorage.getItem(BIDS_KEY) || '{}'); } catch { return {}; }
      const bids = parsed && typeof parsed === 'object' ? parsed.bids : null;
      if (!bids || typeof bids !== 'object' || Array.isArray(bids)) return {};
      const out = {};
      for (const [slug, list] of Object.entries(bids)) {
        if (!SLUG_RE.test(slug) || !Array.isArray(list)) continue;
        const kept = list.map((entry) => normalizeBid(entry)).filter(Boolean).slice(0, MAX_SAVED_BIDS);
        if (kept.length > 0) out[slug] = kept;
      }
      return out;
    }

    function countBids(store) {
      let total = 0;
      for (const list of Object.values(store)) total += list.length;
      return total;
    }

    function showBackup() {
      if (!backupBox) return;
      backupBox.hidden = false;
      const total = countBids(readBidStore());
      backupDownload.hidden = total === 0;
      if (total === 0) {
        backupTitle.textContent = 'Bids saved on another browser?';
        backupCopy.textContent =
          'If you saved bids on another device and downloaded a backup file there, ' +
          'open it here to bring them across. Nothing is uploaded — the file is read ' +
          'in this browser.';
      } else {
        backupTitle.textContent = 'Move your saved bids to another browser';
        backupCopy.textContent =
          'Saved bids live in this browser only. Download ' +
          (total === 1 ? 'your saved bid' : 'all ' + total + ' saved bids') +
          ' as a file to keep a copy, or to open them on your laptop, your phone, ' +
          'or a new device.';
      }
    }

    if (backupBox) {
      showBackup();

      backupDownload.addEventListener('click', () => {
        const at = new Date().toISOString();
        const payload = { kind: BACKUP_KIND, v: BACKUP_VERSION, at: at, bids: readBidStore() };
        try {
          const raw = localStorage.getItem(RATES_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          const rates = parsed && typeof parsed === 'object'
            ? (parsed.rates && typeof parsed.rates === 'object' ? parsed.rates : parsed) : null;
          if (rates) payload.rates = rates;
        } catch { /* a bad rates key is not a reason to refuse the bids */ }

        // A Blob and an object URL: the file is assembled in the page and never
        // travels anywhere. Revoked on the next frame so the browser can free it
        // once the download has started.
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'saved-bids-' + at.slice(0, 10) + '.json';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);

        const count = countBids(payload.bids);
        backupStatus.textContent = 'Downloaded ' + count +
          (count === 1 ? ' saved bid' : ' saved bids') +
          '. Keep it somewhere you would keep a customer list.';
        // How often the backup is taken, never what is in it.
        record('bids_backup_downloaded');
      });

      backupFile.addEventListener('change', async () => {
        const file = backupFile.files && backupFile.files[0];
        if (!file) return;
        backupStatus.textContent = 'Reading…';
        let text = '';
        try {
          text = await file.text();
        } catch {
          backupStatus.textContent = 'That file could not be read.';
          record('bids_backup_rejected');
          backupFile.value = '';
          return;
        }

        const parsed = parseBackupText(text);
        if (!parsed.ok) {
          backupStatus.textContent = parsed.error;
          record('bids_backup_rejected');
          backupFile.value = '';
          return;
        }

        const merged = mergeBids(readBidStore(), parsed.bids);
        try {
          localStorage.setItem(BIDS_KEY, JSON.stringify({ v: 1, bids: merged.bids }));
        } catch {
          backupStatus.textContent =
            'This browser would not store the bids — it may be out of space, or in a ' +
            'private window. Nothing was changed.';
          record('bids_backup_rejected');
          backupFile.value = '';
          return;
        }

        // Shop rates are the visitor's own business numbers and every trade
        // calculator prefills from them. A restore that overwrote the ones set
        // in this browser would silently reprice every tool from a file, so the
        // rates are taken only where there are none to lose, and the status
        // line says which happened.
        let ratesApplied = false;
        let ratesKept = false;
        if (parsed.rates) {
          let existing = null;
          try { existing = localStorage.getItem(RATES_KEY); } catch { /* ignore */ }
          if (existing) {
            ratesKept = true;
          } else {
            try {
              localStorage.setItem(RATES_KEY, JSON.stringify({ v: 1, rates: parsed.rates }));
              ratesApplied = true;
            } catch { /* ignore: the bids are the point */ }
          }
        }

        backupStatus.textContent = restoreSummaryText({
          added: merged.added,
          replaced: merged.replaced,
          unchanged: merged.unchanged,
          dropped: merged.dropped,
          skipped: parsed.skipped,
          ratesKept: ratesKept,
          ratesApplied: ratesApplied,
        });
        record('bids_backup_restored');
        backupFile.value = '';
        // The list above has to redraw now: being told twelve bids arrived and
        // shown the same eight rows reads as a restore that did not happen.
        bidsExpanded = false;
        showSavedBids();
        showBackup();
      });
    }

    function parseBackupText(text) {
      if (typeof text !== 'string' || text.trim() === '') {
        return { ok: false, error: 'That file is empty.' };
      }
      if (text.length > MAX_BACKUP_BYTES) {
        return { ok: false, error: 'That file is too large to be a backup from this site.' };
      }
      let parsed;
      try { parsed = JSON.parse(text); } catch {
        return { ok: false, error: 'That file is not a backup from this site.' };
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: 'That file is not a backup from this site.' };
      }
      if (parsed.kind !== BACKUP_KIND) {
        return { ok: false, error: 'That file is not a backup from this site.' };
      }
      if (parsed.v !== BACKUP_VERSION) {
        return { ok: false, error: 'That backup was written by a different version of ' +
          'this site and cannot be read here.' };
      }
      const source = parsed.bids && typeof parsed.bids === 'object' && !Array.isArray(parsed.bids)
        ? parsed.bids : null;
      if (!source) return { ok: false, error: 'That backup holds no saved bids.' };
      const entries = Object.entries(source);
      if (entries.length > 500) {
        return { ok: false, error: 'That file is not a backup from this site.' };
      }

      const bids = {};
      let skipped = 0;
      for (const [slug, list] of entries) {
        if (!SLUG_RE.test(slug)) {
          skipped += Array.isArray(list) ? list.length : 1;
          continue;
        }
        if (!Array.isArray(list)) { skipped += 1; continue; }
        const kept = [];
        for (const entry of list) {
          const bid = normalizeBid(entry);
          if (bid) kept.push(bid); else skipped++;
        }
        if (kept.length > 0) bids[slug] = kept;
      }
      if (countBids(bids) === 0) {
        return { ok: false, error: skipped > 0
          ? 'That backup holds no saved bids this site can read.'
          : 'That backup holds no saved bids.' };
      }
      let rates = null;
      if (parsed.rates && typeof parsed.rates === 'object' && !Array.isArray(parsed.rates)) {
        const clean = {};
        for (const field of RATE_FIELDS) {
          const value = parsed.rates[field.id];
          if (value === '' || value === null || value === undefined) continue;
          const num = typeof value === 'number' ? value : Number(String(value).trim());
          if (!Number.isFinite(num) || num < 0 || num > field.max) continue;
          clean[field.id] = num;
        }
        if (Object.keys(clean).length > 0) rates = clean;
      }
      return { ok: true, bids: bids, rates: rates, skipped: skipped,
        at: typeof parsed.at === 'string' ? parsed.at : null };
    }

    function restoreSummaryText(counts) {
      const bidWord = (n) => (n === 1 ? '1 bid' : n + ' bids');
      const parts = [];
      if (counts.added) parts.push(bidWord(counts.added) + ' added');
      if (counts.replaced) parts.push(bidWord(counts.replaced) + ' updated to the newer version');
      if (counts.unchanged) parts.push(bidWord(counts.unchanged) + ' already here');
      if (parts.length === 0) parts.push('nothing new to add');
      let text = 'Restored: ' + parts.join(', ') + '.';
      if (counts.skipped) {
        text += ' ' + counts.skipped + ' entr' + (counts.skipped === 1 ? 'y' : 'ies') +
          ' in the file could not be read and ' +
          (counts.skipped === 1 ? 'was' : 'were') + ' left out.';
      }
      if (counts.dropped) {
        text += ' ' + bidWord(counts.dropped) + ' went over the ' + MAX_SAVED_BIDS +
          '-per-tool limit and the oldest ' +
          (counts.dropped === 1 ? 'was' : 'were') + ' dropped.';
      }
      if (counts.ratesApplied) text += ' Your shop rates were restored too.';
      else if (counts.ratesKept) {
        text += ' The shop rates already set in this browser were kept — ' +
          'this never overwrites them.';
      }
      return text;
    }
`;
