"""SVG drawings of a house_plan Plan: a floor plan and the south elevation. Pure string building."""

PX = 24  # pixels per foot
M = 48  # margin, px


def _f(v):
    return f"{v:.1f}"


def _pt(plan, x, y):
    """Plan feet (y runs south to north) to SVG pixels (north up)."""
    return M + x * PX, M + (plan.params.depth - y) * PX


def _along(wall, off):
    """Point `off` ft along a wall from its start."""
    L = wall.length
    t = off / L if L else 0
    return wall.x0 + (wall.x1 - wall.x0) * t, wall.y0 + (wall.y1 - wall.y0) * t


def floor_plan_svg(plan):
    p = plan.params
    W, D = p.width, p.depth
    w, h = W * PX + 2 * M, D * PX + 2 * M
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {_f(w)} {_f(h)}" width="{_f(w)}" height="{_f(h)}" '
         f'font-family="sans-serif" font-size="12" role="img" aria-label="Floor plan, {W:g} by {D:g} feet">',
         f'<title>Floor plan, {W:g} x {D:g} ft ({W * D:.0f} sq ft)</title>',
         f'<rect width="{_f(w)}" height="{_f(h)}" fill="#fff"/>']
    for r in plan.rooms:
        x, y = _pt(plan, r.x, r.y + r.d)
        fill = {"living": "#f4f0e6", "bedroom": "#e8f0f8", "bath": "#e6f2ee"}[r.kind]
        o.append(f'<rect x="{_f(x)}" y="{_f(y)}" width="{_f(r.w * PX)}" height="{_f(r.d * PX)}" fill="{fill}"/>')
        o.append(f'<text x="{_f(x + r.w * PX / 2)}" y="{_f(y + r.d * PX / 2)}" text-anchor="middle" fill="#222">{r.name}</text>')
        o.append(f'<text x="{_f(x + r.w * PX / 2)}" y="{_f(y + r.d * PX / 2 + 15)}" text-anchor="middle" fill="#555" font-size="11">'
                 f'{r.w:g} x {r.d:g} ft, {r.area:.0f} sq ft</text>')
    for wl in plan.walls:
        x0, y0 = _pt(plan, wl.x0, wl.y0)
        x1, y1 = _pt(plan, wl.x1, wl.y1)
        sw = 0.5 * PX if wl.exterior else 0.33 * PX
        o.append(f'<line x1="{_f(x0)}" y1="{_f(y0)}" x2="{_f(x1)}" y2="{_f(y1)}" stroke="#222" stroke-width="{_f(sw)}" stroke-linecap="square"/>')
    for op in plan.openings:
        wl = plan.wall(op.wall)
        (ax, ay), (bx, by) = _along(wl, op.offset), _along(wl, op.offset + op.width)
        (ax, ay), (bx, by) = _pt(plan, ax, ay), _pt(plan, bx, by)
        sw = 0.5 * PX if wl.exterior else 0.33 * PX
        o.append(f'<line x1="{_f(ax)}" y1="{_f(ay)}" x2="{_f(bx)}" y2="{_f(by)}" stroke="#fff" stroke-width="{_f(sw + 1)}"/>')
        if op.kind == "window":
            o.append(f'<line x1="{_f(ax)}" y1="{_f(ay)}" x2="{_f(bx)}" y2="{_f(by)}" stroke="#3a7bd5" stroke-width="3"/>')
        else:  # door: leaf drawn open at 90 degrees into the room, plus the swing arc
            room = next(r for r in plan.rooms if r.name == op.room)
            mx, my = _pt(plan, room.x + room.w / 2, room.y + room.d / 2)
            if ay == by:  # horizontal wall: swing up or down, towards the room's centre
                nx, ny = 0, (1 if my > ay else -1)
            else:
                nx, ny = (1 if mx > ax else -1), 0
            cx, cy = ax + nx * (op.width * PX), ay + ny * (op.width * PX)
            r_px = op.width * PX
            o.append(f'<line x1="{_f(ax)}" y1="{_f(ay)}" x2="{_f(cx)}" y2="{_f(cy)}" stroke="#b5651d" stroke-width="2"/>')
            sweep = 1 if (nx * (by - ay) - ny * (bx - ax)) > 0 else 0
            o.append(f'<path d="M {_f(cx)} {_f(cy)} A {_f(r_px)} {_f(r_px)} 0 0 {sweep} {_f(bx)} {_f(by)}" fill="none" stroke="#b5651d" stroke-width="1" stroke-dasharray="3 2"/>')
    # overall dimensions
    xs, ys = _pt(plan, 0, 0)
    xe, _ = _pt(plan, W, 0)
    _, yn = _pt(plan, 0, D)
    o.append(f'<line x1="{_f(xs)}" y1="{_f(ys + 22)}" x2="{_f(xe)}" y2="{_f(ys + 22)}" stroke="#555"/>')
    o.append(f'<text x="{_f((xs + xe) / 2)}" y="{_f(ys + 38)}" text-anchor="middle" fill="#333">{W:g} ft</text>')
    o.append(f'<line x1="{_f(xs - 22)}" y1="{_f(yn)}" x2="{_f(xs - 22)}" y2="{_f(ys)}" stroke="#555"/>')
    o.append(f'<text transform="translate({_f(xs - 28)} {_f((yn + ys) / 2)}) rotate(-90)" text-anchor="middle" fill="#333">{D:g} ft</text>')
    o.append(f'<text x="{_f(M)}" y="22" fill="#333" font-weight="bold">Floor plan (north up). Not for construction.</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"


def south_elevation_svg(plan):
    p = plan.params
    W = p.width
    wall_h = 8.0
    rise = W / 2 * p.pitch / 12
    w, h = W * PX + 2 * M, (wall_h + rise) * PX + 2 * M
    base = M + (wall_h + rise) * PX  # ground line
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {_f(w)} {_f(h)}" width="{_f(w)}" height="{_f(h)}" '
         f'font-family="sans-serif" font-size="12" role="img" aria-label="South elevation, {p.pitch}:12 roof">',
         f'<title>South elevation, {p.pitch}:12 roof</title>',
         f'<rect width="{_f(w)}" height="{_f(h)}" fill="#fff"/>',
         f'<line x1="{_f(M - 16)}" y1="{_f(base)}" x2="{_f(M + W * PX + 16)}" y2="{_f(base)}" stroke="#444"/>',
         f'<rect x="{_f(M)}" y="{_f(base - wall_h * PX)}" width="{_f(W * PX)}" height="{_f(wall_h * PX)}" fill="#efe9dc" stroke="#222" stroke-width="2"/>']
    ov = p.overhang
    o.append(f'<polygon points="{_f(M - ov * PX)},{_f(base - wall_h * PX)} {_f(M + W * PX / 2)},{_f(base - (wall_h + rise) * PX)} '
             f'{_f(M + W * PX + ov * PX)},{_f(base - wall_h * PX)}" fill="#c9c2b3" stroke="#222" stroke-width="2"/>')
    for op in plan.openings:
        if op.wall != "S":
            continue
        x = M + op.offset * PX
        top = op.sill + op.height if op.kind == "window" else op.height
        y = base - top * PX
        fill, stroke = ("#cfe3f7", "#3a7bd5") if op.kind == "window" else ("#e3c9a8", "#b5651d")
        o.append(f'<rect x="{_f(x)}" y="{_f(y)}" width="{_f(op.width * PX)}" height="{_f(op.height * PX)}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
    o.append(f'<text x="{_f(M)}" y="22" fill="#333" font-weight="bold">South elevation, {p.pitch}:12 roof. Not for construction.</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"
