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
