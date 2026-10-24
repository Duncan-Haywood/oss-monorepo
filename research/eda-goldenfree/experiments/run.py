"""Run the golden-free property checks on the 91 compilable mutants logged by eda-verify and write mutants.jsonl
(one line per mutant: eda-verify's ground truth plus the properties it violates). About 2 minutes on one core."""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "src"), os.path.join(HERE, "..", "..", "chip-accel", "src"),
                os.path.join(HERE, "..", "..", "eda-harness", "src"), os.path.join(HERE, "..", "..", "eda-verify", "src")]
from chip_accel import gen                      # noqa: E402
from eda_harness import harness as H             # noqa: E402
from eda_verify import mutate                    # noqa: E402
from eda_goldenfree import props                 # noqa: E402

CAND = {"p": 8, "wb": 4}


def truth(r):
    sim = any(f is not None for f in r["random_first"]) or r["directed_first"] is not None
    return "killable" if (r["formal"] == "killed" or sim) else r["formal"]


def main():
    P = H.Problem(); gold = P.verilog(CAND); lat = gen.cycles(CAND["p"])
    by_id = {m["id"]: m for m in mutate.sites(gold)}
    log = [json.loads(l) for l in open(os.path.join(HERE, "..", "..", "eda-verify", "experiments", "mutants.jsonl"))]
    out = open(os.path.join(HERE, "mutants.jsonl"), "w")
    t = time.perf_counter(); assert props.violated(gold, CAND["wb"], lat) == []
    gold_s = time.perf_counter() - t
    for r in log:
        t = time.perf_counter()
        v = props.violated(by_id[r["id"]]["text"], CAND["wb"], lat)
        out.write(json.dumps({"id": r["id"], "kind": r["kind"], "truth": truth(r), "violated": v,
                              "prop_seconds": time.perf_counter() - t,
                              "random64_any": any(f is not None for f in r["random_first"]),
                              "directed16": r["directed_first"] is not None}) + "\n")
    json.dump({"tools": H.tool_versions(), "candidate": CAND, "latency": lat, "golden_pass_seconds": gold_s},
              open(os.path.join(HERE, "meta.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
