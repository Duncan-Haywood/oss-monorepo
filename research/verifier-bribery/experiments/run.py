"""Reproduces the tables in paper/whitepaper.md (~10s)."""
from verifier_bribery import Params, solver_profit_closed_form as prof, collusion_threshold_stake as Sc, bribe_floor

print("Collusion-proof stake S_c (s=1, lam=.5, h=0, no jackpots) vs verifiers m")
for m in (1, 2, 4, 8):
    print(f"m={m}: S_c={Sc(Params(m=m)):.2f}")

print("\nBribing solver's max profit (s=3,k=.5,lam=.5,m=1) vs stake, no jackpot: S, profit, cheat rate at optimum")
for S in (2, 4, 6, 7, 8, 12, 24):
    p = Params(s=3, S=S); A = p.lam * S; C = p.k
    x = 1.0 if p.s >= A else min(1, C / A)
    print(f"S={S:>2}: profit={prof(p):.3f} cheat={x:.3f}")

print("\nSame with jackpots (phi=.05): J, phi*J, profit at S=4 (A=2) and S=6 (A=3), s=3")
for J in (0, 5, 10, 20, 40):
    print(f"J={J:>2} phi*J={.05*J:.2f} " + " ".join(f"S={S}: {prof(Params(s=3, S=S, phi=.05, J=J)):.3f}" for S in (4, 6)))

print("\nBribe floor b*(x) (S=4,lam=.5,k=.5,h=0) without / with phi*J=k jackpots")
for x in (.05, .1, .25, .5, 1):
    print(f"x={x:.2f}: none={bribe_floor(Params(), x):+.2f} jackpot={bribe_floor(Params(phi=.05, J=10), x):+.2f}")
