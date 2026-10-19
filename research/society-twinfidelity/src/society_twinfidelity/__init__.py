"""society-twinfidelity: the society-plaza corridor with humanlike-crowd options (speed and sideways-push
heterogeneity, reaction delay, stubborn walkers). Defaults reproduce society-plaza exactly.

A social-force counter-flow corridor with people who learn a passing side and robots that hold one.

Agents walk east or west along a periodic corridor (length LEN, width WID, walls at y = 0 and
y = WID). Motion is a social-force model (Helbing and Molnar 1995): relaxation to a desired
velocity plus exponential repulsion from other agents and walls. On top of it every agent has a
passing-side preference: when an oncoming agent is ahead, the repulsion gets a sideways part that
pushes the agent toward its preferred side (right or left of its own heading), as measured in
pedestrian avoidance by Moussaid et al. (2009).

People copy the convention: each remembers the sides used by their last M oncoming partners and
prefers the majority side. Robots (share rho) either hold one side for ever ("committed"), follow
the people's rule ("adaptive"), or have no side ("none"). Everyone starts keeping right.

A "pass" is two oncoming agents within PASS_DY laterally exchanging order along x. The side the
partner used is the side of the partner's heading it ended up on.

Stdlib only. Stylised: point-like discs in 1D-periodic 2D space, one speed, no groups.
"""
import math
import random

LEN, WID = 30.0, 6.0
DT = 0.05
TAU = 0.5
RADIUS = 0.25
A_AG, B_AG = 12.0, 0.3     # agent repulsion: acceleration scale (m/s^2) and range (m)
A_WALL, B_WALL = 12.0, 0.2
LAMBDA = 0.3               # weight of agents behind (anisotropy)
CUTOFF = 3.0
PASS_DY = 1.5              # lateral gap under which an order exchange counts as a pass
PERSONAL = 0.9             # centre distance of a personal-space intrusion
CLOSE = 0.6                # centre distance of a close call (discs of radius 0.25 touch at 0.5)
RIGHT, LEFT = 1, -1


def wrap(dx):
    """Shortest signed x difference on the periodic corridor."""
    return (dx + LEN / 2) % LEN - LEN / 2


class Agent:
    __slots__ = ("x", "y", "vx", "vy", "dir", "robot", "policy", "side", "mem", "v0", "chi", "ux", "stubborn")

    def __init__(self, x, y, d, robot, policy, v0, chi):
        self.x, self.y, self.vx, self.vy = x, y, d * v0, 0.0
        self.dir, self.robot, self.policy, self.v0, self.chi = d, robot, policy, v0, chi
        self.side = RIGHT
        self.mem = []
        self.ux = x                # unwrapped x, for path length
        self.stubborn = False      # a person who never updates their side


def make_crowd(n, rho, policy, rng, m=9, chi=0.6, v_robot=None, v_human=1.3, v_spread=0.08, chi_sd=0.0,
               stubborn=0.0):
    """n agents, half walking each way, a share rho of them robots with the given policy.

    policy is "left" or "right" (committed), "adaptive" or "none". Robots are split evenly
    between the two directions.
    """
    robots = int(round(rho * n))
    agents = []
    for d in (1, -1):
        for k in range(n // 2):
            robot = k < robots // 2 + (robots % 2 if d == 1 else 0)
            agents.append(Agent(rng.uniform(0, LEN), rng.uniform(0.5, WID - 0.5), d, robot,
                                policy if robot else "human",
                                (v_robot if (robot and v_robot) else v_human) * (1 + rng.uniform(-v_spread, v_spread)),
                                chi))
    for a in agents:
        if not a.robot:
            if chi_sd:
                a.chi = min(max(rng.gauss(chi, chi_sd), 0.0), 1.5)
            a.stubborn = bool(stubborn) and rng.random() < stubborn
        if a.policy == "left":
            a.side = LEFT
        elif a.policy == "none":
            a.side = 0
        a.mem = [RIGHT] * m
    return agents


def prefers(a, m):
    """The side an agent currently steers to."""
    if a.policy in ("left", "right", "none"):
        return a.side
    return RIGHT if sum(a.mem[-m:]) > 0 else LEFT   # memory entries are +1 / -1, m odd


def step(agents, m, noise, rng, past=None):
    """Advance one DT; past is the list of (x, y) of every agent one reaction time ago (people see that). Returns (contact_pairs, intrusion_agents) counted at this step."""
    n = len(agents)
    ax = [0.0] * n
    ay = [0.0] * n
    pref = [prefers(a, m) for a in agents]
    near = [False] * n
    contacts = 0
    for i, a in enumerate(agents):
        ax[i] = (a.v0 * a.dir - a.vx) / TAU
        ay[i] = (0.0 - a.vy) / TAU
    for i in range(n):
        a = agents[i]
        for j in range(i + 1, n):
            b = agents[j]
            dx = wrap(a.x - b.x)
            if dx > CUTOFF or dx < -CUTOFF:
                continue
            dy = a.y - b.y
            d2 = dx * dx + dy * dy
            if d2 > CUTOFF * CUTOFF:
                continue
            d = math.sqrt(d2) or 1e-6
            if d < PERSONAL:
                near[i] = near[j] = True
                if d < CLOSE:
                    contacts += 1
            nx, ny = dx / d, dy / d            # from b to a
            f = A_AG * math.exp((2 * RADIUS - d) / B_AG)
            if past is not None and (not a.robot or not b.robot):
                # people react to where the other agent was one reaction time ago
                # (own position is known exactly; the other's is the stale one)
                fa_f = fb_f = f
                nax, nay, nbx, nby = nx, ny, nx, ny
                if not a.robot:
                    ddx, ddy = wrap(a.x - past[j][0]), a.y - past[j][1]
                    dd = math.sqrt(ddx * ddx + ddy * ddy) or 1e-6
                    nax, nay = ddx / dd, ddy / dd
                    fa_f = A_AG * math.exp((2 * RADIUS - dd) / B_AG)
                if not b.robot:
                    ddx, ddy = wrap(past[i][0] - b.x), past[i][1] - b.y
                    dd = math.sqrt(ddx * ddx + ddy * ddy) or 1e-6
                    nbx, nby = ddx / dd, ddy / dd
                    fb_f = A_AG * math.exp((2 * RADIUS - dd) / B_AG)
            else:
                fa_f = fb_f = f
                nax, nay, nbx, nby = nx, ny, nx, ny
            # anisotropy: agents ahead count fully, agents behind count LAMBDA
            fa = (LAMBDA + (1 - LAMBDA) * (1 - nx * a.dir) / 2)   # -n.heading_a: b ahead of a
            fb = (LAMBDA + (1 - LAMBDA) * (1 + nx * b.dir) / 2)
            ax[i] += fa_f * fa * nax
            ay[i] += fa_f * fa * nay
            ax[j] -= fb_f * fb * nbx
            ay[j] -= fb_f * fb * nby
            if a.dir != b.dir:
                # oncoming: sideways push toward each agent's preferred side of its own heading.
                # Right of heading (dir, 0) is (0, -dir).
                ahead_a = (-nx * a.dir) > 0
                ahead_b = (nx * b.dir) > 0
                if ahead_a and pref[i]:
                    ay[i] += a.chi * fa_f * pref[i] * (-a.dir) * fa
                if ahead_b and pref[j]:
                    ay[j] += b.chi * fb_f * pref[j] * (-b.dir) * fb
    for i in range(n):
        a = agents[i]
        for dwall, sgn in ((a.y, 1.0), (WID - a.y, -1.0)):
            ay[i] += sgn * A_WALL * math.exp((RADIUS - dwall) / B_WALL)
        if noise:
            ax[i] += rng.gauss(0, noise)
            ay[i] += rng.gauss(0, noise)
    for i, a in enumerate(agents):
        a.vx += ax[i] * DT
        a.vy += ay[i] * DT
        sp = math.hypot(a.vx, a.vy)
        cap = 1.6 * a.v0
        if sp > cap:
            a.vx, a.vy = a.vx * cap / sp, a.vy * cap / sp
        ox, oy = a.x, a.y
        a.x = (a.x + a.vx * DT) % LEN
        a.ux += a.vx * DT
        a.y = min(max(a.y + a.vy * DT, 0.05), WID - 0.05)
    return contacts, sum(near)


def detect_passes(agents, prev_dx, m, eps, rng):
    """Update memories from oncoming pairs that just exchanged order along x.

    prev_dx maps (i, j) -> last wrapped dx for oncoming pairs within range. Returns the
    number of passes recorded.
    """
    n = len(agents)
    passes = 0
    for i in range(n):
        a = agents[i]
        for j in range(i + 1, n):
            b = agents[j]
            if a.dir == b.dir:
                continue
            dx = wrap(a.x - b.x)
            dy = a.y - b.y
            key = (i, j)
            last = prev_dx.get(key)
            if abs(dx) < 1.0 and abs(dy) < PASS_DY:
                if last is not None and last * dx < 0:
                    # a's side of b's heading: b used RIGHT iff a is on b's left, i.e. when
                    # (a.y - b.y) has the sign of b.dir (right of heading is (0, -dir))
                    b_right = (dy * b.dir) > 0
                    a_right = (-dy * a.dir) > 0
                    _record(a, RIGHT if b_right else LEFT, eps, rng)
                    _record(b, RIGHT if a_right else LEFT, eps, rng)
                    passes += 1
                prev_dx[key] = dx
            else:
                prev_dx.pop(key, None)
    return passes


def _record(a, partner_side, eps, rng):
    if (a.policy == "human" and not a.stubborn) or a.policy == "adaptive":
        a.mem.append(partner_side)
        if len(a.mem) > 200:
            del a.mem[:100]


def run(n=60, rho=0.0, policy="left", m=9, seed=0, seconds=240.0, chi=0.6, noise=0.15,
        v_robot=None, record_every=None, eps=0.0, humans_copy=True, v_spread=0.08, chi_sd=0.0,
        stubborn=0.0, delay=0.0):
    """Run one crowd. Returns a dict of outcomes over the second half of the run.

    tipped:   share of people whose preferred side is LEFT at the end
    tipped_late: the same, averaged over the last quarter of the run
    lane:     mean lateral offset of oncoming-lane order, positive when people keep right
    close:    close-call pair-steps per agent per minute
    intrude:  share of agent time with another agent inside PERSONAL
    detour:   path length over net x displacement for people (>= 1)
    speed:    mean human speed over desired speed
    frames:   optional list of (t, [(x, y, dir, robot, side)...]) every record_every seconds
    """
    rng = random.Random(seed)
    agents = make_crowd(n, rho, policy, rng, m=m, chi=chi, v_robot=v_robot, v_spread=v_spread,
                        chi_sd=chi_sd, stubborn=stubborn)
    lag = int(round(delay / DT))
    hist = []
    humans = [a for a in agents if not a.robot]
    steps = int(seconds / DT)
    half = steps // 2
    prev = {}
    contacts = intr = 0
    sp = 0.0
    pairs = 0
    frames = []
    ux0 = [a.ux for a in agents]
    path = [0.0] * len(agents)
    lane_sum = 0.0
    lane_cnt = 0
    side_trace = []
    for s in range(steps):
        hist.append([(a.x, a.y) for a in agents])
        if len(hist) > lag + 1:
            hist.pop(0)
        c, k = step(agents, m, noise, rng, hist[0] if lag else None)
        if s % 4 == 0:
            pairs += detect_passes(agents, prev, m, eps, rng)
        for idx, a in enumerate(agents):
            path[idx] += math.hypot(a.vx, a.vy) * DT
        if s == half:
            ux0 = [a.ux for a in agents]
            path = [0.0] * len(agents)
        if s >= half:
            contacts += c
            intr += k
            sp += sum(math.hypot(a.vx, a.vy) / a.v0 for a in humans) / len(humans)
        if s % 20 == 0:
            ps = [prefers(a, m) for a in humans]
            side_trace.append(sum(1 for p in ps if p == LEFT) / len(ps))
            if s >= half:
                east = [a.y for a in humans if a.dir == 1]
                west = [a.y for a in humans if a.dir == -1]
                if east and west:
                    lane_sum += (sum(west) / len(west) - sum(east) / len(east))
                    lane_cnt += 1
        if record_every and s % int(record_every / DT) == 0:
            frames.append((round(s * DT, 2), [(round(a.x, 2), round(a.y, 2), a.dir, int(a.robot), prefers(a, m))
                                                for a in agents]))
    t2 = (steps - half) * DT
    nh = len(humans)
    hidx = [i for i, a in enumerate(agents) if not a.robot]
    dist = sum(path[i] for i in hidx)
    net = sum(abs(agents[i].ux - ux0[i]) for i in hidx)
    return {
        "tipped": side_trace[-1],
        "tipped_late": sum(side_trace[-len(side_trace) // 4:]) / len(side_trace[-len(side_trace) // 4:]),
        "lane": lane_sum / max(lane_cnt, 1),
        "close": contacts / (n * t2 / 60.0),
        "intrude": intr / (n * (steps - half)),
        "detour": dist / net if net else float("nan"),
        "speed": sp / (steps - half),
        "passes": pairs,
        "frames": frames,
        "side_trace": side_trace,
    }
