#!/usr/bin/env python3
"""Where an agent run's tokens go: category shares, context growth, tool mix, time.

Reads the `usage` block that `prompts/runcost.py attach` writes into run records
under prompts/runs/, one run per session id. Stdlib only.

    python3 docs/reports/assets/token-flow/analyze.py > docs/reports/assets/token-flow/results.txt
    python3 docs/reports/assets/token-flow/analyze.py --transcript ~/.claude/projects/<dir>/<session>.jsonl
"""
from __future__ import annotations

import argparse
import glob
import json
import random
import statistics as st
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
PRICING = json.loads((ROOT / "prompts" / "pricing.json").read_text())["models"]
CATS = ("cache_read", "cache_write_5m", "cache_write_1h", "input", "output")


def load_runs() -> list[dict]:
    runs: dict[str, dict] = {}
    for f in sorted(glob.glob(str(ROOT / "prompts" / "runs" / "*.json"))):
        try:
            rec = json.loads(Path(f).read_text())
        except (OSError, ValueError):
            continue
        u = rec.get("usage")
        if not isinstance(u, dict) or "totals" not in u or not u.get("models"):
            continue
        t = u["totals"]
        if not t.get("requests"):
            continue
        sid = u.get("session_id") or rec.get("session") or f
        # A session attached twice keeps the later (larger) measurement.
        if sid in runs and runs[sid]["requests"] >= t["requests"]:
            continue
        usd = defaultdict(float)
        for model, m in u["models"].items():
            rates = PRICING.get(model)
            if not rates:
                continue
            for c in CATS:
                usd[c] += m.get(c, 0) * rates[c] / 1e6
        tm = u.get("time") or {}
        runs[sid] = {
            "track": rec.get("track") or "unknown",
            "model": u.get("primary_model") or "unknown",
            "requests": t["requests"],
            "tok": {c: t.get(c, 0) for c in CATS},
            "thinking": t.get("thinking", 0),
            "usd": dict(usd),
            "tools": u.get("tools") or {},
            "tool_calls": u.get("tool_calls") or 0,
            "transcripts": u.get("transcripts") or 1,
            "model_min": tm.get("model_minutes") or 0.0,
            "tool_min": tm.get("tool_minutes") or 0.0,
            "wait_min": tm.get("waiting_on_human_minutes") or 0.0,
            "active_min": tm.get("active_minutes") or 0.0,
            "merged": rec.get("merged"),
            "date": (u.get("first") or "")[:10],
        }
    return list(runs.values())


def q(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(p * len(xs)))]


def boot_median(xs, n=2000, seed=1):
    rng = random.Random(seed)
    meds = sorted(st.median(rng.choices(xs, k=len(xs))) for _ in range(n))
    return meds[int(0.025 * n)], meds[int(0.975 * n)]


def ols(x, y):
    mx, my = st.fmean(x), st.fmean(y)
    sxx = sum((a - mx) ** 2 for a in x)
    b = sum((a - mx) * (c - my) for a, c in zip(x, y)) / sxx
    return my - b * mx, b


def ctx(r):
    t = r["tok"]
    return t["cache_read"] + t["cache_write_5m"] + t["cache_write_1h"] + t["input"]


def pct(a, b):
    return 100.0 * a / b if b else 0.0


def report(runs: list[dict]) -> None:
    n = len(runs)
    dates = sorted(r["date"] for r in runs if r["date"])
    print(f"runs with a measured usage block (one per session): {n}, {dates[0]} to {dates[-1]}")
    print("models:", dict(Counter(r["model"] for r in runs).most_common()))
    print("tracks:", dict(Counter(r["track"] for r in runs).most_common()))

    print("\n## 1. Token categories, all runs pooled")
    tot = {c: sum(r["tok"][c] for r in runs) for c in CATS}
    usd = {c: sum(r["usd"].get(c, 0) for r in runs) for c in CATS}
    T, U = sum(tot.values()), sum(usd.values())
    think = sum(r["thinking"] for r in runs)
    print(f"{'category':16}{'tokens':>16}{'% tokens':>10}{'API-eq $':>12}{'% $':>8}")
    for c in CATS:
        print(f"{c:16}{tot[c]:>16,}{pct(tot[c], T):>9.2f}%{usd[c]:>12,.2f}{pct(usd[c], U):>7.1f}%")
    print(f"{'total':16}{T:>16,}{100:>9.2f}%{U:>12,.2f}{100:>7.1f}%")
    print(f"thinking (inside output): {think:,} = {pct(think, tot['output']):.1f}% of output tokens")
    print(f"tokens the model reads per token it writes: {(T - tot['output']) / tot['output']:.0f}")

    print("\n## 2. Per-run distributions (median [p10, p90])")
    def row(name, xs, fmt="{:,.0f}"):
        lo, hi = boot_median(xs)
        print(f"{name:42} median {fmt.format(st.median(xs))} [p10 {fmt.format(q(xs, .1))}, "
              f"p90 {fmt.format(q(xs, .9))}]  95% CI of median {fmt.format(lo)} to {fmt.format(hi)}")
    row("requests per run", [r["requests"] for r in runs])
    row("tool calls per run", [r["tool_calls"] for r in runs])
    row("tokens read per run (context, all requests)", [ctx(r) for r in runs])
    row("mean context per request", [ctx(r) / r["requests"] for r in runs])
    row("output tokens per run", [r["tok"]["output"] for r in runs])
    row("output tokens per request", [r["tok"]["output"] / r["requests"] for r in runs])
    row("API-equivalent $ per run", [sum(r["usd"].values()) for r in runs], "{:,.2f}")
    row("cache_read share of run $ (%)", [pct(r["usd"].get("cache_read", 0), sum(r["usd"].values()))
                                          for r in runs if sum(r["usd"].values())], "{:.1f}")
    row("cache_write share of run $ (%)", [pct(r["usd"].get("cache_write_5m", 0) + r["usd"].get("cache_write_1h", 0),
                                               sum(r["usd"].values())) for r in runs if sum(r["usd"].values())], "{:.1f}")
    row("output share of run $ (%)", [pct(r["usd"].get("output", 0), sum(r["usd"].values()))
                                      for r in runs if sum(r["usd"].values())], "{:.1f}")

    print("\n## 3. Context growth: mean context per request = P + g * requests / 2")
    xs = [r["requests"] for r in runs]
    ys = [ctx(r) / r["requests"] for r in runs]
    a, b = ols(xs, ys)
    print(f"OLS over {n} runs: P (context at request 1) = {a:,.0f} tokens; g (growth per request) = {2 * b:,.0f} tokens")
    rng = random.Random(1)
    bs = []
    for _ in range(1000):
        idx = rng.choices(range(n), k=n)
        aa, bb = ols([xs[i] for i in idx], [ys[i] for i in idx])
        bs.append((aa, 2 * bb))
    pa, pg = sorted(x[0] for x in bs), sorted(x[1] for x in bs)
    print(f"bootstrap 95%: P {pa[25]:,.0f} to {pa[974]:,.0f}; g {pg[25]:,.0f} to {pg[974]:,.0f}")
    fixed = sum(a * r["requests"] for r in runs)
    allread = sum(ctx(r) for r in runs)
    print(f"share of all tokens read that is the fixed prefix re-read each request (P x requests): {pct(fixed, allread):.1f}%")
    print(f"share that is accumulated work (tool results, prior turns) re-read: {100 - pct(fixed, allread):.1f}%")
    for lo, hi in ((1, 25), (25, 50), (50, 100), (100, 200), (200, 10**9)):
        sel = [r for r in runs if lo <= r["requests"] < hi]
        if sel:
            m = st.median([ctx(r) / r["requests"] for r in sel])
            share = pct(sum(r["tok"]["output"] for r in sel), sum(ctx(r) + r["tok"]["output"] for r in sel))
            per_out = st.median([sum(r["usd"].values()) / max(1, r["tok"]["output"]) * 1000 for r in sel])
            print(f"  requests {lo:>3}-{hi if hi < 10**9 else '':<4} runs {len(sel):>4}  median context/request {m:>9,.0f}"
                  f"  output share of tokens {share:.2f}%  median $ per 1k output tokens {per_out:.3f}")

    print("\n## 4. Where the API-equivalent $ goes, by run size quartile (requests)")
    srt = sorted(runs, key=lambda r: r["requests"])
    k = len(srt) // 4
    allusd = sum(sum(r["usd"].values()) for r in runs)
    for i in range(4):
        sel = srt[i * k:(i + 1) * k] if i < 3 else srt[3 * k:]
        s = sum(sum(r["usd"].values()) for r in sel)
        print(f"  Q{i + 1}: requests {sel[0]['requests']}-{sel[-1]['requests']}, {len(sel)} runs, {pct(s, allusd):.1f}% of $")

    print("\n## 5. Tool calls: share of all calls")
    tc = Counter()
    for r in runs:
        tc.update(r["tools"])
    TT = sum(tc.values())
    for name, c in tc.most_common(15):
        print(f"  {name:48}{c:>7,}{pct(c, TT):>7.1f}%")
    gh = sum(c for k2, c in tc.items() if k2.startswith("mcp__github__"))
    print(f"  all mcp__github__* tools: {gh:,} ({pct(gh, TT):.1f}%); ToolSearch: {tc['ToolSearch']:,} ({pct(tc['ToolSearch'], TT):.1f}%)")
    print(f"  requests per tool call (pooled): {sum(r['requests'] for r in runs) / max(1, TT):.2f}"
          " (below 1 means calls were batched in parallel)")

    print("\n## 6. Time (pooled minutes)")
    mm, tm, wm = (sum(r[k2] for r in runs) for k2 in ("model_min", "tool_min", "wait_min"))
    print(f"  model {mm:,.0f} ({pct(mm, mm + tm):.0f}% of active), tools {tm:,.0f} ({pct(tm, mm + tm):.0f}% of active), "
          f"waiting on a person {wm:,.0f}")

    print("\n## 7. Subagents (runs with more than one transcript)")
    for label, sel in (("no subagent", [r for r in runs if r["transcripts"] <= 1]),
                       ("with subagents", [r for r in runs if r["transcripts"] > 1])):
        if sel:
            print(f"  {label:15} runs {len(sel):>4}  median requests {st.median([r['requests'] for r in sel]):>5.0f}"
                  f"  median context/request {st.median([ctx(r) / r['requests'] for r in sel]):>8,.0f}"
                  f"  median $ {st.median([sum(r['usd'].values()) for r in sel]):.2f}")

    print("\n## 8. By track (median)")
    by = defaultdict(list)
    for r in runs:
        by[r["track"]].append(r)
    for tr, sel in sorted(by.items(), key=lambda kv: -len(kv[1])):
        if len(sel) < 10:
            continue
        print(f"  {tr:12} runs {len(sel):>4}  requests {st.median([r['requests'] for r in sel]):>4.0f}"
              f"  context/request {st.median([ctx(r) / r['requests'] for r in sel]):>8,.0f}"
              f"  output/request {st.median([r['tok']['output'] / r['requests'] for r in sel]):>6,.0f}"
              f"  $ {st.median([sum(r['usd'].values()) for r in sel]):.2f}")


def levers(runs: list[dict]) -> None:
    """What-if savings for a median run of the dominant model, from the fitted growth model.

    A run of N requests re-reads P + g*(i-1) tokens at request i, writes W0 (the
    uncached part of the prefix) plus g*(N-1) to the cache, and writes O output
    tokens. Each lever changes one term and holds the work (output) fixed.
    """
    model = Counter(r["model"] for r in runs).most_common(1)[0][0]
    sel = [r for r in runs if r["model"] == model]
    rt = PRICING[model]
    xs = [r["requests"] for r in sel]
    a, b = ols(xs, [ctx(r) / r["requests"] for r in sel])
    P, g = a, 2 * b
    N = st.median(xs)
    O = st.median([r["tok"]["output"] for r in sel])
    written = st.median([r["tok"]["cache_write_1h"] + r["tok"]["cache_write_5m"] for r in sel])
    W0 = max(0.0, written - g * (N - 1))

    def cost(P=P, g=g, N=N, W0=W0, wprice=rt["cache_write_1h"]):
        reads = N * P + g * N * (N - 1) / 2 - (W0 + g * (N - 1))
        wr = W0 + g * (N - 1)
        usd = (reads * rt["cache_read"] + wr * wprice + O * rt["output"]) / 1e6
        return usd, reads + wr + O

    base_usd, base_tok = cost()
    print(f"\n## 9. Levers, for a median {model} run (N={N:.0f} requests, P={P:,.0f}, g={g:,.0f}, "
          f"first-write W0={W0:,.0f}, output {O:,.0f})")
    print(f"  modelled run: ${base_usd:.3f}, {base_tok:,.0f} tokens processed (measured median $ "
          f"{st.median([sum(r['usd'].values()) for r in sel]):.3f})")
    cases = [
        ("prefix 10k tokens smaller (always-read docs)", dict(P=P - 10000, W0=max(0, W0 - 10000))),
        ("20% fewer requests, same work (batch calls)", dict(N=N * 0.8, g=g / 0.8)),
        ("growth per request halved (trim tool output)", dict(g=g / 2)),
        ("5-minute instead of 1-hour cache writes (harness)", dict(wprice=rt["cache_write_5m"])),
    ]
    # Cost per request = W0*w/N + P*r + g*r*(N-1)/2 + g*w; its minimum over N.
    nstar = (2 * W0 * rt["cache_write_1h"] / (g * rt["cache_read"])) ** 0.5
    per = lambda n: cost(N=n)[0] / n
    print(f"  run length with the lowest modelled $ per request: N* = {nstar:.0f} requests "
          f"(${per(nstar):.4f}/request vs ${per(N):.4f} at the median N, {pct(per(N) - per(nstar), per(N)):.0f}% dearer)")
    for label, kw in cases:
        u, t = cost(**kw)
        print(f"  {label:52} $ {pct(base_usd - u, base_usd):5.1f}% less   tokens {pct(base_tok - t, base_tok):5.1f}% less")


def transcript(path: Path) -> None:
    """One session's within-run picture: the first request's prefix, and tool-result sizes."""
    seen, first = set(), None
    sizes: Counter[str] = Counter()
    counts: Counter[str] = Counter()
    names: dict[str, str] = {}
    for line in path.open():
        d = json.loads(line)
        msg = d.get("message") or {}
        if d.get("type") == "assistant":
            mid = msg.get("id")
            if first is None and msg.get("usage"):
                first = msg["usage"]
            for blk in msg.get("content") or []:
                if isinstance(blk, dict) and blk.get("type") == "tool_use":
                    names[blk["id"]] = blk["name"]
            seen.add(mid)
        elif d.get("type") == "user":
            for blk in msg.get("content") or [] if isinstance(msg.get("content"), list) else []:
                if isinstance(blk, dict) and blk.get("type") == "tool_result":
                    c = blk.get("content")
                    text = c if isinstance(c, str) else json.dumps(c)
                    nm = names.get(blk.get("tool_use_id"), "?")
                    sizes[nm] += len(text)
                    counts[nm] += 1
    print(f"\n## Transcript {path.name}")
    if first:
        pre = (first.get("cache_read_input_tokens") or 0) + (first.get("cache_creation_input_tokens") or 0) \
            + (first.get("input_tokens") or 0)
        print(f"first request context: {pre:,} tokens (cache read {first.get('cache_read_input_tokens'):,}, "
              f"written {first.get('cache_creation_input_tokens'):,})")
    tot = sum(sizes.values())
    print(f"tool results: {sum(counts.values())} calls, {tot:,} characters (~{tot // 4:,} tokens at 4 chars/token)")
    for nm, s in sizes.most_common(10):
        print(f"  {nm:40}{counts[nm]:>4} calls {s:>9,} chars {pct(s, tot):>5.1f}%")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--transcript", type=Path)
    args = ap.parse_args()
    if args.transcript:
        transcript(args.transcript)
    else:
        runs = load_runs()
        report(runs)
        levers(runs)
