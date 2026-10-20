// A pairwise ranking engine that can be paused between any two comparisons.
//
// WHY IT IS SHAPED LIKE THIS
//
// The obvious way to rank a list by asking a person which of two items they
// prefer is to hand a comparator to `Array.prototype.sort`. That cannot work
// here: the comparator would have to block on a click, and there is nothing to
// block on in a browser. Every practical human-comparison ranker therefore has
// to invert the control flow -- the sort must be able to stop, hand out one
// question, and be resumed with the answer, possibly minutes later, possibly
// in a different tab after the state came back out of localStorage.
//
// So this is a bottom-up merge sort written as an explicit state machine
// rather than as recursion. The state is a plain JSON-serialisable object,
// which is what makes "close the tab halfway through and come back" work for
// free, and what lets undo be a stack of previous states rather than an
// inverse operation for each kind of step.
//
// Merge sort specifically, rather than the Elo or Bradley-Terry scoring most
// "rank these" tools reach for, because the number of questions is the whole
// user cost here. Merge sort asks about n·log2(n) questions and then stops,
// with a complete order. A scoring model needs several times that many random
// pairings before its ordering settles, and it never announces that it is
// done -- which is a worse trade for someone with 12 jobs and ten minutes.
//
// What merge sort assumes in exchange is transitivity: if you prefer A to B
// and B to C, it never asks about A and C, and records A above C. That
// assumption is the honest limitation of this approach and the page says so
// in as many words rather than burying it.

/**
 * Items as the engine will rank them: trimmed, blank lines dropped, and
 * duplicates removed keeping the first occurrence.
 *
 * Duplicates are removed rather than kept because a comparison between two
 * identical strings is a question with no meaning -- there is no answer a
 * person can give that carries information, and it still costs them a click.
 */
export function parseItems(text) {
  const seen = new Set();
  const items = [];
  for (const line of String(text ?? '').split('\n')) {
    const item = line.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    items.push(item);
  }
  return items;
}

/**
 * A fresh ranking over `items`.
 *
 * `runs` holds sorted index runs, shortest-first initially: every item is a
 * run of one. Each pass merges runs pairwise until a single run remains, and
 * that run is the ranking.
 */
export function createRanking(items) {
  const list = Array.isArray(items) ? items.map((item) => String(item)) : [];
  return settle({
    items: list,
    runs: list.map((_, index) => [index]),
    merge: null,
    comparisons: 0,
  });
}

/**
 * Move the machine forward through every step that needs no human answer.
 *
 * Two of them: finishing a merge whose one side has run out (the rest of the
 * other side is already in order, so it is appended without asking), and
 * starting the next merge. Both are loops rather than single steps because
 * finishing one merge can immediately make another startable, and the last
 * few merges of a run of one-item lists are almost all tail-flushing.
 *
 * Every entry point calls this before returning, so a returned state always
 * either carries a real question or is complete. A caller never has to ask
 * "is this state mid-step?" -- there is no such state.
 */
function settle(state) {
  let { runs, merge } = state;
  runs = runs.slice();

  for (;;) {
    if (merge) {
      const { left, right, li, ri, out } = merge;
      if (li >= left.length || ri >= right.length) {
        // One side is exhausted; the other is already sorted, so its tail
        // goes on in order. This is the step that makes the comparison count
        // sublinear in the obvious cases -- a list that is already in the
        // right order asks one question per merge and flushes the rest.
        const merged = out.concat(left.slice(li), right.slice(ri));
        runs.push(merged);
        merge = null;
        continue;
      }
      break; // A real question is waiting.
    }
    if (runs.length < 2) break; // Done, or a list of one.
    const left = runs.shift();
    const right = runs.shift();
    merge = { left, right, li: 0, ri: 0, out: [] };
  }

  return { ...state, runs, merge };
}

/** True once a single sorted run remains and no merge is in flight. */
export function isComplete(state) {
  return !state.merge && state.runs.length <= 1;
}

/**
 * The question to put to the person, or `null` when the ranking is complete.
 *
 * Returned as `{ left, right }` of `{ index, label }` so the page can render
 * the two choices without reaching into `merge` and without needing to know
 * that indices, rather than strings, are what actually move around.
 */
export function nextPair(state) {
  if (!state.merge) return null;
  const { left, right, li, ri } = state.merge;
  const a = left[li];
  const b = right[ri];
  if (a === undefined || b === undefined) return null;
  return {
    left: { index: a, label: state.items[a] },
    right: { index: b, label: state.items[b] },
  };
}

/**
 * Record an answer and return the next state. The argument is `'left'` or
 * `'right'`, naming the side the person picked.
 *
 * Returns the state unchanged for an unknown side or a completed ranking,
 * rather than throwing or advancing on a guess: this is called straight from
 * a click handler and from a keyboard shortcut, and a stray keypress after
 * the last comparison must not corrupt a finished ranking.
 */
export function choose(state, side) {
  if (!state.merge) return state;
  if (side !== 'left' && side !== 'right') return state;
  const { left, right, li, ri, out } = state.merge;
  if (li >= left.length || ri >= right.length) return state;

  const winner = side === 'left' ? left[li] : right[ri];
  const merge = {
    left,
    right,
    li: side === 'left' ? li + 1 : li,
    ri: side === 'right' ? ri + 1 : ri,
    out: out.concat([winner]),
  };
  return settle({ ...state, merge, comparisons: state.comparisons + 1 });
}

/** The ranking so far: the finished order once complete, otherwise empty. */
export function ranking(state) {
  if (!isComplete(state)) return [];
  return (state.runs[0] ?? []).map((index) => state.items[index]);
}

/**
 * Roughly how many questions a list of `n` items will take, for the progress
 * readout.
 *
 * This is merge sort's worst case, `ceil(n·log2(n) − n + 1)`: every merge of
 * two runs of length p and q can need p+q−1 comparisons. The real number is
 * usually lower, because a merge stops asking as soon as one side empties, so
 * the estimate is a ceiling the run tends to come in under.
 *
 * Shown as "about", and the page never renders a progress bar past 100%, for
 * that reason. A count that overshoots its own estimate reads as a bug even
 * when the estimate was the thing that was approximate.
 */
export function estimateComparisons(n) {
  const count = Number(n);
  if (!Number.isFinite(count) || count < 2) return 0;
  return Math.ceil(count * Math.log2(count) - count + 1);
}

/** Fraction complete in [0, 1], clamped, for the progress bar. */
export function progress(state) {
  if (isComplete(state)) return 1;
  const estimate = estimateComparisons(state.items.length);
  if (!estimate) return 1;
  return Math.min(1, state.comparisons / estimate);
}

/**
 * The finished ranking as CSV: position, then item.
 *
 * Quoted unconditionally and with `"` doubled, because job names are free
 * text a person pasted in -- "Ross, 14 Mill St" and `6" gutter run` are both
 * ordinary entries here and both break a naive join.
 */
export function toCsv(order) {
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = (Array.isArray(order) ? order : []).map(
    (label, index) => `${index + 1},${quote(label)}`,
  );
  return ['position,item', ...rows].join('\n');
}

/**
 * Encode a list for the share link.
 *
 * The *list* travels, never the answers. Sending someone your ranking tells
 * them what you decided; sending them the list lets them rank it themselves
 * and compare -- which is the thing two partners disagreeing about what to
 * take on actually want, and the reason this is worth a button at all.
 *
 * Base64 over UTF-8 bytes, then made URL-safe. `encodeURIComponent` alone
 * would work but turns every entry into a wall of percent escapes in a link
 * someone is about to paste into a text message.
 */
export function encodeList(items) {
  const text = (Array.isArray(items) ? items : []).join('\n');
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/**
 * Decode a share link's payload back into items.
 *
 * Anything malformed returns an empty list rather than throwing: this value
 * comes out of a URL, which means it can be truncated by a chat client, typed
 * by hand, or simply stale. The page treats an empty result as "no list was
 * shared" and shows its own empty state, which is the right outcome for all
 * three.
 */
export function decodeList(encoded) {
  if (!encoded) return [];
  try {
    let base64 = String(encoded).replaceAll('-', '+').replaceAll('_', '/');
    while (base64.length % 4) base64 += '=';
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return parseItems(new TextDecoder().decode(bytes));
  } catch {
    return [];
  }
}
