"""Small least-squares tools for screening rules (milestone 6d). Stdlib only."""


def solve(a, b):
    """Solve the square system a x = b by Gaussian elimination with partial pivoting."""
    n = len(b)
    m = [list(map(float, row)) + [float(v)] for row, v in zip(a, b)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        if abs(m[p][c]) < 1e-300:
            raise ValueError("singular system")
        m[c], m[p] = m[p], m[c]
        for r in range(n):
            if r != c:
                f = m[r][c] / m[c][c]
                for k in range(c, n + 1):
                    m[r][k] -= f * m[c][k]
    return [m[i][n] / m[i][i] for i in range(n)]


def ols(rows, ys):
    """Least squares with an intercept: returns [b0, b1, ...] for y ~ b0 + sum b_j x_j."""
    x = [[1.0] + list(r) for r in rows]
    k = len(x[0])
    xtx = [[sum(xi[i] * xi[j] for xi in x) for j in range(k)] for i in range(k)]
    xty = [sum(xi[i] * y for xi, y in zip(x, ys)) for i in range(k)]
    return solve(xtx, xty)


def predict(coef, row):
    return coef[0] + sum(c * v for c, v in zip(coef[1:], row))


def r_squared(coef, rows, ys):
    my = sum(ys) / len(ys)
    ss_res = sum((y - predict(coef, r)) ** 2 for r, y in zip(rows, ys))
    ss_tot = sum((y - my) ** 2 for y in ys)
    return 1.0 - ss_res / ss_tot


def grouped_cv(rows, ys, groups):
    """Leave-one-group-out predictions: each case is predicted by a fit without its group."""
    out = [None] * len(ys)
    for g in sorted(set(groups)):
        train = [i for i, h in enumerate(groups) if h != g]
        coef = ols([rows[i] for i in train], [ys[i] for i in train])
        for i, h in enumerate(groups):
            if h == g:
                out[i] = predict(coef, rows[i])
    return out
