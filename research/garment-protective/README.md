# garment-protective: how much would a suit-like protective garment weigh and cost, and what limits it?

Fifth milestone of the engineered-clothing track (`PROJECTS.md`, track 6). A stylised comparison of nylon, aramid and UHMWPE fabrics using a Cunniff-style specific-toughness scaling, plus mass, cost, thickness and bending stiffness of a torso panel. **Modelling only: this is not a protection claim.** A garment is armour only after certified testing, such as NIJ Standard 0101.07 (ballistic) or 0115.00 (stab). Some US states restrict civilian body armour (New York: Penal Law § 270.21). Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-protective/

**Builds on.** Cunniff (1999), dimensionless parameters for textile body armour, and Lee, Wetzel and Wagner (2003) on shear-thickening-fluid-treated Kevlar (as listed in `PROJECTS.md`). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Citation check.** Both references come from the list in `PROJECTS.md` (checked 2026-10-12). Cunniff (1999) exists in print proceedings only, so I could not read it, and the container blocks doi.org. The U* formula below is written from memory of that paper's form; treat it as unverified. Shear-thickening fluid is not modelled.

## Method
`src/garment_protective/model.py`:
- `u_star`: U* = [ (σε / 2ρ) · √(E/ρ) ]^(1/3) from strength σ, failure strain ε, modulus E and density ρ.
- `v50_ratio`: at equal areal density and threat, V50 is taken proportional to U*. This is my reading of the scaling, not a calibrated ballistic model.
- `areal_density_ratio`: to match another fibre's V50 I assume V50/U* ∝ (areal density)^n. The exponent n is unknown here, so every result is shown for n = 0.25, 0.5 and 1.0.
- `garment`, `thickness`, `bending_stiffness`: mass and cost of a 0.5 m² torso panel, thickness from an assumed 0.55 fibre packing fraction, and stack bending stiffness bonded (one beam) against free plies (20 plies sliding, which is 20² times more flexible).
- Fibre numbers (strength, strain, modulus, density) and fabric prices per kg are **assumed round figures, not datasheet values, and the prices have no source**. Sourcing prices is an owner step.

## Reproduce
```bash
python3 -m pip install numpy pytest
cd research/garment-protective
python3 -m pytest -q tests          # 8 tests
python3 experiments/run.py          # instant; writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
- U*: nylon 549 m/s, aramid 582, UHMWPE 868. At equal weight, UHMWPE has 1.49 times aramid's V50 in this scaling; nylon 0.94.
- Matching aramid's V50 takes UHMWPE 0.20, 0.45 or 0.67 of aramid's areal density for n = 0.25, 0.5, 1.0. The spread shows how much the unknown n matters: the conclusion "UHMWPE is lighter" holds for all three, its size does not.
- A 4 kg/m² aramid-equivalent panel (0.5 m²): aramid 2.0 kg, $80, 5.1 mm; UHMWPE (n = 0.5) 0.9 kg, $54, 3.4 mm; nylon 2.25 kg, $18, 7.2 mm. Cost uses the assumed prices.
- Bonded, these stacks are about 20² times stiffer than loose plies; a bonded panel is also several times stiffer in aramid than UHMWPE because it is thicker.
- Under a suit-like limit (≤ 3 mm and ≤ 1 kg per panel) areal density is capped near 1.6 to 2.0 kg/m², giving 0.50 to 0.84 of the 4 kg/m² aramid reference's V50 for aramid and 0.60 to 1.18 for UHMWPE, depending on n. Only UHMWPE under an optimistic n reaches the reference. This says nothing about the absolute protection level.

## Limitations
- **Stylised.** No ballistic or stab physics, no weave, no projectile, no backface deformation, no trauma limit, no edges or seams, no ageing or wet degradation, no shear-thickening fluid.
- U* is recalled, material numbers are assumed, n is unknown, prices are unsourced. Only ratios are meaningful.
- The suit-like limit (3 mm, 1 kg) is my arbitrary choice.
- No claim about any real garment or protective rating.

## Next steps
Check the U* form against Cunniff's paper or a published reproduction; replace assumed properties with sourced datasheet values and prices; fit n from published V50-versus-areal-density data; add a flexibility score from drape or cantilever tests.

## Owner steps
Sourcing fabric prices for builds at about $300, $1,000 and $3,000, and any certified testing, are owner steps. Nothing was ordered or tested.

## Outside dependencies (vitamins)
Python and pytest. Fibre properties, prices and the scaling exponent come from outside the model.

## References
- Cunniff, P. M. (1999). Dimensionless parameters for optimization of textile-based body armor systems. Proc. 18th Int. Symposium on Ballistics, San Antonio. (Print only; not read.)
- Lee, Y. S., Wetzel, E. D., Wagner, N. J. (2003). The ballistic impact characteristics of Kevlar woven fabrics impregnated with a colloidal shear thickening fluid. *J. Mater. Sci.* 38(13):2825-2833. https://doi.org/10.1023/A:1024424200221 (context only; not modelled)
- NIJ Standard 0101.07 (2023) and NIJ Standard 0115.00 (2000), named as the certification route only.
