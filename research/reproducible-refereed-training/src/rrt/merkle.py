"""Minimal SHA-256 Merkle tree over float32 vectors."""
import hashlib
import struct


def leaf(vec):
    return hashlib.sha256(b"\x00" + struct.pack("%df" % len(vec), *vec)).digest()


def _node(a, b):
    return hashlib.sha256(b"\x01" + a + b).digest()


class MerkleTree:
    def __init__(self, vecs):
        self.n = len(vecs)
        level = [leaf(v) for v in vecs]
        self.levels = [level]
        while len(level) > 1:
            if len(level) % 2:
                level = level + [level[-1]]
                self.levels[-1] = level
            level = [_node(level[i], level[i + 1]) for i in range(0, len(level), 2)]
            self.levels.append(level)

    @property
    def root(self):
        return self.levels[-1][0]

    def proof(self, i):
        out = []
        for level in self.levels[:-1]:
            out.append(level[i ^ 1])
            i //= 2
        return out


def verify_proof(root, vec, i, proof):
    h = leaf(vec)
    for sib in proof:
        h = _node(h, sib) if i % 2 == 0 else _node(sib, h)
        i //= 2
    return h == root
