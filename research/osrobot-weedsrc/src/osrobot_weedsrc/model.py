"""osrobot-weedsrc: osrobot-weedpass's multi-pass weeding model (copied) with the detector's hit rate and speed law
fitted to two published field detection rates (DETECT_POINTS) instead of assumed.

Constants marked SRC come from osrobot-fieldreal's params table or the sources in README.md; ASSUMED ones are round numbers."""
import math, random

# ---- assumed constants (ASSUMED: round numbers) ----
SWATH = 2.0          # m, SRC: 2 m operational width of an autonomous laser weeder (Springer LCA, README [3])
V_BLUR = 2.0         # m/s, detection falls as exp(-v / V_BLUR) (motion blur)
TREAT_S = 0.73       # s, SRC: ~0.73 s per weed, 90 W 810 nm laser (Frontiers review, README [1])
GANTRY_V = 5.0       # m/s, ASSUMED: galvo-steered beam, effectively fast; swept in the experiment
TREAT_OK = 0.992     # probability one treatment kills, SRC: 99.2% success (README [1])
E_M = 0.04           # Wh per metre on dry ground
MUD_E = 2.5          # energy per metre multiplier in mud
MUD_V = 0.5          # speed multiplier in mud
P_IDLE = 30.0        # W, compute and sensors while the robot runs
E_TREAT = 0.3        # Wh per treatment
BLOCK = 5.0          # m, mud is decided per BLOCK x BLOCK square
TURN_S = 4.0         # s per lane end turn


class Field:
    def __init__(self, seed, X=60.0, Y=30.0, density=0.3, mud=0.2, cluster=6.0, sigma=1.5):
        r = random.Random(seed)
        self.X, self.Y = X, Y
        self.weeds = []
        parents = _poisson(r, density * X * Y / cluster)
        for _ in range(parents):
            cx, cy = r.uniform(0, X), r.uniform(0, Y)
            for _ in range(_poisson(r, cluster)):
                x, y = r.gauss(cx, sigma), r.gauss(cy, sigma)
                if 0 <= x <= X and 0 <= y <= Y:
                    self.weeds.append([x, y, True])  # x, y, alive
        self.nbx, self.nby = int(math.ceil(X / BLOCK)), int(math.ceil(Y / BLOCK))
        self.mud = [[r.random() < mud for _ in range(self.nby)] for _ in range(self.nbx)]

    def is_mud(self, x, y):
        i = min(self.nbx - 1, max(0, int(x // BLOCK))); j = min(self.nby - 1, max(0, int(y // BLOCK)))
        return self.mud[i][j]


def _poisson(r, lam):
    if lam <= 0:
        return 0
    if lam > 30:
        return max(0, int(round(r.gauss(lam, math.sqrt(lam)))))
    L, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= r.random()
        if p <= L:
            return k
        k += 1


class Meter:
    """Accumulates time (s) and energy (Wh); moves are integrated in 1 m steps so mud is felt."""
    def __init__(self, field):
        self.f, self.t, self.e, self.dist = field, 0.0, 0.0, 0.0

    def move(self, x0, y0, x1, y1, v):
        d = math.hypot(x1 - x0, y1 - y0)
        if d == 0:
            return
        n = max(1, int(math.ceil(d)))
        for k in range(n):
            f = (k + 0.5) / n
            mud = self.f.is_mud(x0 + f * (x1 - x0), y0 + f * (y1 - y0))
            step = d / n
            self.t += step / (v * (MUD_V if mud else 1.0))
            self.e += step * E_M * (MUD_E if mud else 1.0)
        self.dist += d

    def wait(self, s, extra_wh=0.0):
        self.t += s
        self.e += extra_wh

    def energy(self):
        return self.e + P_IDLE * self.t / 3600.0


# (speed m/s, share of weeds detected), two different robots; see README "Params" for the sources.
DETECT_POINTS = ((0.2, 0.8894), (0.425, 0.862))


def fit_detector(points=DETECT_POINTS):
    """Fit p(v) = p_max * exp(-v / v_blur) through two (v, p) points. Returns (p_max, v_blur)."""
    (v1, p1), (v2, p2) = points
    v_blur = (v2 - v1) / math.log(p1 / p2)
    return p1 * math.exp(v1 / v_blur), v_blur


def p_detect(p_max, v):
    return p_max * math.exp(-v / V_BLUR)


def lanes(Y, overlap):
    """Lane centre lines; spacing = SWATH*(1-overlap). The first and last lanes sit half a swath in from the edge."""
    d = SWATH * (1.0 - overlap)
    n = max(1, int(math.ceil((Y - SWATH) / d)) + 1) if Y > SWATH else 1
    if n == 1:
        return [Y / 2]
    step = (Y - SWATH) / (n - 1)
    return [SWATH / 2 + i * step for i in range(n)]


def _looks(rng, field, c, p_max, v, fp_rate, weeds_alive_only=True, hidden=()):
    """Detections along lane c at speed v: list of (x, y, weed_index or None), sorted along the lane."""
    out = []
    pd = p_detect(p_max, v)
    for i, w in enumerate(field.weeds):
        if w[2] and i not in hidden and abs(w[1] - c) <= SWATH / 2 and rng.random() < pd:
            out.append((w[0], w[1], i))
    for _ in range(_poisson(rng, fp_rate * SWATH * field.X)):
        out.append((rng.uniform(0, field.X), c + rng.uniform(-SWATH / 2, SWATH / 2), None))
    out.sort()
    return out


def _treat(rng, field, meter, target, cx, cy):
    """Treat a target; returns True if a real weed was killed."""
    x, y, i = target
    meter.wait(TREAT_S + abs(y - cy) / GANTRY_V, E_TREAT)
    if i is not None and field.weeds[i][2] and rng.random() < TREAT_OK:
        field.weeds[i][2] = False
        return True
    return False


def run_inline(field, rng, p_max=0.7, fp_rate=0.01, v=1.0, overlap=0.0):
    """Drive lanes at speed v; stop to treat every detection as it appears."""
    m = Meter(field); treats = 0; cx = 0.0
    x, y = 0.0, 0.0
    for li, c in enumerate(lanes(field.Y, overlap)):
        a, b = (0.0, field.X) if li % 2 == 0 else (field.X, 0.0)
        m.move(x, y, a, c, v) if (x, y) != (a, c) else None
        x, y = a, c
        dets = _looks(rng, field, c, p_max, v, fp_rate)
        if li % 2 == 1:
            dets.reverse()
        for tx, ty, i in dets:
            m.move(x, y, tx, c, v); x, y = tx, c
            _treat(rng, field, m, (tx, ty, i), tx, c); treats += 1
        m.move(x, y, b, c, v); x, y = b, c
        m.wait(TURN_S)
    return _summary(field, m, treats)


def run_scout(field, rng, p_max=0.7, fp_rate=0.01, v_scout=2.0, v_tour=1.5, overlap=0.0):
    """Scout every lane at v_scout (no stopping), merge detections, then visit them by nearest neighbour."""
    m = Meter(field)
    seen = {}      # weed index -> (x, y)
    fps = []
    x, y = 0.0, 0.0
    for li, c in enumerate(lanes(field.Y, overlap)):
        a, b = (0.0, field.X) if li % 2 == 0 else (field.X, 0.0)
        if (x, y) != (a, c):
            m.move(x, y, a, c, v_scout)
        m.move(a, c, b, c, v_scout); x, y = b, c
        m.wait(TURN_S)
        for tx, ty, i in _looks(rng, field, c, p_max, v_scout, fp_rate):
            if i is None:
                fps.append((tx, ty))
            elif i not in seen:
                seen[i] = (tx, ty)
    targets = [(p[0], p[1], i) for i, p in seen.items()] + [(p[0], p[1], None) for p in fps]
    treats = 0
    while targets:
        k = min(range(len(targets)), key=lambda q: (targets[q][0] - x) ** 2 + (targets[q][1] - y) ** 2)
        t = targets.pop(k)
        m.move(x, y, t[0], t[1], v_tour); x, y = t[0], t[1]
        _treat(rng, field, m, t, t[0], t[1]); treats += 1
    return _summary(field, m, treats)


def _summary(field, m, treats):
    total = len(field.weeds)
    killed = sum(1 for w in field.weeds if not w[2])
    return {"kill": killed / total if total else 1.0, "time_min": m.t / 60.0, "energy_wh": m.energy(),
            "treatments": treats, "weeds": total, "wasted": treats - killed}


def run_passes(field, rng, passes=1, p_max=0.7, fp_rate=0.01, v=1.0, overlap=0.0, on_move=False, hidden_share=0.0):
    """Inline weeding repeated `passes` times over the same field. Each pass re-detects the weeds still alive
    (detections independent between passes: ASSUMED, except `hidden_share`, the share of weeds the detector
    never sees in any pass, e.g. occluded by crop; ASSUMED, swept). on_move=False stops for every treatment (as run_inline).
    on_move=True never stops: the beam treats while the robot drives, so a lane takes
    max(drive time, queued treatment time) and the beam steers sideways in parallel."""
    m = Meter(field); treats = 0; x, y = 0.0, 0.0
    hidden = {i for i in range(len(field.weeds)) if rng.random() < hidden_share} if hidden_share else ()
    for _ in range(passes):
        for li, c in enumerate(lanes(field.Y, overlap)):
            a, b = (0.0, field.X) if li % 2 == 0 else (field.X, 0.0)
            if (x, y) != (a, c):
                m.move(x, y, a, c, v)
            x, y = a, c
            dets = _looks(rng, field, c, p_max, v, fp_rate, hidden=hidden)
            if on_move:
                t0 = m.t
                m.move(a, c, b, c, v)
                work = 0.0
                for tx, ty, i in dets:
                    work += TREAT_S + abs(ty - c) / GANTRY_V
                    if i is not None and field.weeds[i][2] and rng.random() < TREAT_OK:
                        field.weeds[i][2] = False
                    treats += 1
                m.t = t0 + max(m.t - t0, work)
                m.e += E_TREAT * len(dets)
            else:
                if li % 2 == 1:
                    dets.reverse()
                for tx, ty, i in dets:
                    m.move(x, y, tx, c, v); x = tx
                    _treat(rng, field, m, (tx, ty, i), tx, c); treats += 1
                m.move(x, y, b, c, v)
            x, y = b, c
            m.wait(TURN_S)
    return _summary(field, m, treats)
