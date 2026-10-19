"""Five rate limiters on an integer tick clock. Each is configured as
"at most `limit` requests per `window` ticks" and exposes allow(t), t
non-decreasing, returning True if the request at tick t is admitted."""
from collections import deque


class FixedWindow:
    """Counter reset at multiples of `window`."""
    name = "fixed window"

    def __init__(self, limit, window):
        self.limit, self.window = limit, window
        self.start, self.count = 0, 0

    def allow(self, t):
        s = t - t % self.window
        if s != self.start:
            self.start, self.count = s, 0
        if self.count < self.limit:
            self.count += 1
            return True
        return False


class SlidingLog:
    """Keeps every admitted timestamp; exact."""
    name = "sliding log"

    def __init__(self, limit, window):
        self.limit, self.window = limit, window
        self.log = deque()

    def allow(self, t):
        while self.log and self.log[0] <= t - self.window:
            self.log.popleft()
        if len(self.log) < self.limit:
            self.log.append(t)
            return True
        return False


class SlidingCounter:
    """Two fixed-window counters weighted by overlap (the common
    "sliding window counter" approximation)."""
    name = "sliding counter"

    def __init__(self, limit, window):
        self.limit, self.window = limit, window
        self.start, self.prev, self.curr = 0, 0, 0

    def allow(self, t):
        s = t - t % self.window
        if s != self.start:
            self.prev = self.curr if s - self.start == self.window else 0
            self.start, self.curr = s, 0
        elapsed = t - s
        est = self.prev * (self.window - elapsed) / self.window + self.curr
        if est + 1 <= self.limit:
            self.curr += 1
            return True
        return False


class TokenBucket:
    """Capacity `limit`, refilled continuously at limit/window per tick."""
    name = "token bucket"

    def __init__(self, limit, window):
        self.cap, self.rate = float(limit), limit / window
        self.tokens, self.last = float(limit), 0

    def allow(self, t):
        self.tokens = min(self.cap, self.tokens + (t - self.last) * self.rate)
        self.last = t
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False


class LeakyBucket:
    """Meter: level rises 1 per admitted request, leaks limit/window per tick,
    capacity `limit`."""
    name = "leaky bucket"

    def __init__(self, limit, window):
        self.cap, self.rate = float(limit), limit / window
        self.level, self.last = 0.0, 0

    def allow(self, t):
        self.level = max(0.0, self.level - (t - self.last) * self.rate)
        self.last = t
        if self.level + 1 <= self.cap:
            self.level += 1
            return True
        return False


LIMITERS = [FixedWindow, SlidingLog, SlidingCounter, TokenBucket, LeakyBucket]
