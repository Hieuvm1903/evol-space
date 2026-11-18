"""Quadcopter delivery drone (+ configuration) -> drone.glb"""
import sand3d as s3d
from lib.common import mat, VIOLET, CYAN, PINK, AMBER, RED, GREEN


def build(arm=450, prop=300):
    """Body, 4 arms along +/-X and +/-Y, motors, spinning rotors, camera gimbal, landing skids.
    Joints: rotor_front/back/left/right_spin (continuous about Z)."""
    body = mat(s3d.at(s3d.box("drone_body", 220, 220, 90), z=150), "glossy_plastic", "#e8e6f5")
    s3d.fillet(body, 20, edges="side")
    top = mat(s3d.at(s3d.box("drone_top", 160, 160, 30), z=240), "painted_metal", VIOLET)
    battery = mat(s3d.at(s3d.box("battery", 140, 90, 50), z=100), "painted_metal", "#2a2740")

    arms, motors, rotors, leds = [], [], [], []
    spec = [("front", arm, 0), ("back", -arm, 0), ("left", 0, -arm), ("right", 0, arm)]
    for name, x, y in spec:
        if x:
            arms.append(mat(s3d.at(s3d.box(f"arm_{name}", abs(x), 40, 30), x=x / 2, y=0, z=180), "painted_metal", "#4c3fa8"))
        else:
            arms.append(mat(s3d.at(s3d.box(f"arm_{name}", 40, abs(y), 30), x=0, y=y / 2, z=180), "painted_metal", "#4c3fa8"))
        motors.append(mat(s3d.at(s3d.cylinder(f"motor_{name}", 70, 60), x=x, y=y, z=165), "brushed_steel", "#9a96b8"))
        rotors.append(mat(s3d.at(s3d.cylinder(f"rotor_{name}_spin", prop, 6), x=x, y=y, z=235), "glossy_plastic", "#0a0912"))
        col = RED if name == "back" else GREEN if name == "front" else CYAN
        leds.append(mat(s3d.at(s3d.sphere(f"led_{name}", 24), x=x, y=y, z=150), "light", col, emission=3.0))

    # landing skids
    skids = []
    for i, sy in enumerate((-1, 1)):
        skids.append(mat(s3d.at(s3d.box(f"skid{i}", 380, 20, 20), y=sy * 120), "steel", "#2a2740"))
        for j, sx in enumerate((-1, 1)):
            skids.append(mat(s3d.at(s3d.box(f"skid_leg{i}{j}", 16, 16, 140), x=sx * 130, y=sy * 120, z=20), "steel", "#2a2740"))

    # camera gimbal under the nose
    gimbal = mat(s3d.at(s3d.sphere("gimbal", 70), x=110, z=95), "glossy_plastic", "#0a0912")
    lens = mat(s3d.at(s3d.sphere("lens", 26), x=140, z=105), "light", PINK, emission=2.0)

    for (name, *_), r, m in zip(spec, rotors, motors):
        s3d.joint(f"rotor_{name}_spin", r, s3d.bbox(m, "+Z"), kind="continuous", axis="+Z")

    return s3d.assembly("drone", body, top, battery, *arms, *motors, *rotors, *leds, *skids, gimbal, lens)
