/**
 * What each plan row in the table should show when restoring a saved
 * scenario (or the shipped worked example).
 *
 * The page ships with four example plans in the first four of six blank
 * rows. If a practice later saves a scenario with fewer than four plans and
 * returns, restoring by only writing the saved plans into rows 0..n-1 would
 * leave rows n..3 holding the *example's* plan names and dollar figures --
 * still filled in, never touched, not blank. `readPlan` in calc.mjs treats a
 * row as blank only when its name, production and write-off are all empty,
 * so those leftover example rows would be counted as real plans and folded
 * silently into the practice's own totals. This is the same
 * clear-not-leave-stale defect `platform/ci/check_shared_link_clears.py`
 * guards for a shared link, arrived at here through a saved-scenario restore
 * instead of a URL.
 *
 * `resolvePlanRows` returns one entry per row that must exist afterward --
 * growing to fit more plans than there are rows, and always as many entries
 * as there were rows already, so a shorter incoming list clears the rest
 * rather than leaving them alone.
 */
export function resolvePlanRows(existingRowCount, plans) {
  const list = Array.isArray(plans) ? plans : [];
  const count = Math.max(Number(existingRowCount) || 0, list.length);
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const plan = list[i] ?? {};
    rows.push({
      planName: plan.planName ?? '',
      grossProduction: plan.grossProduction ?? '',
      writeOff: plan.writeOff ?? '',
    });
  }
  return rows;
}

function splitLine(line, delimiter) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

/** A report figure: "$1,234.50", "(1,234)" or "-1,234" all read as 1234.5 / 1234 / 1234. */
function reportNumber(text) {
  if (text === undefined) return null;
  const cleaned = String(text).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '$1').replace(/^-/, '');
  if (cleaned === '' || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

const GROSS_HEADER = /production|gross|billed|charge|fee|ucr/i;
const WRITE_OFF_HEADER = /adjust|write.?off|contractual/i;
const NET_HEADER = /net|paid|collect|allowed|reimburs/i;

/**
 * Read a production-by-carrier report pasted from a practice management
 * system or a spreadsheet (tab, comma or semicolon separated) into the plan
 * rows the table collects. Only period totals per carrier are read; nothing
 * is guessed: a row without a readable name and production figure is listed
 * in `skipped`, a "Total" row is dropped so it is not counted as a plan, and
 * the same carrier on two lines is added together.
 *
 * With a header row, columns are found by name (production, adjustment or
 * write-off, or net/paid/collected, from which the write-off is production
 * minus net). Without one, the order is name, production, write-off.
 */
export function parsePlanReport(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { plans: [], skipped: [], note: 'Nothing was pasted.' };

  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const rows = lines.map((l) => splitLine(l, delimiter));

  let grossAt = 1;
  let writeOffAt = 2;
  let netAt = -1;
  let body = rows;
  const first = rows[0];
  const hasHeader = first.slice(1).every((cell) => reportNumber(cell) === null);
  if (hasHeader) {
    body = rows.slice(1);
    const find = (re, skip = []) => first.findIndex((cell, i) => i > 0 && !skip.includes(i) && re.test(cell));
    const writeOff = find(WRITE_OFF_HEADER);
    const net = writeOff === -1 ? find(NET_HEADER) : -1;
    const gross = find(GROSS_HEADER, [writeOff, net]);
    if (gross === -1 || (writeOff === -1 && net === -1)) {
      return {
        plans: [],
        skipped: [],
        note: 'Could not find a production column and an adjustment (or paid) column in the header row.',
      };
    }
    grossAt = gross;
    writeOffAt = writeOff;
    netAt = net;
  }

  const byName = new Map();
  const skipped = [];
  for (const cells of body) {
    const name = (cells[0] ?? '').trim();
    if (/^(grand\s+)?totals?\b/i.test(name)) continue;
    const gross = reportNumber(cells[grossAt]);
    let writeOff = reportNumber(cells[writeOffAt === -1 ? netAt : writeOffAt]);
    if (writeOff !== null && writeOffAt === -1 && gross !== null) writeOff = Math.max(0, gross - writeOff);
    if (!name || gross === null || writeOff === null) {
      skipped.push(cells.join(' | '));
      continue;
    }
    const key = name.toLowerCase();
    const seen = byName.get(key);
    if (seen) {
      seen.gross += gross;
      seen.writeOff += writeOff;
    } else {
      byName.set(key, { name, gross, writeOff });
    }
  }

  const round = (n) => String(Math.round(n * 100) / 100);
  const plans = [...byName.values()].map((p) => ({
    planName: p.name,
    grossProduction: round(p.gross),
    writeOff: round(p.writeOff),
  }));
  return { plans, skipped, note: '' };
}
