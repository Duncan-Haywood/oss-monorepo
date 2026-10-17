import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "src"))
from robofab_program import check
d = pathlib.Path(__file__).parent.parent / "programs" / sys.argv[1]
for task in ["move", "wall", "heavy", "far"]:
    f = d / f"{task}.rob"
    if not f.exists(): continue
    print(task)
    for lv in ["L0", "L1", "L2", "REF"]:
        r = check(f.read_text(), task, lv)
        print(f"  {lv}: pass={r['pass']} p={r['p_success']} t={r['time']:.1f} {r['violations']}")
