"""Isochrone weather routing with a tack penalty, and a greedy layline flier."""
import math
from .polar import Craft, Polar

_CACHE = {}


def polar_for(craft, tws):
    key = (id(craft), round(tws * 2) / 2)
    if key not in _CACHE:
        _CACHE[key] = Polar(craft, max(key[1], 0.5))
    return _CACHE[key]


class Scene:
    """Wind: speed tws0, from direction wd0 (compass deg) + shift(t); uniform tidal current."""
    def __init__(self, tws=8.0, wd0=0.0, osc_deg=0.0, osc_h=3.0, veer_deg=0.0, veer_h=4.0,
                 tide=0.0, tide_dir=90.0):
        self.tws, self.wd0, self.osc, self.osc_h = tws, wd0, osc_deg, osc_h
        self.veer, self.veer_h, self.tide, self.tide_dir = veer_deg, veer_h, tide, tide_dir

    def wind(self, t, x, y):
        h = t / 3600.0
        wd = self.wd0 + self.osc * math.sin(2 * math.pi * h / self.osc_h)
        wd += self.veer * min(1.0, h / self.veer_h)
        return self.tws, wd

    def current(self, t):
        s = self.tide * math.sin(2 * math.pi * t / (12.42 * 3600))
        d = math.radians(self.tide_dir)
        return s * math.sin(d), s * math.cos(d)


def wrap180(a):
    return (a + 180.0) % 360.0 - 180.0


def advance(craft, scene, t, x, y, hdg, dt, lost=0.0):
    """Move for dt seconds on compass heading hdg; `lost` seconds of that are stalled (a tack)."""
    tws, wd = scene.wind(t + dt / 2, x, y)
    twa = math.radians(wrap180(wd - hdg))
    v = polar_for(craft, tws).at(abs(twa))
    cx, cy = scene.current(t + dt / 2)
    eff = max(dt - lost, 0.0)
    h = math.radians(hdg)
    return (x + (v * math.sin(h) * eff) + cx * dt, y + (v * math.cos(h) * eff) + cy * dt)


def side(scene, t, hdg):
    _, wd = scene.wind(t, 0, 0)
    return 1 if wrap180(wd - hdg) >= 0 else -1


def isochrone(craft, scene, start, goal, t_tack_plan=0.0, dt=900.0, hdg_step=5, max_steps=400,
              bins=90, radius=1000.0):
    """Returns the list of (hdg) per step to reach the goal, planning with tack penalty t_tack_plan."""
    fronts = [(0.0, start[0], start[1], 0, [])]
    for k in range(max_steps):
        t = k * dt
        cand = {}
        for (_, x, y, sd, path) in fronts:
            for hdg in range(0, 360, hdg_step):
                s = side(scene, t, hdg)
                lost = t_tack_plan if (sd != 0 and s != sd and abs(wrap180(scene.wind(t, x, y)[1] - hdg)) > 1.0) else 0.0
                nx, ny = advance(craft, scene, t, x, y, hdg, dt, lost)
                d = math.hypot(goal[0] - nx, goal[1] - ny)
                if d < radius + 1.0 * craft_speed_cap(craft, scene) * dt * 0:  # arrival
                    pass
                b = int(((math.degrees(math.atan2(nx - start[0], ny - start[1])) % 360) / 360) * bins)
                key = (b, s)
                if key not in cand or d < cand[key][0]:
                    cand[key] = (d, nx, ny, s, path + [hdg])
        fronts = [(c[0], c[1], c[2], c[3], c[4]) for c in cand.values()]
        best = min(fronts, key=lambda f: f[0])
        if best[0] < max(radius, 3000.0):
            return best[4]
    return None


def craft_speed_cap(craft, scene):
    return 0.0


def fly(craft, scene, start, goal, plan, t_tack, dt=900.0, radius=1000.0, max_t=72 * 3600, sub=60.0):
    """Fly a heading plan with the real tack penalty, then finish greedily. Return seconds."""
    t, x, y, sd = 0.0, start[0], start[1], 0
    for hdg in plan:
        if math.hypot(goal[0] - x, goal[1] - y) < radius:
            return t
        s = side(scene, t, hdg)
        lost = t_tack if (sd != 0 and s != sd) else 0.0
        x, y = advance(craft, scene, t, x, y, hdg, dt, lost)
        t += dt
        sd = s
    return greedy(craft, scene, (x, y), goal, t_tack, t0=t, sd=sd, radius=radius, max_t=max_t)


def greedy(craft, scene, start, goal, t_tack, t0=0.0, sd=0, corridor=2000.0, dt=300.0,
           radius=1000.0, max_t=72 * 3600):
    """Head for the goal; if inside the no-go zone, sail the better-VMG tack and tack only
    when the boat leaves a corridor (m) around the rhumb line."""
    t, x, y = t0, start[0], start[1]
    rb = math.degrees(math.atan2(goal[0] - start[0], goal[1] - start[1])) % 360
    cur = sd
    while t < max_t:
        d = math.hypot(goal[0] - x, goal[1] - y)
        if d < radius:
            return t
        brg = math.degrees(math.atan2(goal[0] - x, goal[1] - y)) % 360
        tws, wd = scene.wind(t, x, y)
        pol = polar_for(craft, tws)
        (vmg_up, a_up), (vmg_dn, a_dn) = pol.best_vmg()
        a_up, a_dn = math.degrees(a_up), math.degrees(a_dn)
        direct = abs(wrap180(wd - brg))
        if a_up < direct < a_dn:
            hdg = brg
            if cur == 0:
                cur = side(scene, t, hdg)
        else:
            # cross-track from rhumb line (positive to the right of the line of travel)
            rx, ry = math.sin(math.radians(rb)), math.cos(math.radians(rb))
            xt = (x - start[0]) * ry - (y - start[1]) * rx
            want = cur if cur != 0 else 1
            if cur != 0 and abs(xt) > corridor and (xt * want) > 0:  # outside on the side we sail toward
                want = -cur
            ang = a_up if direct <= a_up else a_dn
            hdg = (wd - want * ang) % 360
            cur = side(scene, t, hdg)
        s = side(scene, t, hdg)
        lost = t_tack if (sd != 0 and s != sd) else 0.0
        x, y = advance(craft, scene, t, x, y, hdg, dt, lost)
        t += dt
        sd = s
    return float('inf')
