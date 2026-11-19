"""Peer-prediction mechanisms: elicit honest reports about a hidden state
using only *other agents' reports* as the scoring reference, with no access
to ground truth.

Implements two mechanisms from the peer-prediction literature, specialized
to binary reports (e.g. "this training step's gradient update was computed
correctly" vs. not):

- Peer Truth Serum (PTS): Jurca & Faltings (2009); see also Faltings &
  Radanovic, "Game Theory for Data Science: Eliciting Truthful Information"
  (2017), ch. 4. Pays agent i by comparing to a single reference peer j,
  scaled by the (empirical) population report frequency, so that truthful
  reporting is a strict Bayes-Nash equilibrium whenever reports are
  "stochastically relevant" to the hidden state, while any *uninformative*
  fixed/random strategy earns expected payment 0.

- Correlated Agreement (CA): Dasgupta & Ghosh (2013), "Crowdsourced Judgement
  Elicitation with Endogenous Proficiency"; Shnayder, Agarwal, Frongillo &
  Parkes (2016), "Informed Truthfulness in Multi-Task Peer Prediction".
  ``multi_task_ca_payment`` is the published multi-task mechanism (bonus
  task minus penalty task pair, scored by sign(Delta)). ``ca_payment`` is
  the bonus-only variant this package first shipped, and everything said
  below about vulnerability is about that variant only (quality audit
  2026-11-17).

  Delta[x][y] = P(same-task report pair = (x, y)) - P(cross-task pair =
  (x, y)) is estimated from the population's pairwise reports, with a random
  cross-task pairing as the baseline (``correlated_agreement_matrix``).

  The bonus-only variant pays Delta[r_i][r_j] on the shared task and nothing
  else. With a skewed base rate, Delta[(1, 1)] > 0, so a block that always
  reports the popular label collects that bonus on every task without
  looking (tests/test_simulation.py::test_ca_is_vulnerable_to_simultaneous_correlated_deviation).
  The published mechanism subtracts the score on a pair of distinct penalty
  tasks; a report independent of the signal agrees with its peer on the
  penalty pair exactly as often as on the bonus task, so its expected pay is
  zero. Shnayder et al. prove "informed truthfulness": truthful reporting
  pays at least as much as any other strategy profile, deviators acting
  together included, and strictly more than any uninformed one (given the
  sign of Delta). The same 14/3/3/2 population
  that breaks the bonus-only variant leaves the published one
  incentive-compatible (test_multi_task_ca_survives_simultaneous_correlated_deviation).
  What multi-task CA does not stop is a coordinated block that *does* look
  at its signals in a correlated way, which none of the agents here do.
"""

from __future__ import annotations

import random
from collections import defaultdict
from typing import Dict, Iterable, List, Tuple

_EPS = 1e-9


def _clip(p: float) -> float:
    return min(max(p, _EPS), 1 - _EPS)


def peer_truth_serum(report_i: int, report_peer: int, prior_prob_one: float) -> float:
    """Peer Truth Serum payment for report_i, scored against a single peer.

    Args:
        report_i: agent i's binary report (0 or 1).
        report_peer: a randomly selected peer's binary report.
        prior_prob_one: the common-knowledge (or empirically estimated)
            population probability that a report equals 1.

    Returns:
        The PTS payment. Truthful reporting is a strict Bayes-Nash
        equilibrium (given a "stochastically relevant" signal structure);
        any fixed/uninformative reporting strategy has expected payment 0.
    """
    prior_prob_one = _clip(prior_prob_one)
    peer_prob = prior_prob_one if report_peer == 1 else (1 - prior_prob_one)
    match = 1.0 if report_i == report_peer else 0.0
    return match / peer_prob - 1.0


def correlated_agreement_matrix(
    reports_by_agent: Dict[int, Dict[int, int]],
    rng: random.Random,
    n_shuffles: int = 200,
) -> Dict[Tuple[int, int], float]:
    """Estimate the CA "delta" matrix Delta[x][y] = P_same(x,y) - P_diff(x,y).

    Args:
        reports_by_agent: {agent_id: {task_id: report}}.
        rng: random.Random instance for the cross-task shuffle baseline.
        n_shuffles: number of random cross-task pairings used to estimate
            the "different task" baseline distribution.

    Returns:
        A dict mapping (x, y) in {0,1}x{0,1} to Delta[x][y].
    """
    agents = list(reports_by_agent)
    same_counts: Dict[Tuple[int, int], int] = defaultdict(int)
    same_total = 0
    for a_idx, agent_a in enumerate(agents):
        for agent_b in agents[a_idx + 1 :]:
            shared_tasks = set(reports_by_agent[agent_a]) & set(reports_by_agent[agent_b])
            for t in shared_tasks:
                x = reports_by_agent[agent_a][t]
                y = reports_by_agent[agent_b][t]
                same_counts[(x, y)] += 1
                same_total += 1

    diff_counts: Dict[Tuple[int, int], int] = defaultdict(int)
    diff_total = 0
    for a_idx, agent_a in enumerate(agents):
        tasks_a = list(reports_by_agent[agent_a])
        for agent_b in agents[a_idx + 1 :]:
            tasks_b = list(reports_by_agent[agent_b])
            if not tasks_a or not tasks_b:
                continue
            for _ in range(n_shuffles):
                t_a = rng.choice(tasks_a)
                t_b = rng.choice(tasks_b)
                if t_a == t_b:
                    continue
                x = reports_by_agent[agent_a][t_a]
                y = reports_by_agent[agent_b][t_b]
                diff_counts[(x, y)] += 1
                diff_total += 1

    delta: Dict[Tuple[int, int], float] = {}
    for x in (0, 1):
        for y in (0, 1):
            p_same = same_counts[(x, y)] / same_total if same_total else 0.0
            p_diff = diff_counts[(x, y)] / diff_total if diff_total else 0.0
            delta[(x, y)] = p_same - p_diff
    return delta


def ca_payment(report_i: int, report_peer: int, delta: Dict[Tuple[int, int], float]) -> float:
    """Bonus-only Correlated Agreement payment: Delta[report_i][report_peer]
    on the shared task, with no penalty term. This is *not* the published
    mechanism; it is kept because the original experiments used it and its
    collusion vulnerability comes from the missing penalty term. The
    published mechanism is ``multi_task_ca_payment``."""
    return delta.get((report_i, report_peer), 0.0)


def ca_score_matrix(
    delta: Dict[Tuple[int, int], float], mode: str = "sign"
) -> Dict[Tuple[int, int], float]:
    """Score matrix S(x, y) used by multi-task Correlated Agreement.

    ``mode="sign"`` is the published mechanism (Shnayder, Agarwal, Frongillo
    & Parkes 2016, "Informed Truthfulness in Multi-Task Peer Prediction",
    sec. 4): S(x, y) = 1 if Delta[x][y] > 0 else 0. ``mode="delta"`` uses
    Delta itself, which keeps the same sign structure but weights each
    pattern by its estimated strength.
    """
    if mode == "sign":
        return {k: (1.0 if v > 0 else 0.0) for k, v in delta.items()}
    if mode == "delta":
        return dict(delta)
    raise ValueError(f"unknown CA score mode {mode!r}")


def multi_task_ca_payment(
    reports_i: Dict[int, int],
    reports_peer: Dict[int, int],
    bonus_task: int,
    penalty_task_i: int,
    penalty_task_peer: int,
    score: Dict[Tuple[int, int], float],
) -> float:
    """Multi-task Correlated Agreement payment (Dasgupta & Ghosh 2013;
    Shnayder et al. 2016): the score on a shared *bonus* task minus the
    score on a pair of *distinct penalty* tasks, one answered by each agent.

        pay = S(r_i[b], r_j[b]) - S(r_i[p], r_j[q]),   b, p, q distinct

    The penalty term is what makes any uninformative strategy (always
    "correct", a fixed label, a coin flip) earn zero in expectation: such a
    report agrees with the peer on the penalty pair exactly as often as on
    the bonus task. ``ca_payment`` (bonus term only) lacks it.
    """
    if len({bonus_task, penalty_task_i, penalty_task_peer}) != 3:
        raise ValueError("bonus and the two penalty tasks must be distinct")
    bonus = score.get((reports_i[bonus_task], reports_peer[bonus_task]), 0.0)
    penalty = score.get((reports_i[penalty_task_i], reports_peer[penalty_task_peer]), 0.0)
    return bonus - penalty


def empirical_prior(reports: Iterable[int]) -> float:
    reports = list(reports)
    if not reports:
        return 0.5
    return sum(reports) / len(reports)
