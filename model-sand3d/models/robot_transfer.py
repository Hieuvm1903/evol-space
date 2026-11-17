"""Rail-guided transfer robot (shuttle + mast + telescopic fork) -> robot_transfer.glb"""
import sand3d as s3d
from lib.common import mat, VIOLET, CYAN, PINK, AMBER, RED, GREEN


def build(rail_len=4000, mast_h=2800):
    """Floor rails, a travelling carriage, a lifting mast and a fork that slides out sideways (Y).
    Joints: travel_slide (X), lift_slide (Z), fork_slide (Y)."""
    rails = [mat(s3d.at(s3d.box(f"rail{i}", rail_len, 70, 50), y=sy * 380), "steel", "#8a86a8")
             for i, sy in enumerate((-1, 1))]
    sleepers = [mat(s3d.at(s3d.box(f"sleeper{i}", 80, 900, 30), x=-rail_len / 2 + 200 + i * (rail_len - 400) / 8, z=-30),
                    "steel", "#2a2740") for i in range(9)]
    stops = [mat(s3d.at(s3d.box(f"stop{i}", 60, 900, 160), x=sx * (rail_len / 2 - 30)), "painted_metal", RED)
             for i, sx in enumerate((-1, 1))]

    # carriage (moves along X)
    carriage = mat(s3d.at(s3d.box("carriage", 900, 760, 160), z=50), "painted_metal", "#4c3fa8")
    s3d.fillet(carriage, 14, edges="side")
    wheels = [mat(s3d.at(s3d.cylinder(f"tr_wheel{i}{j}", 110, 50), x=sx * 330, y=sy * 380 + (25 if sy < 0 else -25), z=55,
                         rx=-90 if sy < 0 else 90), "rubber", "#0a0912")
              for i, sx in enumerate((-1, 1)) for j, sy in enumerate((-1, 1))]
    cabinet = mat(s3d.at(s3d.box("tr_cabinet", 300, 500, 500), x=-280, z=210), "painted_metal", "#e8e6f5")
    beacon = mat(s3d.at(s3d.cylinder("tr_beacon", 80, 90), x=-280, z=710), "light", AMBER, emission=2.5)
    mast = mat(s3d.at(s3d.box("mast", 120, 120, mast_h), x=200, z=210), "brushed_steel", "#9a96b8")
    guide = mat(s3d.at(s3d.box("mast_guide", 40, 40, mast_h), x=200, y=-90, z=210), "steel", "#2a2740")
    top_cap = mat(s3d.at(s3d.box("mast_cap", 220, 220, 40), x=200, z=210 + mast_h), "painted_metal", VIOLET)
    carr_grp = s3d.group("carriage_group", carriage, *wheels, cabinet, beacon, mast, guide, top_cap)

    # lift (moves along Z on the mast)
    lift_plate = mat(s3d.at(s3d.box("lift_plate", 200, 360, 260), x=290, z=400), "painted_metal", AMBER)
    # fork (slides out along Y)
    fork_bar = mat(s3d.at(s3d.box("fork_bar", 160, 900, 24), x=290, z=660), "steel", "#8a86a8")
    fork_tip = mat(s3d.at(s3d.box("fork_marker", 60, 60, 6), x=290, y=380, z=686), "light", PINK, emission=2.5)
    fork = s3d.group("fork", fork_bar, fork_tip)
    lift = s3d.group("lift", lift_plate, fork)

    s3d.joint("travel_slide", carr_grp, s3d.bbox(rails[0], "-X"), kind="prismatic", axis="+X", range=(0, rail_len - 1100))
    s3d.joint("lift_slide", lift, s3d.bbox(carriage, "+Z"), kind="prismatic", axis="+Z", range=(0, mast_h - 1000))
    s3d.joint("fork_slide", fork, s3d.bbox(lift_plate, "+Y"), kind="prismatic", axis="+Y", range=(0, 600))
    return s3d.assembly("robot_transfer", *rails, *sleepers, *stops, carr_grp, lift)
