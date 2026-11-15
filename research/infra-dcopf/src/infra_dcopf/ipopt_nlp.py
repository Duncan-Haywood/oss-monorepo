"""IPOPT as a drop-in replacement for PIPS inside PYPOWER's AC OPF (a second reference AC solver).

PYPOWER's `pipsopf_solver` builds the AC OPF (variables, cost, power-balance equalities, branch-flow
inequalities, linear angle-difference rows, bounds) and hands it to `pips(f_fcn, x0, A, l, u, xmin,
xmax, gh_fcn, hess_fcn, opt)`. `ipopt_pips` has the same signature and return dictionary and solves
the same problem with IPOPT (Waechter and Biegler 2006, via cyipopt, MUMPS linear solver), so the
model, the start (PYPOWER's bound-midpoint x0) and every result field are unchanged and only the
NLP solver differs. `use_ipopt()` swaps it in for the duration of a `with` block:

    with use_ipopt():
        r = runopf(ppc, ACOPT)

Needs the IPOPT library and cyipopt (`apt-get install coinor-libipopt-dev liblapack-dev
libblas-dev pkg-config && pip install cyipopt`); `available()` says whether they import.
"""
import contextlib

import numpy as np
from scipy.sparse import coo_matrix, csr_matrix, tril

INF = 1e19
OPTIONS = {"tol": 1e-6, "acceptable_tol": 1e-4, "max_iter": 3000, "print_level": 0,
           "linear_solver": "mumps", "mu_strategy": "monotone"}
LAST = {}  # status, message and iteration count of the most recent solve


def available():
    try:
        import cyipopt  # noqa: F401
        return True
    except ImportError:
        return False


def _pattern(M):
    M = coo_matrix(M)
    keep = M.data != 0
    return M.row[keep], M.col[keep]


def _values(M, rows, cols):
    M = csr_matrix(M)
    return np.asarray(M[rows, cols]).ravel()


def ipopt_pips(f_fcn, x0=None, A=None, l=None, u=None, xmin=None, xmax=None, gh_fcn=None, hess_fcn=None,
               opt=None):
    import cyipopt

    opt = opt or {}
    cm = opt.get("cost_mult", 1.0)
    x0 = np.asarray(x0, float)
    nx = x0.size
    A = csr_matrix((0, nx)) if A is None else csr_matrix(A)
    nA = A.shape[0]
    h0, g0, _, _ = gh_fcn(x0)
    neq, niq = len(g0), len(h0)
    m = neq + niq + nA

    def jac_full(x):
        _, _, dh, dg = gh_fcn(x)
        blocks = []
        if neq:
            blocks.append(csr_matrix(dg.T))
        if niq:
            blocks.append(csr_matrix(dh.T))
        if nA:
            blocks.append(A)
        from scipy.sparse import vstack
        return vstack(blocks).tocsr()

    rng = np.random.default_rng(0)
    xs = x0 + 1e-3 * rng.standard_normal(nx)
    J = jac_full(xs) + jac_full(x0)
    jr, jc = _pattern(abs(J))

    def hess_full(x, lam, of):
        return hess_fcn(x, {"eqnonlin": lam[:neq], "ineqnonlin": lam[neq:neq + niq]}, of * cm)

    H = tril(abs(hess_full(xs, rng.standard_normal(m) + 1.0, 1.0)) + abs(hess_full(x0, np.ones(m), 1.0)))
    hr, hc = _pattern(H)

    class Prob:
        def objective(self, x):
            return f_fcn(x)[0] * cm

        def gradient(self, x):
            return np.asarray(f_fcn(x)[1]).ravel() * cm

        def constraints(self, x):
            h, g, _, _ = gh_fcn(x)
            return np.concatenate([np.ravel(g), np.ravel(h), A @ x])

        def jacobianstructure(self):
            return jr, jc

        def jacobian(self, x):
            return _values(jac_full(x), jr, jc)

        def hessianstructure(self):
            return hr, hc

        def hessian(self, x, lam, of):
            return _values(tril(hess_full(x, lam, of)), hr, hc)

    lb = np.where(np.isfinite(xmin), xmin, -INF)
    ub = np.where(np.isfinite(xmax), xmax, INF)
    la = np.where(np.isfinite(l), l, -INF) if nA else np.zeros(0)
    ua = np.where(np.isfinite(u), u, INF) if nA else np.zeros(0)
    cl = np.concatenate([np.zeros(neq), -INF * np.ones(niq), la])
    cu = np.concatenate([np.zeros(neq), np.zeros(niq), ua])
    nlp = cyipopt.Problem(n=nx, m=m, problem_obj=Prob(), lb=lb, ub=ub, cl=cl, cu=cu)
    for k, v in OPTIONS.items():
        nlp.add_option(k, v)
    x, info = nlp.solve(np.clip(x0, lb, ub))
    status = int(info["status"])
    LAST.clear()
    LAST.update({"status": status, "message": info["status_msg"].decode() if isinstance(info["status_msg"], bytes)
                 else str(info["status_msg"])})
    lam = np.asarray(info["mult_g"]) / cm
    lam_lin = lam[neq + niq:]
    lmbda = {"eqnonlin": lam[:neq], "ineqnonlin": np.maximum(lam[neq:neq + niq], 0.0),
             "mu_l": np.maximum(-lam_lin, 0.0), "mu_u": np.maximum(lam_lin, 0.0),
             "lower": np.asarray(info["mult_x_L"]) / cm, "upper": np.asarray(info["mult_x_U"]) / cm}
    return {"x": x, "f": info["obj_val"] / cm, "eflag": 1 if status in (0, 1) else 0,
            "output": {"iterations": None, "hist": [], "message": LAST["message"], "status": status},
            "lmbda": lmbda}


@contextlib.contextmanager
def use_ipopt():
    import pypower.pipsopf_solver as ps
    old = ps.pips
    ps.pips = ipopt_pips
    try:
        yield
    finally:
        ps.pips = old
