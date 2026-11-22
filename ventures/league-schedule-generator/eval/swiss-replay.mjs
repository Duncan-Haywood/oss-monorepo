// Replay helper for eval/swiss-vs-published.mjs and the other Swiss eval scripts: pair one round of a
// parsed TRF from the rounds before it, as the page would after opening the file. The code moved to
// round-check.mjs (2026-11-22) so the page's "Check a round" uses the same replay.
export { replayRound as pairRound } from "../round-check.mjs";
