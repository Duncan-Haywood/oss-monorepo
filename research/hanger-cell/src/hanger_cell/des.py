"""A minimal discrete-event engine (stdlib only): generator processes, timeouts and FIFO resources."""
import heapq
from collections import deque


class Timeout:
    def __init__(self, dt):
        self.dt = dt


class Request:
    def __init__(self, res):
        self.res = res


class Resource:
    """`capacity` identical servers with a FIFO queue; tracks busy server-seconds."""

    def __init__(self, env, name, capacity=1):
        self.env, self.name, self.capacity = env, name, capacity
        self.in_use, self.queue = 0, deque()
        self.busy, self._t = 0.0, 0.0

    def _tick(self):
        self.busy += self.in_use * (self.env.now - self._t)
        self._t = self.env.now

    def _grant(self, proc):
        self._tick()
        self.in_use += 1
        self.env._schedule(self.env.now, proc)

    def request(self, proc):
        if self.in_use < self.capacity:
            self._grant(proc)
        else:
            self.queue.append(proc)

    def release(self):
        self._tick()
        self.in_use -= 1
        if self.queue:
            self._grant(self.queue.popleft())

    def utilisation(self, horizon):
        self._tick()
        return self.busy / (self.capacity * horizon) if horizon > 0 else 0.0


class Env:
    def __init__(self):
        self.now, self._heap, self._n = 0.0, [], 0

    def _schedule(self, t, proc):
        self._n += 1
        heapq.heappush(self._heap, (t, self._n, proc))

    def process(self, gen):
        self._schedule(self.now, gen)

    def run(self):
        while self._heap:
            t, _, proc = heapq.heappop(self._heap)
            self.now = t
            try:
                ev = next(proc)
            except StopIteration:
                continue
            if isinstance(ev, Timeout):
                self._schedule(self.now + ev.dt, proc)
            else:
                ev.res.request(proc)
        return self.now
