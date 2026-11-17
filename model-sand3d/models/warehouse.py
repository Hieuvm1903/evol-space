"""Warehouse building shell -> warehouse.glb (floor, walls, columns, roof trusses, dock doors, lights)"""
import sand3d as s3d
from lib.common import mat, VIOLET, CYAN, PINK, AMBER, RED, GREEN


def build(length=24000, width=16000, height=7000, bays=6, doors=3):
    """Open-front warehouse: floor slab, 3 walls, column grid, roof trusses, dock doors on the back wall.
    Origin = floor centre, floor top at z=0."""
    parts = []
    parts.append(mat(s3d.at(s3d.box("floor", length, width, 200), z=-200), "steel", "#1d1a2e"))

    # floor safety lanes (thin emissive strips)
    for i, sy in enumerate((-1, 1)):
        parts.append(mat(s3d.at(s3d.box(f"lane{i}", length - 1000, 100, 6), y=sy * (width / 2 - 1200)), "light", AMBER, emission=1.0))

    t = 250  # wall thickness
    parts.append(mat(s3d.at(s3d.box("wall_back", length, t, height), y=width / 2 - t / 2), "painted_metal", "#2a2740"))
    for i, sx in enumerate((-1, 1)):
        parts.append(mat(s3d.at(s3d.box(f"wall_side{i}", t, width, height), x=sx * (length / 2 - t / 2)), "painted_metal", "#2a2740"))

    # columns along both long sides
    pitch = (length - 2 * t) / bays
    for i in range(bays + 1):
        x = -length / 2 + t + i * pitch
        for j, sy in enumerate((-1, 1)):
            if sy == 1 and i not in (0, bays):
                continue  # the back wall already carries the load
            parts.append(mat(s3d.at(s3d.box(f"col{i}_{j}", 400, 400, height), x=x, y=sy * (width / 2 - 600)), "steel", "#4c3fa8"))

    # roof trusses (cross beams) + purlins
    for i in range(bays + 1):
        x = -length / 2 + t + i * pitch
        parts.append(mat(s3d.at(s3d.box(f"truss{i}", 300, width, 350), x=x, z=height), "painted_metal", AMBER))
    for k, sy in enumerate((-0.66, -0.33, 0, 0.33, 0.66)):
        parts.append(mat(s3d.at(s3d.box(f"purlin{k}", length, 120, 150), y=sy * width / 2, z=height + 350), "steel", "#8a86a8"))

    # dock doors on the back wall
    dw, dh = 3000, 3600
    for i in range(doors):
        x = (i - (doors - 1) / 2) * (length / (doors + 1))
        parts.append(mat(s3d.at(s3d.box(f"dock_door{i}", dw, 120, dh), x=x, y=width / 2 - t - 40), "brushed_steel", "#9a96b8"))
        parts.append(mat(s3d.at(s3d.box(f"dock_light{i}", dw, 60, 120), x=x, y=width / 2 - t - 120, z=dh + 150), "light", GREEN, emission=2.0))

    # ceiling lights
    for i in range(bays):
        x = -length / 2 + t + (i + 0.5) * pitch
        for j, sy in enumerate((-0.33, 0.33)):
            parts.append(mat(s3d.at(s3d.box(f"lamp{i}_{j}", 1800, 200, 60), x=x, y=sy * width / 2, z=height - 200), "light", "#f5f3ff", emission=3.0))

    return s3d.assembly("warehouse", *parts)
