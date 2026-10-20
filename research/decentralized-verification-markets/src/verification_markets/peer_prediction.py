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
  Elicitation with Endogenous Proficiency". The version here is a
  deliberately simplified, practically-implementable variant: it estimates
  the "same task" joint report distribution against a "different task"
  baseline (via random cross-task pairing) and scores agreement by how much
  more correlated same-task reports are than the baseline. This captures the
  core CA idea -- reward reports that are *surprisingly* correlated with
  peers on the same task, not just reports that match -- but does not
  reproduce the full generality of the original theorem (which requires a
  richer signal structure and a matrix-decomposition argument for strict
  properness).

  Concretely: the delta matrix below is estimated by pooling reports across
  the *whole* population, including any deviating agents' own reports. The
  original theorem's incentive-compatibility guarantee is for a single agent
  unilaterally deviating while the rest of the population reports honestly;
  it says nothing about a sub-population deviating *simultaneously* in a
  correlated way (e.g. a colluding block that always reports the majority
  label). See tests/test_simulation.py::test_ca_is_vulnerable_to_simultaneous_correlated_deviation
  for a concrete demonstration: under a skewed base rate and a large enough
  colluding/lazy block, the pooled delta matrix gets dominated by genuine
  honest-honest correlation, and the colluding block can free-ride on it and
  out-earn honest reporting. Peer Truth Serum's prior-normalization does not
  have this failure mode in the same setting, because dividing by the peer's
  marginal report probability directly cancels out the "always guess the
  popular answer" exploit.
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
    """Correlated Agreement payment: reward reports whose pairwise pattern
    with a peer is more common on shared tasks than on random cross-task
    pairings, i.e. Delta[report_i][report_peer]."""
    return delta.get((report_i, report_peer), 0.0)


def empirical_prior(reports: Iterable[int]) -> float:
    reports = list(reports)
    if not reports:
        return 0.5
    return sum(reports) / len(reports)
