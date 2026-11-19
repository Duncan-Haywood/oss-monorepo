"""What a queued survey holds on the ESP32's heap, and whether SURVEY_QUEUE 3 fits (2026-11-18, firmware/esp32/README.md
"A queued survey's heap").

The ESC-lag and take surveys run one at a time; the others wait in `LaunchCheck.survey_queue` (controller.SURVEY_QUEUE,
2), each holding its ball's period snapshots and tick logs. README "The ESC-lag survey between 100 and 200 ms" left
open whether a depth of 3 fits the ESP32's heap, to win back the wheels the seventh lag costs. No board was at hand,
so this counts the bytes on the simulator's drills, sized as MicroPython 1.24's ESP32 port lays its objects out (read
from py/objlist.c, objtuple.h, objarray.c, objfloat.c, mpconfig.h and ports/esp32/mpconfigport.h):

- the heap is allocated in 16-byte blocks (4 words of 4 bytes);
- integers under 2**30 are held in the pointer itself (MICROPY_OBJ_REPR_A), so cost nothing beyond their slot;
- a float is a boxed single (type pointer + 4 bytes): one block;
- a tuple of n is 2 + n words; a list is a 4-word header plus an items array of `alloc` words, where `alloc` starts at
  4 and doubles on a full append (pop never shrinks a list of over half its alloc);
- an array is a 4-word header plus its items, grown 8 at a time on append; "l" and "f" are 4 bytes an item;
- a class instance with three attributes: header and a 4-slot attribute table, about 4 blocks (estimated, not read);
- a not-yet-started generator: header, code state and a frame of about 16 words, 6 blocks (estimated).

The ESP32 port starts the Python heap at 56 KB and adds areas from the IDF's free RAM on demand (MICROPY_GC_SPLIT_HEAP_
AUTO); what is free on the board with main.py loaded is not known here (`gc.mem_free()` on a real board says).

For every survey the board queues, the script sizes what that survey alone keeps alive (its snapshot and tick logs,
the outer lists and the generator), and after every queue or start the sum over the running survey and the waiting
ones: the heap the surveys pin. The running survey's own working lists (one wheel's ticks re-based, the lagged
ticks) come and go one wheel at a time and are the same at any depth, so they are not counted.

PREDICTION, written before the first run: with tuples a queued survey holds 10-25 KB (115-240 ticks a wheel at about
48 bytes a tick); packed (controller.PackedTicks, 12 bytes a tick) under 8 KB. DECISION RULE: SURVEY_QUEUE goes to 3
if, on every drill below, (a) the peak the surveys pin at depth 3 packed is no more than at depth 2 with tuples (so the
board needs no more heap than it did), (b) packing changes no result at depth 2 (survey count, pick and every record
the same: it must be lossless), and (c) depth 3 surveys at least as many wheels as depth 2 on every drill. If (a) or
(c) fails, the depth stays 2 and packing ships alone (if (b) holds); if (b) fails, neither ships.

Drills: rally and example (no hold between balls, where the queue fills) and the calibration drill, on the 0.4 s
first-order wheel, on a 50 ms ESC with a 0.6 s wheel and on a 3 us jittery tach. (The first run's "ESC" build only
told the board a 50 ms lag, with no ESC in the plant, and picked 0 ms; it was rerun with the ESC in the plant, and the
jittery tach was added before that rerun.)

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/survey_heap.py

Simulated only: the byte counts are a model of MicroPython's layout, not a reading of a board's heap.
"""

import sys
from array import array

import esc_survey_sweep as S
from feeder_sim import controller

BLOCK = 16
WORD = 4
INSTANCE = 4 * BLOCK
GENERATOR = 6 * BLOCK


def blocks(nbytes):
    return -(-nbytes // BLOCK) * BLOCK


def list_alloc(n):
    a = 4
    while a < n:
        a *= 2
    return a


def size(obj, seen):
    """Bytes `obj` and everything it holds take on the ESP32's heap, counting each object once across `seen`."""
    if obj is None or isinstance(obj, bool):
        return 0
    if isinstance(obj, int):
        if -(1 << 30) <= obj < (1 << 30):
            return 0
        raise ValueError(f"an int past the small-int range: {obj}")
    if id(obj) in seen:
        return 0
    seen.add(id(obj))
    if isinstance(obj, float):
        return BLOCK
    if isinstance(obj, tuple):
        return blocks(WORD * (2 + len(obj))) + sum(size(x, seen) for x in obj)
    if isinstance(obj, list):
        return BLOCK + blocks(WORD * list_alloc(len(obj))) + sum(size(x, seen) for x in obj)
    if isinstance(obj, array):
        return BLOCK + blocks(4 * (-(-len(obj) // 8) * 8))
    if isinstance(obj, controller.PackedTicks):
        return INSTANCE + size(obj.c, seen) + size(obj.us, seen) + size(obj.u, seen)
    raise TypeError(type(obj))


def survey_bytes(gen, seen):
    f = gen.gi_frame.f_locals if gen.gi_frame is not None else {}
    return GENERATOR + sum(size(f[k], seen) for k in ("snap", "ticks", "edges0", "targets") if k in f)


DRILLS = (("first-order 0.4 s", 0.4, {}), ("ESC 50 ms, 0.6 s", 0.6, {"esc_tau_s": 0.05}),
          ("tach 3 us, 0.4 s", 0.4, {"tach_jitter_us": 3.0}))
NAMES = ("drill.rally.json", "drill.example.json", "drill.calibration.json")


def run(name, tau, kw, depth, pack):
    controller.SURVEY_QUEUE = depth
    controller.PACK_SURVEY_TICKS = pack
    each, peak = [], [0]
    orig_queue = controller.LaunchCheck.queue_survey
    orig_step = controller.LaunchCheck._survey_step

    def pinned(lc):
        seen = set()
        gens = ([lc.surveying] if lc.surveying is not None else []) + list(lc.survey_queue)
        return sum(survey_bytes(g, seen) if hasattr(g, "gi_frame") else 0 for g in gens)

    def queue(self, survey):
        each.append(survey_bytes(survey, set()))
        orig_queue(self, survey)
        peak[0] = max(peak[0], pinned(self))

    def step(self, during=False):
        before = self.surveying
        out = orig_step(self, during)
        if self.surveying is not before:
            peak[0] = max(peak[0], pinned(self))
        return out

    controller.LaunchCheck.queue_survey = queue
    controller.LaunchCheck._survey_step = step
    try:
        sim = S.sim_for(kw, tau, 0.95, 0.65)
        res = S.drill(sim, name)
    finally:
        controller.LaunchCheck.queue_survey = orig_queue
        controller.LaunchCheck._survey_step = orig_step
    sv = res.esc_survey or {}
    records = [(sorted(d.items()) if isinstance(d, dict) else d) for d in res.launches]
    return {"each": each, "peak": peak[0], "wheels": sv.get("wheels"), "pick": sv.get("refined_ms"),
            "cut": sim.hw.launch.survey_cut, "records": repr(records)}


def main():
    ok_a = ok_b = ok_c = True
    print("drill | build | depth/form | surveys queued | KB each (min-max) | peak pinned KB | wheels | cut | pick ms")
    for label, tau, kw in DRILLS:
        for name in NAMES:
            rows = {}
            for depth, pack in ((2, False), (2, True), (3, False), (3, True)):
                r = rows[(depth, pack)] = run(name, tau, kw, depth, pack)
                e = r["each"]
                print(f"{name:22} | {label:18} | {depth} {'packed' if pack else 'tuples':6} | {len(e):3d} | "
                      f"{min(e) / 1024 if e else 0:5.1f}-{max(e) / 1024 if e else 0:5.1f} | {r['peak'] / 1024:6.1f} | "
                      f"{r['wheels']} | {r['cut']} | {r['pick']}")
            a = rows[(3, True)]["peak"] <= rows[(2, False)]["peak"]
            b = all(rows[(2, True)][k] == rows[(2, False)][k] for k in ("wheels", "pick", "cut", "records"))
            c = (rows[(3, True)]["wheels"] or 0) >= (rows[(2, True)]["wheels"] or 0)
            ok_a, ok_b, ok_c = ok_a and a, ok_b and b, ok_c and c
            print(f"  (a) depth 3 packed pins no more than depth 2 tuples: {a}; (b) packing lossless: {b}; "
                  f"(c) depth 3 surveys as many wheels: {c}")
    print(f"ALL: (a) {ok_a}  (b) {ok_b}  (c) {ok_c}")
    return 0 if ok_b else 1


if __name__ == "__main__":
    sys.exit(main())
