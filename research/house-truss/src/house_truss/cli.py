import argparse

from .model import Truss, bf_per_sf, board_feet, checks, lightest, stick_frame


def main(argv=None):
    ap = argparse.ArgumentParser(prog="house-truss", description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("size", help="lightest W truss that passes, and the stick-built alternative")
    a.add_argument("--span", type=float, required=True, help="span in feet")
    a.add_argument("--pitch", type=float, default=4.0, help="rise per 12 of run")
    a.add_argument("--spacing", type=float, default=24.0, help="truss spacing, in")
    a.add_argument("--snow", type=int, default=30, choices=(30, 50), help="ground-snow roof load, psf on plan")
    c = sub.add_parser("check", help="check one truss")
    c.add_argument("--span", type=float, required=True)
    c.add_argument("--pitch", type=float, default=4.0)
    c.add_argument("--spacing", type=float, default=24.0)
    for k in ("top", "bottom", "web"):
        c.add_argument(f"--{k}", default="2x4")
    args = ap.parse_args(argv)
    if args.cmd == "size":
        best = lightest(args.span, args.pitch, args.spacing, snow_psf=args.snow)
        if best is None:
            print("no 2x4/2x6/2x8 W truss passes at this span: it needs a different truss type or engineered lumber")
        else:
            t, bf = best
            print(f"truss: top {t.top}, bottom {t.bottom}, web {t.web}: {bf:.1f} bf each, {bf_per_sf(t):.3f} bf/sq ft")
        s = stick_frame(args.span, args.pitch, case=f"roof-snow{args.snow}")
        print("stick:", "none passes" if s is None else f"rafter {s['rafter']}, ceiling joist {s['joist']} at 16 in: {s['bf_per_sf']:.3f} bf/sq ft")
    else:
        t = Truss(args.span, args.pitch, args.spacing, args.top, args.bottom, args.web)
        r, _ = checks(t)
        for k, v in r.items():
            print(f"{k:13s} {v:6.2f}  {'ok' if v <= 1 else 'FAILS'}")
        print(f"{board_feet(t):.1f} bf")
    print("Research code, not a design: a truss needs a truss engineer's sealed design.")


if __name__ == "__main__":
    main()
