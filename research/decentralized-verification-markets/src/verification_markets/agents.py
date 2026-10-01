"""Verifier agent models and synthetic training-step tasks.

Models the setting from Gensyn's Verde ("a verification system for machine
learning over untrusted nodes") and Credibly Neutral AI Oracles: a stream of
training steps, each of which was either computed correctly or is faulty /
fraudulent, and a population of verifiers who each get a noisy private
signal about correctness and must report it. Ground-truth recomputation
(the "referee" in Verde, the audited report layer in Credibly Neutral AI
Oracles) is expensive and only applied to a small audited subset; peer
prediction is used to price the other reports.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Dict, List


def generate_tasks(n_tasks: int, corruption_rate: float, rng: random.Random) -> List[int]:
    """Generate ground-truth correctness labels for `n_tasks` training steps.

    Each step is correct (1) with probability `1 - corruption_rate`, and
    faulty/fraudulent (0) otherwise.
    """
    return [0 if rng.random() < corruption_rate else 1 for _ in range(n_tasks)]


STRATEGIES = ("honest", "lazy", "colluding", "adversarial", "sleeper", "intermittent", "whitewash", "late_whitewash",
              "intermittent_whitewash")


@dataclass
class Verifier:
    """A verifier agent with a fixed reporting strategy.

    Strategies:
        honest: observes a noisy private signal of ground truth and reports
            it truthfully.
        lazy: skips verification (no signal cost) and always reports the
            modal outcome ("correct"), free-riding on other verifiers.
        colluding: a coordinated block that always reports a fixed value
            ("correct") regardless of the true signal, attempting to
            whitewash faulty steps cheaply.
        adversarial: observes the true signal but reports its negation,
            actively trying to flip the aggregate verdict (e.g. to get a
            fraudulent training update accepted).
        sleeper: a mechanism-aware trust-farming adversary. Reports
            honestly for tasks before ``switch_task`` (so any trust weight
            bootstrapped from that early window looks honest), then always
            reports "correct" like a colluder. Targets the one-shot
            calibration window used by ``reputation.py``.
        intermittent: an on/off trust-farming adversary. Honest before
            ``switch_task``; afterwards, in every ``period``-task cycle it
            reports honestly for the first ``(1 - defect_fraction)`` of the
            cycle and always reports "correct" for the rest. Targets
            rolling trust: defection is spread thin and interleaved with
            honest play, so a decayed PTS average may stay above the trust
            threshold.
        whitewash: a stealth, PTS-aware adversary. Honest except that
            when its private signal says "faulty" it reports "correct" with
            probability ``whitewash_prob``. Faulty steps are the minority
            label, so this deviation touches few tasks and barely moves an
            averaged Peer Truth Serum score (and hence trust), yet it is
            exactly the deviation that lets fraudulent training steps
            through.
        late_whitewash: sleeper + whitewash. Fully honest before
            ``switch_task`` (so calibration-window trust of either kind
            looks honest), then behaves as ``whitewash`` for the rest of the
            stream. Targets calibration-only minority-label trust.
        intermittent_whitewash: whitewash on an on/off schedule. Honest
            before ``switch_task``; afterwards, in each ``period``-task cycle
            it is honest for the first ``1 - defect_fraction`` and behaves as
            ``whitewash`` for the rest. Targets rolling minority-label trust:
            honest phases can buy trust back between bursts of lying.
    """

    id: int
    strategy: str
    signal_noise: float = 0.1
    switch_task: int = 0
    period: int = 100
    defect_fraction: float = 0.5
    whitewash_prob: float = 0.5

    def __post_init__(self) -> None:
        if self.strategy not in STRATEGIES:
            raise ValueError(f"unknown strategy: {self.strategy!r}")
        if not 0.0 <= self.signal_noise < 0.5:
            raise ValueError("signal_noise must be in [0, 0.5)")
        if self.period < 1:
            raise ValueError("period must be >= 1")
        if not 0.0 <= self.defect_fraction <= 1.0:
            raise ValueError("defect_fraction must be in [0, 1]")
        if not 0.0 <= self.whitewash_prob <= 1.0:
            raise ValueError("whitewash_prob must be in [0, 1]")

    def is_defecting(self, task_index: int) -> bool:
        """Whether a sleeper / intermittent verifier defects on this task."""
        if self.strategy == "sleeper":
            return task_index >= self.switch_task
        if self.strategy == "intermittent" and task_index >= self.switch_task:
            phase = (task_index - self.switch_task) % self.period
            return phase >= self.period * (1.0 - self.defect_fraction)
        return False

    def _in_burst(self, task_index: int) -> bool:
        if task_index < self.switch_task:
            return False
        phase = (task_index - self.switch_task) % self.period
        return phase >= self.period * (1.0 - self.defect_fraction)

    def _observe(self, ground_truth: int, rng: random.Random) -> int:
        """Private noisy signal: correct w.p. 1 - signal_noise."""
        return ground_truth if rng.random() > self.signal_noise else 1 - ground_truth

    def report(self, ground_truth: int, rng: random.Random, task_index: int = 0) -> int:
        if self.is_defecting(task_index):
            # Still draw the signal so the rng stream matches honest play.
            self._observe(ground_truth, rng)
            return 1
        if self.strategy == "lazy":
            return 1
        if self.strategy == "colluding":
            return 1
        signal = self._observe(ground_truth, rng)
        if self.strategy == "adversarial":
            return 1 - signal
        stealth = (
            self.strategy == "whitewash"
            or (self.strategy == "late_whitewash" and task_index >= self.switch_task)
            or (self.strategy == "intermittent_whitewash" and self._in_burst(task_index))
        )
        if stealth and signal == 0:
            return 1 if rng.random() < self.whitewash_prob else 0
        return signal  # honest
