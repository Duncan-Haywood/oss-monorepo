#!/usr/bin/env python3
"""9 teams, 3 games a night, 2 courts x 6 times: every slot booked. Can a whole season be wait-free?

A hand argument fixes the shape of a wait-free night, and then every season of that shape is
checked by exhaustion (seconds; the general SAT model of eval/odd-night-sat.py ran past 30 min).

The shape. 9 teams, 3 rounds: 6 teams play 3 games (a window of 3 rows), 3 sit out one round and
play 2 (a window of 2). 12 matches fill all 12 slots, so every row holds exactly 4 teams. Write
F_h and S_h for the 3- and 2-game windows that start at row h. Row cover, row by row:
  row 0: F0 + S0 = 4                 row 1: F0 + F1 + S0 + S1 = 4, so F1 = S1 = 0
  row 5: F3 + S4 = 4 (F4 = F5 = S5 = 0, windows end by row 5)
  row 4: F2 + F3 + S3 + S4 = 4, so F2 = S3 = 0
  row 3: F3 + S2 = 4, and row 2: F0 + S2 = 4
so S0 = S2 = S4, and S0 + S2 + S4 = 3 gives S0 = 1, F0 = F3 = 3. The night is: three teams A in
rows 0-2 with one 2-game team s0 in rows 0-1, three teams B in rows 3-5 with s4 in rows 4-5, and
s2 in rows 2-3. Rows 0 and 1 are two perfect matchings of A + s0; row 2 pairs s2 with one team
a of A and the other two of A together; rows 3 to 5 mirror it. So the night's graph is
K4 - (s0, a) on A + s0, the same on B + s4, and s2 joined to a and to one b of B. Its 12 matches
must also split into the night's 3 rounds, each a matching of 4 that misses one of s0, s2, s4.

The check. Fix night 1 (relabelling); enumerate every night of that shape (315 splits x 144
choices of s0, s4, a, b); keep those edge-disjoint from night 1 whose 2-game teams are new; for
each, the third night is forced (the 12 pairs left) and is looked up. Also checked: that every
night of the shape splits into rounds (so a model, if there were one, would be a season).
  python3 eval/nine-on-two.py
"""
from itertools import combinations


def bit(u, v):
    if u > v:
        u, v = v, u
    return 1 << (u * 9 + v)


def night(L, m, R, s0, a, s4, b):
    mask = 0
    for side, s, x in ((L, s0, a), (R, s4, b)):
        for u, v in combinations(side, 2):
            if {u, v} != {s, x}:
                mask |= bit(u, v)
    mask |= bit(m, a) | bit(m, b)
    return mask


def all_nights():
    out = {}
    teams = range(9)
    for m in teams:
        rest = [t for t in teams if t != m]
        for L in combinations(rest, 4):
            R = tuple(t for t in rest if t not in L)
            if L > R:
                continue  # L and R unordered
            for s0 in L:
                for a in L:
                    if a == s0:
                        continue
                    for s4 in R:
                        for b in R:
                            if b == s4:
                                continue
                            k = night(L, m, R, s0, a, s4, b)
                            out.setdefault(k, (frozenset((s0, m, s4)), (L, m, R, s0, a, s4, b)))
    return out


def edges(mask):
    return [(u, v) for u in range(9) for v in range(u + 1, 9) if mask & bit(u, v)]


def splits_into_rounds(mask, short):
    es = edges(mask)
    # 3 matchings of 4 edges, round k missing exactly short[k] (any order of the shorts)
    short = list(short)

    def go(i, used, rounds):
        if i == len(es):
            return all(len(r) == 4 for r in rounds)
        u, v = es[i]
        for k in range(3):
            if short[k] in (u, v) or u in used[k] or v in used[k] or len(rounds[k]) == 4:
                continue
            used[k] |= {u, v}
            rounds[k].append((u, v))
            if go(i + 1, used, rounds):
                return True
            rounds[k].pop()
            used[k] -= {u, v}
        return False

    return go(0, [set(), set(), set()], [[], [], []])


def shapes():
    """Every way to start six 3-row and three 2-row windows in 6 rows with exactly 4 teams a row."""
    from itertools import combinations_with_replacement as cwr
    out = []
    for F in cwr(range(4), 6):
        for S in cwr(range(5), 3):
            load = [0] * 6
            for f in F:
                for r in range(f, f + 3):
                    load[r] += 1
            for x in S:
                for r in range(x, x + 2):
                    load[r] += 1
            if load == [4] * 6:
                out.append((F, S))
    return out


def main():
    sh = shapes()
    print(f"window shapes with every row holding 4 teams: {sh} (the hand argument: F at 0,0,0,3,3,3 and S at 0,2,4)")
    assert sh == [((0, 0, 0, 3, 3, 3), (0, 2, 4))]
    nights = all_nights()
    allpairs = 0
    for u, v in combinations(range(9), 2):
        allpairs |= bit(u, v)
    print(f"nights of the forced shape: {len(nights)} distinct edge sets")
    every = all(splits_into_rounds(k, s) for k, (s, _) in nights.items())
    print(f"every one splits into 3 rounds with its three 2-game teams as the byes: {every}")
    first = night((0, 1, 2, 3), 4, (5, 6, 7, 8), 0, 3, 8, 5)
    s1 = nights[first][0]
    cand = 0
    seasons = 0
    for k, (s, _) in nights.items():
        if k & first or s & s1:
            continue
        cand += 1
        rest = allpairs & ~first & ~k
        if rest in nights and not (nights[rest][0] & (s | s1)):
            seasons += 1
    print(f"second nights edge-disjoint from night 1 with three new 2-game teams: {cand}")
    print(f"seasons (three such nights covering all 36 pairs): {seasons}")
    print("so 9 teams, 3 games on 2 courts x 6 times: " + ("a wait-free season exists" if seasons else "no season is wait-free (every one keeps a wait)"))


if __name__ == "__main__":
    main()
