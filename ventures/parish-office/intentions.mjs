// Mass intentions book: the register canon 958 §1 asks every parish that
// takes Mass offerings to keep, plus the checks canons 948-956 imply.
//
// Pure functions, no I/O. Money is integer cents; dates are ISO
// "YYYY-MM-DD" strings compared as UTC calendar days.
//
// Canon text (Code of Canon Law, Book IV, cann. 945-958), English, from
// https://www.vatican.va/archive/cod-iuris-canonici/eng/documents/cic_lib4-cann879-958_en.html
// Each check below quotes the canon it rests on. The tool reports
// observations for the pastor to weigh; it does not decide anything canonical.
//
// Not modelled: collective ("plurintentional") Masses under the
// Congregation for the Clergy's 1991 decree, foundation Masses, the
// "extrinsic title" recompense in c. 951 §1, and any particular law of a
// diocese beyond the offering amount the user types.

const DAY = 86400000;

export const CANONS = {
  948: "Separate Masses are to be applied for the intentions of those for whom a single offering, although small, has been given and accepted.",
  950: "If a sum of money is offered for the application of Masses without an indication of the number of Masses to be celebrated, the number is to be computed on the basis of the offering established in the place where the donor resides, unless the intention of the donor must be presumed legitimately to have been different.",
  "951.1": "A priest who celebrates several Masses on the same day can apply each to the intention for which the offering was given, but subject to the rule that, except on Christmas, he is to keep the offering for only one Mass and transfer the others to the purposes prescribed by the ordinary, while allowing for some recompense by reason of an extrinsic title.",
  "951.2": "A priest who concelebrates a second Mass on the same day cannot accept an offering for it under any title.",
  952: "a priest is not permitted to seek a larger sum. Nevertheless, he is permitted to accept for the application of a Mass a voluntary offering which is larger or even smaller than the one defined.",
  953: "No one is permitted to accept more offerings for Masses to be applied by himself than he can satisfy within a year.",
  954: "If in certain churches or oratories more Masses are asked to be celebrated than can be celebrated there, it is permitted for them to be celebrated elsewhere unless the donors have expressly indicated a contrary intention.",
  "955.1": "He must transfer the entire offering received unless it is certain that the excess over the sum fixed in the diocese was given for him personally.",
  "955.2": "The time within which Masses must be celebrated begins on the day the priest who is to celebrate them received them unless it is otherwise evident.",
  956: "Each and every administrator of pious causes or those obliged in any way to see to the celebration of Masses, whether clerics or laity, are to hand over to their ordinaries according to the method defined by the latter the Mass obligations which have not been satisfied within a year.",
  "958.1": "The pastor and the rector of a church or other pious place which regularly receives offerings for Masses are to have a special book in which they note accurately the number of Masses to be celebrated, the intention, the offering given, and their celebration.",
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function dayNumber(iso) {
  if (typeof iso !== "string" || !ISO.test(iso)) throw new Error(`not a YYYY-MM-DD date: ${iso}`);
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) {
    throw new Error(`not a real date: ${iso}`);
  }
  return Math.round(t / DAY);
}

export function isoFromDay(n) {
  return new Date(n * DAY).toISOString().slice(0, 10);
}

/** One year after `iso`, same month and day (29 Feb -> 28 Feb). */
export function oneYearAfter(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  return `${y + 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function money(cents) {
  const sign = cents < 0 ? "-" : "";
  const a = Math.abs(Math.round(cents));
  return `${sign}$${Math.floor(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")}`;
}

/**
 * c. 950: a lump sum with no number of Masses is divided by the offering
 * established where the donor lives. Returns whole Masses and the remainder.
 */
export function massesFromLumpSum(sumCents, localOfferingCents) {
  if (!(localOfferingCents > 0)) throw new Error("the local offering amount must be above zero");
  if (!(sumCents >= 0)) throw new Error("the sum must not be negative");
  return { masses: Math.floor(sumCents / localOfferingCents), remainderCents: sumCents % localOfferingCents };
}

function normalise(book) {
  const settings = { localOfferingCents: 1000, warnDays: 30, ...(book.settings || {}) };
  const intentions = (book.intentions || []).map((r, i) => {
    if (!r.id) throw new Error(`intention ${i + 1} has no id`);
    dayNumber(r.received);
    if (r.requestedDate) dayNumber(r.requestedDate);
    const offeringCents = Math.round(r.offeringCents ?? 0);
    if (offeringCents < 0) throw new Error(`intention ${r.id}: offering is negative`);
    return { forbidTransfer: false, ...r, offeringCents };
  });
  const ids = new Set();
  for (const r of intentions) {
    if (ids.has(r.id)) throw new Error(`duplicate intention id ${r.id}`);
    ids.add(r.id);
  }
  const masses = (book.masses || []).map((m, i) => {
    if (!m.id) throw new Error(`Mass ${i + 1} has no id`);
    dayNumber(m.date);
    return { time: "", celebrant: "", concelebrated: false, intentionIds: [], celebrated: false, ...m };
  });
  const massIds = new Set();
  for (const m of masses) {
    if (massIds.has(m.id)) throw new Error(`duplicate Mass id ${m.id}`);
    massIds.add(m.id);
    for (const id of m.intentionIds) if (!ids.has(id)) throw new Error(`Mass ${m.id} names unknown intention ${id}`);
  }
  const transfers = (book.transfers || []).map((t) => {
    if (!ids.has(t.intentionId)) throw new Error(`transfer names unknown intention ${t.intentionId}`);
    dayNumber(t.date);
    return { personalExcess: false, ...t, amountCents: Math.round(t.amountCents ?? 0) };
  });
  return { settings, intentions, masses, transfers };
}

/**
 * Where each intention stands. An intention is satisfied when a Mass
 * marked celebrated applies it, or when it was transferred to another
 * priest (the obligation passes with it, c. 955 §1, once he accepts).
 */
export function status(book, todayIso) {
  const { intentions, masses, transfers } = normalise(book);
  const today = dayNumber(todayIso);
  const appliedBy = new Map();
  for (const m of masses) for (const id of m.intentionIds) {
    if (!appliedBy.has(id)) appliedBy.set(id, []);
    appliedBy.get(id).push(m);
  }
  const transferred = new Map(transfers.map((t) => [t.intentionId, t]));
  return intentions.map((r) => {
    const ms = appliedBy.get(r.id) || [];
    const done = ms.find((m) => m.celebrated);
    const t = transferred.get(r.id);
    const due = oneYearAfter(r.received);
    let state;
    if (done) state = "celebrated";
    else if (t) state = "transferred";
    else if (ms.length) state = "scheduled";
    else state = "open";
    const outstanding = state === "open" || state === "scheduled";
    return {
      id: r.id,
      intention: r.intention || "",
      donor: r.donor || "",
      received: r.received,
      offeringCents: r.offeringCents,
      state,
      massId: (done || ms[0])?.id || null,
      massDate: (done || ms[0])?.date || null,
      dueBy: due,
      daysLeft: outstanding ? dayNumber(due) - today : null,
    };
  });
}

function label(m) {
  return m.id.includes(m.date) ? `Mass ${m.id}` : `Mass ${m.id} (${m.date}${m.time ? " " + m.time : ""})`;
}

function finding(code, canon, severity, message, refs) {
  return { code, canon, severity, message, refs, quote: CANONS[canon] };
}

/** Every observation the book's entries raise, worst first. */
export function check(book, todayIso) {
  const nb = normalise(book);
  const { settings, intentions, masses, transfers } = nb;
  const byId = new Map(intentions.map((r) => [r.id, r]));
  const out = [];
  const today = dayNumber(todayIso);

  // c. 948: one offered intention per Mass.
  for (const m of masses) {
    const offered = m.intentionIds.filter((id) => byId.get(id).offeringCents > 0);
    if (offered.length > 1) {
      out.push(finding("several-offerings-one-mass", 948, "high",
        `${label(m)} applies ${offered.length} intentions that each came with an offering. Each one needs its own Mass, unless your diocese's rules for collective intentions are met (not checked here).`,
        [m.id, ...offered]));
    }
  }

  // An intention applied by more than one Mass is usually a double booking.
  const seen = new Map();
  for (const m of masses) for (const id of m.intentionIds) {
    if (!seen.has(id)) seen.set(id, []);
    seen.get(id).push(m.id);
  }
  for (const [id, ms] of seen) if (ms.length > 1 && (byId.get(id).masses ?? 1) < ms.length) {
    out.push(finding("intention-booked-twice", "958.1", "medium",
      `Intention ${id} is on ${ms.length} Masses (${ms.join(", ")}) but was offered for ${byId.get(id).masses ?? 1}.`, [id, ...ms]));
  }

  // A requested date the Mass list does not honour.
  for (const r of intentions) if (r.requestedDate && seen.has(r.id)) {
    const dates = seen.get(r.id).map((mid) => masses.find((m) => m.id === mid).date);
    if (!dates.includes(r.requestedDate)) {
      out.push(finding("requested-date-missed", "958.1", "low",
        `Intention ${r.id} asked for ${r.requestedDate} but is booked on ${dates.join(", ")}. Tell the donor or move it.`, [r.id]));
    }
  }

  // c. 951: one celebrant, several offered Masses in a day.
  const byPriestDay = new Map();
  for (const m of masses) {
    if (!m.celebrant) continue;
    const k = `${m.celebrant}|${m.date}`;
    if (!byPriestDay.has(k)) byPriestDay.set(k, []);
    byPriestDay.get(k).push(m);
  }
  for (const [k, ms] of byPriestDay) {
    if (ms.length < 2) continue;
    const [priest, date] = k.split("|");
    ms.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    const offered = ms.filter((m) => m.intentionIds.some((id) => byId.get(id).offeringCents > 0));
    // c. 951 §2: a concelebrated second (or later) Mass takes no offering.
    for (const m of ms.slice(1)) {
      if (m.concelebrated && m.intentionIds.some((id) => byId.get(id).offeringCents > 0)) {
        out.push(finding("concelebrated-second-mass-offering", "951.2", "high",
          `${priest} concelebrates Mass ${m.id} as a later Mass on ${date} and it carries an offering, which he cannot accept for it under any title.`, [m.id]));
      }
    }
    const christmas = date.slice(5) === "12-25";
    if (offered.length > 1 && !christmas) {
      const kept = offered[0];
      const rest = offered.slice(1);
      const cents = rest.reduce((s, m) => s + m.intentionIds.reduce((t, id) => t + byId.get(id).offeringCents, 0), 0);
      out.push(finding("binated-offerings-to-ordinary", "951.1", "medium",
        `${priest} applies offered intentions at ${offered.length} Masses on ${date}. He keeps the offering for one (here Mass ${kept.id}) and transfers the others, ${money(cents)}, to the purposes the ordinary prescribes.`,
        [kept.id, ...rest.map((m) => m.id)]));
    }
  }

  // c. 955 §1 and c. 954: transfers to another priest.
  for (const t of transfers) {
    const r = byId.get(t.intentionId);
    if (r.forbidTransfer) {
      out.push(finding("transfer-against-donor", 954, "high",
        `Intention ${r.id} was transferred to ${t.toPriest || "another priest"} although the donor asked for it to be said here.`, [r.id]));
    }
    if (t.amountCents < r.offeringCents) {
      const floor = settings.localOfferingCents;
      const allowed = t.personalExcess && t.amountCents >= Math.min(floor, r.offeringCents);
      if (!allowed) {
        out.push(finding("transfer-short", "955.1", "high",
          `Intention ${r.id}: ${money(r.offeringCents)} was received but ${money(t.amountCents)} was passed on. The whole offering goes with the Mass unless the excess over the diocesan ${money(floor)} was certainly given for the priest personally.`, [r.id]));
      }
    }
  }

  // c. 953 / c. 955 §2 / c. 956: the one-year clock.
  for (const s of status(nb, todayIso)) {
    if (s.daysLeft === null) continue;
    if (s.daysLeft < 0) {
      out.push(finding("past-one-year", 956, "high",
        `Intention ${s.id} (received ${s.received}) is ${-s.daysLeft} days past a year without being said. Unsatisfied obligations go to the ordinary in the way he has set.`, [s.id]));
    } else if (s.daysLeft <= settings.warnDays && !(s.state === "scheduled" && s.massDate <= s.dueBy)) {
      out.push(finding("near-one-year", "955.2", "medium",
        `Intention ${s.id} (received ${s.received}) reaches a year on ${s.dueBy}, in ${s.daysLeft} days, and is ${s.state === "scheduled" ? `booked only for ${s.massDate}` : "not booked"}.`, [s.id]));
    }
  }

  // c. 953: more open intentions than the Masses ahead can carry in a year.
  const open = status(nb, todayIso).filter((s) => s.state === "open").length;
  const perWeek = Number(settings.intentionMassesPerWeek || 0);
  if (perWeek > 0) {
    const scheduledAhead = masses.filter((m) => !m.celebrated && dayNumber(m.date) >= today && m.intentionIds.length === 0).length;
    const capacity = Math.floor(perWeek * 52);
    if (open > capacity) {
      out.push(finding("over-capacity", 953, "high",
        `${open} intentions are open but about ${capacity} Masses a year are free for intentions (${perWeek} a week). Stop accepting, or pass some on (c. 954) where donors allow.`, []));
    } else if (open > scheduledAhead && scheduledAhead > 0) {
      out.push(finding("needs-more-slots", 953, "low",
        `${open} intentions are open and ${scheduledAhead} Masses already on the calendar are free. Add Masses to the list to book the rest.`, []));
    }
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/**
 * Book open intentions into free Masses on or after `fromIso`: oldest
 * received first, a requested date honoured when a free Mass falls on it.
 * Returns a new book and the list of what was placed; the original is not
 * changed. A Mass gets at most one intention.
 */
export function autoBook(book, fromIso) {
  const nb = normalise(book);
  const from = dayNumber(fromIso);
  const st = new Map(status(nb, fromIso).map((s) => [s.id, s]));
  const masses = nb.masses.map((m) => ({ ...m, intentionIds: [...m.intentionIds] }));
  const free = masses
    .filter((m) => !m.celebrated && m.intentionIds.length === 0 && dayNumber(m.date) >= from && !m.noIntention)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time)));
  const used = new Set();
  const placed = [];
  const late = [];
  const queue = nb.intentions
    .filter((r) => {
      const s = st.get(r.id);
      if (s.state !== "open") return false;
      if (s.daysLeft < 0) {
        late.push({ id: r.id, reason: `past one year (due ${s.dueBy}): hand it to the ordinary (c. 956) unless he has said otherwise` });
        return false;
      }
      return true;
    })
    .sort((a, b) => (a.requestedDate ? 0 : 1) - (b.requestedDate ? 0 : 1) || a.received.localeCompare(b.received) || a.id.localeCompare(b.id));
  const unplaced = [];
  for (const r of queue) {
    let slot = null;
    if (r.requestedDate) slot = free.find((m) => !used.has(m.id) && m.date === r.requestedDate);
    if (!slot && r.requestedDate) {
      unplaced.push({ id: r.id, reason: `no free Mass on the requested ${r.requestedDate}` });
      continue;
    }
    if (!slot) slot = free.find((m) => !used.has(m.id));
    if (!slot) {
      unplaced.push({ id: r.id, reason: "no free Mass left in the list" });
      continue;
    }
    used.add(slot.id);
    slot.intentionIds.push(r.id);
    placed.push({ id: r.id, massId: slot.id, date: slot.date, time: slot.time });
  }
  return { book: { ...nb, masses }, placed, unplaced: [...late, ...unplaced] };
}

/**
 * The c. 958 §1 book as rows: number of Masses, intention, offering, and
 * celebration, one row per intention, oldest first.
 */
export function registerRows(book, todayIso) {
  const nb = normalise(book);
  const st = status(nb, todayIso);
  const byId = new Map(nb.intentions.map((r) => [r.id, r]));
  const tr = new Map(nb.transfers.map((t) => [t.intentionId, t]));
  return st
    .sort((a, b) => a.received.localeCompare(b.received) || a.id.localeCompare(b.id))
    .map((s) => {
      const m = s.massId ? nb.masses.find((x) => x.id === s.massId) : null;
      const t = tr.get(s.id);
      return {
        id: s.id,
        received: s.received,
        donor: s.donor,
        intention: s.intention,
        masses: byId.get(s.id).masses ?? 1,
        offering: (s.offeringCents / 100).toFixed(2),
        state: s.state,
        celebrated: s.state === "celebrated" ? `${m.date}${m.time ? " " + m.time : ""}${m.celebrant ? " by " + m.celebrant : ""}` : "",
        scheduled: s.state === "scheduled" ? s.massDate : "",
        transferred: t ? `${t.date} to ${t.toPriest || "?"} (${(t.amountCents / 100).toFixed(2)})` : "",
        dueBy: s.dueBy,
      };
    });
}

const COLUMNS = ["id", "received", "donor", "intention", "masses", "offering", "state", "celebrated", "scheduled", "transferred", "dueBy"];

function csvCell(v) {
  let s = String(v ?? "");
  // A cell a spreadsheet would run as a formula is prefixed so it stays text.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function registerCsv(book, todayIso) {
  const rows = registerRows(book, todayIso);
  return [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
}

/**
 * The year's totals the ordinary looks at in the annual review (c. 958 §2):
 * received, said, transferred, open, and offerings per bucket.
 */
export function yearSummary(book, year, todayIso) {
  const nb = normalise(book);
  const st = status(nb, todayIso).filter((s) => s.received.startsWith(String(year)));
  const sum = (xs) => xs.reduce((a, s) => a + s.offeringCents, 0);
  const pick = (state) => st.filter((s) => s.state === state);
  const outstanding = st.filter((s) => s.state === "open" || s.state === "scheduled");
  return {
    year: Number(year),
    received: { count: st.length, cents: sum(st) },
    celebrated: { count: pick("celebrated").length, cents: sum(pick("celebrated")) },
    transferred: { count: pick("transferred").length, cents: sum(pick("transferred")) },
    outstanding: { count: outstanding.length, cents: sum(outstanding) },
    pastOneYear: outstanding.filter((s) => s.daysLeft < 0).map((s) => s.id),
  };
}
