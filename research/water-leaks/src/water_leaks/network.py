"""L-Town geometry from the EPANET .inp: node coordinates and pipe graph distances."""
from __future__ import annotations

import heapq
import math


def parse_inp(text: str):
    """Returns (coords {node: (x, y)}, links {id: (n1, n2, length_m)}); pumps and valves have length 0."""
    coords, pipes, sec = {}, {}, None
    for ln in text.splitlines():
        s = ln.split(";")[0].strip()
        if not s:
            continue
        if s.startswith("["):
            sec = s.upper()
            continue
        f = s.split()
        if sec == "[COORDINATES]" and len(f) >= 3:
            coords[f[0]] = (float(f[1]), float(f[2]))
        elif sec == "[PIPES]" and len(f) >= 4:
            pipes[f[0]] = (f[1], f[2], float(f[3]))
        elif sec in ("[PUMPS]", "[VALVES]") and len(f) >= 3:
            pipes[f[0]] = (f[1], f[2], 0.0)  # zero-length links keep the graph connected
    return coords, pipes


def euclid_to_pipe(coords, pipes, node, pipe):
    """Euclidean distance (m) from a node to a pipe's midpoint."""
    a, b, _ = pipes[pipe]
    mx = (coords[a][0] + coords[b][0]) / 2
    my = (coords[a][1] + coords[b][1]) / 2
    x, y = coords[node]
    return math.hypot(x - mx, y - my)


def graph_dist(pipes, src):
    """Shortest along-pipe distance (m) from node src to every node (Dijkstra)."""
    adj = {}
    for a, b, length in pipes.values():
        adj.setdefault(a, []).append((b, length))
        adj.setdefault(b, []).append((a, length))
    dist, pq = {src: 0.0}, [(0.0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist.get(u, math.inf):
            continue
        for v, w in adj.get(u, []):
            nd = d + w
            if nd < dist.get(v, math.inf):
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    return dist


def pipe_dist(pipes, dist, pipe):
    """Along-pipe distance to a pipe's midpoint, given graph_dist from a source node."""
    a, b, length = pipes[pipe]
    return min(dist.get(a, math.inf), dist.get(b, math.inf)) + length / 2
