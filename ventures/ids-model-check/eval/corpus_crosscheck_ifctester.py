#!/usr/bin/env python3
"""IfcTester's side of eval/corpus-crosscheck.mjs.

    pip install ifcopenshell==0.9.0.post1 ifctester==0.9.0
    python3 eval/corpus_crosscheck_ifctester.py MODEL_DIR IDS_DIR OUT.jsonl [--timeout S]

Opens each model once with IfcOpenShell, validates it against every IDS file
in IDS_DIR with IfcTester and writes, per specification, the verdict, the
applicable count and the failing element ids (the same rule as
crosscheck_ifctester.py). An IDS file IfcTester cannot open, or that raises
or runs past --timeout seconds (default 900) during validation, is written
with its error.
"""
import json
import signal
import sys
import time
from pathlib import Path

import ifcopenshell
from ifctester import ids as idsmod


class Timeout(Exception):
    pass


def _alarm(*_):
    raise Timeout()


def run(spec, model):
    spec.validate(model)
    out = []
    for s in spec.specifications:
        failed = set()
        for r in s.requirements:
            for f in getattr(r, "failures", []) or []:
                el = f.get("element") if isinstance(f, dict) else None
                if el is not None and hasattr(el, "id"):
                    failed.add(el.id())
        if s.maxOccurs == 0:
            failed = {e.id() for e in s.applicable_entities}
        out.append({"name": s.name, "pass": bool(s.status), "applicable": len(s.applicable_entities), "failed": sorted(failed)})
    return out


def main():
    model_dir, ids_dir, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    timeout = int(sys.argv[sys.argv.index("--timeout") + 1]) if "--timeout" in sys.argv else 900
    signal.signal(signal.SIGALRM, _alarm)
    out.write_text("")
    for m in sorted(p for p in model_dir.iterdir() if p.suffix.lower() == ".ifc"):
        t0 = time.time()
        model = ifcopenshell.open(str(m))
        print(f"{m.name}: opened in {time.time() - t0:.1f} s", file=sys.stderr, flush=True)
        for f in sorted(p for p in ids_dir.iterdir() if p.suffix.lower() == ".ids"):
            t1 = time.time()
            row = {"model": m.name, "ids": f.name}
            try:
                spec = idsmod.open(str(f))
            except Exception as e:  # noqa: BLE001 - recorded, not hidden
                row["open_error"] = f"{type(e).__name__}: {e}"[:300]
                spec = None
            if spec is not None:
                signal.alarm(timeout)
                try:
                    row["specs"] = run(spec, model)
                except Timeout:
                    row["error"] = f"timeout after {timeout} s"
                except Exception as e:  # noqa: BLE001
                    row["error"] = f"{type(e).__name__}: {e}"[:300]
                finally:
                    signal.alarm(0)
            row["seconds"] = round(time.time() - t1, 2)
            with out.open("a") as fh:
                fh.write(json.dumps(row) + "\n")
            print(f"  {f.name}: {row['seconds']} s {'ERR' if 'error' in row or 'open_error' in row else ''}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
