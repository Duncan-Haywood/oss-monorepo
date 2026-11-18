# ratelimit-burst: how far over its limit can a rate limiter be pushed, and does "sliding window" really mean never more than the limit?

A new question outside the priority tracks (a free-choice run). API rate limiting is everywhere, and the usual advice is that fixed windows allow a 2x burst at a boundary while "sliding" ones fix it. This project measures what each of five common limiters actually admits in a *true* rolling window, with an exhaustive adversarial search at small sizes and a Poisson overload test. Produced with AI assistance. **Stylised**: integer ticks, one client, a single limiter instance, no clock skew or distributed state.

**Live page:** https://marisstella.app/research/ratelimit-burst/

## Question

A limiter is configured "at most L requests per window of W ticks". An adversary (or a bursty client) chooses arrival times. What is the largest number of *admitted* requests in any rolling window of W ticks, for fixed window, sliding log, sliding-window counter, token bucket (capacity L, refill L/W per tick) and leaky bucket (as a meter, capacity L)?

## Headline (worst admitted count in any rolling window, as a multiple of L)

| limiter | L=10, W=20 | L=20, W=40 | L=50, W=100 |
|---|---|---|---|
| fixed window | 2.00 | 2.00 | 2.00 |
| sliding log | 1.00 | 1.00 | 1.00 |
| sliding counter (two weighted windows) | 1.90* | 1.95* | 1.98* |
| token bucket | 1.90 | 1.95 | 1.98 |
| leaky bucket (meter) | 1.90 | 1.95 | 1.98 |

*Correction, 2026-11-10 (quality audit, `portfolio/quality/audits/2026-11-10-ratelimit-burst.json`): this row read 1.40, 1.45, 1.48, which is what `experiments/results.txt` still reports. Both searches send at most one request per tick, and with L = W/2 that caps what any window can be offered. Sending L requests in the last tick of one window and then L per tick admits 2L - 1 (19, 39, 99) with the same `SlidingCounter`; `tests/test_limiters.py::test_sliding_counter_batched_arrivals_reach_2l_minus_1` pins it. The searches in `analysis.py` have not been extended yet.

- **Only the sliding log keeps the limit exactly.** It stores every timestamp; the others do not.
- **The sliding-window counter is no better than a bucket in the worst case**: with batched arrivals (L requests in the last tick of one window, then a flood) it admits 2L - 1 in a rolling window. Under the one-request-per-tick searches it reaches only 1.40-1.48 L, which was this README's earlier, wrong headline.
- **Token bucket and leaky bucket allow nearly 2 L** (2L - 1 here, because of integer ticks): a full bucket of L plus L refilled during the window. They bound the *long-run* rate, not the window count. In this model the two are mirror images and give identical numbers.
- **Under ordinary Poisson overload** (L=50, W=100) the long-run admitted rate is about L for all of them (sliding log and counter slightly under, 48-49.7 at 1.5-3x load), but the share of rolling windows that exceed L differs a lot: at 1.5x offered load, 47% for fixed window, 39% for token and leaky bucket, 8.8% for the sliding counter and 0% for the sliding log.

If the limit protects something that breaks above L in any W (a downstream with a hard concurrency or per-second quota), use a sliding log, or set the others' L to about L/2 (fixed, token, leaky and sliding counter) and accept the lower sustained throughput.

## Builds on (and does not claim affiliation with)

- Fixed-window boundary bursts and token-bucket burst allowance are textbook. The b + rT bound on a token bucket's output is the arrival curve of network calculus (Cruz 1991; Le Boudec and Thiran, *Network Calculus*, 2001); GCRA is the ATM Forum's (Traffic Management 4.0, 1996); the sliding-window counter is the approximation Cloudflare described in 2017. The worst cases here are consistent with those; what is left of this project's own is the side-by-side overload comparison.

## Method

`src/ratelimit_burst/limiters.py` has the five limiters on an integer tick clock. `analysis.py`: `flood_pattern_search` (silent for `idle` ticks then one request per tick, over every idle in [0, 2W)); `two_burst_search` (flood, silence, flood, over all start, length and gap choices; run for W <= 40); `poisson_overload` (Poisson arrivals at a multiple of the nominal rate, 2,000 windows, seed 1). The worst case is the larger of the two searches. Both are searches, not proofs, so a column is a lower bound on the true worst case; both send at most one request per tick, so neither covers bursts within a tick (see the correction under the table).

## Reproduce

```bash
cd research/ratelimit-burst
pip install pytest
PYTHONPATH=src python3 -m pytest -q tests                              # 8 tests, under a second
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt    # about 15 s
```

## Results (all from `experiments/results.txt`)

Section 1: worst rolling-window count for three sizes. Section 2: Poisson overload at 0.8, 1.5, 3 and 10 times the nominal rate.

## Limitations

- **Searches, not proofs, and one request per tick.** Only adversary families I tried are covered, and none sends a batch in one tick; a cleverer pattern could push a column higher (never lower).
- **One client, one process.** Distributed limiters (per-node buckets, eventual counters) add error this does not model.
- **Integer ticks.** Real clocks are continuous; the 2L - 1 for buckets would approach 2L.
- **Token and leaky bucket parameters.** Capacity equal to L is the common default; a smaller capacity reduces the burst to capacity + refill, which I did not tabulate.
- Poisson arrivals are not how real clients behave; retries and synchronised clients are burstier.

## Next steps

- Add a batched-arrival search to `analysis.py`, regenerate `results.txt` and the table, and tabulate smaller bucket capacities.
- Run recorded request traces (the owner's call, as it concerns data).

## Owner steps

None.

## Outside dependencies

pytest only. No model, dataset, service or hardware.
