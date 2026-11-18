# E26: the McGrews' 10^44 from their own text

Inputs from the authors' draft (pp. 31, 38-39, 41; draft pagination): women 10^2, one disciple 10^3, 13 disciples multiplied under independence, Paul 10^3; illustrative prior 10^-40.

- log10 factors: women 2, disciples 39, Paul 3, total 44; reproduces 10^44: True
- posterior at prior 10^-40: odds 1e+04, P = 0.99990001; above .9999 by 1.0e-08
- prior at which the posterior is 1/2: 10^-44.00
- share of the log factor: women 0.045, disciples 0.886, Paul 0.068

## Mixture bound: a shared explanation with group-level probability q given ~R

BF_D = 1/(q + (1-q) 10^-39); bound BF_D <= 1/q.

| q | log10 BF_D | log10 total | log10 P(R|E) at prior 1e-40 | log10 prior for 1/2 |
|---|---:|---:|---:|---:|
| 1e-1 | 1.00 | 6.00 | -34.00 | -6.00 |
| 1e-3 | 3.00 | 8.00 | -32.00 | -8.00 |
| 1e-6 | 6.00 | 11.00 | -29.00 | -11.00 |
| 1e-10 | 10.00 | 15.00 | -25.00 | -15.00 |
| 1e-20 | 20.00 | 25.00 | -15.00 | -25.00 |
| 1e-30 | 30.00 | 35.00 | -5.00 | -35.00 |
| 1e-39 | 38.70 | 43.70 | -0.00 | -43.70 |
| 0 | 39.00 | 44.00 | -0.00 | -44.00 |

## Under independence: how many disciples, how strong each

- log10 BF_D needed for 1/2 at prior 10^-40: 35.00; per-disciple factor needed 492.4; independent disciples needed at 10^3 each: 11.67
- posterior at prior 10^-40 by number of independent disciples: n=10: 1e-05, n=11: 0.0099, n=12: 0.909, n=13: 1
- log10 total factor by per-disciple factor: f=30: 24.2, f=100: 31.0, f=300: 37.2, f=492: 40.0, f=1000: 44.0

- group-level q at which D alone falls to E2's bar (7.3): 0.1370
- Martin's 1/500 (McGrews' n. 31) in Swinburne's model (E25): 50/53 = 0.9434
