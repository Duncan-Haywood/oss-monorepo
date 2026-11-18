import math, sys, time
sys.path.insert(0, 'src')
from marine_sail.polar import Craft
from marine_sail.route import Scene, isochrone, fly, greedy

craft = Craft()
start, goal = (0.0, 0.0), (7000.0, 38000.0)   # about 40 km, bearing 10 deg
SC = {
 'steady': dict(),
 'oscillating': dict(osc_deg=15.0, osc_h=3.0),
 'front': dict(veer_deg=60.0, veer_h=4.0),
}
print('scene,tws,tide,t_tack_s,ideal_h,plan_ignores_h,plan_aware_h,greedy_h,loss_ignore_pct,loss_aware_pct,loss_greedy_pct')
for name, kw in SC.items():
    for tws in (4, 8, 12):
        for tide in (0.0, 0.5):
            scene = Scene(tws=tws, wd0=0.0, tide=tide, **kw)
            p0 = isochrone(craft, scene, start, goal, 0.0)
            ideal = fly(craft, scene, start, goal, p0, 0.0) if p0 else float('nan')
            for tt in (30, 60, 120):
                pa = isochrone(craft, scene, start, goal, float(tt))
                ti = fly(craft, scene, start, goal, p0, float(tt))
                ta = fly(craft, scene, start, goal, pa, float(tt))
                tg = greedy(craft, scene, start, goal, float(tt))
                f = lambda a: 100 * (a - ideal) / ideal
                print(f'{name},{tws},{tide},{tt},{ideal/3600:.2f},{ti/3600:.2f},{ta/3600:.2f},{tg/3600:.2f},{f(ti):.1f},{f(ta):.1f},{f(tg):.1f}', flush=True)
