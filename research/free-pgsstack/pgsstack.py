"""Sequential-impulse (projected Gauss-Seidel) contact solver for a vertical stack of unit boxes.

Body 0 is the ground. Body i (1..n) has mass m and rests on body i-1; contact i joins them.
Semi-implicit Euler, accumulated impulses clamped at zero, optional warm start, Baumgarte bias.
Pure standard library.
"""
G = 9.81


def make_stack(n, h=1.0):
    return {"y": [0.0] + [h * i for i in range(1, n + 1)], "v": [0.0] * (n + 1), "lam": [0.0] * (n + 1), "h": h}


def step(s, dt, iters, m=1.0, order="up", warm=True, beta=0.2, slop=0.0):
    """One step. Returns the converged-or-not impulses in s['lam'] (units of N*s)."""
    n = len(s["y"]) - 1
    y, v, lam, h = s["y"], s["v"], s["lam"], s["h"]
    for i in range(1, n + 1):
        v[i] -= G * dt
    bias = [0.0] * (n + 1)
    for i in range(1, n + 1):
        pen = h - (y[i] - y[i - 1])          # > 0 when overlapping
        bias[i] = beta / dt * max(pen - slop, 0.0)
    for i in range(1, n + 1):
        if y[i] - y[i - 1] - h > 0:          # separated: drop any stored impulse
            lam[i] = 0.0
    if warm:
        for i in range(1, n + 1):
            v[i] += lam[i] / m
            if i > 1:
                v[i - 1] -= lam[i] / m
    else:
        for i in range(1, n + 1):
            lam[i] = 0.0
    idx = range(1, n + 1) if order == "up" else range(n, 0, -1)
    for _ in range(iters):
        for i in idx:
            if y[i] - y[i - 1] - h > 0:      # separated: contact inactive
                continue
            # relative normal velocity of body i w.r.t. body i-1; effective mass inverse
            vr = v[i] - (v[i - 1] if i > 1 else 0.0)
            k = 1.0 / m + (1.0 / m if i > 1 else 0.0)
            d = -(vr - bias[i]) / k * 1.0    # impulse that would zero vr - bias
            new = max(lam[i] + d, 0.0)
            d = new - lam[i]
            lam[i] = new
            v[i] += d / m
            if i > 1:
                v[i - 1] -= d / m
    for i in range(1, n + 1):
        y[i] += v[i] * dt
    return s


def run(n, iters, T=3.0, dt=1 / 60, **kw):
    """Boxes start at rest, exactly touching. Metrics are taken over the last second.

    sag: largest total overlap (sum of penetrations) seen; speed: largest body speed seen;
    lam_err: worst relative error of any contact impulse against the static value, at the final step.
    """
    s = make_stack(n)
    steps = int(round(T / dt))
    sag = speed = 0.0
    for k in range(steps):
        step(s, dt, iters, **kw)
        if k >= steps - int(1 / dt):
            pen = sum(max(s["h"] - (s["y"][i] - s["y"][i - 1]), 0.0) for i in range(1, n + 1))
            sag, speed = max(sag, pen), max(speed, max(abs(x) for x in s["v"]))
    ex = exact_impulses(n, dt)
    err = max(abs(s["lam"][i + 1] - ex[i]) / ex[i] for i in range(n))
    return {"sag": sag, "speed": speed, "lam_err": err, "lam": s["lam"][1:]}


def exact_impulses(n, dt, m=1.0):
    """Static equilibrium: contact i carries the weight of bodies i..n, so lam_i = (n-i+1) m g dt."""
    return [(n - i + 1) * m * G * dt for i in range(1, n + 1)]
