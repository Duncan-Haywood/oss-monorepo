// The fewest out-of-target lane counts any deal can reach, proved by a solver, for even leagues whose
// floor/ceil lane split is out of reach (bowling-proofs.mjs). Key "teams,round-robin weeks" for
// roundRobin(teams) played in order from round 1, as bowlingSchedule() plays it; value: the minimum
// of offBound (bowling.mjs: each count above its pair's ceiling or below its floor counts once).
// From eval/bowling-mirror-cpsat.py --soft (OR-Tools CP-SAT, status OPTIMAL: answer = proved bound),
// 2026-11-24; every run is in eval/bowling-lane-min-2026-11-24.txt. A season whose deal reaches its
// minimum is reported as the most even split possible, not merely the best this search found.
export const LANE_MIN = {
};
