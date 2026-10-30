import copy
import math
import torch

from lowcomm import DiLoCo, GPT, GPTConfig, CharData, train_sync

TEXT = ("to be or not to be that is the question " * 80)


def make(seed=0):
    torch.manual_seed(seed)
    data = CharData(TEXT, block=16)
    m = GPT(GPTConfig(vocab=data.vocab, block=16, layers=1, heads=2, dim=16))
    return data, m, (lambda model, rng: model(*data.batch("train", 4, rng)))


def test_m1_h1_identical_to_sync():
    data, m, f = make()
    ref = copy.deepcopy(m)
    outer = lambda p: torch.optim.SGD(p, lr=1.0)
    d = DiLoCo(m, f, workers=1, H=1, outer=outer, seed=3)
    a = [d.round() for _ in range(30)]
    b = train_sync(ref, f, 30, seed=3)
    assert max(abs(x - y) for x, y in zip(a, b)) < 1e-5
    for p, q in zip(m.parameters(), ref.parameters()):
        assert torch.allclose(p, q, atol=1e-5)


def test_m1_hH_with_unit_outer_equals_sync_hH_steps():
    data, m, f = make(1)
    ref = copy.deepcopy(m)
    d = DiLoCo(m, f, workers=1, H=5, outer=lambda p: torch.optim.SGD(p, lr=1.0), seed=2)
    a = [d.round() for _ in range(4)]
    b = train_sync(ref, f, 20, seed=2)
    assert abs(sum(b[:5]) / 5 - a[0]) < 1e-5 and abs(sum(b[15:]) / 5 - a[3]) < 1e-5


def test_pseudo_gradient_is_mean_of_worker_deltas():
    data, m, f = make(2)
    start = copy.deepcopy(m.state_dict())
    d = DiLoCo(m, f, workers=3, H=2, outer=lambda p: torch.optim.SGD(p, lr=1.0), seed=1)
    d.round()
    ends = [w.state_dict() for w in d.workers]
    for k, v in m.state_dict().items():
        mean = torch.stack([e[k] for e in ends]).mean(0)
        assert torch.allclose(v, mean, atol=1e-6), k   # outer lr 1, no momentum -> global = average of workers
    assert any(not torch.allclose(start[k], v) for k, v in m.state_dict().items())


def test_workers_stream_distinct_data():
    data, m, f = make()
    d = DiLoCo(m, f, workers=2, H=1, seed=0)
    x0 = data.batch("train", 4, d.rngs[0])[0]
    x1 = data.batch("train", 4, d.rngs[1])[0]
    assert not torch.equal(x0, x1)


def test_deterministic_given_seed():
    runs = []
    for _ in range(2):
        data, m, f = make()
        d = DiLoCo(m, f, workers=2, H=3, seed=7)
        runs.append([d.round() for _ in range(3)])
    assert runs[0] == runs[1]


# Quadratic closed form of research/noisy-local-sgd (exact stationary variance of the outer AR(2) recursion).
def _floor(a, eta, sigma, M, H, alpha, beta):
    q = 1 - eta * a
    s = 1 - q ** H
    V = eta * eta * sigma * sigma * (1 - q ** (2 * H)) / ((1 - q * q) * M)
    var = alpha * V * (1 + beta) / ((1 - beta) * s * (2 * (1 + beta) - alpha * s))
    return 0.5 * a * var


def test_quadratic_stationary_loss_matches_closed_form():
    a = torch.tensor([1.0, 0.3, 0.05])
    eta, sigma, M, H, alpha, beta = 0.1, 1.0, 4, 8, 0.8, 0.5

    class Quad(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.x = torch.nn.Parameter(torch.zeros(3))

    def loss_fn(model, rng):   # gradient = a x + sigma*noise
        return 0.5 * (a * model.x ** 2).sum() + sigma * (model.x * torch.randn(3, generator=rng)).sum()

    model = Quad()
    d = DiLoCo(model, loss_fn, workers=M, H=H, seed=5,
               inner=lambda p: torch.optim.SGD(p, lr=eta),
               outer=lambda p: torch.optim.SGD(p, lr=alpha, momentum=beta))
    for _ in range(300):
        d.round()
    acc, n = 0.0, 4000
    for _ in range(n):
        d.round()
        acc += 0.5 * (a * model.x.detach() ** 2).sum().item()
    want = sum(_floor(float(ai), eta, sigma, M, H, alpha, beta) for ai in a)
    # heavy ball in torch is v <- beta v + g, x <- x - lr v, the same as the closed form's outer step
    assert abs(acc / n - want) / want < 0.12, (acc / n, want)


def test_rand_k_unbiased_and_keep1_matches_plain():
    from lowcomm import rand_k
    g = torch.Generator().manual_seed(0)
    x = torch.randn(2000)
    c = rand_k(0.25)
    est = torch.stack([c(x, g) for _ in range(400)]).mean(0)
    assert abs((est - x).mean().item()) < 0.05
    err = ((c(x, g) - x) ** 2).sum() / (x ** 2).sum()
    assert 2.0 < err.item() < 4.0  # omega = 1/0.25 - 1 = 3
    data, m, f = make(4)
    m2 = copy.deepcopy(m)
    a = DiLoCo(m, f, workers=2, H=3, outer=lambda p: torch.optim.SGD(p, lr=1.0), seed=1)
    b = DiLoCo(m2, f, workers=2, H=3, outer=lambda p: torch.optim.SGD(p, lr=1.0), seed=1, compress=rand_k(1.0))
    for _ in range(3):
        a.round(); b.round()
    for p, q in zip(m.parameters(), m2.parameters()):
        assert torch.allclose(p, q, atol=1e-5)


def test_top_k_and_error_feedback():
    import torch
    from lowcomm import DiLoCo, top_k
    c = top_k(0.25)
    x = torch.tensor([1.0, -5.0, 2.0, 0.5, 3.0, -0.1, 0.2, 4.0])
    y = c(x, None)
    assert y.count_nonzero() == 2 and y[1] == -5.0 and y[7] == 4.0
    # keep = 1 is the identity, with or without error feedback, so DiLoCo matches the uncompressed round
    def mk():
        torch.manual_seed(0)
        return torch.nn.Linear(3, 1)
    f = lambda m, rng: ((m(torch.randn(4, 3, generator=rng)) - 1) ** 2).mean()
    outs = []
    for kw in ({}, {"compress": top_k(1.0), "error_feedback": True}):
        m = mk()
        d = DiLoCo(m, f, workers=2, H=3, outer=lambda p: torch.optim.SGD(p, lr=1.0), seed=1, **kw)
        for _ in range(3):
            d.round()
        outs.append([p.detach().clone() for p in m.parameters()])
    assert all(torch.allclose(a, b, atol=1e-6) for a, b in zip(*outs))
    # with a lossy compressor the residual is stored: delta + old residual = compressed + new residual
    m = mk()
    d = DiLoCo(m, f, workers=2, H=3, outer=lambda p: torch.optim.SGD(p, lr=1.0), seed=1, compress=top_k(0.5), error_feedback=True)
    d.round()
    assert any(float(e.abs().sum()) > 0 for e in d.ef[0])


def test_quantise_is_unbiased_and_on_grid():
    import torch
    from lowcomm import quantise
    x = torch.tensor([0.9, -0.3, 0.05, 0.0, -1.0])
    for levels in (1, 7):
        c, gen = quantise(levels), torch.Generator().manual_seed(0)
        outs = torch.stack([c(x, gen) for _ in range(20000)])
        assert torch.allclose(outs.mean(0), x, atol=0.02)
        grid = outs.abs() / 1.0 * levels
        assert torch.allclose(grid, grid.round(), atol=1e-5)
    assert torch.equal(quantise(3)(torch.zeros(4), torch.Generator()), torch.zeros(4))

def test_median_aggregate_and_attack():
    import torch
    from lowcomm import DiLoCo
    def mk():
        torch.manual_seed(0)
        return torch.nn.Linear(3, 1)
    f = lambda m, rng: ((m(torch.randn(4, 3, generator=rng)) - 1) ** 2).mean()
    sgd = lambda p: torch.optim.SGD(p, lr=1.0)
    # one worker: the median is the delta itself, so it matches the mean
    outs = []
    for agg in ("mean", "median"):
        m = mk()
        d = DiLoCo(m, f, workers=1, H=3, outer=sgd, seed=1, aggregate=agg)
        d.round()
        outs.append([p.detach().clone() for p in m.parameters()])
    assert all(torch.allclose(a, b, atol=1e-6) for a, b in zip(*outs))
    # three workers, one attacker adding a huge offset: the mean moves with it, the median stays near the honest value
    res = {}
    for agg in ("mean", "median"):
        for atk in (None, lambda d, j: d + 1e3 if j == 0 else d):
            m = mk()
            d = DiLoCo(m, f, workers=3, H=3, outer=sgd, seed=1, aggregate=agg, attack=atk)
            d.round()
            res[(agg, atk is not None)] = torch.cat([p.detach().flatten() for p in m.parameters()])
    assert (res[("mean", True)] - res[("mean", False)]).abs().max() > 100
    assert (res[("median", True)] - res[("median", False)]).abs().max() < 5
    # even M: median is the mean of the two middle values
    ds = torch.tensor([[1.0], [2.0], [10.0], [100.0]])
    assert float(ds.sort(0).values[1:3].mean(0)) == 6.0

def test_trimmed_aggregate():
    import torch
    from lowcomm import DiLoCo
    f = lambda m, rng: ((m(torch.randn(4, 3, generator=rng)) - 1) ** 2).mean()
    sgd = lambda p: torch.optim.SGD(p, lr=1.0)
    res = {}
    for agg, atk in (("mean", None), ("trimmed", None), ("trimmed", lambda d, j: d + 1e3 if j == 0 else d)):
        torch.manual_seed(0)
        m = torch.nn.Linear(3, 1)
        DiLoCo(m, f, workers=5, H=3, outer=sgd, seed=1, aggregate=agg, attack=atk).round()
        res[(agg, atk is not None)] = torch.cat([p.detach().flatten() for p in m.parameters()])
    assert not torch.allclose(res[("mean", False)], res[("trimmed", False)], atol=1e-7)  # it drops two values
    assert (res[("trimmed", True)] - res[("trimmed", False)]).abs().max() < 5  # a huge offset is trimmed away

def test_quantize_unbiased_and_sign():
    import torch
    from lowcomm import quantize
    g = torch.Generator().manual_seed(0)
    x = torch.randn(50)
    m = torch.stack([quantize(4)(x, g) for _ in range(4000)]).mean(0)
    assert (m - x).abs().max() < 0.03
    assert len(set(quantize(2)(x, g).tolist())) <= 3  # levels -s, 0, s
    s = quantize(1)(x, g)
    assert torch.equal(torch.sign(s), torch.sign(x)) and torch.allclose(s.abs(), x.abs().mean().expand(50))
