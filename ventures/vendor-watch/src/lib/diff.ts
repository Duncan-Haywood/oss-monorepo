// Small dependency-free word-level diff.
//
// Approach: trim the common prefix/suffix (cheap, and typically removes most
// of a page's unchanged boilerplate), then run a classic LCS/backtrack diff
// on whatever word span remains in the middle. If that remaining span is
// still too large for an O(n*m) table (a wholesale rewrite of a very long
// page), fall back to reporting the whole span as removed+added rather than
// spending unbounded time/memory on a granular diff.

export type DiffOp = { type: "same" | "added" | "removed"; value: string };

// n*m table cells; keeps worst-case memory/time bounded for a request/response demo.
const MAX_DP_CELLS = 400_000;

export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export function diffWords(oldText: string, newText: string): DiffOp[] {
  return diffTokens(tokenize(oldText), tokenize(newText));
}

export function diffTokens(oldTokens: string[], newTokens: string[]): DiffOp[] {
  let start = 0;
  const maxStart = Math.min(oldTokens.length, newTokens.length);
  while (start < maxStart && oldTokens[start] === newTokens[start]) start += 1;

  let oldEnd = oldTokens.length;
  let newEnd = newTokens.length;
  while (oldEnd > start && newEnd > start && oldTokens[oldEnd - 1] === newTokens[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  const ops: DiffOp[] = [];
  if (start > 0) {
    ops.push({ type: "same", value: oldTokens.slice(0, start).join(" ") });
  }

  const oldMid = oldTokens.slice(start, oldEnd);
  const newMid = newTokens.slice(start, newEnd);

  if (oldMid.length > 0 || newMid.length > 0) {
    if (oldMid.length * newMid.length > MAX_DP_CELLS) {
      if (oldMid.length > 0) ops.push({ type: "removed", value: oldMid.join(" ") });
      if (newMid.length > 0) ops.push({ type: "added", value: newMid.join(" ") });
    } else {
      ops.push(...lcsDiff(oldMid, newMid));
    }
  }

  const oldSuffix = oldTokens.slice(oldEnd);
  if (oldSuffix.length > 0) {
    ops.push({ type: "same", value: oldSuffix.join(" ") });
  }

  return ops;
}

function lcsDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let sameBuffer: string[] = [];
  let removedBuffer: string[] = [];
  let addedBuffer: string[] = [];

  const flushChange = () => {
    if (removedBuffer.length > 0) {
      ops.push({ type: "removed", value: removedBuffer.join(" ") });
      removedBuffer = [];
    }
    if (addedBuffer.length > 0) {
      ops.push({ type: "added", value: addedBuffer.join(" ") });
      addedBuffer = [];
    }
  };
  const flushSame = () => {
    if (sameBuffer.length > 0) {
      ops.push({ type: "same", value: sameBuffer.join(" ") });
      sameBuffer = [];
    }
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      flushChange();
      sameBuffer.push(a[i]);
      i += 1;
      j += 1;
    } else {
      flushSame();
      if (dp[i + 1][j] >= dp[i][j + 1]) {
        removedBuffer.push(a[i]);
        i += 1;
      } else {
        addedBuffer.push(b[j]);
        j += 1;
      }
    }
  }
  flushSame();
  while (i < n) {
    removedBuffer.push(a[i]);
    i += 1;
  }
  while (j < m) {
    addedBuffer.push(b[j]);
    j += 1;
  }
  flushChange();

  return ops;
}
