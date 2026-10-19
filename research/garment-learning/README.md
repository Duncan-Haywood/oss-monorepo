# garment-learning: how many home-sewn coats before the labour cost settles?

**Question.** `garment-teardown` priced a $20 to $50 replica trench coat at about $43 in materials plus sewing labour at an *experienced operator's* speed (76 minutes). A first-time sewer is far slower. Using a Wright learning curve, how many coats does it take to get within 2x of an experienced operator, and what does your own time have to be worth for the n-th coat to still cost $50?

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-learning/

**Headline (assumed inputs, see Limitations).** With a first coat 4x an experienced operator (5.1 h) and an 85% learning rate, it takes 20 coats to get within 2x of experienced time; with a first coat 8x and a 90% rate it takes about 9,100, so the answer is dominated by the two assumed parameters, not by the model. At those 4x / 85% inputs, with $43 in materials, the first coat stays under $50 only if your time is valued at $1.45/h or less, and the 100th coat at $4.28/h or less. At a $15/h valuation the first coat costs about $119. Produced with AI assistance (Claude).

**Why this one.** The garment track's recent chain was variants of one two-node thermal model; this asks a different question, the volume and learning effect that `garment-teardown`'s limitations list as ignored.

**Builds on.** Wright, T. P. (1936), "Factors affecting the cost of airplanes", *Journal of the Aeronautical Sciences* 3(4):122-128 (the learning curve: unit time falls by a fixed share with each doubling of cumulative output; I cite it from memory and did not fetch it). Replica materials and minutes come from `garment-teardown`. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- `src/garment_learning/model.py`: unit time `t(n) = max(floor, t1 * n^b)`, `b = log2(rate)`; exact cumulative sums; coats-to-target; labour cost per unit at a wage and line efficiency. Floor = the experienced-operator minutes (sewing 51 + cutting 25 = 76).
- `experiments/run.py` writes `experiments/results.txt` (stdlib, deterministic): A) coats to reach 2x experienced time; B) total cost of the n-th coat with own time valued at $0, $6, $15/h; C) highest wage for which the n-th coat costs at most $50; D) a factory run, mean sewing labour per coat against run length ($6/h, efficiency 0.55, first coat 2x, rate 0.90).

## Reproduce
```bash
cd research/garment-learning
python -m pytest -q tests                       # 9 tests
python experiments/run.py                       # writes experiments/results.txt
python experiments/figure.py                    # writes experiments/max_wage.svg
```

## Results (from `experiments/results.txt`)
| first coat / rate | coats to within 2x of experienced time |
|---|---|
| 4x / 0.80 | 9 |
| 4x / 0.85 | 20 |
| 4x / 0.90 | 96 |
| 8x / 0.80 | 75 |
| 8x / 0.85 | 370 |
| 8x / 0.90 | 9,138 |

- Own time at $0/h: every coat costs the $43 of materials. At $6/h the coats cost $73, $63, $58, $53 for coats 1, 5, 20, 100; at $15/h, $119, $95, $80, $68.
- Break-even wage for a $50 coat (4x, 0.85): $1.45, $2.12, $2.93, $4.28 per hour for coats 1, 5, 20, 100. In these assumptions a $50 replica is a hobby price, not a wage-paying one: the $43 of materials leaves only $7 of headroom.
- Factory run (D): mean sewing labour per coat is $27.6 for a single coat, $22.1 over 10, $14.9 over 200 and $14.0 over 1,000, against a steady state of $13.8. With a 2x first coat and a 0.90 rate, the learning surcharge is under 8% after 200 coats.

## Limitations
- **Every parameter is assumed**: the first-coat multiple (4x, 8x), the learning rates (0.80 to 0.90), and the floor. Real learning rates for home sewing were not measured or sourced here. The 2x-time answer ranges over three orders of magnitude on those two numbers.
- Wright's curve is an empirical fit for repeated identical units; a new pattern, a different cloth or a break between coats resets some learning (forgetting is not modelled). The floor is the factory time, but a skilled home sewer without industrial machines may never reach it.
- Materials ($43) and the 76 minutes are `garment-teardown`'s assumed replica, itself unverified against real bills of materials. Waste and failed coats are not modelled.
- Modelled numbers only; nothing was sewn, timed or bought.

## Next steps
Source a measured learning rate for apparel sewing (the industrial-engineering literature reports them; not checked here), add forgetting between coats, and tie the first-coat multiple to pattern complexity from `garment-pattern-fit`.

## Owner steps
None required. A real test would be timing a few people sewing the same pattern repeatedly; that is a physical-world step, not done here.

## Outside dependencies (vitamins)
Python standard library; `garment-teardown` for the replica inputs. Real learning rates, cloth and labour values come from outside the model.
