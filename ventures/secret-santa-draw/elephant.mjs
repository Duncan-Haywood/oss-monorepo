// White elephant (Yankee swap, Dirty Santa) game engine.
//
// Pure functions over a plain JSON state, so the page can save a game in local
// storage, undo by keeping old states, and the tests can play thousands of
// random games against the rules.
//
// The game: players go in a drawn order. On a turn the active player either
// opens a new gift (the turn ends) or steals an opened gift from someone, who
// then becomes the active player and makes the same choice. House rules:
//   maxSteals      a gift is frozen after this many steals (0 = never frozen)
//   perTurn        steals allowed in one turn before someone must open (0 = no cap)
//   noStealBack    a player who just lost a gift cannot take that same gift
//                  straight back in the same turn
//   finalSwap      when every gift is open, the first player may swap once with
//                  any gift that is not frozen

export const MAX_PLAYERS = 120;
export const MAX_LABEL = 60;
export const DEFAULT_RULES = Object.freeze({ maxSteals: 3, perTurn: 0, noStealBack: true, finalSwap: true });

// Fisher-Yates with a supplied rng (calc.mjs's mulberry32), so a seed replays.
export function drawOrder(n, rng) {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export function normaliseRules(r = {}) {
  const int = (v, d) => (Number.isInteger(Number(v)) && Number(v) >= 0 ? Math.min(Number(v), 99) : d);
  return {
    maxSteals: int(r.maxSteals, DEFAULT_RULES.maxSteals),
    perTurn: int(r.perTurn, DEFAULT_RULES.perTurn),
    noStealBack: r.noStealBack === undefined ? DEFAULT_RULES.noStealBack : Boolean(r.noStealBack),
    finalSwap: r.finalSwap === undefined ? DEFAULT_RULES.finalSwap : Boolean(r.finalSwap),
  };
}

export function newGame({ names, order, rules }) {
  if (!Array.isArray(names) || names.length < 2) return { ok: false, message: "Add at least two players." };
  if (names.length > MAX_PLAYERS) return { ok: false, message: `At most ${MAX_PLAYERS} players.` };
  const n = names.length;
  const ord = order ?? names.map((_, i) => i);
  if (ord.length !== n || new Set(ord).size !== n || ord.some((i) => !Number.isInteger(i) || i < 0 || i >= n)) {
    return { ok: false, message: "The turn order must list every player once." };
  }
  return {
    ok: true,
    state: {
      v: 1,
      names: names.slice(),
      order: ord.slice(),
      rules: normaliseRules(rules),
      gifts: [], // { label, holder, steals, openedBy }
      turn: 0, // index into order of the player whose turn it is
      active: ord[0], // who must move now (changes after each steal)
      turnSteals: 0,
      blocked: {}, // player -> gift index they may not take back this turn
      phase: "play", // play | final | done
      log: [],
    },
  };
}

export const holding = (s, p) => s.gifts.findIndex((g) => g.holder === p);
export const frozen = (s, g) => s.rules.maxSteals > 0 && s.gifts[g].steals >= s.rules.maxSteals;

// Why the active player may not steal gift g, or "" if they may.
export function stealBlock(s, g) {
  const gift = s.gifts[g];
  if (!gift) return "No such gift.";
  if (s.phase === "done") return "The game is over.";
  if (s.phase === "final") {
    if (gift.holder === s.active) return "That is already yours.";
    if (frozen(s, g)) return "Frozen: it has been stolen the most times allowed.";
    return "";
  }
  if (gift.holder === s.active) return "That is already yours.";
  if (frozen(s, g)) return "Frozen: it has been stolen the most times allowed.";
  if (s.rules.perTurn > 0 && s.turnSteals >= s.rules.perTurn) return "No more steals this turn: open a new gift.";
  if (s.rules.noStealBack && s.blocked[s.active] === g) return "No stealing straight back: it was just taken from you.";
  return "";
}

export function moves(s) {
  if (s.phase === "done") return { canOpen: false, steal: [], canKeep: false };
  const steal = s.gifts.map((_, g) => g).filter((g) => !stealBlock(s, g));
  if (s.phase === "final") return { canOpen: false, steal, canKeep: true };
  return { canOpen: true, steal, canKeep: false };
}

const copy = (s) => structuredClone(s);

function endTurn(s) {
  s.turn += 1;
  s.turnSteals = 0;
  s.blocked = {};
  if (s.turn < s.order.length) {
    s.active = s.order[s.turn];
    return;
  }
  const first = s.order[0];
  if (s.rules.finalSwap && s.gifts.some((g, i) => g.holder !== first && !frozen(s, i))) {
    s.phase = "final";
    s.active = first;
  } else {
    s.phase = "done";
    s.active = -1;
  }
}

// action: { type: "open", label } | { type: "steal", gift } | { type: "keep" }
export function apply(state, action) {
  const s = copy(state);
  const who = s.names[s.active];
  if (s.phase === "done") return { ok: false, message: "The game is over." };
  if (action?.type === "open") {
    if (s.phase !== "play") return { ok: false, message: "Every gift is open." };
    if (holding(s, s.active) !== -1) return { ok: false, message: `${who} already holds a gift.` };
    const label = String(action.label ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_LABEL) || `Gift ${s.gifts.length + 1}`;
    s.gifts.push({ label, holder: s.active, steals: 0, openedBy: s.active });
    s.log.push(`${who} opened ${label}.`);
    endTurn(s);
    return { ok: true, state: s };
  }
  if (action?.type === "steal") {
    const g = action.gift;
    const why = stealBlock(s, g);
    if (why) return { ok: false, message: why };
    const gift = s.gifts[g];
    const victim = gift.holder;
    if (s.phase === "final") {
      const mine = holding(s, s.active);
      gift.holder = s.active;
      gift.steals += 1;
      if (mine !== -1) s.gifts[mine].holder = victim;
      s.log.push(`${who} swapped for ${gift.label} with ${s.names[victim]}.`);
      s.phase = "done";
      s.active = -1;
      return { ok: true, state: s };
    }
    gift.holder = s.active;
    gift.steals += 1;
    s.turnSteals += 1;
    s.log.push(`${who} stole ${gift.label} from ${s.names[victim]}${frozen(s, g) ? " (now frozen)" : ""}.`);
    if (s.rules.noStealBack) s.blocked[victim] = g;
    s.active = victim;
    return { ok: true, state: s };
  }
  if (action?.type === "keep") {
    if (s.phase !== "final") return { ok: false, message: "Keeping is only for the final swap." };
    s.log.push(`${who} kept their gift.`);
    s.phase = "done";
    s.active = -1;
    return { ok: true, state: s };
  }
  return { ok: false, message: "Unknown move." };
}

// Invariants the tests check after every move.
export function checkState(s) {
  const problems = [];
  const holders = s.gifts.map((g) => g.holder);
  if (new Set(holders).size !== holders.length) problems.push("a player holds two gifts");
  if (s.phase === "play") {
    const done = new Set(s.order.slice(0, s.turn));
    // Everyone who has had a turn holds a gift, except the one now choosing.
    for (const p of done) if (p !== s.active && !holders.includes(p)) problems.push(`${s.names[p]} has no gift`);
    if (holders.includes(s.active)) problems.push("the active player already holds a gift");
    if (s.gifts.length !== s.turn) problems.push("gift count does not match turns taken");
  } else {
    if (s.gifts.length !== s.names.length) problems.push("not every gift is open");
  }
  if (s.rules.maxSteals > 0 && s.gifts.some((g) => g.steals > s.rules.maxSteals)) problems.push("a gift was stolen past its limit");
  return problems;
}

export function results(s) {
  return s.names.map((name, p) => {
    const g = holding(s, p);
    return { name, gift: g === -1 ? "" : s.gifts[g].label, steals: g === -1 ? 0 : s.gifts[g].steals };
  });
}

const cell = (v) => {
  const t = String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(t) && !/^-?\d[\d,.]*$/.test(t) ? "'" + t : t; // formula injection guard (CWE-1236)
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function resultsCsv(s) {
  return ["Player,Gift,Times stolen", ...results(s).map((r) => [r.name, r.gift, r.steals].map(cell).join(","))].join("\r\n") + "\r\n";
}

export function resultsText(s) {
  return results(s).map((r) => `${r.name}: ${r.gift || "(no gift)"}`).join("\n");
}

// Most moves a game can take under the rules (opens plus steals plus the final
// swap). The last gift opened ends play, so it can only be taken in the final
// swap; every other gift can be stolen up to maxSteals times. With no freeze
// limit and no per-turn cap a game can loop for ever, so the bound is null.
export function maxMoves(n, rules) {
  const r = normaliseRules(rules);
  if (r.maxSteals === 0 && r.perTurn === 0) return null;
  let steals = r.maxSteals === 0 ? Infinity : r.maxSteals * (n - 1);
  if (r.perTurn > 0) steals = Math.min(steals, r.perTurn * (n - 1));
  return n + steals + (r.finalSwap ? 1 : 0);
}

// Play one game where every active player steals with probability p when a
// steal is allowed (picking uniformly among the allowed gifts), otherwise
// opens. The final swap is taken with the same probability. Returns the move
// count. This is a stated toy policy for sizing a game, not a model of people.
export function simulate(n, rules, p, rng) {
  let s = newGame({ names: Array.from({ length: n }, (_, i) => `P${i + 1}`), rules }).state;
  let movesMade = 0;
  for (let guard = 0; guard < 100000 && s.phase !== "done"; guard++) {
    const m = moves(s);
    let act;
    if (m.steal.length && rng() < p) act = { type: "steal", gift: m.steal[Math.floor(rng() * m.steal.length)] };
    else act = s.phase === "final" ? { type: "keep" } : { type: "open", label: "" };
    const r = apply(s, act);
    if (!r.ok) throw new Error(r.message);
    s = r.state;
    if (act.type !== "keep") movesMade += 1;
  }
  return { moves: movesMade, state: s };
}

export const EXAMPLE = {
  names: "Ann\nBen\nCara\nDev\nEmi\nFinn\nGus\nHana\nIvo\nJo",
  gifts: ["Fuzzy socks", "Hot sauce trio", "Desk cactus", "Board game", "Coffee beans", "Mystery mug", "Puzzle", "Candle", "Bluetooth speaker", "Cookbook"],
};
