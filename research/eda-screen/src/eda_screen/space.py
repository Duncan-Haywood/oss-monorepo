"""Index-coded view of the committed 80-design table (copied unchanged from `eda-proposers`): lookup only, no Yosys needed."""
import json

DIMS = {"p": list(range(1, 9)), "wb": [4, 5, 6, 7, 8], "abc": ["gates", "fast"]}
OBJ = ("cells", "cycles", "err")          # all minimised


def load_table(path):
    return [json.loads(l) for l in open(path)]


class Space:
    def __init__(self, table):
        self.keys = list(DIMS)
        self.sizes = [len(DIMS[k]) for k in self.keys]
        self.t = {tuple(DIMS[k].index(r[k]) for k in self.keys): tuple(float(r[o]) for o in OBJ) for r in table}
        assert len(self.t) == len(table) == 80
        arr = list(self.t.values())
        self.lo = [min(a[i] for a in arr) for i in range(3)]
        self.hi = [max(a[i] for a in arr) for i in range(3)]

    def norm(self, y):
        return tuple((v - l) / (h - l) for v, l, h in zip(y, self.lo, self.hi))

    def evaluate(self, x):
        return self.norm(self.t[x])

    def raw_cells(self, x):
        return self.t[x][0]

    def cheap(self, x):
        """Normalised (cycles, err): the two objectives that need no synthesis."""
        return self.evaluate(x)[1:]

    def all(self):
        return list(self.t)
