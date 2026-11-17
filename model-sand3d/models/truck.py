"""Delivery truck (cab + box body, 6 wheels) -> truck.glb"""
import sand3d as s3d
from lib.common import mat, VIOLET, CYAN, PINK, AMBER, RED, GREEN
from lib.parts import wheel


def build(length=7200, width=2400):
    """Origin = floor centre, +X is the driving direction. Joints: wheel_*_spin (continuous about Y)."""
    chassis = mat(s3d.at(s3d.box("truck_chassis", length, width - 500, 220), z=450), "steel", "#2a2740")
    cargo = mat(s3d.at(s3d.box("cargo_box", 4800, width, 2500), x=-1000, z=670), "painted_metal", "#e8e6f5")
    stripe = mat(s3d.at(s3d.box("cargo_stripe", 4802, width + 4, 160), x=-1000, z=1200), "painted_metal", VIOLET)
    rear_door = mat(s3d.at(s3d.box("rear_door", 40, width - 200, 2300), x=-3420, z=760), "brushed_steel", "#9a96b8")
    cab = mat(s3d.at(s3d.box("cab", 1700, width - 100, 1900), x=2650, z=670), "painted_metal", AMBER)
    s3d.fillet(cab, 80, edges="side")
    windshield = mat(s3d.at(s3d.box("windshield", 20, width - 400, 800), x=3510, z=1500), "glossy_plastic", "#0a0912")
    side_win = [mat(s3d.at(s3d.box(f"side_win{i}", 900, 20, 700), x=2650, y=sy * (width / 2 - 40), z=1600), "glossy_plastic", "#0a0912")
                for i, sy in enumerate((-1, 1))]
    headlights = [mat(s3d.at(s3d.box(f"headlight{i}", 20, 260, 140), x=3515, y=sy * 800, z=800), "light", "#f5f3ff", emission=4.0)
                  for i, sy in enumerate((-1, 1))]
    taillights = [mat(s3d.at(s3d.box(f"taillight{i}", 20, 200, 120), x=-3600, y=sy * 900, z=700), "light", RED, emission=3.0)
                  for i, sy in enumerate((-1, 1))]
    bumper = mat(s3d.at(s3d.box("bumper_front", 120, width, 220), x=3560, z=380), "steel", "#8a86a8")

    wheels, joints = [], []
    for k, (x, tag) in enumerate([(2500, "front"), (-300, "mid"), (-1700, "rear")]):
        for sy, side in ((-1, "l"), (1, "r")):
            w = wheel(f"wheel_{tag}_{side}", 1000, 300, x, sy * (width / 2 - 150))
            wheels.append(w)
            joints.append((f"wheel_{tag}_{side}_spin", w))
    for name, w in joints:
        s3d.joint(name, w, s3d.bbox(chassis, "+Y" if "_r_" in name else "-Y"), kind="continuous", axis="+Y")

    return s3d.assembly("truck", chassis, cargo, stripe, rear_door, cab, windshield, *side_win,
                        *headlights, *taillights, bumper, *wheels)
