import { test } from "node:test";
import assert from "node:assert/strict";
import { runService, drawServices, mulberry32, PARTY_SIZES } from "./calc.mjs";

// The table-by-table simulator as it was before 2026-11-19, copied verbatim. runService now keeps a free count per seat
// size and skips hopeless waiting-line checks; it must return exactly what this one returns.
function oldRunService(parties, tables, sizes, dwellMin, patienceMin, combine) {
  const free = tables.map(() => true);
  const order = tables.map((t, i) => i).sort((a, b) => tables[a].seats - tables[b].seats);
  const deps = []; // [time, tableIdxA, tableIdxB|-1]
  const queue = []; // [deadline, arrival, k, dwell]
  const r = { guests: 0, parties: parties.length, lost: 0, waitMin: 0, seated: 0, seatMinutes: 0 };

  const pick = (size) => {
    for (const i of order) if (free[i] && tables[i].seats >= size) return [i, -1];
    if (!combine) return null;
    let best = null;
    let bestSeats = Infinity;
    for (let x = 0; x < order.length; x++) {
      const a = order[x];
      if (!free[a]) continue;
      for (let y = x + 1; y < order.length; y++) {
        const b = order[y];
        if (!free[b]) continue;
        const seats = tables[a].seats + tables[b].seats;
        if (seats >= size && seats < bestSeats) { best = [a, b]; bestSeats = seats; }
      }
    }
    return best;
  };
  const seat = (now, arrival, k, dwell) => {
    const size = sizes[k];
    const slot = pick(size);
    if (!slot) return false;
    free[slot[0]] = false;
    if (slot[1] >= 0) free[slot[1]] = false;
    const t = now + dwell;
    let lo = 0;
    while (lo < deps.length && deps[lo][0] <= t) lo++;
    deps.splice(lo, 0, [t, slot[0], slot[1]]);
    r.guests += size;
    r.seated += 1;
    r.waitMin += now - arrival;
    r.seatMinutes += dwell * (tables[slot[0]].seats + (slot[1] >= 0 ? tables[slot[1]].seats : 0));
    return true;
  };
  const drain = (now) => {
    for (let q = 0; q < queue.length; ) {
      if (queue[q][0] < now) { r.lost += 1; queue.splice(q, 1); continue; }
      if (seat(now, queue[q][1], queue[q][2], queue[q][3])) queue.splice(q, 1);
      else q++;
    }
  };

  let a = 0;
  while (a < parties.length || deps.length) {
    const nextArr = a < parties.length ? parties[a][0] : Infinity;
    const nextDep = deps.length ? deps[0][0] : Infinity;
    if (nextDep <= nextArr) {
      const d = deps.shift();
      free[d[1]] = true;
      if (d[2] >= 0) free[d[2]] = true;
      drain(d[0]);
    } else {
      const [t, k, mult] = parties[a++];
      const dwell = dwellMin[k] * mult;
      if (!seat(t, t, k, dwell)) {
        if (patienceMin > 0) queue.push([t + patienceMin, t, k, dwell]);
        else r.lost += 1;
      }
    }
  }
  r.lost += queue.length;
  return r;
}

function randomCase(rnd) {
  const nTypes = 1 + Math.floor(rnd() * 5);
  const seatsPool = [1, 2, 2, 3, 4, 4, 5, 6, 6, 8, 10, 12, 16];
  const tables = [];
  for (let i = 0; i < nTypes; i++) {
    const seats = seatsPool[Math.floor(rnd() * seatsPool.length)]; // repeats on purpose: two types, same seats
    const count = Math.floor(rnd() * 7);
    for (let j = 0; j < count; j++) tables.push({ seats });
  }
  for (let i = tables.length - 1; i > 0; i--) { // the old code sorted by seats itself; any input order must agree
    const j = Math.floor(rnd() * (i + 1));
    [tables[i], tables[j]] = [tables[j], tables[i]];
  }
  const raw = PARTY_SIZES.map(() => (rnd() < 0.3 ? 0 : rnd()));
  if (raw.every((x) => x === 0)) raw[1] = 1;
  const tot = raw.reduce((s, x) => s + x, 0);
  let acc = 0;
  const sizeCdf = raw.map((x) => (acc += x / tot));
  sizeCdf[sizeCdf.length - 1] = 1;
  const windowMin = 30 + rnd() * 240;
  const ratePerMin = (1 + rnd() * 400) / windowMin;
  const dwellMin = PARTY_SIZES.map(() => 10 + rnd() * 120);
  const patienceMin = rnd() < 0.25 ? 0 : rnd() * 40;
  return { tables, sizeCdf, windowMin, ratePerMin, dwellMin, patienceMin };
}

test("runService returns what the table-by-table simulator returned, field for field", () => {
  const rnd = mulberry32(20261119);
  let compared = 0, queued = 0;
  for (let c = 0; c < 400; c++) {
    const k = randomCase(rnd);
    const services = drawServices({ n: 3, seed: c + 1, windowMin: k.windowMin, ratePerMin: k.ratePerMin, sizeCdf: k.sizeCdf });
    for (const s of services) {
      for (const combine of [true, false]) {
        const want = oldRunService(s, k.tables, PARTY_SIZES, k.dwellMin, k.patienceMin, combine);
        const got = runService(s, k.tables, PARTY_SIZES, k.dwellMin, k.patienceMin, combine);
        assert.deepEqual(got, want, `case ${c}, combine ${combine}`);
        compared++;
        if (want.waitMin > 0) queued++;
      }
    }
  }
  assert.equal(compared, 2400);
  assert.ok(queued > 300, `only ${queued} runs had anyone wait`); // the waiting line must actually be exercised
});

test("ties in arrival and departure times are handled in the same order", () => {
  // Whole-minute arrivals and stays make simultaneous departures and arrivals common.
  const rnd = mulberry32(7);
  for (let c = 0; c < 200; c++) {
    const k = randomCase(rnd);
    const parties = [];
    let t = 0;
    const n = 1 + Math.floor(rnd() * 120);
    for (let i = 0; i < n; i++) {
      t += Math.floor(rnd() * 3);
      parties.push([t, Math.floor(rnd() * 8), 1]);
    }
    const dwellMin = PARTY_SIZES.map(() => 5 * (1 + Math.floor(rnd() * 6)));
    const patienceMin = [0, 5, 10][c % 3];
    for (const combine of [true, false]) {
      assert.deepEqual(
        runService(parties, k.tables, PARTY_SIZES, dwellMin, patienceMin, combine),
        oldRunService(parties, k.tables, PARTY_SIZES, dwellMin, patienceMin, combine),
        `case ${c}, combine ${combine}`,
      );
    }
  }
});
